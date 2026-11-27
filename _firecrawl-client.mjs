import { isIP } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { createFirecrawlLocalEngine } from './_firecrawl-local-serve.mjs';

const localApi = 'http://127.0.0.1:3002';
const cloudApi = 'https://api.firecrawl.dev';
const weekMs = 7 * 24 * 60 * 60 * 1000;
const domainIntervals = new Map([
  ['xiaohongshu.com', 6000], ['zhihu.com', 5000], ['nowcoder.com', 3000],
  ['github.com', 2000], ['bilibili.com', 3000],
]);
const restrictedStatuses = new Set([401, 403, 429]);
const restrictedCodes = new Set(['BLOCKED', 'BLOCKED_TARGET', 'ROBOTS_TXT_BLOCKED', 'SITE_BLOCKED']);

export class FirecrawlError extends Error {
  constructor(code, { status, retryAt } = {}) {
    super(code);
    this.name = 'FirecrawlError';
    this.code = code;
    this.status = status;
    this.retryAt = retryAt;
  }
}

function apiBase(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TypeError('FIRECRAWL_API_URL must be an HTTP(S) base URL without credentials');
  }
  return url.href.replace(/\/+$/, '').replace(/\/v2$/, '');
}

function pageUrl(value) {
  const url = typeof value === 'string' && URL.canParse(value) ? new URL(value) : null;
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !url.hostname.includes('.') || isIP(url.hostname) || /\.(?:localhost|local|internal)\.?$/i.test(url.hostname)) {
    throw new TypeError('Expected a public HTTP(S) page URL without credentials');
  }
  url.hostname = url.hostname.replace(/\.$/, '');
  url.hash = '';
  return url;
}

