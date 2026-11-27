import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_CLOUD_API = 'https://api.firecrawl.dev';
const DEFAULT_UA = 'FirecrawlLocal/0.1 (+https://course-compass.local; robots-compliant)';
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
const CACHE_LIMIT = 256;

const SKIPPED_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'head', 'iframe', 'canvas',
  'object', 'embed', 'select', 'textarea', 'input', 'link', 'meta', 'audio', 'video',
]);

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•',
  hellip: '…', copy: '©', reg: '®', trade: '™',
};

export function decodeHtmlEntities(text) {
  return String(text || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (raw, entity) => {
    if (!entity.startsWith('#')) return ENTITIES[entity.toLowerCase()] ?? raw;
    const cp = entity[1].toLowerCase() === 'x'
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : raw;
  });
}

function parseIpv4Octets(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(p => (/^\d+$/.test(p) ? Number(p) : NaN));
  return nums.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? nums : null;
}

function v4IsMetadataOrLinkLocal(o) {
  return (o[0] === 169 && o[1] === 254) ||
    (o[0] === 100 && o[1] === 100 && o[2] === 100 && o[3] === 200);
}

function v4IsPrivate(o, { allowBenchmarkTun = false } = {}) {
  return o[0] === 0 ||
    o[0] === 10 ||
    o[0] === 127 ||
    (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
    (o[0] === 192 && o[1] === 168) ||
    (o[0] === 100 && (o[1] & 0xc0) === 64) ||
    (o[0] === 192 && o[1] === 0 && o[2] === 0) ||
    (o[0] === 192 && o[1] === 0 && o[2] === 2) ||
    (!allowBenchmarkTun && o[0] === 198 && (o[1] & 0xfe) === 18) ||
    (o[0] === 198 && o[1] === 51 && o[2] === 100) ||
    (o[0] === 203 && o[1] === 0 && o[2] === 113) ||
    o[0] >= 224 ||
    v4IsMetadataOrLinkLocal(o);
}

function expandIpv6Segments(raw) {
  const clean = raw.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  let ipv6Part = clean;
  let embeddedV4 = null;
  const lastColon = clean.lastIndexOf(':');
  if (lastColon !== -1 && clean.slice(lastColon + 1).includes('.')) {
    const octets = parseIpv4Octets(clean.slice(lastColon + 1));
    if (!octets) return null;
    embeddedV4 = octets;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    ipv6Part = `${clean.slice(0, lastColon)}:${hi}:${lo}`;
  }
  const halves = ipv6Part.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - (left.length + right.length);
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const full = [...left, ...(halves.length === 2 ? Array(missing).fill('0') : []), ...right];
  if (full.length !== 8 || full.some(seg => !/^[0-9a-f]{1,4}$/.test(seg))) return null;
  const segs = full.map(seg => Number.parseInt(seg, 16));
  if (!embeddedV4) {
    const isMapped = segs.slice(0, 5).every(x => x === 0) && segs[5] === 0xffff;
    const isNat64 = segs[0] === 0x0064 && segs[1] === 0xff9b && segs.slice(2, 6).every(x => x === 0);
    if (isMapped || isNat64) {
      embeddedV4 = [(segs[6] >> 8) & 0xff, segs[6] & 0xff, (segs[7] >> 8) & 0xff, segs[7] & 0xff];
    }
  }
  return { segs, embeddedV4 };
}

export function checkIpAddress(ip, allowPrivate = false, { allowBenchmarkTun = false } = {}) {
  const normalized = String(ip || '').replace(/^\[|\]$/g, '');
  const version = isIP(normalized);
  if (version === 4) {
    const octets = parseIpv4Octets(normalized);
    if (!octets) return { ok: false, reason: 'Invalid IPv4 address' };
    if (v4IsMetadataOrLinkLocal(octets)) return { ok: false, reason: 'Link-local or cloud metadata address blocked' };
    if (!allowPrivate && v4IsPrivate(octets, { allowBenchmarkTun })) return { ok: false, reason: 'Private IPv4 address blocked' };
    return { ok: true };
  }
  if (version === 6) {
    const parsed = expandIpv6Segments(normalized);
    if (!parsed) return { ok: false, reason: 'Invalid IPv6 address' };
    if (parsed.embeddedV4) {
      if (v4IsMetadataOrLinkLocal(parsed.embeddedV4)) return { ok: false, reason: 'Embedded link-local/metadata IPv4 blocked' };
      if (!allowPrivate && v4IsPrivate(parsed.embeddedV4, { allowBenchmarkTun })) return { ok: false, reason: 'Embedded private IPv4 blocked' };
      return { ok: true };
    }
    const s = parsed.segs;
    const isLinkLocal = (s[0] & 0xffc0) === 0xfe80;
    if (isLinkLocal) return { ok: false, reason: 'Link-local IPv6 blocked' };
    const isLoopback = s.slice(0, 7).every(x => x === 0) && (s[7] === 1 || s[7] === 0);
    const isUniqueLocal = (s[0] & 0xfe00) === 0xfc00 || (s[0] & 0xffc0) === 0xfec0;
    const isDocOrMulticast = (s[0] === 0x2001 && s[1] === 0x0db8) || (s[0] & 0xff00) === 0xff00;
    if (!allowPrivate && (isLoopback || isUniqueLocal || isDocOrMulticast)) {
      return { ok: false, reason: 'Private IPv6 address blocked' };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'Unrecognized IP literal' };
}

function isLocalHostname(host) {
  const h = host.replace(/\.$/, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') ||
    h.endsWith('.internal') || h === 'metadata' || h === 'metadata.google.internal';
}

export async function guardPublicUrl(rawUrl, { allowPrivate = false, lookupImpl = dnsLookup } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, code: 'BLOCKED_TARGET', reason: 'Invalid URL' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, code: 'BLOCKED_TARGET', reason: 'Unsupported URL protocol' };
  }
  if (url.username || url.password) {
    return { ok: false, code: 'BLOCKED_TARGET', reason: 'Embedded credentials are not allowed' };
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) return { ok: false, code: 'BLOCKED_TARGET', reason: 'Missing hostname' };
  if (hostname.toLowerCase() === 'metadata.google.internal' || (!allowPrivate && isLocalHostname(hostname))) {
    return { ok: false, code: 'BLOCKED_TARGET', reason: 'Local or metadata hostname blocked' };
  }
  if (isIP(hostname)) {
    const check = checkIpAddress(hostname, allowPrivate);
    return check.ok ? { ok: true, url } : { ok: false, code: 'BLOCKED_TARGET', reason: check.reason };
  }
  if (!allowPrivate && !hostname.includes('.')) {
    return { ok: false, code: 'BLOCKED_TARGET', reason: 'Single-label internal host blocked' };
  }
  try {
    const records = await lookupImpl(hostname, { all: true });
    const list = Array.isArray(records) ? records : [records];
    if (!list.length) return { ok: false, code: 'FETCH_FAILED', reason: 'DNS returned no records' };
    for (const entry of list) {
      const addr = typeof entry === 'string' ? entry : entry?.address;
      // Allow 198.18.0.0/15 Fake-IP TUN answers for multi-label public domains while still blocking all RFC1918/loopback/metadata IPs
      const check = checkIpAddress(addr, allowPrivate, { allowBenchmarkTun: true });
      if (!check.ok) return { ok: false, code: 'BLOCKED_TARGET', reason: `DNS resolved to blocked IP: ${check.reason}` };
    }
  } catch {
    return { ok: false, code: 'FETCH_FAILED', reason: 'DNS resolution failed' };
  }
  return { ok: true, url };
}

export function isRobotsAllowed(robotsTxt, pathname, userAgents = ['firecrawllocal', 'coursecompass']) {
  if (!robotsTxt || typeof robotsTxt !== 'string') return true;
  const groups = [];
  let current = null;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) {
      if (current && current.rules.length) current = null;
      continue;
    }
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
    } else if ((field === 'allow' || field === 'disallow') && current) {
      current.rules.push({ allow: field === 'allow', pattern: val });
    }
  }

  const wanted = userAgents.map(a => a.toLowerCase());
  const specific = groups.filter(g => g.agents.some(a => wanted.some(w => w.includes(a) && a !== '*')));
  const wildcard = groups.filter(g => g.agents.includes('*'));
  const activeRules = (specific.length ? specific : wildcard).flatMap(g => g.rules);
  if (!activeRules.length) return true;

  let bestLen = -1;
  let allowed = true;
  for (const rule of activeRules) {
    if (!rule.pattern) continue;
    const endAnchored = rule.pattern.endsWith('$');
    const rawPattern = endAnchored ? rule.pattern.slice(0, -1) : rule.pattern;
    const escaped = rawPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const anchored = endAnchored ? `^${escaped}$` : `^${escaped}`;
    try {
      const re = new RegExp(anchored);
      if (re.test(pathname)) {
        const effectiveLen = rule.pattern.replace(/\*/g, '').length;
        if (effectiveLen > bestLen || (effectiveLen === bestLen && rule.allow)) {
          bestLen = effectiveLen;
          allowed = rule.allow;
        }
      }
    } catch {}
  }
  return allowed;
}

