import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { employmentEngine, readEmploymentData } from './_employment-data.mjs';
import { matchAllowedChannelUrl } from './_experience-channels.mjs';
import { canonicalizeExperienceUrl, computeSimhash64, evaluateSpamAndAdRisk, redactExperiencePii } from './_experience-cleaner.mjs';
import { assertExperienceItem } from './_experience-contract.mjs';
import { openExperienceDb } from './_experience-db.mjs';
import { distillExperiencePost } from './_experience-distiller.mjs';
import { allocateChannelQuotas, planWeeklyQueries } from './_experience-query-planner.mjs';
import { createFirecrawlClient } from './_firecrawl-client.mjs';
import {
  checkIpAddress,
  cleanHtmlToMarkdown,
  createFirecrawlLocalEngine,
  createFirecrawlLocalServer,
  guardPublicUrl,
  isRobotsAllowed,
} from './_firecrawl-local-serve.mjs';

const citation = {
  sourceUrl: 'https://www.nowcoder.com/discuss/123',
  publishedAt: '2026-11-21',
  verifiedAt: '2026-11-27T14:00:00Z',
  extractMode: 'full_markdown',
  disclaimer: '社区个体实战复盘，仅供参考',
};
const item = {
  id: 'exp_nc_91c4e2a0', schemaVersion: '1.0', platform: 'nowcoder', platformLabel: '牛客网',
  trustTier: 'B_EXPERIENCE', livenessStatus: 'active', category: 'interview_exp',
  title: '后端实习面经复盘', tldr: '用具体压测数据解释缓存设计与异常恢复。',
  paths: ['jiuye'], directionIds: ['software', 'data'], familyIds: ['backend', 'ai-applications'],
  mappedSkillIds: ['golang', 'redis', 'sql_rdbms', 'computer_networks'], targetOrgs: ['腾讯'], targetGradYear: 2027,
  authorBaseline: { schoolTier: 'non_double_first_class', majorFamily: 'cs', rankBucket: 'unknown', startingState: 'zero_internship' },
  keySteps: ['为缓存加入击穿保护', '对比启用缓存前后的 P99 延迟'],
  interviewQuestions: ['锁过期时如何保障操作幂等？'], pitfalls: [],
  actionTask: { title: '补齐压测记录', estimatedHours: 4, deliverable: 'README 压测对比表', targetModule: 'evidence' },
  guidanceScore: 0.88, corroborationCount: 1, corroborationCluster: 'backend:redis', citation,
};
const doc = { markdown: '# Public page\n\nPublic guidance.', links: ['https://example.com/'], metadata: { statusCode: 200 } };
const success = data => Response.json({ success: true, data });
const health = () => Response.json({ status: 'ok', engine: 'firecrawl-local' });

test('experience schema validates evidence, hyphenated family IDs, taxonomy and source tiers', () => {
  assert.doesNotThrow(() => assertExperienceItem(item));
  assert.doesNotThrow(() => assertExperienceItem({ ...item, trustTier: 'A_OFFICIAL', platform: 'bilibili_edu',
    citation: { ...citation, sourceUrl: 'https://careers.example.edu.cn/notice/1' } }));
  const noSource = { ...citation };
  delete noSource.sourceUrl;
  for (const [patch, field] of [
    [{ trustTier: 'UNKNOWN_TIER' }, /trustTier/],
    [{ trustTier: 'A_OFFICIAL', platform: 'bilibili_edu' }, /sourceUrl/],
    [{ trustTier: 'A_OFFICIAL' }, /platform/],
    [{ mappedSkillIds: ['nonexistent_skill'] }, /mappedSkillIds\/0 has unknown ID/],
    [{ familyIds: ['nonexistent_family'] }, /familyIds\/0 has unknown ID/],
    [{ directionIds: ['nonexistent_direction'] }, /directionIds\/0 has unknown ID/],
    [{ citation: noSource }, /citation\/sourceUrl/],
    [{ citation: { ...citation, sourceUrl: 'javascript:alert(1)' } }, /citation\/sourceUrl/],
    [{ citation: { ...citation, sourceUrl: 'https://name@example.com/' } }, /citation\/sourceUrl/],
    [{ citation: { ...citation, publishedAt: '2026-02-30' } }, /citation\/publishedAt/],
    [{ actionTask: { ...item.actionTask, estimatedHours: 0 } }, /actionTask\/estimatedHours/],
    [{ authorBaseline: { ...item.authorBaseline, fullName: '测试' } }, /authorBaseline\/fullName/],
    [{ rawMarkdown: '原文' }, /rawMarkdown/],
  ]) {
    assert.throws(() => assertExperienceItem({ ...item, ...patch }), field);
  }
});

