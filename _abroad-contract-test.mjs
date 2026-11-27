import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assertAbroadShape } from './_abroad-contract.mjs';
import { evaluateAbroadScamRisk, isVerifiedFeiyueRepo, normalizeUndergradTier } from './_abroad-cleaner.mjs';
import { openAbroadDb } from './_abroad-db.mjs';
import { refreshOfficialProgram } from './_abroad-program-ingestor.mjs';
import { collectFeiyueCases } from './_abroad-feiyue-parser.mjs';
import { collectOfficialAbroadCase } from './_abroad-official-cases.mjs';
import { collectAbroadCommunityCases, parseCommunityCase } from './_abroad-community.mjs';
import { assertAbroadSnapshot, buildAbroadSnapshot } from './_abroad-snapshot.mjs';
import { assertEmploymentShape } from './_employment-contract.mjs';
import { employmentEngine, readEmploymentData } from './_employment-data.mjs';
import { createCourseCompassServer } from './_serve.mjs';

const university = {
  id: 'univ_fixture', nameZh: '示例大学', nameEn: 'Example University', region: 'uk',
  countryCode: 'GB', city: 'London', officialDomain: 'example.ac.uk', openalexId: null,
  qsBand: null, pswVisaPolicy: 'unknown', listStrictness: 'strict_list',
};
const program = {
  id: 'prog_fixture', schemaVersion: '1.0', universityId: university.id,
  titleEn: 'MSc Computer Science', titleZh: '计算机科学硕士', degreeType: 'msc_taught',
  discipline: 'cs_ai', orientation: 'balanced', durationMonths: 12, tuitionCurrency: 'GBP',
  tuitionAmount: 20000, estTotalRmbPerYear: 300000, tierGpaRules: { '985': 80, blockedTiers: [] },
  prereqMode: 'core_required', prereqCourseTags: ['prog_basic'], allowedMajors: ['cs'],
  langPolicy: 'conditional_allowed', ieltsOverall: 6.5, ieltsSubMin: 6, toeflOverall: null,
  greGmatPolicy: 'not_required', admissionMode: 'rounds',
  rounds: [{ round: 'Round 1', deadline: '2027-01-10' }], coreModules: [],
  officialUrl: 'https://admissions.example.ac.uk/msc', requirementQuote: 'Programming is required.',
  verifiedAt: '2026-11-27', livenessStatus: 'active',
};
const admission = {
  id: 'case_fixture', schemaVersion: '1.0', programId: program.id, intakeTerm: '2027Fall',
  outcome: 'reject', undergradTier: 'unknown', undergradSchoolTag: 'unknown', undergradMajor: '软件工程',
  majorFamily: 'cs', gpaPercent: null, gpaRawText: 'unknown', rankBucket: 'unknown',
  langText: 'unknown', greGmatText: null, highlights: [], submittedMonth: null, decisionMonth: null,
  keyTakeaway: '仅观察到拒信，原因未披露。', sourceChannel: 'github_feiyue', sourceLabel: '公开手册',
  sourceUrl: 'https://github.com/example/guide', simhash64: '0000000000000001', verifiedAt: '2026-11-27',
};

test('weekly community crawl imports explicit cases without visiting community pages', async () => {
  const claim = '我申请 Example University MSc Computer Science 2027Fall 后收到拒信';
  const article = { url:'https://zhuanlan.zhihu.com/p/123?tracking=1', title:'申请总结', description:claim };
  const config = { channelId:'zhihu', program, school:university };
  assert.equal(parseCommunityCase(article, config).outcome, 'reject');
  assert.equal(parseCommunityCase({ ...article, description:claim + '？' }, config), null);
  assert.equal(parseCommunityCase({ ...article, description:claim + '，扣1领资料' }, config), null);
  assert.equal(parseCommunityCase({ ...article, description:claim.replace('2027Fall','明年') }, config), null);
  assert.equal(parseCommunityCase({ ...article, url:'https://www.zhihu.com/question/123' }, config), null);
  const cases = await collectAbroadCommunityCases({
    client:{ async searchPages(options) {
      assert.equal(options.tbs, 'qdr:w');
      return [article, { ...article, url:'https://zhuanlan.zhihu.com/p/123?tracking=2' }];
    } },
    programs:[program], schools:new Map([[university.id,university]]),
    searches:[{programId:program.id,channelId:'zhihu'}],
  });
  assert.equal(cases.length, 1);
  assert.equal(cases[0].sourceUrl, 'https://zhuanlan.zhihu.com/p/123');
  assert.doesNotMatch(JSON.stringify(cases), /我申请/);
});

