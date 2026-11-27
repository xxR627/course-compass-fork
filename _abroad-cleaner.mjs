import { redactExperiencePii } from './_experience-cleaner.mjs';

export const VERIFIED_FEIYUE_REPOS = new Map([
  ['SUSTech-Application/SUSTechapplication', { license: 'MIT', school: '南方科技大学', domain: 'study_abroad' }],
  ['USTC-Feiyue/USTC-Feiyue', { license: 'MIT', school: '中国科学技术大学', domain: 'study_abroad' }],
  ['ZJU-Feiyue/ZJU-Feiyue', { license: 'CC-BY-4.0', school: '浙江大学', domain: 'study_abroad' }],
  ['SJTU-Application/SJTU-Feiyue', { license: 'MIT', school: '上海交通大学', domain: 'study_abroad' }],
]);

export const BLOCKED_REPO_PATTERNS = /(?:some-many-books|cirosantilli|political|vpn|shadowsocks|clash|pirate|crack|nsfw|gambling|casino)/i;

const GUARANTEED_SCAM_RE = /(?:保录取|稳录班|免雅(?:思)?直录|低分保录|内部保录|内推名额直录|教授内推保过|不出分拿\s*offer|操作成绩单|改成绩单|背景挂靠|买分|远程代考|替考保分|直通藤校保过|双非7[0-5]分?保录)/i;
const AGENCY_SOLICIT_RE = /(?:付费内推|代写文书|全套文书代写|扣\s*[1一68]\s*(?:领|拿|测|发|送)|(?:评论区|后台|主页|私信|滴滴|小窗).{0,12}(?:扣|留|发|领|拿|测|踢).{0,12}(?:[1一]|选校表|选校评估|院校\s*list|定位报告|免费规划|资料包|文书模板)|加(?:老师|学长|学姐|顾问)?.{0,6}(?:vx|微信|v信|绿泡泡|威信)|签约了.{0,8}留学.{0,6}顾问|强烈安利.{0,8}中介老师)/i;
const STUDY_ABROAD_CONTEXT_RE = /(?:留学|申请|录取|拒信|候补|飞跃|网申|选校|雅思|托福|先修课|admission|application|offer|reject|waitlist|msc|mphil|phd|ielts|toefl|gre|gmat)/i;
const NON_ACADEMIC_UNSAFE_RE = /(?:博彩平台|六合彩|色情|成人视频|刷单返利|虚拟币带单)/i;

export function isVerifiedFeiyueRepo(repository, { allowExplicitTestRepo = false } = {}) {
  const repo = String(repository || '').trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return false;
  if (BLOCKED_REPO_PATTERNS.test(repo)) return false;
  if (VERIFIED_FEIYUE_REPOS.has(repo)) return true;
  return Boolean(allowExplicitTestRepo);
}

export function evaluateAbroadScamRisk(raw) {
  const text = String(raw ?? '').normalize('NFKC');
  const reasons = [];
  if (text.length > 120000) reasons.push('oversized_document');
  if (NON_ACADEMIC_UNSAFE_RE.test(text)) reasons.push('unsafe_non_academic');
  if (GUARANTEED_SCAM_RE.test(text)) reasons.push('guaranteed_admission_scam');
  if (AGENCY_SOLICIT_RE.test(text)) reasons.push('agency_leadgen_solicitation');
  if (!STUDY_ABROAD_CONTEXT_RE.test(text)) reasons.push('missing_study_abroad_context');
  return {
    blocked: reasons.length > 0,
    reasons,
    cleanedText: redactExperiencePii(text),
  };
}

export function normalizeUndergradTier(raw) {
  const s = String(raw || '').normalize('NFKC').trim();
  if (!s) return 'unknown';
  if (/清北|清华|北大|top\s*2/i.test(s)) return 'qingbei';
  if (/中外合[办作]|西浦|西交利物浦|宁诺|宁波诺丁汉|港中深|昆山杜克|上纽|4\+0|2\+2/i.test(s)) return 'sino_foreign';
  if (/海本|美本|英本|澳本|加本|港本|海外本科/i.test(s)) return 'overseas';
  if (/985|华五|c9|中九|末流985|顶9/i.test(s)) return '985';
  if (/211|两电一邮|财经211|理工211/i.test(s)) return '211';
  if (/双一流/i.test(s)) return 'double_first_class';
  if (/双非|普通一本|普通二本|省属重点|一本|二本/i.test(s)) return 'non_double_first_class';
  return 'unknown';
}

export function checkAbroadSource(raw) {
  const text = String(raw).normalize('NFKC');
  if (text.length > 120000) throw new Error('Case source exceeds the supported document size');
  if (NON_ACADEMIC_UNSAFE_RE.test(text)) {
    throw new Error('Unsafe non-academic content in case source');
  }
  if (GUARANTEED_SCAM_RE.test(text) || AGENCY_SOLICIT_RE.test(text)) {
    throw new Error('Commercial solicitation in case source');
  }
  if (!STUDY_ABROAD_CONTEXT_RE.test(text)) {
    throw new Error('Case source lacks study-abroad context');
  }
  return text;
}

export function cleanAbroadCaseSource(markdown) {
  const text = checkAbroadSource(markdown);
  // Only parse explicit result rows. Free-form text and demographics are never retained.
  return text.split(/\r?\n/).filter(line => /^\s*\|/.test(line)).map(redactExperiencePii);
}
