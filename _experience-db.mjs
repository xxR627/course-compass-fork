import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { assertExperienceItem } from './_experience-contract.mjs';

const defaultFile = fileURLToPath(new URL('./_research/experiences.db', import.meta.url));
const schemaVersion = 1;
const schema = `
CREATE TABLE experience_sources (
  source_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  total_runs INTEGER NOT NULL DEFAULT 0 CHECK (total_runs >= 0),
  total_fetched INTEGER NOT NULL DEFAULT 0 CHECK (total_fetched >= 0),
  total_accepted INTEGER NOT NULL DEFAULT 0 CHECK (total_accepted >= 0),
  consecutive_fails INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_fails >= 0),
  cooldown_until TEXT,
  last_attempt_at TEXT,
  last_ok_at TEXT,
  last_error_code TEXT
) STRICT;

CREATE TABLE crawl_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  trigger_mode TEXT NOT NULL CHECK (trigger_mode IN ('scheduled_weekly', 'manual_cli', 'local_api', 'gh_actions')),
  firecrawl_mode TEXT NOT NULL CHECK (firecrawl_mode IN ('local_binary', 'self_hosted_docker', 'cloud_api')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial_ok', 'failed')),
  queries_executed INTEGER NOT NULL DEFAULT 0 CHECK (queries_executed >= 0),
  pages_discovered INTEGER NOT NULL DEFAULT 0 CHECK (pages_discovered >= 0),
  spam_rejected INTEGER NOT NULL DEFAULT 0 CHECK (spam_rejected >= 0),
  items_upserted INTEGER NOT NULL DEFAULT 0 CHECK (items_upserted >= 0),
  summary_json TEXT CHECK (summary_json IS NULL OR json_valid(summary_json))
) STRICT;

CREATE TABLE query_seeds (
  seed_id TEXT PRIMARY KEY NOT NULL,
  channel TEXT NOT NULL,
  query_template TEXT NOT NULL,
  paths_json TEXT NOT NULL CHECK (json_valid(paths_json)),
  season_months TEXT NOT NULL CHECK (json_valid(season_months)),
  skill_id TEXT,
  runs_count INTEGER NOT NULL DEFAULT 0 CHECK (runs_count >= 0),
  accepted_yield INTEGER NOT NULL DEFAULT 0 CHECK (accepted_yield >= 0),
  adoption_score REAL NOT NULL DEFAULT 0.5 CHECK (adoption_score BETWEEN 0 AND 1),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE experience_items (
  id TEXT PRIMARY KEY NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = '1.0'),
  canonical_url TEXT NOT NULL UNIQUE,
  canonical_url_hash TEXT NOT NULL,
  simhash64 TEXT NOT NULL CHECK (length(simhash64) = 16 AND simhash64 NOT GLOB '*[^0-9a-f]*'),
  platform TEXT NOT NULL CHECK (platform IN ('xiaohongshu', 'zhihu', 'nowcoder', 'github_exp', 'bilibili_edu')),
  platform_label TEXT NOT NULL,
  extract_mode TEXT NOT NULL CHECK (extract_mode IN ('full_markdown', 'search_snippet')),
  trust_tier TEXT NOT NULL CHECK (trust_tier IN ('A_OFFICIAL', 'B_EXPERIENCE', 'C_CLUE')),
  liveness_status TEXT NOT NULL CHECK (liveness_status IN ('active', 'archived_past_batch', 'source_removed')),
  category TEXT NOT NULL CHECK (category IN ('interview_exp', 'offer_retro', 'project_guide', 'camp_policy', 'pitfall')),
  title TEXT NOT NULL,
  tldr TEXT NOT NULL,
  paths_json TEXT NOT NULL CHECK (json_valid(paths_json)),
  direction_ids_json TEXT NOT NULL CHECK (json_valid(direction_ids_json)),
  family_ids_json TEXT NOT NULL CHECK (json_valid(family_ids_json)),
  mapped_skill_ids_json TEXT NOT NULL CHECK (json_valid(mapped_skill_ids_json)),
  target_orgs_json TEXT NOT NULL CHECK (json_valid(target_orgs_json)),
  target_grad_year INTEGER,
  author_baseline_json TEXT NOT NULL CHECK (json_valid(author_baseline_json)),
  key_steps_json TEXT NOT NULL CHECK (json_valid(key_steps_json)),
  interview_qs_json TEXT NOT NULL CHECK (json_valid(interview_qs_json)),
  pitfalls_json TEXT NOT NULL CHECK (json_valid(pitfalls_json)),
  action_task_json TEXT NOT NULL CHECK (json_valid(action_task_json)),
  guidance_score REAL NOT NULL CHECK (guidance_score BETWEEN 0 AND 1),
  ad_risk_score REAL NOT NULL CHECK (ad_risk_score BETWEEN 0 AND 1),
  corroboration_cluster TEXT,
  corroboration_count INTEGER NOT NULL CHECK (corroboration_count >= 1),
  alternate_sources_json TEXT NOT NULL CHECK (json_valid(alternate_sources_json)),
  source_url TEXT NOT NULL,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  citation_disclaimer TEXT NOT NULL
) STRICT;

CREATE INDEX idx_exp_tier_status ON experience_items(trust_tier, liveness_status, guidance_score DESC);
CREATE INDEX idx_exp_simhash ON experience_items(simhash64);
CREATE INDEX idx_exp_published ON experience_items(published_at DESC);

CREATE TABLE taxonomy_candidates (
  term TEXT PRIMARY KEY NOT NULL,
  suggested_skill TEXT,
  mention_count INTEGER NOT NULL DEFAULT 1 CHECK (mention_count >= 1),
  sample_urls_json TEXT NOT NULL CHECK (json_valid(sample_urls_json)),
  first_seen_at TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'ignored'))
) STRICT;
`;