test('official case requires an explicit, matching admission statement and keeps only case facts', async () => {
  const evidence = 'I was admitted to MSc Computer Science in Fall 2026';
  const reviewed = { sourceUrl:program.officialUrl, evidence, intakeTerm:'2026Fall' };
  const deps = { fetchImpl: async () => new Response('User-agent: *\nAllow: /'),
    client: { async scrapePage() { return { markdown:'Private-looking signature: name@example.org\n' + evidence }; } } };
  const result = await collectOfficialAbroadCase(reviewed, program, university, deps);
  assert.equal(result.outcome, 'offer');
  assert.equal(result.gpaPercent, null);
  assert.doesNotMatch(JSON.stringify(result), /name@example.org/);
  await assert.rejects(collectOfficialAbroadCase({ ...reviewed, intakeTerm:'2027Fall' }, program, university, deps), /explicit intake/);
  await assert.rejects(collectOfficialAbroadCase(reviewed, { ...program, titleEn:'Different Program' }, university, deps), /admission statement/);
});

test('serves filtered study abroad data from the same-origin API with a snapshot fallback', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-abroad-api-'));
  const catalogFile = join(dir, 'catalog.json');
  const abroadDbPath = join(dir, 'abroad.db');
  const alternate = { ...program, id:'prog_alt', titleZh:'另一个项目' };
  writeFileSync(catalogFile, JSON.stringify({ ...readEmploymentData(), studyAbroad: {
    schemaVersion: '1.0', universities: [university], programs: [program, alternate], cases: [admission],
  } }));
  const server = createCourseCompassServer({ catalogFile, abroadDbPath, abroadManifest:'reviewed.json',
    abroadCrawlRunner: async ({manifest}) => {
      assert.equal(manifest, 'reviewed.json');
      return { programs:[program], cases:[admission] };
    },
  }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port + '/api/abroad/';
    const get = async (path, options) => {
      const response = await fetch(base + path, options);
      return { status: response.status, body: await response.json() };
    };
    const result = await get('programs?region=uk&discipline=cs_ai&langPolicy=conditional_allowed&q=computer');
    assert.equal(result.body.source, 'snapshot');
    assert.equal(result.body.items[0].university.id, university.id);
    assert.equal((await get('programs?maxBudgetRmb=1')).body.total, 0);
    assert.equal((await get('cases?programId=' + program.id + '&outcome=reject')).body.total, 1);
    assert.equal((await get('cases?gpaMin=50')).body.total, 0);
    assert.equal((await get('programs?limit=0')).status, 400);
    assert.equal((await get('programs', { headers: { origin: 'https://example.org' } })).status, 403);
    const trigger = { method:'POST', headers:{'content-type':'application/json'}, body:'{}' };
    assert.deepEqual((await get('crawl/trigger', trigger)).body, { programs:1, cases:1 });
    const proxied = await get('crawl/trigger', { ...trigger, headers:{...trigger.headers, 'x-forwarded-for':'192.0.2.1'} });
    assert.equal(proxied.status, 403);
    const evaluated = await get('evaluate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: { schoolTier: '985', gpa: 90, courses: [] } }),
    });
    assert.equal(evaluated.status, 200);
    assert.equal(evaluated.body.reach.length + evaluated.body.match.length + evaluated.body.safety.length, 2);
    const compared = await fetch(base + 'llm/compare', {
      method:'POST', headers:{'content-type':'application/json',accept:'text/event-stream'},
      body:JSON.stringify({ programIds:[program.id,alternate.id], profile:{ schoolTier:'985', gpa:90 } }),
    });
    assert.equal(compared.status, 200);
    assert.match(compared.headers.get('content-type'), /text\/event-stream/);
    const events = await compared.text();
    assert.match(events, /^event: assessment/);
    const resultLine = events.split('event: result\n')[1].split('\n')[0];
    const advice = JSON.parse(resultLine.slice(6));
    assert.equal(advice.mode, 'rule_fallback');
    assert.deepEqual(new Set(advice.rows.map(row => row.programId)), new Set([program.id, alternate.id]));
    const outline = await get('llm/sop-outline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ programId: program.id, profile: { evidences: [
        { id:'ev_verified', title:'Verified project', verificationStatus:'user_confirmed', metrics:[{label:'Unverified result',value:100}] },
        { id:'ev_draft', title:'Draft project', verificationStatus:'unverified' },
      ] } }),
    });
    assert.equal(outline.status, 200);
    assert.deepEqual(outline.body.materials.map(item => item.evidenceId), ['ev_verified']);
    assert.ok(outline.body.markdown.includes('[待补充实测数据]'));
    assert.doesNotMatch(outline.body.markdown, /Unverified result|Draft project/);
    const db = openAbroadDb(abroadDbPath);
    try { db.upsert({ universities: [university], programs: [{ ...program, titleEn: 'Warehouse title' }] }); }
    finally { db.close(); }
    const full = await get('programs?q=warehouse');
    assert.equal(full.body.source, 'warehouse');
    assert.equal(full.body.total, 1);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('selection engine preserves hard gates, course status and separate case outcomes', () => {
  const CC = employmentEngine(readEmploymentData());
  const now = new Date('2026-11-27T00:00:00Z');
  const twoRounds = { ...program, rounds: [
    {round:'Round 1',deadline:'2026-11-20'},
    {round:'Round 2',openDate:'2026-11-23',deadline:'2026-12-20'},
  ] };
  assert.equal(CC.abroadRoundStatus(twoRounds, now).round.round, 'Round 2');
  assert.equal(CC.abroadRoundStatus(twoRounds, now).status, 'open');
  assert.equal(CC.abroadRoundStatus(twoRounds, new Date('2026-12-21')).status, 'closed');
  assert.equal(CC.buildAbroadMilestones(twoRounds, new Date('2026-12-21')).length, 0);
  assert.deepEqual(Array.from(CC.buildAbroadMilestones(program, now), item => item.deadline), ['2027-01-10', null]);
  assert.deepEqual(Array.from(CC.buildAbroadMilestones({ ...program, langPolicy:'required_at_submit' }, now),
    item => item.deadline), ['2027-01-10', '2027-01-10']);
  const profile = { schoolTier: '985', gpa: 88, major: 'cs', courses: [{ name: '程序设计基础', status: '已通过' }] };
  const denied = { ...program, tierGpaRules: { blockedTiers: ['985'] } };
  assert.equal(CC.evaluateAbroadProgram(profile, {}, denied).band, 'blocked');
  const strict = { ...program, prereqMode: 'strict_ects', prereqCourseTags: ['math_calculus', 'cs_core'] };
  assert.equal(CC.evaluateAbroadProgram({ ...profile, major: 'econ' }, {}, strict).eligibility.status, 'FAIL');
  assert.equal(CC.evaluateAbroadProgram(profile, {}, program).eligibility.status, 'CONDITIONAL');
  assert.equal(CC.evaluateAbroadProgram({}, {}, program).eligibility.status, 'UNKNOWN');
  const language = { ieltsOverall: 7, ieltsSubMin: 6 };
  assert.equal(CC.evaluateAbroadProgram(profile, { language }, program).eligibility.status, 'PASS');
  const passed = { ...admission, id: 'case_offer', outcome: 'offer', undergradTier: '985', gpaPercent: 85 };
  const matched = CC.evaluateAbroadProgram(profile, { language }, program, new Date(), [passed]);
  assert.equal(matched.band, 'safety');
  const samples = CC.similarAbroadCases(profile, [passed, admission], { programId: program.id });
  assert.equal(samples.offers[0].id, passed.id);
  assert.equal(samples.cautions[0].id, admission.id);
  const programs = Array.from({ length: 210 }, (_, i) => ({ ...program, id: 'prog_' + i }));
  CC.matchAbroadPrograms(profile, { language }, programs);
  const started = performance.now();
  assert.equal(CC.matchAbroadPrograms(profile, { language }, programs).length, 210);
  console.log('210-program ranking:', (performance.now() - started).toFixed(2), 'ms');
});

