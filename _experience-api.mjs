import { existsSync } from 'node:fs';
import { employmentEngine, readEmploymentData } from './_employment-data.mjs';
import { EXPERIENCE_CHANNELS } from './_experience-channels.mjs';
import { openExperienceDb } from './_experience-db.mjs';
import { allocateChannelQuotas, detectEmergingJobSkills, detectSeasonTheme } from './_experience-query-planner.mjs';
import { runExperienceCrawl } from './_crawl-experiences.mjs';

function isLoopbackSocket(request) {
  const addr = String(request.socket?.remoteAddress || '').replace(/^::ffff:/, '').toLowerCase();
  const host = String(request.headers.host || '').split(':')[0].toLowerCase();
  return (addr === '127.0.0.1' || addr === '::1') &&
    (host === '127.0.0.1' || host === 'localhost' || host === '[::1]');
}

export function createExperienceIntelHandler({
  catalogFile,
  experiencesDbPath,
  crawlRunner = runExperienceCrawl,
} = {}) {
  let crawlInProgress = false;

  function loadMergedPool() {
    const data = readEmploymentData(catalogFile);
    const engine = employmentEngine(data);
    const byId = new Map();
    for (const item of data.experienceIntel?.items || []) {
      byId.set(item.id, item);
    }
    if (experiencesDbPath ? existsSync(experiencesDbPath) : true) {
      let db = null;
      try {
        db = openExperienceDb(experiencesDbPath);
        for (const rec of db.listExperiences({ limit: 500, activeOnly: true })) {
          byId.set(rec.item.id, rec.item);
        }
      } catch {} finally {
        db?.close();
      }
    }
    return { data, engine, items: [...byId.values()] };
  }

  return async function handleExperienceIntel(request, pathname, send, readLocalJson) {
    if (!pathname.startsWith('/api/intel/')) return false;

    const url = new URL(request.url, 'http://127.0.0.1');

    if (pathname === '/api/intel/experiences') {
      if (request.method !== 'GET') return send(405, { error: 'GET_REQUIRED' }), true;
      const { items } = loadMergedPool();
      const pathFilter = url.searchParams.get('path') || 'all';
      const dirFilter = url.searchParams.get('direction') || 'all';
      const famFilter = url.searchParams.get('family') || 'all';
      const catFilter = url.searchParams.get('category') || 'all';
      const platFilter = url.searchParams.get('platform') || 'all';
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));

      const filtered = items.filter(it => {
        if (it.trustTier === 'C_CLUE' || it.livenessStatus === 'source_removed') return false;
        if (pathFilter !== 'all' && !it.paths.includes(pathFilter)) return false;
        if (dirFilter !== 'all' && !it.directionIds.includes(dirFilter)) return false;
        if (famFilter !== 'all' && !it.familyIds.includes(famFilter)) return false;
        if (catFilter !== 'all' && it.category !== catFilter) return false;
        if (platFilter !== 'all' && it.platform !== platFilter) return false;
        if (q) {
          const hay = [it.title, it.tldr, ...it.keySteps, ...it.interviewQuestions, ...it.targetOrgs].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      send(200, { total: filtered.length, items: filtered.slice(0, limit) });
      return true;
    }

    if (pathname === '/api/intel/feed') {
      if (request.method !== 'POST') return send(405, { error: 'POST_REQUIRED' }), true;
      const bodyRes = await readLocalJson({ maxBytes: 32768 });
      if (!bodyRes.ok) return send(bodyRes.status, { error: bodyRes.error }), true;
      const payload = bodyRes.value || {};
      const { engine, items } = loadMergedPool();
      const cp = payload.profile && typeof payload.profile === 'object'
        ? engine.ccProfileFromState({ profile: payload.profile, paths: payload.paths || [], jobs: { preferences: payload.preferences || {} } })
        : engine.ccProfileFromState({ profile: {}, paths: payload.paths || [] });
      const paths = Array.isArray(payload.paths) ? payload.paths.filter(p => ['baoyan', 'kaoyan', 'liuxue', 'jiuye'].includes(p)) : [];
      const userPrefs = payload.userPrefs && typeof payload.userPrefs === 'object' ? payload.userPrefs : {};
      const limit = Math.min(100, Math.max(1, Number(payload.limit) || 40));

      const ranked = engine.rankExperienceIntel(cp, paths, items, userPrefs, new Date());
      const digest = engine.buildWeeklyDigest(ranked, paths);
      send(200, {
        rankVersion: engine.INTEL_RANK_VERSION,
        totalPool: items.length,
        digest,
        items: ranked.slice(0, limit),
      });
      return true;
    }

    if (pathname === '/api/intel/sources/health') {
      if (request.method !== 'GET') return send(405, { error: 'GET_REQUIRED' }), true;
      const { data, engine, items } = loadMergedPool();
      let sources = [];
      let recentRuns = [];
      let db = null;
      try {
        db = openExperienceDb(experiencesDbPath);
        db.ensureSources(EXPERIENCE_CHANNELS);
        sources = db.listSources();
        recentRuns = db.listCrawlRuns(5);
      } catch {
        sources = EXPERIENCE_CHANNELS.map(c => ({
          sourceId: c.id, displayName: c.label, enabled: true,
          totalRuns: 0, totalFetched: 0, totalAccepted: 0, consecutiveFails: 0, cooldownUntil: null,
        }));
      } finally {
        db?.close();
      }
      const quotas = Object.fromEntries(allocateChannelQuotas(sources, { totalBudget: 30 }));
      const season = detectSeasonTheme(new Date());
      const emergingSkills = detectEmergingJobSkills(data.jobs, engine, { topK: 4 });
      send(200, {
        crawlInProgress,
        totalActiveItems: items.length,
        season,
        emergingSkills,
        ucbQuotas: quotas,
        sources,
        recentRuns,
      });
      return true;
    }

    if (pathname === '/api/intel/crawl/trigger') {
      if (request.method !== 'POST') return send(405, { error: 'POST_REQUIRED' }), true;
      if (!isLoopbackSocket(request)) {
        request.resume();
        return send(403, { error: 'LOOPBACK_ONLY' }), true;
      }
      if (crawlInProgress) {
        request.resume();
        return send(409, { error: 'CRAWL_ALREADY_RUNNING' }), true;
      }
      const bodyRes = await readLocalJson({ maxBytes: 4096 });
      if (!bodyRes.ok) return send(bodyRes.status, { error: bodyRes.error }), true;
      const totalBudget = Math.min(40, Math.max(4, Number(bodyRes.value?.totalBudget) || 12));
      crawlInProgress = true;
      try {
        const result = await crawlRunner({
          dbFile: experiencesDbPath,
          triggerMode: 'local_api',
          totalBudget,
          useLlm: Boolean(bodyRes.value?.useLlm),
          livenessSampleSize: 2,
        });
        send(200, result);
      } catch (err) {
        send(502, { error: err?.code || 'CRAWL_FAILED' });
      } finally {
        crawlInProgress = false;
      }
      return true;
    }

    return false;
  };
}
