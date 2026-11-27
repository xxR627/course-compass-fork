import { createHash } from 'node:crypto';
import { assertAbroadShape } from './_abroad-contract.mjs';
import { cleanAbroadCaseSource, isVerifiedFeiyueRepo } from './_abroad-cleaner.mjs';
import { computeSimhash64 } from './_experience-cleaner.mjs';

const outcomes = new Map([
  ['offer', 'offer'], ['录取', 'offer'], ['conditional offer', 'conditional_offer'], ['有条件录取', 'conditional_offer'],
  ['waitlist', 'waitlist'], ['候补', 'waitlist'], ['reject', 'reject'], ['rejected', 'reject'], ['拒信', 'reject'], ['拒绝', 'reject'],
]);
const supportedLicenses = new Set(['MIT', 'Apache-2.0', 'CC-BY-4.0', 'CC0-1.0']);

export function parseFeiyueCases(markdown, { sourceUrl, programs, verifiedAt }) {
  const titles = new Map();
  for (const program of programs) {
    for (const title of [program.titleEn, program.titleZh]) {
      const key = title.normalize('NFKC').trim().toLowerCase();
      const matches = titles.get(key) ?? new Set();
      matches.add(program.id);
      titles.set(key, matches);
    }
  }
  const seen = new Set();
  const cases = [];
  for (const line of cleanAbroadCaseSource(markdown)) {
    const [name, intakeTerm, rawOutcome, ...extra] = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
    if (extra.length || !/^20\d{2}(?:Fall|Spring|Summer|Winter)$/.test(intakeTerm || '')) continue;
    const matches = titles.get(name.toLowerCase());
    const outcome = outcomes.get(rawOutcome?.toLowerCase());
    if (!outcome || matches?.size !== 1) continue;
    const [programId] = matches;
    const identity = [sourceUrl, programId, intakeTerm, outcome].join('\n');
    if (seen.has(identity)) continue;
    seen.add(identity);
    const item = {
      id: 'case_fy_' + createHash('sha256').update(identity).digest('hex').slice(0, 24),
      schemaVersion: '1.0', programId, intakeTerm, outcome,
      undergradTier: 'unknown', undergradSchoolTag: 'unknown', undergradMajor: 'unknown',
      majorFamily: 'other', gpaPercent: null, gpaRawText: 'unknown', rankBucket: 'unknown',
      langText: 'unknown', greGmatText: null, highlights: [], submittedMonth: null, decisionMonth: null,
      keyTakeaway: '公开手册记载的个人申请结果，具体原因未核实。',
      sourceChannel: 'github_feiyue', sourceLabel: '开源飞跃手册', sourceUrl,
      simhash64: computeSimhash64(identity.replace(sourceUrl, createHash('sha256').update(sourceUrl).digest('hex'))),
      verifiedAt,
    };
    assertAbroadShape('AdmissionCase', item);
    cases.push(item);
  }
  return cases;
}

async function githubJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error('GitHub source unavailable (HTTP ' + response.status + ')');
  return response.json();
}

export async function collectFeiyueCases(source, programs, { fetchImpl = fetch, now = new Date(), allowExplicitTestRepo = true } = {}) {
  const { repository, revision, path, license } = source;
  if (!isVerifiedFeiyueRepo(repository, { allowExplicitTestRepo }) || !/^[a-f0-9]{40}$/.test(revision) ||
      typeof path !== 'string' || !path.endsWith('.md') || path.split('/').some(part => !part || part === '..' || part === '.') ||
      !supportedLicenses.has(license)) throw new Error('Expected a reviewed, licensed GitHub Markdown source pinned to a commit');
  const api = 'https://api.github.com/repos/' + repository;
  const filePath = path.split('/').map(encodeURIComponent).join('/');
  const licenseFile = await githubJson(api + '/license?ref=' + revision, fetchImpl);
  if (licenseFile.license?.spdx_id !== license) throw new Error('GitHub license differs from the reviewed source');
  const file = await githubJson(api + '/contents/' + filePath + '?ref=' + revision, fetchImpl);
  if (file.type !== 'file' || file.path !== path || file.encoding !== 'base64' || typeof file.content !== 'string' ||
      file.size > 120000) throw new Error('Expected a small Markdown file from the reviewed source');
  return parseFeiyueCases(Buffer.from(file.content, 'base64').toString('utf8'), {
    sourceUrl: 'https://github.com/' + repository + '/blob/' + revision + '/' + filePath,
    programs, verifiedAt: now.toISOString(),
  });
}