test('imports only licensed, explicit case outcomes without copying personal text', async () => {
  const revision = 'a'.repeat(40);
  const source = { repository: 'example/handbook', revision, path: 'content/case.md', license: 'MIT' };
  const markdown = [
    '# 留学申请总结',
    '姓名：张三，example@example.com',
    '| MSc Computer Science | 2027Fall | Offer |',
    '| MSc Computer Science | 2027Fall | Reject |',
    '| Other Course | 2027Fall | Offer |',
    '| MSc Computer Science | 2027Fall | Unknown |',
  ].join('\n');
  const file = { type: 'file', path: source.path, encoding: 'base64', content: Buffer.from(markdown).toString('base64') };
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return Response.json(url.includes('/license?') ? { license: { spdx_id: 'MIT' } } : file);
  };
  const cases = await collectFeiyueCases(source, [program], { fetchImpl });
  assert.deepEqual(cases.map(item => item.outcome), ['offer', 'reject']);
  assert.ok(cases.every(item => item.sourceUrl.includes(revision) && item.programId === program.id));
  assert.doesNotMatch(JSON.stringify(cases), /张三|example@example.com/);
  assert.equal(calls.length, 2);
  await assert.rejects(collectFeiyueCases({ ...source, license: 'CC0-1.0' }, [program], { fetchImpl }), /license differs/);
  assert.equal(calls.length, 3);
});