test('SQLite migrates, deduplicates SimHash near-copies, clusters corroboration, and rolls back failed batches', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-experiences-'));
  const file = join(dir, 'nested', 'experiences.db');
  const simA = computeSimhash64('双非计算机零大厂实习，春招补录腾讯后端日常实习一面+二面复盘：Redis分布式锁与MySQL慢查询');
  const simNear = computeSimhash64('双非计算机零大厂实习，春招补录腾讯后端日常实习一面+二面复盘：Redis分布式锁与MySQL慢查询！');
  const record = { item, simhash64: simA };
  let db = openExperienceDb(file);
  try {
    const [first] = db.upsertExperiences([record]);
    assert.deepEqual(first.item, item);
    assert.equal(first.canonicalUrlHash.length, 64);
    assert.deepEqual(db.getByCanonicalUrl(citation.sourceUrl + '#comments'), first);

    // Near-duplicate SimHash detection & alternate source merge
    const nearHit = db.findNearDuplicate(simNear, { maxDistance: 3 });
    assert.ok(nearHit && nearHit.record.item.id === item.id);
    const merged = db.mergeAlternateSource(item.id, 'https://zhuanlan.zhihu.com/p/888888');
    assert.equal(merged.alternateSources.length, 1);
    assert.ok(merged.item.corroborationCount >= 2);

    const [updated] = db.upsertExperiences([{ ...record, alternateSources: merged.alternateSources, item: { ...merged.item, id: 'exp_alt', title: '更新后的复盘' } }]);
    assert.equal(updated.item.id, first.item.id);
    assert.equal(updated.fetchedAt, first.fetchedAt);
    assert.equal(db.listExperiences().length, 1);

    const next = { ...record, item: { ...item, id: 'exp_new', citation: { ...citation, sourceUrl: 'https://www.nowcoder.com/discuss/567' } } };
    const duplicateId = { ...record, item: { ...item, citation: { ...citation, sourceUrl: 'https://www.nowcoder.com/discuss/999' } } };
    assert.throws(() => db.upsertExperiences([next, duplicateId]), /UNIQUE constraint failed/);
    assert.equal(db.getExperience(next.item.id), null);
    assert.throws(() => db.upsertExperiences([{ ...record, simhash64: 'bad' }]), /simhash64/);

    db.close();
    db = null;
    const sql = new DatabaseSync(file);
    try {
      assert.equal(sql.prepare('PRAGMA user_version').get().user_version, 1);
      assert.deepEqual(sql.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.name),
        ['crawl_runs', 'experience_items', 'experience_sources', 'query_seeds', 'taxonomy_candidates']);
    } finally {
      sql.close();
    }
    db = openExperienceDb(file);
    assert.deepEqual(db.getExperience(item.id), updated);
    assert.equal(db.deleteExperience(item.id), true);
    assert.equal(db.deleteExperience(item.id), false);
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Firecrawl prefers the authenticated local engine and uses narrow v2 requests', async () => {
  const calls = [];
  const client = createFirecrawlClient({
    env: { FIRECRAWL_API_KEY: 'cloud-key', FIRECRAWL_LOCAL_TOKEN: 'local-token' },
    async fetchImpl(url, options) {
      calls.push(url);
      assert.match(url, /^http:\/\/127\.0\.0\.1:3002\//);
      assert.equal(options.headers.authorization, 'Bearer local-token');
      assert.equal(options.redirect, 'error');
      if (url.endsWith('/health')) return health();
      const body = JSON.parse(options.body);
      if (url.endsWith('/search')) {
        assert.deepEqual(body, { query: '后端 实习 面经', limit: 3, tbs: 'qdr:w', sources: [{ type: 'web' }] });
        return success({ web: [
          { url: citation.sourceUrl, title: item.title, description: item.tldr, markdown: '不随索引返回' },
          { url: 'https://www.nowcoder.com/login' }, { url: 'http://127.0.0.1/secret' },
        ] });
      }
      assert.deepEqual(body, {
        url: citation.sourceUrl, formats: ['markdown', 'links'], onlyMainContent: true,
        maxAge: 0, timeout: 15000, proxy: 'basic',
      });
      return success(doc);
    },
  });
  assert.equal(await client.getMode(), 'local_binary');
  assert.deepEqual(await client.searchPages({ query: '后端 实习 面经', limit: 3 }),
    [{ url: citation.sourceUrl, title: item.title, description: item.tldr }]);
  assert.deepEqual(await client.scrapePage({ url: citation.sourceUrl, maxAge: 0 }), doc);
  assert.equal(calls.length, 3);
});