export function cleanHtmlToMarkdown(rawHtml, baseUrl, { onlyMainContent = true } = {}) {
  const html = String(rawHtml || '');
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';
  const descMatch = html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const description = descMatch ? decodeHtmlEntities(descMatch[1]).replace(/\s+/g, ' ').trim() : '';

  let working = html;
  for (const tag of SKIPPED_TAGS) {
    working = working.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
  }
  working = working.replace(/<!--[\s\S]*?-->/g, ' ');

  if (onlyMainContent) {
    const articleMatch = working.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)\s*>/i);
    if (articleMatch && articleMatch[1].replace(/<[^>]+>/g, '').trim().length >= 120) {
      working = articleMatch[1];
    } else {
      working = working
        .replace(/<(?:nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/(?:nav|header|footer|aside)\s*>/gi, ' ')
        .replace(/<(?:div|section)\b[^>]*(?:id|class)=["'][^"']*(?:nav-|navbar|sidebar|footer|header|cookie|modal|popup|banner|recommend-list)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)\s*>/gi, ' ');
    }
  }

  const links = [];
  const seenLinks = new Set();
  for (const match of working.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const rawHref = decodeHtmlEntities(match[1]).trim();
    if (!rawHref || /^(?:javascript:|mailto:|tel:|data:|#)/i.test(rawHref)) continue;
    try {
      const resolved = new URL(rawHref, baseUrl);
      if (['http:', 'https:'].includes(resolved.protocol)) {
        resolved.hash = '';
        if (!seenLinks.has(resolved.href)) {
          seenLinks.add(resolved.href);
          links.push(resolved.href);
        }
      }
    } catch {}
  }

  let md = working
    .replace(/<pre\b[^>]*>\s*<code\b[^>]*class=["'][^"']*language-([a-z0-9_+-]+)[^"']*["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
      (_, lang, code) => `\n\n\`\`\`${lang}\n${decodeHtmlEntities(code.replace(/<[^>]+>/g, '')).trim()}\n\`\`\`\n\n`)
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi,
      (_, code) => `\n\n\`\`\`\n${decodeHtmlEntities(code.replace(/<[^>]+>/g, '')).trim()}\n\`\`\`\n\n`)
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi,
      (_, code) => `\`${decodeHtmlEntities(code.replace(/<[^>]+>/g, '')).trim()}\``)
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi,
      (_, level, inner) => `\n\n${'#'.repeat(Number(level))} ${decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()}\n\n`)
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote\s*>/gi,
      (_, inner) => `\n\n> ${decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()}\n\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi,
      (_, inner) => `\n- ${decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()}`)
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_, href, inner) => {
      const label = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!label) return '';
      try {
        const resolved = new URL(decodeHtmlEntities(href).trim(), baseUrl);
        if (['http:', 'https:'].includes(resolved.protocol)) return `[${label}](${resolved.href})`;
      } catch {}
      return label;
    })
    .replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)\s*>/gi,
      (_, inner) => {
        const t = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
        return t ? `**${t}**` : '';
      })
    .replace(/<hr\b[^>]*\/?>/gi, '\n\n---\n\n')
    .replace(/<br\b[^>]*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|main|ul|ol|table|tr|dl|dd|dt)\s*>/gi, '\n\n')
    .replace(/<\/(?:td|th)\s*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');

  md = decodeHtmlEntities(md)
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { markdown: md, links, title, description };
}

function defaultBrowserPath(env) {
  const candidates = [
    env.CC_BROWSER_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find(p => existsSync(p)) || null;
}

export function createFirecrawlLocalEngine({
  env = process.env,
  fetchImpl = fetch,
  lookupImpl = dnsLookup,
  allowPrivate = false,
  now = Date.now,
  browserRenderImpl = null,
} = {}) {
  const robotsCache = new Map();
  const pageCache = new Map();
  let sharedBrowserPromise = null;

  async function renderWithPlaywright(targetUrl, timeoutMs) {
    if (browserRenderImpl) return browserRenderImpl(targetUrl, timeoutMs);
    const executablePath = defaultBrowserPath(env);
    const { chromium } = await import('playwright');
    if (!sharedBrowserPromise) {
      sharedBrowserPromise = chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      }).catch(err => {
        sharedBrowserPromise = null;
        throw err;
      });
    }
    const browser = await sharedBrowserPromise;
    const context = await browser.newContext({ userAgent: DEFAULT_UA, javaScriptEnabled: true });
    try {
      const page = await context.newPage();
      await page.route('**/*', async route => {
        const reqUrl = route.request().url();
        const type = route.request().resourceType();
        if (['image', 'media', 'font'].includes(type)) return route.abort();
        const check = await guardPublicUrl(reqUrl, { allowPrivate, lookupImpl });
        return check.ok ? route.continue() : route.abort();
      });
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      const finalUrl = page.url();
      const html = await page.content();
      return { statusCode: response?.status() ?? 200, finalUrl, html };
    } finally {
      await context.close();
    }
  }

  async function checkRobotsForUrl(urlObj, signal) {
    const origin = urlObj.origin;
    const cached = robotsCache.get(origin);
    if (cached && cached.expiresAt > now()) {
      return isRobotsAllowed(cached.text, urlObj.pathname + urlObj.search);
    }
    let text = '';
    try {
      const res = await fetchImpl(`${origin}/robots.txt`, {
        headers: { 'user-agent': DEFAULT_UA, accept: 'text/plain,*/*' },
        redirect: 'manual',
        signal,
      });
      if (res.ok) text = (await res.text()).slice(0, 256 * 1024);
    } catch {
      text = '';
    }
    robotsCache.set(origin, { text, expiresAt: now() + 30 * 60 * 1000 });
    return isRobotsAllowed(text, urlObj.pathname + urlObj.search);
  }

  async function fetchFollowingSafeRedirects(initialUrl, timeoutMs) {
    const signal = AbortSignal.timeout(timeoutMs);
    let current = initialUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const guard = await guardPublicUrl(current, { allowPrivate, lookupImpl });
      if (!guard.ok) {
        const status = guard.code === 'BLOCKED_TARGET' ? 403 : 502;
        return { ok: false, status, code: guard.code, error: guard.reason, blocked: guard.code === 'BLOCKED_TARGET' };
      }
      const allowedByRobots = await checkRobotsForUrl(guard.url, signal);
      if (!allowedByRobots) {
        return { ok: false, status: 403, code: 'ROBOTS_TXT_BLOCKED', error: 'Blocked by robots.txt', blocked: true };
      }
      let response;
      try {
        response = await fetchImpl(guard.url.href, {
          headers: {
            'user-agent': DEFAULT_UA,
            accept: 'text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9,*/*;q=0.5',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          redirect: 'manual',
          signal,
        });
      } catch (err) {
        if (signal.aborted) return { ok: false, status: 408, code: 'SCRAPE_TIMEOUT', error: 'Scrape timed out' };
        return { ok: false, status: 502, code: 'FETCH_FAILED', error: err?.message || 'Network fetch failed' };
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return { ok: false, status: 502, code: 'FETCH_FAILED', error: 'Redirect missing Location' };
        current = new URL(location, guard.url).href;
        continue;
      }
      const reader = response.body?.getReader ? response.body.getReader() : null;
      let html = '';
      if (reader) {
        const chunks = [];
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            return { ok: false, status: 413, code: 'RESPONSE_TOO_LARGE', error: 'Response exceeded max bytes' };
          }
          chunks.push(value);
        }
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }
        html = new TextDecoder('utf-8').decode(merged);
      } else {
        html = await response.text();
      }
      return {
        ok: true,
        statusCode: response.status,
        contentType: response.headers.get('content-type') || 'text/html',
        retryAfter: response.headers.get('retry-after') || null,
        finalUrl: guard.url.href,
        html,
      };
    }
    return { ok: false, status: 502, code: 'FETCH_FAILED', error: 'Too many redirects' };
  }

  async function scrape(options = {}) {
    const rawUrl = options.url;
    const onlyMainContent = options.onlyMainContent !== false;
    const maxAge = Number.isSafeInteger(options.maxAge) && options.maxAge >= 0 ? options.maxAge : 7 * 24 * 3600 * 1000;
    const timeoutMs = Math.min(120000, Math.max(1000, Number(options.timeout) || 15000));
    const cacheKey = `${rawUrl}|${onlyMainContent ? 1 : 0}`;

    if (maxAge > 0) {
      const hit = pageCache.get(cacheKey);
      if (hit && now() - hit.storedAt <= maxAge) {
        return {
          httpStatus: 200,
          body: {
            success: true,
            data: {
              ...hit.data,
              metadata: { ...hit.data.metadata, cacheState: 'hit', cachedAt: new Date(hit.storedAt).toISOString() },
            },
          },
        };
      }
    }

    const fetched = await fetchFollowingSafeRedirects(rawUrl, timeoutMs);
    if (!fetched.ok) {
      return {
        httpStatus: fetched.status,
        body: { success: false, code: fetched.code, error: fetched.error, ...(fetched.blocked ? { blocked: true } : {}) },
      };
    }
    if ([401, 403, 429].includes(fetched.statusCode)) {
      return {
        httpStatus: fetched.statusCode,
        retryAfter: fetched.retryAfter,
        body: { success: false, code: 'SITE_BLOCKED', blocked: true, error: `Upstream returned ${fetched.statusCode}` },
      };
    }

    let html = fetched.html;
    let finalUrl = fetched.finalUrl;
    let statusCode = fetched.statusCode;
    const isPlainMarkdown = /text\/(?:markdown|plain)/i.test(fetched.contentType) && !/<html\b/i.test(html.slice(0, 300));
    let parsed = isPlainMarkdown
      ? { markdown: html.trim(), links: [], title: '', description: '' }
      : cleanHtmlToMarkdown(html, finalUrl, { onlyMainContent });

    const browserMode = String(env.FIRECRAWL_LOCAL_BROWSER || 'auto').toLowerCase();
    const looksLikeSpaShell = !isPlainMarkdown && statusCode < 400 && parsed.markdown.length < 80 && /<div\s+id=["'](?:app|root|__next)["']/i.test(html);
    if ((browserMode === 'always' || (browserMode === 'auto' && looksLikeSpaShell)) && statusCode < 400) {
      try {
        const rendered = await renderWithPlaywright(finalUrl, timeoutMs);
        finalUrl = rendered.finalUrl || finalUrl;
        statusCode = rendered.statusCode || statusCode;
        parsed = cleanHtmlToMarkdown(rendered.html, finalUrl, { onlyMainContent });
      } catch {}
    }

    const metadata = {
      sourceURL: rawUrl,
      url: finalUrl,
      statusCode,
      title: parsed.title,
      description: parsed.description,
      ...(maxAge > 0 ? { cacheState: 'miss' } : {}),
    };
    const data = {
      markdown: parsed.markdown,
      links: parsed.links,
      metadata,
    };

    if (maxAge > 0 && statusCode >= 200 && statusCode < 300) {
      if (pageCache.size >= CACHE_LIMIT) {
        const oldest = pageCache.keys().next().value;
        pageCache.delete(oldest);
      }
      pageCache.set(cacheKey, { storedAt: now(), data });
    }
    return { httpStatus: 200, body: { success: true, data } };
  }

  async function search(options = {}) {
    const cloudMode = String(env.FIRECRAWL_CLOUD ?? 'search').trim().toLowerCase();
    if (['off', 'false', '0', 'none', 'disabled'].includes(cloudMode) && !env.SEARXNG_ENDPOINT) {
      return {
        httpStatus: 503,
        body: { success: false, code: 'SEARCH_DISABLED', error: 'FIRECRAWL_CLOUD is off and SEARXNG_ENDPOINT is unset.' },
      };
    }

    const query = String(options.query || '').trim();
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 10));
    if (!query) return { httpStatus: 400, body: { success: false, code: 'BAD_REQUEST', error: 'Missing query' } };

    if (env.SEARXNG_ENDPOINT) {
      try {
        const searxUrl = new URL('/search', env.SEARXNG_ENDPOINT);
        searxUrl.search = new URLSearchParams({ q: query, format: 'json' }).toString();
        const res = await fetchImpl(searxUrl.href, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) return { httpStatus: res.status, body: { success: false, code: 'SEARXNG_ERROR', error: `SearXNG HTTP ${res.status}` } };
        const json = await res.json();
        const web = (json.results || []).slice(0, limit).map(r => ({
          url: r.url,
          title: r.title || '',
          description: r.content || '',
        }));
        return { httpStatus: 200, body: { success: true, data: { web } } };
      } catch (err) {
        return { httpStatus: 502, body: { success: false, code: 'SEARXNG_UNREACHABLE', error: err?.message || 'SearXNG failed' } };
      }
    }

    const cloudBase = (env.FIRECRAWL_CLOUD_URL || DEFAULT_CLOUD_API).replace(/\/+$/, '');
    const headers = {
      'content-type': 'application/json',
      'x-origin': 'firecrawl-local',
    };
    if (env.FIRECRAWL_API_KEY) headers.authorization = `Bearer ${env.FIRECRAWL_API_KEY}`;
    const body = { query, limit, sources: options.sources || [{ type: 'web' }] };
    if (options.tbs) body.tbs = options.tbs;
    try {
      const res = await fetchImpl(`${cloudBase}/v2/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await res.json().catch(() => ({ success: false, error: 'Invalid cloud JSON' }));
      if (res.ok && payload?.success === true) {
        return { httpStatus: res.status, retryAfter: res.headers.get('retry-after'), body: payload };
      }
      if (env.FIRECRAWL_API_KEY) {
        return { httpStatus: res.status, retryAfter: res.headers.get('retry-after'), body: payload };
      }
    } catch (err) {
      if (env.FIRECRAWL_API_KEY) {
        return { httpStatus: 502, body: { success: false, code: 'CLOUD_SEARCH_FAILED', error: err?.message || 'Cloud search failed' } };
      }
    }

    // Keyless rate-limit/VPN fallback: query public GitHub open-source repositories API (100% public, robots-free REST API)
    try {
      const cleanedQuery = query.replace(/\bsite:[^\s)]+/gi, '').replace(/[()"]/g, ' ').replace(/\bOR\b/g, ' ').replace(/\s+/g, ' ').trim() || '经验 复盘';
      const ghUrl = new URL('https://api.github.com/search/repositories');
      ghUrl.search = new URLSearchParams({ q: `${cleanedQuery} archived:false`, per_page: String(Math.min(10, limit)) }).toString();
      const ghRes = await fetchImpl(ghUrl.href, {
        headers: { 'user-agent': DEFAULT_UA, accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(12000),
      });
      if (ghRes.ok) {
        const ghJson = await ghRes.json();
        const web = (ghJson.items || []).slice(0, limit).map(repo => ({
          url: `https://github.com/${repo.full_name}`,
          title: repo.full_name,
          description: repo.description || '',
        }));
        return { httpStatus: 200, body: { success: true, data: { web } } };
      }
    } catch {}
    return { httpStatus: 503, body: { success: false, code: 'SEARCH_UNAVAILABLE', error: 'Keyless search rate-limited and public fallback unavailable' } };
  }

  async function close() {
    if (sharedBrowserPromise) {
      const b = await sharedBrowserPromise.catch(() => null);
      sharedBrowserPromise = null;
      await b?.close().catch(() => {});
    }
  }

  return { scrape, search, close };
}

function hostAllowed(hostHeader, allowedHosts = []) {
  if (!hostHeader) return false;
  const raw = String(hostHeader).trim().toLowerCase();
  const host = raw.startsWith('[') ? raw.slice(1, raw.indexOf(']')) : raw.split(':')[0];
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' ||
    allowedHosts.some(h => h.toLowerCase() === host);
}

function bearerMatches(authHeader, expectedToken) {
  const presented = String(authHeader || '').replace(/^bearer\s+/i, '');
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expectedToken, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createFirecrawlLocalServer({
  env = process.env,
  token = env.FIRECRAWL_LOCAL_TOKEN || null,
  allowedHosts = [],
  ...engineOptions
} = {}) {
  const engine = createFirecrawlLocalEngine({ env, ...engineOptions });

  const server = createServer(async (req, res) => {
    const send = (status, body, extraHeaders = {}) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders });
      res.end(JSON.stringify(body));
    };

    if (!hostAllowed(req.headers.host, allowedHosts)) {
      req.resume();
      return send(403, { success: false, code: 'HOST_NOT_ALLOWED', error: 'Host header not allowed' });
    }
    const secSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    if (secSite && secSite !== 'none') {
      req.resume();
      return send(403, { success: false, code: 'BROWSER_ORIGIN_BLOCKED', error: 'Cross-origin browser requests are blocked' });
    }
    if (token && !bearerMatches(req.headers.authorization, token)) {
      req.resume();
      return send(401, { success: false, code: 'UNAUTHORIZED', error: 'Missing or invalid Bearer token' });
    }

    const pathname = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && pathname === '/health') {
      return send(200, { status: 'ok', engine: 'firecrawl-local' });
    }

    if (req.method !== 'POST' || !['content-type'].every(h => String(req.headers[h] || '').toLowerCase().startsWith('application/json'))) {
      req.resume();
      return send(400, { success: false, code: 'BAD_REQUEST', error: 'Expected POST with application/json' });
    }

    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) return send(413, { success: false, code: 'PAYLOAD_TOO_LARGE', error: 'Request body too large' });
        chunks.push(chunk);
      }
    } catch {
      return send(400, { success: false, code: 'BAD_REQUEST', error: 'Failed reading request stream' });
    }

    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return send(400, { success: false, code: 'INVALID_JSON', error: 'Invalid JSON body' });
    }

    if (pathname === '/v2/scrape') {
      const out = await engine.scrape(body);
      return send(out.httpStatus, out.body, out.retryAfter ? { 'retry-after': out.retryAfter } : {});
    }
    if (pathname === '/v2/search') {
      const out = await engine.search(body);
      return send(out.httpStatus, out.body, out.retryAfter ? { 'retry-after': out.retryAfter } : {});
    }
    return send(404, { success: false, code: 'NOT_FOUND', error: `Unsupported route ${pathname}` });
  });

  server.on('close', () => { void engine.close(); });
  return { server, engine };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const portIdx = process.argv.indexOf('--port');
  const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : (Number(process.env.FIRECRAWL_LOCAL_PORT) || 3002);
  const hostIdx = process.argv.indexOf('--host');
  const host = hostIdx >= 0 ? process.argv[hostIdx + 1] : '127.0.0.1';
  const token = process.env.FIRECRAWL_LOCAL_TOKEN || null;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !token) {
    console.error('Refusing to bind non-loopback address without FIRECRAWL_LOCAL_TOKEN');
    process.exit(1);
  }
  const { server } = createFirecrawlLocalServer({ token });
  server.listen(port, host, () => {
    console.log(`Firecrawl Local (Node v2 compatible) listening at http://${host}:${port} (cloud=${process.env.FIRECRAWL_CLOUD || 'search'})`);
  });
}