test('refreshes grounded official evidence and does not scrape disallowed paths', async () => {
  const markdown = [
    'Duration: 1 calendar year',
    '#### Overseas tuition fees (2026/27)',
    '£20,000',
    'A minimum of a bachelor’s degree is required.',
    'IELTS Academic 7.0 overall and 6.5 in each component',
  ].join('\n');
  let requests = 0;
  const client = { async scrapePage() { requests++; return { markdown, metadata: { url: program.officialUrl } }; } };
  const allowed = async () => new Response('User-agent: *\nDisallow: /private');
  const refreshed = await refreshOfficialProgram(university, program, { client, fetchImpl: allowed });
  assert.equal(refreshed.requirementQuote, 'A minimum of a bachelor’s degree is required.');
  assert.equal(refreshed.ieltsSubMin, 6.5);
  await assert.rejects(refreshOfficialProgram(university, program, {
    client, fetchImpl: async () => new Response('User-agent: *\nDisallow: /msc'),
  }), /robots.txt/);
  assert.equal(requests, 1);
  await assert.rejects(refreshOfficialProgram(university, { ...program, tuitionAmount: 10000 }, {
    client, fetchImpl: allowed,
  }), /annual RMB estimate/);
});

test('validates the three contracts and rejects missing evidence and unsupported fields', () => {
  assertAbroadShape('University', university);
  assertAbroadShape('StudyAbroadProgram', program);
  assertAbroadShape('AdmissionCase', admission);
  const missingLink = { ...program };
  delete missingLink.officialUrl;
  assert.throws(() => assertAbroadShape('StudyAbroadProgram', missingLink), /officialUrl/);
  assert.throws(() => assertAbroadShape('StudyAbroadProgram', { ...program, requirementQuote: ' ' }), /requirementQuote/);
  assert.throws(() => assertAbroadShape('AdmissionCase', { ...admission, outcome: 'pending' }), /outcome/);
  assert.throws(() => assertAbroadShape('AdmissionCase', { ...admission, email: 'example@example.com' }), /email/);
});

test('upserts idempotently, keeps outcomes distinct and rolls back a failed batch', () => {
  const db = openAbroadDb(':memory:');
  try {
    db.upsert({ universities: [university], programs: [program], cases: [admission] });
    db.upsert({ cases: [admission, { ...admission, id: 'case_duplicate' }, { ...admission, id: 'case_offer', outcome: 'offer' }] });
    assert.deepEqual(db.listPrograms({ region: 'uk', discipline: 'cs_ai' }), [program]);
    assert.deepEqual(db.listCases({ programId: program.id, outcome: 'reject' }), [admission]);
    assert.equal(db.listCases({ programId: program.id }).length, 2);
    const snapshot = buildAbroadSnapshot(db);
    assert.deepEqual(snapshot.programs, [program]);
    assert.deepEqual(snapshot.cases.map(item => item.outcome), ['offer', 'reject']);
    assert.throws(() => assertAbroadSnapshot({ ...snapshot, programs: [] }), /missing program/);
    assert.throws(() => assertAbroadSnapshot({ ...snapshot, cases: Array(1000).fill(admission) }), /320KB/);
    assertEmploymentShape('Catalog', { ...readEmploymentData(), studyAbroad: snapshot });
    assert.deepEqual(db.findSimilarCases({ ...admission, simhash64: '0000000000000003' }), [admission]);
    const wrongDomain = { ...program, officialUrl: 'https://example.ac.uk.other.com/msc' };
    assert.throws(() => db.upsert({ universities: [{ ...university, city: 'Oxford' }], programs: [wrongDomain] }), /officialUrl/);
    assert.deepEqual(db.getUniversity(university.id), university);
    db.recordCrawlRun({ runId: 'run_test_1', startedAt: '2026-11-27T00:00:00Z', finishedAt: '2026-11-27T00:01:00Z', status: 'completed', programsVerified: 2, casesUpserted: 3, scamsRejected: 1, summary: { ok: true } });
    assert.equal(db.listCrawlRuns(5)[0].runId, 'run_test_1');
  } finally {
    db.close();
  }
});