test('Firecrawl routes explicit self-hosting and cloud with isolated credentials', async () => {
  const selfHosted = createFirecrawlClient({
    env: { FIRECRAWL_API_URL: 'https://crawl.example.net/firecrawl/v2/', FIRECRAWL_API_KEY: 'cloud-key',
      FIRECRAWL_SELF_HOSTED_TOKEN: 'container-token' },
    async fetchImpl(url, options) {
      assert.equal(url, 'https://crawl.example.net/firecrawl/v2/search');
      assert.equal(options.headers.authorization, 'Bearer container-token');
      return success([]);
    },
  });
  assert.equal(await selfHosted.getMode(), 'self_hosted_docker');
  assert.deepEqual(await selfHosted.searchPages({ query: '公开资料' }), []);
  const cloud = createFirecrawlClient({
    env: { FIRECRAWL_API_KEY: 'cloud-key' },
    async fetchImpl(url, options) {
      if (url.endsWith('/health')) return Response.json({ status: 'ok', engine: 'another-service' });
      assert.equal(url, 'https://api.firecrawl.dev/v2/search');
      assert.equal(options.headers.authorization, 'Bearer cloud-key');
      return success({ web: [] });
    },
  });
  assert.equal(await cloud.getMode(), 'cloud_api');
  assert.deepEqual(await cloud.searchPages({ query: '公开资料' }), []);
  const offline = createFirecrawlClient({ env: {}, fetchImpl: async () => new Response(null, { status: 404 }) });
  await assert.rejects(offline.getMode(), { code: 'FIRECRAWL_UNAVAILABLE' });
});

test('Firecrawl stops blocked domains, preserves cooldown across aliases, and honors Retry-After', async () => {
  for (const denial of [
    () => new Response(null, { status: 401 }),
    () => new Response(null, { status: 403 }),
    () => new Response(null, { status: 429, headers: { 'retry-after': '90' } }),
    () => success({ ...doc, blocked: true }),
    () => success({ ...doc, metadata: { statusCode: 403 } }),
    () => success({ ...doc, metadata: { statusCode: 200, url: 'https://www.zhihu.com/signin' } }),
    () => success({ ...doc, markdown: '# Just a moment...' }),
    () => success({ ...doc, metadata: { statusCode: 200, proxyUsed: 'stealth' } }),
    () => success({ ...doc, source: 'firecrawl-cloud' }),
  ]) {
    let calls = 0;
    let time = 10;
    const client = createFirecrawlClient({
      env: { FIRECRAWL_API_URL: 'https://crawl.example.net' }, now: () => time, cooldownMs: 30000,
      wait: async ms => { time += ms; },
      async fetchImpl() { return calls++ === 0 ? denial() : success(doc); },
    });
    const results = await Promise.allSettled([
      client.scrapePage({ url: 'https://zhuanlan.zhihu.com/p/1' }),
      client.scrapePage({ url: 'https://www.zhihu.com/question/2/answer/3' }),
    ]);
    assert.equal(results[0].reason.code, 'TARGET_BLOCKED');
    assert.equal(results[1].reason.code, 'COOLDOWN');
    assert.equal(calls, 1);
    assert.equal(results[1].reason.retryAt, time + (results[0].reason.status === 429 ? 90000 : 30000));
    assert.deepEqual(await client.scrapePage({ url: citation.sourceUrl }), doc);
    time = results[1].reason.retryAt;
    assert.deepEqual(await client.scrapePage({ url: 'https://zhuanlan.zhihu.com/p/1' }), doc);
    assert.equal(calls, 3);
  }
});

