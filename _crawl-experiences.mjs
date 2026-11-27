import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { employmentEngine, readEmploymentData } from './_employment-data.mjs';
import { callCloudChat, getEnvCloudProviders } from './_employment-llm.mjs';
import { EXPERIENCE_CHANNELS, matchAllowedChannelUrl } from './_experience-channels.mjs';
import { canonicalizeExperienceUrl, computeSimhash64, evaluateSpamAndAdRisk } from './_experience-cleaner.mjs';
import { openExperienceDb } from './_experience-db.mjs';
import { distillExperiencePost } from './_experience-distiller.mjs';
import { allocateChannelQuotas, defaultQuerySeeds, planWeeklyQueries } from './_experience-query-planner.mjs';
import { createFirecrawlClient } from './_firecrawl-client.mjs';

export async function runExperienceCrawl({
  dbFile,
  client = null,
  triggerMode = 'manual_cli',
  totalBudget = 20,
  useLlm = false,
  livenessSampleSize = 6,
  now = new Date(),
} = {}) {
  const data = readEmploymentData();
  const engine = employmentEngine(data);
  const db = openExperienceDb(dbFile);
  const ownedClient = !client;
  const fc = client || createFirecrawlClient({ embeddedFallback: true });

  const runId = `exp_run_${now.toISOString().slice(0, 10).replaceAll('-', '')}_${randomUUID().slice(0, 6)}`;
  let firecrawlMode = 'local_binary';
  try {
    firecrawlMode = await fc.getMode();
  } catch {}

  db.ensureSources(EXPERIENCE_CHANNELS);
  if (!db.listQuerySeeds().length) {
    db.upsertQuerySeeds(defaultQuerySeeds(), now.toISOString());
  }

  db.startCrawlRun({ runId, triggerMode, firecrawlMode, startedAt: now.toISOString() });

  const channelSummary = {};
  let queriesExecuted = 0;
  let pagesDiscovered = 0;
  let spamRejected = 0;
  let itemsUpserted = 0;
  const cloudProviders = useLlm ? getEnvCloudProviders() : [];

  try {
    const sourceStats = db.listSources();
    const quotas = allocateChannelQuotas(sourceStats, { totalBudget, now });
    const plan = planWeeklyQueries({
      now,
      jobs: data.jobs,
      engine,
      storedSeeds: db.listQuerySeeds(),
      channelQuotas: quotas,
    });

    const consumedByChannel = new Map();
    for (const q of plan.queries) {
      const budgetLeft = (quotas.get(q.channel) || 0) - (consumedByChannel.get(q.channel) || 0);
      if (budgetLeft <= 0) continue;

      const summary = channelSummary[q.channel] ??= {
        queries: 0, discovered: 0, scraped: 0, spamRejected: 0, accepted: 0, duplicatesMerged: 0, errors: [],
      };
      summary.queries++;
      queriesExecuted++;

      let hits = [];
      try {
        hits = await fc.searchPages({ query: q.query, limit: Math.min(6, budgetLeft + 2), tbs: null });
      } catch (err) {
        summary.errors.push(err?.code || err?.message || 'SEARCH_ERROR');
        db.recordSourceAttempt({
          sourceId: q.channel,
          fetched: 0,
          accepted: 0,
          failed: true,
          cooldownUntil: err?.retryAt ? new Date(err.retryAt).toISOString() : null,
          errorCode: err?.code || 'SEARCH_ERROR',
          attemptedAt: now.toISOString(),
        });
        continue;
      }

      let seedAccepted = 0;
      let channelFetchedThisQuery = 0;

      for (const hit of hits) {
        if ((consumedByChannel.get(q.channel) || 0) >= (quotas.get(q.channel) || 0)) break;
        const matched = matchAllowedChannelUrl(hit.url, q.channel);
        if (!matched) continue;

        let canonicalUrl;
        try {
          canonicalUrl = canonicalizeExperienceUrl(matched.normalizedUrl);
        } catch {
          continue;
        }
        pagesDiscovered++;
        summary.discovered++;

        if (db.getByCanonicalUrl(canonicalUrl)) continue;

        consumedByChannel.set(q.channel, (consumedByChannel.get(q.channel) || 0) + 1);
        channelFetchedThisQuery++;

        let extractMode = 'search_snippet';
        let pageTitle = hit.title || '';
        let pageText = hit.description || '';

        if (matched.channel.scrapePolicy === 'scrape_or_snippet') {
          try {
            const scraped = await fc.scrapePage({ url: canonicalUrl, onlyMainContent: true, timeoutMs: 12000 });
            if (scraped.markdown && scraped.markdown.trim().length >= 100) {
              extractMode = 'full_markdown';
              pageText = scraped.markdown;
              pageTitle = scraped.metadata?.title || pageTitle;
              summary.scraped++;
            }
          } catch (err) {
            if (err?.code === 'TARGET_BLOCKED' || err?.code === 'COOLDOWN') {
              summary.errors.push(err.code);
              db.recordSourceAttempt({
                sourceId: q.channel,
                fetched: channelFetchedThisQuery,
                accepted: seedAccepted,
                failed: true,
                cooldownUntil: err.retryAt ? new Date(err.retryAt).toISOString() : new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
                errorCode: err.code,
                attemptedAt: now.toISOString(),
              });
            }
          }
        }

        const spamCheck = evaluateSpamAndAdRisk({ title: pageTitle, text: pageText, extractMode });
        if (spamCheck.rejected) {
          spamRejected++;
          summary.spamRejected++;
          continue;
        }

        const simhash64 = computeSimhash64(`${pageTitle}\n${pageText}`);
        const nearDup = db.findNearDuplicate(simhash64, { maxDistance: 3 });
        if (nearDup) {
          db.mergeAlternateSource(nearDup.record.item.id, canonicalUrl);
          summary.duplicatesMerged++;
          continue;
        }

        const item = await distillExperiencePost({
          url: canonicalUrl,
          title: pageTitle,
          text: pageText,
          platform: matched.channel.id,
          isOfficialEdu: matched.isOfficialEdu,
          extractMode,
          publishedAt: now.toISOString().slice(0, 10),
          verifiedAt: now.toISOString().slice(0, 10),
          defaultPaths: q.paths,
          adRiskScore: spamCheck.adRiskScore,
          engine,
          cloudProviders,
          llmCaller: useLlm ? callCloudChat : null,
        });

        db.upsertExperiences([{
          item,
          canonicalUrl,
          simhash64,
          adRiskScore: spamCheck.adRiskScore,
          alternateSources: [],
        }]);
        itemsUpserted++;
        if (item.trustTier !== 'C_CLUE') {
          summary.accepted++;
          seedAccepted++;
        }
      }

      db.recordSeedYield(q.seedId, seedAccepted, now.toISOString());
      db.recordSourceAttempt({
        sourceId: q.channel,
        fetched: channelFetchedThisQuery,
        accepted: seedAccepted,
        failed: false,
        errorCode: null,
        attemptedAt: now.toISOString(),
      });
    }

    // Liveness spot-check on top scrape-eligible active records + cohort lifecycle sweep
    const deadIds = [];
    if (livenessSampleSize > 0) {
      const candidates = db.listExperiences({ limit: livenessSampleSize, activeOnly: true })
        .filter(r => r.item.citation.extractMode === 'full_markdown');
      for (const rec of candidates) {
        try {
          await fc.scrapePage({ url: rec.canonicalUrl, maxAge: 0, timeoutMs: 10000 });
          db.markVerified(rec.item.id, now.toISOString().slice(0, 10));
        } catch (err) {
          if (err?.code === 'HTTP_404' || err?.status === 404 || err?.status === 410) {
            deadIds.push(rec.item.id);
          }
        }
      }
    }

    const minActiveGradYear = now.getUTCMonth() + 1 >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    const lifecycle = db.sweepLifecycle({
      minActiveGradYear,
      deadIds,
      verifiedAt: now.toISOString().slice(0, 10),
    });
    const corroborated = db.recomputeCorroboration({ windowDays: 30, now });

    const finalSummary = {
      season: plan.season.label,
      emergingSkills: plan.emergingSkills,
      channels: channelSummary,
      lifecycle,
      corroboratedUpdated: corroborated,
    };
    const anyFailed = Object.values(channelSummary).some(c => c.errors.length > 0);
    const status = itemsUpserted > 0 || !anyFailed ? (anyFailed ? 'partial_ok' : 'completed') : 'partial_ok';

    db.finishCrawlRun({
      runId,
      status,
      queriesExecuted,
      pagesDiscovered,
      spamRejected,
      itemsUpserted,
      summary: finalSummary,
      finishedAt: new Date().toISOString(),
    });

    return {
      runId,
      firecrawlMode,
      status,
      queriesExecuted,
      pagesDiscovered,
      spamRejected,
      itemsUpserted,
      summary: finalSummary,
    };
  } catch (err) {
    db.finishCrawlRun({
      runId,
      status: 'failed',
      queriesExecuted,
      pagesDiscovered,
      spamRejected,
      itemsUpserted,
      summary: { error: err?.message || 'CRAWL_FAILED', channels: channelSummary },
      finishedAt: new Date().toISOString(),
    });
    throw err;
  } finally {
    if (ownedClient) await fc.close?.();
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const budgetIdx = process.argv.indexOf('--budget');
  const totalBudget = budgetIdx >= 0 ? Number(process.argv[budgetIdx + 1]) : 18;
  const useLlm = process.argv.includes('--llm');
  const triggerMode = process.argv.includes('--weekly') ? 'scheduled_weekly'
    : process.argv.includes('--gh-actions') ? 'gh_actions' : 'manual_cli';
  const res = await runExperienceCrawl({
    triggerMode,
    totalBudget,
    useLlm,
    livenessSampleSize: process.argv.includes('--skip-liveness') ? 0 : 4,
  });
  console.log(JSON.stringify(res, null, 2));
}