test('scam & safety gate intercepts >=98% guaranteed-admission/agency ads, blocks non-academic repos, and caches robots.txt per origin', async () => {
  const maliciousSamples = [
    '留学双非72分保录取G5名校，不出分拿offer，私信咨询',
    '英国港三稳录班，免雅思直录港大商科，内部保录名额最后2席',
    '27Fall留学选校定位，评论区扣1领选校表和院校list',
    '后台私信发定位报告，加学长vx评估冲稳保方案',
    '留学全套文书代写，操作成绩单背景挂靠直通藤校保过',
    '付费内推名校夏令营与教授内推保过，扣6拿资料包',
    '完全无关的小说书单与娱乐八卦内容，没有任何深造信息',
    '非法博彩平台返利推广与留学申请混杂引流',
  ];
  const legitimateSamples = [
    '26Fall DIY申请总结：双非软件工程均分86.5，IELTS 7.0(6.0)，申了曼大ACS被卡List拒信，布里斯托CS和鲁汶AI拿到Offer。',
    '985自动化均分84，TUM电气工程APS审核顺利通过，1月递交网申3月收到录取通知。',
    '211金融学均分87，港中文商分Round1递交，GMAT 690，11月面试后获有条件录取。',
    '普通一本汉语言文学均分85，跨申港城大整合营销传播，用六级530分直申拿到Offer，没有找中介纯DIY。',
  ];
  const blockedCount = maliciousSamples.filter(sample => evaluateAbroadScamRisk(sample).blocked).length;
  assert.ok(blockedCount / maliciousSamples.length >= 0.98, 'Expected >=98% scam/unsafe interception');
  assert.ok(legitimateSamples.every(sample => !evaluateAbroadScamRisk(sample).blocked), 'Legitimate DIY posts must pass');

  assert.equal(isVerifiedFeiyueRepo('SUSTech-Application/SUSTechapplication'), true);
  assert.equal(isVerifiedFeiyueRepo('Dujltqzv/Some-Many-Books', { allowExplicitTestRepo: true }), false);
  assert.equal(isVerifiedFeiyueRepo('cirosantilli/unrelated-dump', { allowExplicitTestRepo: true }), false);
  assert.equal(isVerifiedFeiyueRepo('unverified/random-repo', { allowExplicitTestRepo: false }), false);

  assert.equal(normalizeUndergradTier('末流985理工'), '985');
  assert.equal(normalizeUndergradTier('西交利物浦 4+0'), 'sino_foreign');
  assert.equal(normalizeUndergradTier('双非一本'), 'non_double_first_class');

  // Verify robotsCache reuses robots.txt across multiple pages on the same university origin and follows safe same-domain redirects
  const robotsCache = new Map();
  let robotsHits = 0;
  const markdown = 'A minimum of a bachelor’s degree is required.\nIELTS Academic 6.5 overall and 6.0 in each component';
  const fetchImpl = async url => {
    robotsHits++;
    if (String(url).startsWith('https://admissions.example.ac.uk/robots.txt')) {
      return new Response(null, { status: 301, headers: { location: 'https://www.example.ac.uk/robots.txt' } });
    }
    return new Response('User-agent: *\nAllow: /');
  };
  const client = { async scrapePage({ url }) { return { markdown, metadata: { url } }; } };
  await refreshOfficialProgram(university, program, { client, fetchImpl, robotsCache });
  await refreshOfficialProgram(university, { ...program, id: 'prog_fixture_2', officialUrl: 'https://admissions.example.ac.uk/msc-ai' }, { client, fetchImpl, robotsCache });
  assert.equal(robotsHits, 2, 'Expected 1 redirect hop + 1 target robots.txt fetch total, reused on second program of same origin');

  await assert.rejects(refreshOfficialProgram(university, program, {
    client,
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example.org/robots.txt' } }),
  }), /officialUrl/);
});