test('Firecrawl detects provider authentication failures before probing other domains', async () => {
  let calls = 0;
  const client = createFirecrawlClient({
    env: { FIRECRAWL_API_URL: 'https://api.firecrawl.dev' },
    async fetchImpl() {
      calls++;
      return Response.json({ success: false, error: 'An API key is required from this network.' }, { status: 403 });
    },
  });
  await assert.rejects(client.scrapePage({ url: 'https://example.com/' }),
    { code: 'FIRECRAWL_AUTH_REQUIRED', status: 403 });
  await assert.rejects(client.scrapePage({ url: 'https://www.nowcoder.com/discuss/123' }),
    { code: 'FIRECRAWL_COOLDOWN' });
  assert.equal(calls, 1);
});

test('Firecrawl spaces concurrent calls, times out once, and preserves target 404', async () => {
  let time = 0;
  const callTimes = [];
  const client = createFirecrawlClient({
    env: { FIRECRAWL_API_URL: 'https://crawl.example.net' }, now: () => time,
    wait: async ms => { time += ms; },
    async fetchImpl(url, { body, signal }) {
      const page = JSON.parse(body).url;
      callTimes.push(time);
      if (page.endsWith('/slow')) await setTimeout(1000, null, { signal });
      if (page.endsWith('/gone')) return success({ ...doc, metadata: { statusCode: 404 } });
      return success(doc);
    },
  });
  await Promise.all([client.scrapePage({ url: citation.sourceUrl }), client.scrapePage({ url: citation.sourceUrl })]);
  assert.deepEqual(callTimes, [0, 3000]);
  await assert.rejects(client.scrapePage({ url: citation.sourceUrl + '/slow', timeoutMs: 20 }), { code: 'TIMEOUT' });
  await assert.rejects(client.scrapePage({ url: citation.sourceUrl + '/gone' }), { code: 'HTTP_404', status: 404 });
  assert.deepEqual(callTimes, [0, 3000, 6000, 9000]);
});

