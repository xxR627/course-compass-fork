import { createHash } from 'node:crypto';
import { sanitizeText } from './_employment-llm.mjs';

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'spm', 'spm_id_from', 'vd_source', 'from', 'isappinstalled',
  'xhsshare', 'xsec_token', 'xsec_source', 'app_platform', 'app_version',
  'share_from_user_hidden', 'apptime', 'shareRedId', 'source', ' share_id',
]);

const HARD_SPAM_RULES = [
  { code: 'lead_gen_comment_trigger', re: /(?:评论区|后台|主页|置顶|下方|留言).{0,12}(?:扣|留|回|敲|发|私信|私我|滴滴|dd)\s*[【「"'“‘]?[0-9a-zA-Z一二三四五六七八九十上岸资料面经模板]{1,8}/i },
  { code: 'lead_gen_dm_bait', re: /(?:无偿分享|免费领|整理好了|打包送|需要的宝子|想要的同学).{0,18}(?:点赞关注|私信我|后台私|滴滴我|扣\s*\d+|主页粉丝群|进群领)/i },
  { code: 'paid_coaching_funnel', re: /(?:保过班|全程托管|付费内推|保录取|名额有限先到先得|早鸟优惠|添加助教|扫码进群领|1对1定制辅导|一对一保过|直通车保过|内部名额付费)/i },
  { code: 'academic_fraud_blackmarket', re: /(?:代写论文|论文代发|挂名发表|sci挂名|买科研项目|水赛保奖|代做毕设|包拿国奖)/i },
];

const SOFT_AD_SIGNALS = [
  { weight: 0.35, re: /(?:报了.{0,8}机构|跟了.{0,6}直系学长班|多亏了.{0,8}辅导班|推荐大家去报)/i },
  { weight: 0.30, re: /(?:公众号|绿泡泡|卫星号|徽信|vx|v信)\s*[:：]?\s*[a-zA-Z0-9_-]{5,}/i },
  { weight: 0.25, re: /(?:点击下方卡片|限时立减|训练营报名|课程顾问|领券购买)/i },
  { weight: 0.25, re: /(?:彻底完蛋了|今年地狱难度全挂|双非别投了没救了|人均清北5个sp)/i },
];

const METHOD_KEYWORDS = /(?:一面|二面|三面|终面|hr面|追问|手撕|复盘|时间线|timeline|夏令营|预推免|九推|初试|复试|机试|项目|课设|实习|简历|八股|压测|题库|避坑|复习规划|投递)/i;

export function canonicalizeExperienceUrl(rawUrl) {
  const parsed = typeof rawUrl === 'string' && URL.canParse(rawUrl) ? new URL(rawUrl) : null;
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new TypeError(`Invalid experience URL: ${rawUrl}`);
  }
  parsed.protocol = 'https:';
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^m\.nowcoder\.com$/, 'www.nowcoder.com');
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.trim()) || key.startsWith('utm_')) {
      parsed.searchParams.delete(key);
    }
  }
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }
  parsed.searchParams.sort();
  return parsed.href;
}

function normalizeForShingles(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function computeSimhash64(text) {
  const clean = normalizeForShingles(text);
  if (!clean) return '0000000000000000';
  const weights = new Int32Array(64);
  const step = clean.length < 6 ? 1 : 3;
  const limit = Math.max(1, clean.length - step + 1);
  for (let i = 0; i < limit; i++) {
    const gram = clean.slice(i, i + step);
    const digest = createHash('sha256').update(gram).digest();
    const hi = digest.readUInt32BE(0);
    const lo = digest.readUInt32BE(4);
    for (let bit = 0; bit < 32; bit++) {
      weights[bit] += (hi & (1 << bit)) !== 0 ? 1 : -1;
      weights[bit + 32] += (lo & (1 << bit)) !== 0 ? 1 : -1;
    }
  }
  let hash = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (weights[bit] > 0) hash |= 1n << BigInt(bit);
  }
  return hash.toString(16).padStart(16, '0');
}

export function redactExperiencePii(rawText) {
  const base = sanitizeText(String(rawText || ''), 12000);
  return base
    .replace(/(?:微信|微信号|vx|v信|wechat|绿泡泡|企微|qq|qq群|扣扣群)\s*[:：号]?\s*[a-zA-Z][a-zA-Z0-9_-]{4,24}/gi, '[联系方式已脱敏]')
    .replace(/(?:qq|qq群|群号)\s*[:：]?\s*\d{6,12}/gi, '[群号已脱敏]')
    .replace(/(?:学号|工号|考号|准考证号)\s*[:：]?\s*[A-Za-z0-9]{6,20}/gi, '[编号已脱敏]')
    .replace(/(?:本人姓名|真实姓名|姓名)\s*[:：]\s*[\u4e00-\u9fa5]{2,4}/g, '姓名：[已脱敏]')
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号已脱敏]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[邮箱已脱敏]');
}

export function evaluateSpamAndAdRisk({ title = '', text = '', extractMode = 'full_markdown' } = {}) {
  const combined = `${title}\n${text}`.trim();
  const minLen = extractMode === 'search_snippet' ? 28 : 65;
  if (combined.replace(/\s+/g, '').length < minLen) {
    return { rejected: true, adRiskScore: 0.2, reason: 'insufficient_length' };
  }
  for (const rule of HARD_SPAM_RULES) {
    if (rule.re.test(combined)) {
      return { rejected: true, adRiskScore: 1, reason: rule.code };
    }
  }
  let adRisk = 0;
  const matchedSignals = [];
  for (const sig of SOFT_AD_SIGNALS) {
    if (sig.re.test(combined)) {
      adRisk += sig.weight;
      matchedSignals.push(sig.re.source.slice(0, 24));
    }
  }
  if (!METHOD_KEYWORDS.test(combined)) {
    adRisk += 0.35;
  }
  const clamped = Math.min(1, Number(adRisk.toFixed(3)));
  if (clamped >= 0.6) {
    return { rejected: true, adRiskScore: clamped, reason: 'high_soft_ad_or_low_methodology', matchedSignals };
  }
  return { rejected: false, adRiskScore: clamped, reason: null };
}