const itemFields = {
  id: 'id',
  schemaVersion: 'schema_version',
  platform: 'platform',
  platformLabel: 'platform_label',
  trustTier: 'trust_tier',
  livenessStatus: 'liveness_status',
  category: 'category',
  title: 'title',
  tldr: 'tldr',
  targetGradYear: 'target_grad_year',
  guidanceScore: 'guidance_score',
  corroborationCount: 'corroboration_count',
};
const itemJsonFields = {
  paths: 'paths_json',
  directionIds: 'direction_ids_json',
  familyIds: 'family_ids_json',
  mappedSkillIds: 'mapped_skill_ids_json',
  targetOrgs: 'target_orgs_json',
  authorBaseline: 'author_baseline_json',
  keySteps: 'key_steps_json',
  interviewQuestions: 'interview_qs_json',
  pitfalls: 'pitfalls_json',
  actionTask: 'action_task_json',
};
const citationFields = {
  sourceUrl: 'source_url',
  publishedAt: 'published_at',
  verifiedAt: 'last_verified_at',
  extractMode: 'extract_mode',
  disclaimer: 'citation_disclaimer',
};

function atomic(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function canonicalHttps(value) {
  const url = typeof value === 'string' && URL.canParse(value) ? new URL(value) : null;
  if (!url || url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('Expected an HTTPS source URL without credentials');
  }
  url.hash = '';
  return url.href;
}

export function hammingDistanceHex64(a, b) {
  let diff = BigInt('0x' + a) ^ BigInt('0x' + b);
  let count = 0;
  while (diff > 0n) {
    diff &= diff - 1n;
    count++;
  }
  return count;
}

function encodeRecord({ item, canonicalUrl = item?.citation?.sourceUrl, simhash64, adRiskScore = 0, alternateSources = [] }) {
  assertExperienceItem(item);
  if (typeof simhash64 !== 'string' || !/^[0-9a-f]{16}$/.test(simhash64)) {
    throw new TypeError('simhash64 must contain 16 lowercase hexadecimal digits');
  }
  if (!Number.isFinite(adRiskScore) || adRiskScore < 0 || adRiskScore > 1) {
    throw new TypeError('adRiskScore must be between 0 and 1');
  }
  if (!Array.isArray(alternateSources)) throw new TypeError('alternateSources must contain HTTPS URLs');
  canonicalUrl = canonicalHttps(canonicalUrl);
  const sources = Array.from(new Set(alternateSources.map(canonicalHttps))).filter(url => url !== canonicalUrl);
  return {
    ...Object.fromEntries(Object.entries(itemFields).map(([key, column]) => [column, item[key]])),
    ...Object.fromEntries(Object.entries(itemJsonFields).map(([key, column]) => [column, JSON.stringify(item[key])])),
    ...Object.fromEntries(Object.entries(citationFields).map(([key, column]) => [column, item.citation[key]])),
    corroboration_cluster: item.corroborationCluster ?? null,
    canonical_url: canonicalUrl,
    canonical_url_hash: createHash('sha256').update(canonicalUrl).digest('hex'),
    simhash64,
    ad_risk_score: adRiskScore,
    alternate_sources_json: JSON.stringify(sources),
    fetched_at: new Date().toISOString(),
  };
}

function decodeRecord(row) {
  if (!row) return null;
  const item = {
    ...Object.fromEntries(Object.entries(itemFields).map(([key, column]) => [key, row[column]])),
    ...Object.fromEntries(Object.entries(itemJsonFields).map(([key, column]) => [key, JSON.parse(row[column])])),
    citation: Object.fromEntries(Object.entries(citationFields).map(([key, column]) => [key, row[column]])),
  };
  if (row.corroboration_cluster !== null) item.corroborationCluster = row.corroboration_cluster;
  return {
    item,
    canonicalUrl: row.canonical_url,
    canonicalUrlHash: row.canonical_url_hash,
    simhash64: row.simhash64,
    adRiskScore: row.ad_risk_score,
    alternateSources: JSON.parse(row.alternate_sources_json),
    fetchedAt: row.fetched_at,
  };
}

const columns = [
  ...Object.values(itemFields), ...Object.values(itemJsonFields), ...Object.values(citationFields),
  'corroboration_cluster', 'canonical_url', 'canonical_url_hash', 'simhash64', 'ad_risk_score',
  'alternate_sources_json', 'fetched_at',
];
const fixedColumns = new Set(['id', 'canonical_url', 'canonical_url_hash', 'fetched_at']);
const writeSql = `
  INSERT INTO experience_items (${columns.join(', ')})
  VALUES (${columns.map(column => ':' + column).join(', ')})
  ON CONFLICT(canonical_url) DO UPDATE SET
    ${columns.filter(column => !fixedColumns.has(column)).map(column => `${column} = excluded.${column}`).join(', ')}
  RETURNING *
`;

export function openExperienceDb(file = defaultFile) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    atomic(db, () => {
      const { user_version: version } = db.prepare('PRAGMA user_version').get();
      if (version > schemaVersion) throw new Error(`Unsupported experience database version ${version}`);
      if (version === 0) db.exec(schema + `PRAGMA user_version = ${schemaVersion}`);
    });
    const upsert = db.prepare(writeSql);
    const byId = db.prepare('SELECT * FROM experience_items WHERE id = ?');
    const byUrl = db.prepare('SELECT * FROM experience_items WHERE canonical_url = ?');
    const list = db.prepare('SELECT * FROM experience_items ORDER BY guidance_score DESC, id LIMIT ? OFFSET ?');
    const listActive = db.prepare(`
      SELECT * FROM experience_items
      WHERE trust_tier IN ('A_OFFICIAL', 'B_EXPERIENCE') AND liveness_status != 'source_removed'
      ORDER BY guidance_score DESC, published_at DESC, id
      LIMIT ? OFFSET ?
    `);
    const allSimhashes = db.prepare('SELECT * FROM experience_items WHERE liveness_status != \'source_removed\'');
    const remove = db.prepare('DELETE FROM experience_items WHERE id = ?');

    const ensureSourceStmt = db.prepare(`
      INSERT INTO experience_sources (source_id, display_name, enabled)
      VALUES (?, ?, 1)
      ON CONFLICT(source_id) DO UPDATE SET display_name = excluded.display_name
    `);
    const listSourcesStmt = db.prepare('SELECT * FROM experience_sources ORDER BY source_id');
    const recordSourceStmt = db.prepare(`
      UPDATE experience_sources SET
        total_runs = total_runs + 1,
        total_fetched = total_fetched + :fetched,
        total_accepted = total_accepted + :accepted,
        consecutive_fails = CASE WHEN :failed = 1 THEN consecutive_fails + 1 ELSE 0 END,
        cooldown_until = :cooldownUntil,
        last_attempt_at = :attemptedAt,
        last_ok_at = CASE WHEN :failed = 0 THEN :attemptedAt ELSE last_ok_at END,
        last_error_code = :errorCode
      WHERE source_id = :sourceId
    `);

    const startRunStmt = db.prepare(`
      INSERT INTO crawl_runs (run_id, trigger_mode, firecrawl_mode, started_at, status, summary_json)
      VALUES (:runId, :triggerMode, :firecrawlMode, :startedAt, 'running', '{}')
    `);
    const finishRunStmt = db.prepare(`
      UPDATE crawl_runs SET
        finished_at = :finishedAt,
        status = :status,
        queries_executed = :queriesExecuted,
        pages_discovered = :pagesDiscovered,
        spam_rejected = :spamRejected,
        items_upserted = :itemsUpserted,
        summary_json = :summaryJson
      WHERE run_id = :runId
    `);
    const listRunsStmt = db.prepare('SELECT * FROM crawl_runs ORDER BY started_at DESC LIMIT ?');

    const upsertSeedStmt = db.prepare(`
      INSERT INTO query_seeds (seed_id, channel, query_template, paths_json, season_months, skill_id, adoption_score, active, updated_at)
      VALUES (:seedId, :channel, :queryTemplate, :pathsJson, :seasonMonths, :skillId, :adoptionScore, :active, :updatedAt)
      ON CONFLICT(seed_id) DO UPDATE SET
        query_template = excluded.query_template,
        paths_json = excluded.paths_json,
        season_months = excluded.season_months,
        skill_id = excluded.skill_id,
        active = excluded.active,
        updated_at = excluded.updated_at
    `);
    const recordSeedYieldStmt = db.prepare(`
      UPDATE query_seeds SET
        runs_count = runs_count + 1,
        accepted_yield = accepted_yield + :accepted,
        adoption_score = MIN(1.0, MAX(0.05, CASE WHEN :accepted > 0 THEN adoption_score * 0.8 + 0.2 ELSE adoption_score * 0.9 END)),
        updated_at = :updatedAt
      WHERE seed_id = :seedId
    `);
    const listSeedsStmt = db.prepare('SELECT * FROM query_seeds WHERE active = 1 ORDER BY adoption_score DESC, seed_id');

    const upsertCandidateStmt = db.prepare(`
      INSERT INTO taxonomy_candidates (term, suggested_skill, mention_count, sample_urls_json, first_seen_at, review_status)
      VALUES (:term, :suggestedSkill, 1, :sampleUrlsJson, :now, 'pending')
      ON CONFLICT(term) DO UPDATE SET
        mention_count = taxonomy_candidates.mention_count + 1,
        sample_urls_json = :sampleUrlsJson
    `);
    const listCandidatesStmt = db.prepare('SELECT * FROM taxonomy_candidates ORDER BY mention_count DESC, term LIMIT ?');

    const updateLivenessStmt = db.prepare(`
      UPDATE experience_items SET liveness_status = :status, last_verified_at = :verifiedAt WHERE id = :id
    `);
    const archiveCohortStmt = db.prepare(`
      UPDATE experience_items
      SET liveness_status = 'archived_past_batch'
      WHERE liveness_status = 'active' AND target_grad_year IS NOT NULL AND target_grad_year < ?
    `);
    const updateCorrobStmt = db.prepare(`
      UPDATE experience_items SET corroboration_count = :count, citation_disclaimer = :disclaimer WHERE id = :id
    `);

    return {
      upsertExperiences(records) {
        const rows = records.map(encodeRecord);
        return atomic(db, () => rows.map(row => decodeRecord(upsert.get(row))));
      },
      getExperience(id) {
        return decodeRecord(byId.get(id));
      },
      getByCanonicalUrl(url) {
        return decodeRecord(byUrl.get(canonicalHttps(url)));
      },
      findNearDuplicate(simhash64, { maxDistance = 3 } = {}) {
        if (!/^[0-9a-f]{16}$/.test(simhash64 || '')) return null;
        let best = null;
        let bestDist = maxDistance + 1;
        for (const row of allSimhashes.all()) {
          const dist = hammingDistanceHex64(simhash64, row.simhash64);
          if (dist <= maxDistance && dist < bestDist) {
            best = decodeRecord(row);
            bestDist = dist;
          }
        }
        return best ? { record: best, distance: bestDist } : null;
      },
      mergeAlternateSource(id, alternateUrl) {
        const existing = decodeRecord(byId.get(id));
        if (!existing) return null;
        const merged = Array.from(new Set([...existing.alternateSources, canonicalHttps(alternateUrl)]))
          .filter(u => u !== existing.canonicalUrl);
        const nextCount = Math.max(existing.item.corroborationCount, merged.length + 1);
        const nextItem = { ...existing.item, corroborationCount: nextCount };
        return this.upsertExperiences([{
          item: nextItem,
          canonicalUrl: existing.canonicalUrl,
          simhash64: existing.simhash64,
          adRiskScore: existing.adRiskScore,
          alternateSources: merged,
        }])[0];
      },
      recomputeCorroboration({ windowDays = 30, now = new Date() } = {}) {
        const cutoff = now.getTime() - windowDays * 86400 * 1000;
        const rows = allSimhashes.all().map(decodeRecord);
        const clusters = new Map();
        for (const rec of rows) {
          const key = rec.item.corroborationCluster;
          if (!key) continue;
          const pubMs = Date.parse(rec.item.citation.publishedAt || rec.item.citation.verifiedAt);
          if (Number.isFinite(pubMs) && pubMs < cutoff) continue;
          if (!clusters.has(key)) clusters.set(key, []);
          clusters.get(key).push(rec);
        }
        let updated = 0;
        atomic(db, () => {
          for (const group of clusters.values()) {
            const count = group.reduce((sum, r) => sum + 1 + r.alternateSources.length, 0);
            for (const rec of group) {
              if (rec.item.corroborationCount !== count) {
                const disclaimer = rec.item.trustTier === 'A_OFFICIAL'
                  ? '高校与主管部门公开政策通知原文提炼，具体执行以当年最新官方章程为准'
                  : count >= 3
                    ? `社区个体实战复盘（近${windowDays}天${count}篇同方向独立经验交叉印证），仅供参考，非官方硬门槛`
                    : '社区个体实战样本，仅供参考，非官方硬门槛';
                updateCorrobStmt.run({ id: rec.item.id, count, disclaimer });
                updated++;
              }
            }
          }
        });
        return updated;
      },
      listExperiences({ limit = 100, offset = 0, activeOnly = false } = {}) {
        if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(offset) || offset < 0) {
          throw new TypeError('Expected non-negative integer limit and offset');
        }
        return (activeOnly ? listActive : list).all(limit, offset).map(decodeRecord);
      },
      deleteExperience(id) {
        return remove.run(id).changes > 0;
      },
      ensureSources(defs) {
        atomic(db, () => {
          for (const d of defs) ensureSourceStmt.run(d.id, d.label);
        });
      },
      listSources() {
        return listSourcesStmt.all().map(r => ({
          sourceId: r.source_id,
          displayName: r.display_name,
          enabled: Boolean(r.enabled),
          totalRuns: r.total_runs,
          totalFetched: r.total_fetched,
          totalAccepted: r.total_accepted,
          consecutiveFails: r.consecutive_fails,
          cooldownUntil: r.cooldown_until,
          lastAttemptAt: r.last_attempt_at,
          lastOkAt: r.last_ok_at,
          lastErrorCode: r.last_error_code,
        }));
      },
      recordSourceAttempt({ sourceId, fetched = 0, accepted = 0, failed = false, cooldownUntil = null, errorCode = null, attemptedAt = new Date().toISOString() }) {
        recordSourceStmt.run({
          sourceId,
          fetched,
          accepted,
          failed: failed ? 1 : 0,
          cooldownUntil,
          attemptedAt,
          errorCode,
        });
      },
      startCrawlRun({ runId, triggerMode = 'manual_cli', firecrawlMode = 'local_binary', startedAt = new Date().toISOString() }) {
        startRunStmt.run({ runId, triggerMode, firecrawlMode, startedAt });
      },
      finishCrawlRun({ runId, status = 'completed', queriesExecuted = 0, pagesDiscovered = 0, spamRejected = 0, itemsUpserted = 0, summary = {}, finishedAt = new Date().toISOString() }) {
        finishRunStmt.run({
          runId,
          finishedAt,
          status,
          queriesExecuted,
          pagesDiscovered,
          spamRejected,
          itemsUpserted,
          summaryJson: JSON.stringify(summary),
        });
      },
      listCrawlRuns(limit = 10) {
        return listRunsStmt.all(limit).map(r => ({
          runId: r.run_id,
          triggerMode: r.trigger_mode,
          firecrawlMode: r.firecrawl_mode,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
          status: r.status,
          queriesExecuted: r.queries_executed,
          pagesDiscovered: r.pages_discovered,
          spamRejected: r.spam_rejected,
          itemsUpserted: r.items_upserted,
          summary: r.summary_json ? JSON.parse(r.summary_json) : {},
        }));
      },
      upsertQuerySeeds(seeds, updatedAt = new Date().toISOString()) {
        atomic(db, () => {
          for (const s of seeds) {
            upsertSeedStmt.run({
              seedId: s.seedId,
              channel: s.channel,
              queryTemplate: s.queryTemplate,
              pathsJson: JSON.stringify(s.paths || ['jiuye']),
              seasonMonths: JSON.stringify(s.seasonMonths || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
              skillId: s.skillId ?? null,
              adoptionScore: s.adoptionScore ?? 0.5,
              active: s.active === false ? 0 : 1,
              updatedAt,
            });
          }
        });
      },
      recordSeedYield(seedId, accepted, updatedAt = new Date().toISOString()) {
        recordSeedYieldStmt.run({ seedId, accepted, updatedAt });
      },
      listQuerySeeds() {
        return listSeedsStmt.all().map(r => ({
          seedId: r.seed_id,
          channel: r.channel,
          queryTemplate: r.query_template,
          paths: JSON.parse(r.paths_json),
          seasonMonths: JSON.parse(r.season_months),
          skillId: r.skill_id,
          runsCount: r.runs_count,
          acceptedYield: r.accepted_yield,
          adoptionScore: r.adoption_score,
          active: Boolean(r.active),
          updatedAt: r.updated_at,
        }));
      },
      recordTaxonomyCandidate({ term, suggestedSkill = null, sampleUrl, now = new Date().toISOString() }) {
        const cleanTerm = String(term || '').trim().toLowerCase().slice(0, 60);
        if (!cleanTerm) return;
        const existing = db.prepare('SELECT sample_urls_json FROM taxonomy_candidates WHERE term = ?').get(cleanTerm);
        const urls = existing ? JSON.parse(existing.sample_urls_json) : [];
        if (sampleUrl && !urls.includes(sampleUrl) && urls.length < 5) urls.push(sampleUrl);
        upsertCandidateStmt.run({
          term: cleanTerm,
          suggestedSkill,
          sampleUrlsJson: JSON.stringify(urls),
          now,
        });
      },
      listTaxonomyCandidates(limit = 30) {
        return listCandidatesStmt.all(limit).map(r => ({
          term: r.term,
          suggestedSkill: r.suggested_skill,
          mentionCount: r.mention_count,
          sampleUrls: JSON.parse(r.sample_urls_json),
          firstSeenAt: r.first_seen_at,
          reviewStatus: r.review_status,
        }));
      },
      sweepLifecycle({ minActiveGradYear = 2027, deadIds = [], verifiedAt = new Date().toISOString() } = {}) {
        return atomic(db, () => {
          const archived = archiveCohortStmt.run(minActiveGradYear).changes;
          let removed = 0;
          for (const id of deadIds) {
            removed += updateLivenessStmt.run({ id, status: 'source_removed', verifiedAt }).changes;
          }
          return { archivedPastBatch: archived, markedSourceRemoved: removed };
        });
      },
      markVerified(id, verifiedAt = new Date().toISOString()) {
        updateLivenessStmt.run({ id, status: 'active', verifiedAt });
      },
      close() {
        db.close();
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