test('Local Firecrawl engine guards SSRF/DNS rebinding, honors robots.txt, cleans Markdown, and caches maxAge', async () => {
  for (const blockedIp of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.100.100.200', '::1', 'fd00::1', '::ffff:127.0.0.1', '198.18.0.1']) {
    assert.equal(checkIpAddress(blockedIp, false).ok, false, `${blockedIp} literal must be blocked`);
  }
  assert.equal(checkIpAddress('93.184.216.34', false).ok, true);
  assert.equal(checkIpAddress('100.100.100.200', true).ok, false, 'Alibaba cloud metadata IP must stay blocked even in allowPrivate');

  // DNS rebinding to 127.0.0.1 blocked, whereas TUN Fake-IP 198.18.0.5 on multi-label domain allowed
  const rebind = await guardPublicUrl('https://evil.example.com/', { lookupImpl: async () => [{ address: '127.0.0.1' }] });
  assert.equal(rebind.ok, false);
  const tunDomain = await guardPublicUrl('https://public.example.com/', { lookupImpl: async () => [{ address: '198.18.0.12' }] });
  assert.equal(tunDomain.ok, true);

  // robots.txt rules
  const robots = 'User-agent: *\nDisallow: /search\nDisallow: /*.pdf$\nAllow: /discuss/\n';
  assert.equal(isRobotsAllowed(robots, '/discuss/123'), true);
  assert.equal(isRobotsAllowed(robots, '/search?q=1'), false);
  assert.equal(isRobotsAllowed(robots, '/files/guide.pdf'), false);

  const cleaned = cleanHtmlToMarkdown(
    '<html><head><title>面经复盘</title></head><body><nav>顶部导航噪声</nav><article><h2>一面追问</h2><p>重点考察 <strong>Redis</strong> 与 <a href="/post/2">连接池</a>。</p><pre><code class="language-sql">EXPLAIN SELECT * FROM t;</code></pre></article><footer>底部版权</footer></body></html>',
    'https://www.nowcoder.com/discuss/1'
  );
  assert.equal(cleaned.title, '面经复盘');
  assert.doesNotMatch(cleaned.markdown, /顶部导航噪声|底部版权/);
  assert.match(cleaned.markdown, /## 一面追问/);
  assert.match(cleaned.markdown, /\*\*Redis\*\*/);
  assert.match(cleaned.markdown, /```sql/);
  assert.deepEqual(cleaned.links, ['https://www.nowcoder.com/post/2']);

  let upstreamHits = 0;
  const localEngine = createFirecrawlLocalEngine({
    env: { FIRECRAWL_LOCAL_BROWSER: 'never' },
    lookupImpl: async () => [{ address: '93.184.216.34' }],
    async fetchImpl(url) {
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /private\n', { status: 200 });
      upstreamHits++;
      return new Response('<html><head><title>Cached</title></head><body><article>' + '干货内容'.repeat(40) + '</article></body></html>', { status: 200 });
    },
  });
  const blockedRes = await localEngine.scrape({ url: 'https://example.com/private/note' });
  assert.equal(blockedRes.httpStatus, 403);
  assert.equal(blockedRes.body.code, 'ROBOTS_TXT_BLOCKED');

  const miss = await localEngine.scrape({ url: 'https://example.com/public/1', maxAge: 60000 });
  const hit = await localEngine.scrape({ url: 'https://example.com/public/1', maxAge: 60000 });
  assert.equal(miss.body.data.metadata.cacheState, 'miss');
  assert.equal(hit.body.data.metadata.cacheState, 'hit');
  assert.equal(upstreamHits, 1);
  await localEngine.close();
});

test('Cleaner blocks MCN soft-ads with >=95% precision, normalizes tracking URLs, and strips PII', () => {
  assert.equal(
    canonicalizeExperienceUrl('http://m.nowcoder.com/discuss/123/?utm_source=xhs&xsec_token=secret&page=1#top'),
    'https://www.nowcoder.com/discuss/123?page=1'
  );
  assert.equal(matchAllowedChannelUrl('https://www.nowcoder.com/login'), null);
  assert.equal(matchAllowedChannelUrl('https://www.xiaohongshu.com/explore/673c91a8000000001b02d4e1')?.channel.id, 'xiaohongshu');

  const spamSamples = [
    '秋招面经整理好了，无偿分享给宝子们，评论区扣666私信我秒发！',
    '双非逆袭大厂！多亏报了XX直通车1对1定制辅导保过班，早鸟优惠最后3个名额',
    '保研夏令营资料大礼包，后台留【上岸】进群领，扫码进群领助教老师评估',
    '计算机毕设与SCI挂名发表渠道，代写论文稳过盲审，水赛保奖私聊',
    '付费内推大厂核心部门直通终面，保录取签协议退费',
  ];
  for (const s of spamSamples) {
    const res = evaluateSpamAndAdRisk({ title: '经验分享', text: s });
    assert.equal(res.rejected, true, `Spam must be rejected: ${s}`);
  }

  const legitSamples = [
    '腾讯后端实习一面45分钟复盘：1. 自我介绍与选课系统项目深挖；2. Redis缓存穿透布隆过滤器与Lua分布式锁续期；3. MySQL慢查询EXPLAIN索引优化。建议把本机wrk压测QPS数据写进简历。',
    '双非计算机排名18%保研预推免总结：6月夏令营被拒不要慌，8月把嵌入式FreeRTOS课设整理好测试波形与5分钟答辩PPT，9月成功拿到两所211优营拟录取。',
  ];
  for (const g of legitSamples) {
    const res = evaluateSpamAndAdRisk({ title: '真实复盘', text: g });
    assert.equal(res.rejected, false, `Legitimate guide must pass: ${g}`);
  }

  const redacted = redactExperiencePii('姓名：李华，手机号 13812345678，联系微信号：offer_helper99，QQ群：827364519，邮箱 test@campus.edu.cn，学号：2023010982');
  assert.doesNotMatch(redacted, /李华|13812345678|offer_helper99|827364519|test@campus\.edu\.cn|2023010982/);
});

test('Distiller enforces taxonomy grounding and QueryPlanner + UCB1 adapt to seasons and cooldowns', async () => {
  const data = readEmploymentData();
  const engine = employmentEngine(data);
  const distilled = await distillExperiencePost({
    url: 'https://www.nowcoder.com/discuss/777777',
    title: '双非零实习春招Go与Redis后端一面复盘',
    text: '本人普通一本计算机零实习，一面面试官追问：1. Redis分布式锁过期怎么保障幂等？2. Golang协程调度GMP模型阻塞怎么处理？建议先把课设加上wrk压测对比表再去投递。',
    platform: 'nowcoder',
    engine,
  });
  assert.doesNotThrow(() => assertExperienceItem(distilled));
  assert.equal(distilled.authorBaseline.schoolTier, 'non_double_first_class');
  assert.equal(distilled.authorBaseline.startingState, 'zero_internship');
  assert.equal(distilled.authorBaseline.rankBucket, 'unknown');
  assert.ok(distilled.mappedSkillIds.includes('redis') && distilled.mappedSkillIds.includes('golang'));

  const springPlan = planWeeklyQueries({ now: new Date('2027-03-15T00:00:00Z'), jobs: data.jobs, engine });
  assert.match(springPlan.season.label, /暑期实习/);
  assert.ok(springPlan.queries.length >= 4);

  const quotas = allocateChannelQuotas([
    { sourceId: 'nowcoder', enabled: true, totalRuns: 5, totalFetched: 20, totalAccepted: 16, consecutiveFails: 0, cooldownUntil: null },
    { sourceId: 'xiaohongshu', enabled: true, totalRuns: 5, totalFetched: 20, totalAccepted: 1, consecutiveFails: 2, cooldownUntil: '2099-01-01T00:00:00Z' },
  ], { totalBudget: 20, now: new Date('2026-11-27T00:00:00Z') });
  assert.equal(quotas.has('xiaohongshu'), false, 'Channel in cooldown must receive 0 quota');
  assert.ok((quotas.get('nowcoder') || 0) >= 5);
});

if (process.argv.includes('--live')) {
  test('live Firecrawl extracts public Markdown and searches public pages end-to-end', async () => {
    let ephemeral = null;
    let env = { ...process.env };
    try {
      const probe = await fetch('http://127.0.0.1:3002/health', { signal: AbortSignal.timeout(1000) }).catch(() => null);
      if (!probe?.ok) {
        ephemeral = createFirecrawlLocalServer({ env: { ...process.env, FIRECRAWL_LOCAL_BROWSER: 'never' } });
        ephemeral.server.listen(0, '127.0.0.1');
        await once(ephemeral.server, 'listening');
        const { port } = ephemeral.server.address();
        env = { ...env, FIRECRAWL_API_URL: `http://127.0.0.1:${port}` };
      }
      const client = createFirecrawlClient({ env });
      console.log('Live Firecrawl mode:', await client.getMode());
      const page = await client.scrapePage({ url: 'https://example.com/' });
      assert.match(page.markdown, /Example Domain|documentation examples/i);
      if (!process.argv.includes('--scrape-only')) {
        const pages = await client.searchPages({ query: 'site:nowcoder.com 面经 实习', limit: 3, tbs: null });
        assert.ok(pages.length > 0, 'No public search results');
        console.log('Live Firecrawl returned search results:', pages.length);
      }
      await client.close();
    } finally {
      if (ephemeral) {
        await new Promise(resolve => ephemeral.server.close(resolve));
      }
    }
  });
}
