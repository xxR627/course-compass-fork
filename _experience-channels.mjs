export const EXPERIENCE_CHANNELS = [
  {
    id: 'nowcoder',
    label: '牛客网',
    prior: 0.92,
    scrapePolicy: 'scrape_or_snippet',
    allowUrl: /^https:\/\/(?:www\.|m\.)?nowcoder\.com\/(?:discuss\/\d+|feed\/main\/detail\/[0-9a-f]{16,64}|enterprise\/\d+\/interview)(?:[/?#]|$)/i,
    siteQuery: 'site:nowcoder.com',
  },
  {
    id: 'zhihu',
    label: '知乎',
    prior: 0.85,
    // zhihu.com robots.txt disallows User-agent: * on /, so compliant mode uses search-indexed summaries without scraping disallowed paths
    scrapePolicy: 'snippet_only',
    allowUrl: /^https:\/\/(?:zhuanlan\.zhihu\.com\/p\/\d+|www\.zhihu\.com\/question\/\d+(?:\/answer\/\d+)?)(?:[/?#]|$)/i,
    siteQuery: '(site:zhuanlan.zhihu.com OR site:zhihu.com/question)',
  },
  {
    id: 'xiaohongshu',
    label: '小红书',
    prior: 0.78,
    // xiaohongshu.com robots.txt disallows User-agent: * on /, so compliant mode uses search-indexed public note summaries
    scrapePolicy: 'snippet_only',
    allowUrl: /^https:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item)\/[0-9a-f]{16,32}(?:[/?#]|$)/i,
    siteQuery: 'site:xiaohongshu.com/explore',
  },
  {
    id: 'github_exp',
    label: 'GitHub 开源经验仓',
    prior: 0.95,
    scrapePolicy: 'scrape_or_snippet',
    allowUrl: /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/(?:blob|tree)\/[^\s?#]+)?(?:[/?#]|$)/i,
    siteQuery: 'site:github.com',
  },
  {
    id: 'bilibili_edu',
    label: 'B站专栏 / 高校官方就业网',
    prior: 0.88,
    scrapePolicy: 'scrape_or_snippet',
    allowUrl: /^https:\/\/(?:www\.bilibili\.com\/read\/cv\d+|(?:[a-z0-9-]+\.)+edu\.cn\/[^\s?#]+)(?:[/?#]|$)/i,
    siteQuery: '(site:bilibili.com/read OR site:edu.cn)',
  },
];

const CHANNEL_BY_ID = new Map(EXPERIENCE_CHANNELS.map(c => [c.id, c]));

const BLOCKED_PATH_SEGMENTS = /^\/(?:login|signin|sign_in|signup|register|passport|captcha|verify|settings|messages|notifications|inbox|account|privacy|terms)(?:[/?#._-]|$)/i;

export function getExperienceChannel(id) {
  return CHANNEL_BY_ID.get(id) || null;
}

export function matchAllowedChannelUrl(rawUrl, expectedChannelId = null) {
  if (typeof rawUrl !== 'string' || !URL.canParse(rawUrl)) return null;
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (BLOCKED_PATH_SEGMENTS.test(url.pathname)) return null;
  const normalizedHttps = `https://${url.host}${url.pathname}${url.search}`;
  const candidates = expectedChannelId ? [CHANNEL_BY_ID.get(expectedChannelId)].filter(Boolean) : EXPERIENCE_CHANNELS;
  for (const ch of candidates) {
    if (ch.allowUrl.test(normalizedHttps)) {
      const isOfficialEdu = ch.id === 'bilibili_edu' && /\.edu\.cn$/i.test(url.hostname);
      return {
        channel: ch,
        isOfficialEdu,
        normalizedUrl: normalizedHttps,
      };
    }
  }
  return null;
}
