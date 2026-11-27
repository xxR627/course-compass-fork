import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evidenceReviewProjection, reviewEvidenceWithOllama } from './_employment-evidence-review.mjs';
import { createEmploymentCatalogHandler } from './_employment-catalog-api.mjs';
import { callCloudChat, createEmploymentLlmHandler, discoverLocalModels, getEnvCloudConfig, getEnvCloudProviders } from './_employment-llm.mjs';
import { createEmploymentLiveApiHandler } from './_employment-live-api.mjs';
import { createLocalIdentityHandler, defaultIdentityDbPath } from './_employment-identity-api.mjs';
import { createExperienceIntelHandler } from './_experience-api.mjs';

const page = new URL('./index.html', import.meta.url);
const reviewPath = '/api/employment/evidence-review';

function requestHostOf(request) {
  const raw = request.headers['x-forwarded-host'] || request.headers.host || '';
  return String(raw).split(',')[0].trim().toLowerCase();
}

function isLocalhostName(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

function isLocalBrowserAllowed(request) {
  const host = requestHostOf(request);
  if (!host) return false;
  const site = String(request.headers['sec-fetch-site'] || '').toLowerCase();
  if (site && !['same-origin', 'none'].includes(site)) return false;
  if (request.headers.origin) {
    try {
      const parsed = new URL(request.headers.origin);
      const originHost = parsed.host.toLowerCase();
      if (originHost === host) return true;
      // Allow local dev proxies on matching localhost/127.0.0.1 hostnames
      if (isLocalhostName(parsed.hostname) && isLocalhostName(host.replace(/:\d+$/, '')) && parsed.port === (host.split(':')[1] || '')) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
  return true;
}

function localJsonReader(request) {
  return async ({ browserOnly = false, maxBytes = 32768 } = {}) => {
    const site = String(request.headers['sec-fetch-site'] || '').toLowerCase();
    const browserRequest = !!(request.headers.origin || site);
    if (!isLocalBrowserAllowed(request) ||
      ((browserOnly || browserRequest) && site && site !== 'same-origin') ||
      request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') {
      request.resume();
      return { ok: false, status: 403, error: 'CROSS_ORIGIN_FORBIDDEN' };
    }
    let size = 0;
    const buffers = [];
    try {
      for await (const piece of request.iterator({ destroyOnReturn: false })) {
        size += piece.length;
        if (size > maxBytes) { request.resume(); return { ok: false, status: 413, error: 'INPUT_TOO_LARGE' }; }
        buffers.push(piece);
      }
      return { ok: true, value: JSON.parse(Buffer.concat(buffers).toString('utf8')) };
    } catch { return { ok: false, status: 400, error: 'INVALID_JSON' }; }
  };
}

export function createCourseCompassServer({
  model,
  review = reviewEvidenceWithOllama,
  catalogFile,
  growthModel = model,
  growth,
  llm,
  llmFetcher,
  llmEndpoint,
  liveFetcher,
  jobsDbPath,
  calendarDbPath,
  jdTextDbPath,
  experiencesDbPath,
  crawlRunner,
  identityDbPath = ':memory:',
} = {}) {
  let reviewInProgress = false;
  const identity = createLocalIdentityHandler({ dbPath: identityDbPath });
  const rateBuckets = new Map();
  const checkRateLimit = (request) => {
    const ip = String(request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const isLoopback = isLocalhostName(ip.replace(/^::ffff:/, ''));
    const limit = isLoopback ? 2000 : 240;
    const now = Date.now();
    const bucket = rateBuckets.get(ip) || { count: 0, resetAt: now + 60_000 };
    if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + 60_000; }
    bucket.count += 1;
    rateBuckets.set(ip, bucket);
    if (rateBuckets.size > 2000) {
      for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
    }
    return bucket.count <= limit;
  };

  const catalog = createEmploymentCatalogHandler({ file: catalogFile, growthModel, growth });
  const liveApi = createEmploymentLiveApiHandler({ catalogFile, jobsDbPath, calendarDbPath, jdTextDbPath, fetcher: liveFetcher });
  const experienceApi = createExperienceIntelHandler({ catalogFile, experiencesDbPath, crawlRunner });
  const llmHandler = llm || createEmploymentLlmHandler({
    endpoint: llmEndpoint,
    defaultModel: model || growthModel || null,
    fetcher: llmFetcher,
  });
  const server = createServer(async (request, response) => {
    const send = (status, body, type = 'application/json; charset=utf-8', headers = {}) => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
      response.end(request.method === 'HEAD' ? undefined : type.startsWith('application/json') ? JSON.stringify(body) : body);
    };
    const pathname = request.url.split('?')[0];
    if ((pathname.startsWith('/api/') || pathname.startsWith('/employment/')) && !checkRateLimit(request)) {
      request.resume();
      return send(429, { error: 'RATE_LIMIT_EXCEEDED' });
    }
    if (await identity(request, pathname, send)) return;
    const readLocalJson = localJsonReader(request);
    if (pathname.startsWith('/api/intel/')) {
      if (!isLocalBrowserAllowed(request)) {
        request.resume();
        return send(403, { error: 'CROSS_ORIGIN_FORBIDDEN' });
      }
      if (await experienceApi(request, pathname, send, readLocalJson)) return;
    }
    if (pathname.startsWith('/api/employment/live/') || pathname === '/api/employment/warehouse/search' || pathname === '/api/employment/calendar') {
      if (!isLocalBrowserAllowed(request)) {
        request.resume();
        return send(403, { error: 'CROSS_ORIGIN_FORBIDDEN' });
      }
      if (await liveApi(request, pathname, send, readLocalJson)) return;
    }
    if (pathname.startsWith('/api/employment/llm/')) {
      if (!isLocalBrowserAllowed(request)) {
        request.resume();
        return send(403, { error: 'CROSS_ORIGIN_FORBIDDEN' });
      }
      if (await llmHandler(request, pathname, send, readLocalJson, response)) return;
    }
    if (await catalog(request, pathname, (status, body, headers) => send(status, body, undefined, headers), () => readLocalJson({ maxBytes: 32768 }))) return;
    if (pathname === reviewPath) {
      if (request.method !== 'POST') return send(405, { error: 'POST_REQUIRED' });
      const cloudProviders = !model ? getEnvCloudProviders() : [];
      if ((!model && !cloudProviders.length) || reviewInProgress) {
        request.resume();
        return send(503, { error: (model || cloudProviders.length) ? 'REVIEW_BUSY' : 'MODEL_DISABLED' });
      }
      reviewInProgress = true;
      try {
        const input = await readLocalJson({ browserOnly: true });
        if (!input.ok) return send(input.status, { error: input.error });
        let projected;
        try {
          projected = evidenceReviewProjection(input.value);
        } catch {
          return send(400, { error: 'INVALID_REVIEW_INPUT' });
        }
        let result;
        if (model) {
          result = await review(projected, { model });
        } else {
          const criteriaText = projected.criteria.map((c, i) => `${i}. ${c}`).join('\n');
          const { text } = await callCloudChat({
            providers: cloudProviders,
            systemPrompt: '你是严谨的作品验收复核助手。仅根据用户片段逐条核对验收标准，严禁编造。只输出 JSON：{"findings":[{"index":0,"assessment":"supports|unclear|contradicts","quote":"片段原句或空字符串"}]}',
            userPrompt: `验收标准：\n${criteriaText}\n\n提交片段：\n${projected.excerpt}`,
            maxTokens: 500,
            timeoutMs: 18000,
          });
          const matchJson = String(text || '').match(/\{[\s\S]*\}/);
          const parsed = matchJson ? JSON.parse(matchJson[0]) : null;
          const findings = projected.criteria.map((_, idx) => {
            const hit = Array.isArray(parsed?.findings) ? parsed.findings.find(f => Number(f.index) === idx) : null;
            const assessment = ['supports', 'unclear', 'contradicts'].includes(hit?.assessment) ? hit.assessment : 'unclear';
            const quote = typeof hit?.quote === 'string' && projected.excerpt.includes(hit.quote.trim()) ? hit.quote.trim() : '';
            return { index: idx, assessment: assessment === 'supports' && !quote ? 'unclear' : assessment, quote };
          });
          result = { findings };
        }
        send(200, result);
      } catch (error) {
        send(503, { error: error.message === 'UNGROUNDED_REVIEW' ? 'UNGROUNDED_REVIEW' : 'MODEL_UNAVAILABLE' });
      } finally {
        reviewInProgress = false;
      }
      return;
    }
    if (pathname === '/favicon.ico') return send(204, '', 'text/plain');
    if (!['/', '/index.html'].includes(pathname) || !['HEAD', 'GET'].includes(request.method)) return send(404, { error: 'NOT_FOUND' });
    try {
      send(200, await readFile(page), 'text/html; charset=utf-8');
    } catch {
      send(500, { error: 'PAGE_UNAVAILABLE' });
    }
  });
  server.requestTimeout = 120000;
  server.on('close', () => identity.close?.());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const enableLocalOllama = process.env.CC_ENABLE_LOCAL_LLM === '1';
  const configured = enableLocalOllama
    ? (process.env.CC_QWEN_MODEL || process.env.CC_EVIDENCE_LOCAL_MODEL || process.env.CC_GROWTH_LOCAL_MODEL || null)
    : null;
  const discovered = enableLocalOllama ? await discoverLocalModels({ preferredModel: configured }) : { activeModel: null };
  const resolvedModel = configured || discovered.activeModel || undefined;
  const resolvedGrowthModel = enableLocalOllama ? (process.env.CC_GROWTH_LOCAL_MODEL || resolvedModel) : undefined;
  const port = Number(process.env.PORT) || 8090;
  const host = process.env.HOST || '127.0.0.1';
  const identityDbPath = process.env.CC_IDENTITY_DB || defaultIdentityDbPath();
  const envCloud = getEnvCloudConfig();
  createCourseCompassServer({
    model: resolvedModel,
    growthModel: resolvedGrowthModel,
    identityDbPath,
  }).listen(port, host, () => {
    console.log(`Course Compass at http://${host}:${port}/ | Copilot: ${resolvedModel || (envCloud ? `${envCloud.model} (cloud-api, zero-gpu)` : 'expert-copilot-v2 (zero-gpu)')}`);
  });
}