function accessWall(value) {
  if (typeof value !== 'string' || !URL.canParse(value)) return false;
  const url = new URL(value);
  return /^(?:passport|login|auth)\./i.test(url.hostname) ||
    /^\/(?:login|sign[_-]?in|captcha|verify|oauth|security[_-]?check)(?:[/?#._-]|$)/i.test(url.pathname);
}

function retryAfterTime(value, time) {
  if (!value) return 0;
  return /^\d+$/.test(value) ? time + Number(value) * 1000 : Date.parse(value) || 0;
}

function responseStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status < 600 ? status : undefined;
}

function isRestricted(payload) {
  return payload?.blocked === true || payload?.data?.blocked === true ||
    restrictedCodes.has(payload?.code) || restrictedCodes.has(payload?.data?.metadata?.error);
}

export function createFirecrawlClient({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
  wait = sleep,
  cooldownMs = 30 * 60 * 1000,
  embeddedFallback = false,
  lookupImpl,
} = {}) {
  const gates = new Map();
  let endpointPromise;
  let embeddedEngine = null;
  let providerCooldownUntil = 0;

  async function localHealth(base) {
    try {
      const headers = env.FIRECRAWL_LOCAL_TOKEN ? { authorization: 'Bearer ' + env.FIRECRAWL_LOCAL_TOKEN } : {};
      const result = await fetchImpl(base + '/health', { headers, signal: AbortSignal.timeout(1500), redirect: 'error' });
      const data = result.ok ? await result.json() : null;
      return data?.status === 'ok' && data?.engine === 'firecrawl-local';
    } catch {
      return false;
    }
  }

  async function resolveEndpoint() {
    const cloud = { base: cloudApi, mode: 'cloud_api', token: env.FIRECRAWL_API_KEY };
    const configured = env.FIRECRAWL_API_URL?.trim();
    if (configured) {
      const base = apiBase(configured);
      if (base === cloudApi) return cloud;
      const host = new URL(base).hostname;
      if (['127.0.0.1', 'localhost', '[::1]'].includes(host) && await localHealth(base)) {
        return { base, mode: 'local_binary', token: env.FIRECRAWL_LOCAL_TOKEN };
      }
      return { base, mode: 'self_hosted_docker', token: env.FIRECRAWL_SELF_HOSTED_TOKEN };
    }
    if (await localHealth(localApi)) {
      return { base: localApi, mode: 'local_binary', token: env.FIRECRAWL_LOCAL_TOKEN };
    }
    if (cloud.token) return cloud;
    if (embeddedFallback || env.FIRECRAWL_EMBEDDED_LOCAL === '1') {
      embeddedEngine ??= createFirecrawlLocalEngine({ env, fetchImpl, now, ...(lookupImpl ? { lookupImpl } : {}) });
      return { base: 'embedded://firecrawl-local', mode: 'local_binary', embedded: embeddedEngine };
    }
    throw new FirecrawlError('FIRECRAWL_UNAVAILABLE');
  }

  function endpoint() {
    if (!endpointPromise) {
      endpointPromise = resolveEndpoint().catch(error => {
        endpointPromise = undefined;
        throw error;
      });
    }
    return endpointPromise;
  }

  function interpretResponse({ status, retryHeader, payload, mode }) {
    const targetStatus = responseStatus(payload?.data?.metadata?.statusCode ?? payload?.metadata?.statusCode);
    const retryAt = retryAfterTime(retryHeader, now());
    const providerAuthError = !targetStatus && [401, 403].includes(status) &&
      (payload?.code === 'UNAUTHORIZED' ||
        (mode === 'cloud_api' && /\bapi key\b/i.test(String(payload?.error ?? ''))));
    if (providerAuthError) {
      providerCooldownUntil = Math.max(now() + cooldownMs, retryAt);
      throw new FirecrawlError('FIRECRAWL_AUTH_REQUIRED', { status, retryAt: providerCooldownUntil });
    }
    if (restrictedStatuses.has(status) || restrictedStatuses.has(targetStatus) || isRestricted(payload)) {
      throw new FirecrawlError('TARGET_BLOCKED', {
        status: status < 200 || status >= 300 ? status : targetStatus,
        retryAt,
      });
    }
    const failureStatus = (status < 200 || status >= 300) ? status : targetStatus >= 400 ? targetStatus : null;
    if (failureStatus) throw new FirecrawlError('HTTP_' + failureStatus, { status: failureStatus });
    if (payload?.success !== true || !payload.data || typeof payload.data !== 'object') {
      throw new FirecrawlError(payload?.success === false ? 'FIRECRAWL_REJECTED' : 'FIRECRAWL_INVALID_RESPONSE');
    }
    return payload.data;
  }

  async function request(route, body, timeoutMs) {
    const resolved = await endpoint();
    const { base, mode, token, embedded } = resolved;
    if (providerCooldownUntil > now()) {
      throw new FirecrawlError('FIRECRAWL_COOLDOWN', { retryAt: providerCooldownUntil });
    }
    if (embedded) {
      const out = route === 'search' ? await embedded.search(body) : await embedded.scrape(body);
      if (out.httpStatus === 408) throw new FirecrawlError('TIMEOUT');
      return interpretResponse({ status: out.httpStatus, retryHeader: out.retryAfter, payload: out.body, mode });
    }
    const signal = AbortSignal.timeout(timeoutMs);
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    let response, payload;
    try {
      response = await fetchImpl(base + '/v2/' + route, {
        method: 'POST', headers, body: JSON.stringify(body), signal, redirect: 'error',
      });
      payload = await response.json().catch(() => null);
    } catch {
      throw new FirecrawlError(signal.aborted ? 'TIMEOUT' : 'FIRECRAWL_NETWORK');
    }
    if (signal.aborted) throw new FirecrawlError('TIMEOUT');
    return interpretResponse({
      status: response.status,
      retryHeader: response.headers.get('retry-after'),
      payload,
      mode,
    });
  }

  function throttled(key, interval, action) {
    const gate = gates.get(key) ?? { nextAt: 0, cooldownUntil: 0, tail: Promise.resolve() };
    gates.set(key, gate);
    const checkCooldown = () => {
      if (gate.cooldownUntil > now()) {
        throw new FirecrawlError('COOLDOWN', { retryAt: gate.cooldownUntil });
      }
    };
    const pending = gate.tail.then(async () => {
      checkCooldown();
      if (gate.nextAt > now()) await wait(gate.nextAt - now());
      gate.nextAt = now() + interval;
      try {
        return await action();
      } catch (error) {
        if (error.code === 'TARGET_BLOCKED') {
          gate.cooldownUntil = Math.max(now() + cooldownMs, error.retryAt || 0);
          error.retryAt = gate.cooldownUntil;
        }
        throw error;
      }
    });
    gate.tail = pending.catch(() => {});
    return pending;
  }

  return {
    async getMode() {
      return (await endpoint()).mode;
    },
    async close() {
      await embeddedEngine?.close();
    },
    async searchPages({ query, limit = 10, tbs = 'qdr:w' }) {
      if (typeof query !== 'string' || !query.trim() || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError('Expected a search query and a limit between 1 and 100');
      }
      const body = { query: query.trim(), limit, sources: [{ type: 'web' }] };
      if (tbs) body.tbs = tbs;
      return throttled('search', 1000, async () => {
        const data = await request('search', body, 15000);
        const entries = Array.isArray(data) ? data : data.web;
        if (!Array.isArray(entries)) throw new FirecrawlError('FIRECRAWL_INVALID_RESPONSE');
        return entries.filter(entry => {
          try { pageUrl(entry?.url); } catch { return false; }
          return !accessWall(entry.url);
        }).slice(0, limit).map(({ url, title, description }) => ({
          url, title: typeof title === 'string' ? title : '', description: typeof description === 'string' ? description : '',
        }));
      });
    },
    async scrapePage({ url, onlyMainContent = true, maxAge = weekMs, timeoutMs = 15000 }) {
      const target = pageUrl(url);
      if (accessWall(target.href)) throw new FirecrawlError('TARGET_BLOCKED');
      if (typeof onlyMainContent !== 'boolean' || !Number.isSafeInteger(maxAge) || maxAge < 0 ||
          !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
        throw new TypeError('Invalid scrape options');
      }
      const { mode } = await endpoint();
      const key = [...domainIntervals.keys()].find(domain =>
        target.hostname === domain || target.hostname.endsWith('.' + domain)
      ) ?? target.hostname.replace(/^www\./, '');
      return throttled(key, domainIntervals.get(key) ?? 3000, async () => {
        const data = await request('scrape', {
          url: target.href, formats: ['markdown', 'links'], onlyMainContent,
          maxAge, timeout: Math.max(1000, timeoutMs), proxy: 'basic',
        }, timeoutMs);
        const metadata = data.metadata ?? {};
        const wallTitle = /^(?:sign in|log in|access denied|just a moment|verify (?:that )?you are human|请登录|登录后|安全验证|访问受限)(?:$|[\s！!：:.。、—-])/i;
        const heading = (typeof data.markdown === 'string' ? data.markdown.trimStart().split(/\r?\n/, 1)[0] : '').replace(/^#+\s+/, '');
        if (accessWall(metadata.url) || accessWall(metadata.sourceURL) || wallTitle.test(String(metadata.title ?? '').trim()) ||
            wallTitle.test(heading) || (mode !== 'cloud_api' && data.source === 'firecrawl-cloud') || metadata.proxyUsed === 'stealth') {
          throw new FirecrawlError('TARGET_BLOCKED', { status: responseStatus(metadata.statusCode) });
        }
        if (typeof data.markdown !== 'string') throw new FirecrawlError('FIRECRAWL_INVALID_RESPONSE');
        return { markdown: data.markdown, links: Array.isArray(data.links) ? data.links : [], metadata };
      });
    },
  };
}
