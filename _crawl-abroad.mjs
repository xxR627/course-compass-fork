import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openAbroadDb } from './_abroad-db.mjs';
import { refreshOfficialProgram } from './_abroad-program-ingestor.mjs';
import { createFirecrawlClient } from './_firecrawl-client.mjs';
import { collectFeiyueCases } from './_abroad-feiyue-parser.mjs';
import { collectOfficialAbroadCase } from './_abroad-official-cases.mjs';
import { collectAbroadCommunityCases } from './_abroad-community.mjs';
import { buildBaselineAbroadCatalog } from './_abroad-seed-baseline.mjs';

export async function runAbroadCrawl({
  manifest,
  dryRun = false,
  includeBaseline = false,
  abroadDbPath,
  client = createFirecrawlClient({ embeddedFallback: true }),
  fetchImpl = fetch,
  now = new Date(),
}) {
  const { universities, programs, reviewedFeiyueSources = [], reviewedOfficialCases = [], communitySearches = [] } = JSON.parse(await readFile(manifest, 'utf8'));
  if (!Array.isArray(universities) || !Array.isArray(programs) || programs.length === 0) {
    throw new Error('Manifest must include universities and at least one reviewed program');
  }
  if (!Array.isArray(reviewedFeiyueSources) || !Array.isArray(reviewedOfficialCases) || !Array.isArray(communitySearches)) {
    throw new Error('Reviewed case sources must be arrays');
  }

  const startedAt = now.toISOString();
  const runId = `abroad_run_${startedAt.slice(0, 10).replaceAll('-', '')}_${randomUUID().slice(0, 6)}`;
  const robotsCache = new Map();
  const byId = new Map(universities.map(university => [university.id, university]));
  const verified = [];

  for (const program of programs) {
    const university = byId.get(program.universityId);
    if (!university) throw new Error('Missing university in manifest: ' + program.universityId);
    verified.push(await refreshOfficialProgram(university, program, { client, fetchImpl, now, robotsCache }));
  }

  const cases = [];
  for (const source of reviewedFeiyueSources) {
    cases.push(...await collectFeiyueCases(source, verified, { fetchImpl, now }));
  }
  for (const source of reviewedOfficialCases) {
    const program = verified.find(item => item.id === source.programId);
    if (!program) throw new Error('Missing reviewed case program: ' + source.programId);
    cases.push(await collectOfficialAbroadCase(source, program, byId.get(program.universityId), { client, fetchImpl, now, robotsCache }));
  }
  cases.push(...await collectAbroadCommunityCases({ client, programs: verified, schools: byId, searches: communitySearches, now }));

  if (!dryRun) {
    const db = openAbroadDb(abroadDbPath);
    try {
      if (includeBaseline) {
        const baseline = buildBaselineAbroadCatalog(startedAt.slice(0, 10));
        db.upsert(baseline);
      }
      db.upsert({ universities, programs: verified, cases });
      db.recordCrawlRun({
        runId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'completed',
        programsVerified: verified.length,
        casesUpserted: cases.length,
        scamsRejected: 0,
        summary: { manifestPrograms: programs.length, communitySearches: communitySearches.length, includeBaseline },
      });
    } finally {
      db.close();
    }
  }
  return { runId, dryRun, programs: verified, cases };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: {
    manifest: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'with-baseline': { type: 'boolean', default: true },
  } });
  if (!values.manifest) throw new Error('Usage: node _crawl-abroad.mjs --manifest <reviewed-programs.json> [--dry-run] [--no-with-baseline]');
  console.log(JSON.stringify(await runAbroadCrawl({
    manifest: values.manifest,
    dryRun: values['dry-run'],
    includeBaseline: values['with-baseline'],
  }), null, 2));
}
