import { createHash } from 'node:crypto';
import { assertAbroadShape } from './_abroad-contract.mjs';
import { checkAbroadSource } from './_abroad-cleaner.mjs';
import { getExperienceChannel, matchAllowedChannelUrl } from './_experience-channels.mjs';

const supported = new Set(['zhihu', 'xiaohongshu']);
const normalize = value => String(value || '').normalize('NFKC').toLowerCase();
const resultPatterns = {
  reject: /被拒|收到拒信|\b(?:rejected|rejection)\b/i,
  conditional_offer: /有条件录取|\bconditional offer\b/i,
  offer: /收到录取|获得录取|收到\s*offer|拿到\s*offer|\b(?:received an offer|was admitted)\b/i,
  waitlist: /进入候补|收到候补|\b(?:was waitlisted|was placed on the waitlist)\b/i,
};

export function parseCommunityCase(result, { channelId, program, school, now = new Date() }) {
  if (!supported.has(channelId)) return null;
  const allowed = matchAllowedChannelUrl(result.url, channelId);
  if (!allowed) return null;
  const url = new URL(allowed.normalizedUrl);
  if (channelId === 'zhihu' && /\/question\//.test(url.pathname) && !/\/answer\/\d+\/?$/.test(url.pathname)) return null;
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/$/, '');
  let text;
  try { text = checkAbroadSource([result.title, result.description].filter(Boolean).join('。')); }
  catch { return null; }
  const schoolNames = [school.nameZh,school.nameEn].map(normalize).filter(Boolean);
  const programNames = [program.titleZh,program.titleEn].map(normalize).filter(Boolean);
  const matches = new Map();
  for (const statement of text.split(/[。;；\n]|\.(?:\s|$)/).map(normalize)) {
    if (!schoolNames.some(name=>statement.includes(name)) || !programNames.some(name=>statement.includes(name))) continue;
    if (!/我(?:的|申请|在|被|收到|拿到)|本人|\bi (?:applied|received|was|got|have)\b/i.test(statement) ||
        /\?|求问|预测|假设|未收到|还没|如果|有没有|是否|可能|\b(?:not|never|might|whether)\b/i.test(statement)) continue;
    const intake = [...new Set([...statement.matchAll(/\b(20\d{2})\s*(fall|spring)\b/gi)].map(([,year,term]) =>
      year + (term.toLowerCase() === 'fall' ? 'Fall' : 'Spring')))];
    const outcomes = Object.entries(resultPatterns).filter(([,pattern]) => pattern.test(statement)).map(([key])=>key);
    if (outcomes.includes('conditional_offer') && outcomes.includes('offer')) outcomes.splice(outcomes.indexOf('offer'),1);
    if (intake.length === 1 && outcomes.length === 1) matches.set(intake[0] + ':' + outcomes[0], [intake[0],outcomes[0]]);
  }
  if (matches.size !== 1) return null;
  const [[intakeTerm,outcome]] = matches.values();
  const hash = createHash('sha256').update([url.href,program.id,intakeTerm,outcome].join('\n')).digest('hex');
  const item = {
    id:'case_community_' + hash.slice(0,24), schemaVersion:'1.0', programId:program.id, intakeTerm, outcome,
    undergradTier:'unknown', undergradSchoolTag:'unknown', undergradMajor:'unknown', majorFamily:'other',
    gpaPercent:null, gpaRawText:'unknown', rankBucket:'unknown', langText:'unknown', greGmatText:null,
    highlights:[], submittedMonth:null, decisionMonth:null,
    keyTakeaway:'公开搜索摘要中的个人申请自报，申请背景和结果细节未独立核实。',
    sourceChannel:channelId, sourceLabel:getExperienceChannel(channelId).label + '公开索引',
    sourceUrl:url.href, simhash64:hash.slice(0,16), verifiedAt:now.toISOString(),
  };
  assertAbroadShape('AdmissionCase', item);
  return item;
}

export async function collectAbroadCommunityCases({ client, programs, schools, searches, now = new Date() }) {
  const cases = new Map();
  for (const { programId, channelId, limit = 5 } of searches) {
    const program = programs.find(item => item.id === programId);
    if (!program || !supported.has(channelId) || !Number.isInteger(limit) || limit < 1 || limit > 10) {
      throw new Error('Invalid reviewed community case search');
    }
    const school = schools.get(program.universityId);
    const channel = getExperienceChannel(channelId);
    const query = channel.siteQuery + ' "' + school.nameZh + '" "' + program.titleZh + '" (录取 OR 拒信 OR 候补)';
    const hits = await client.searchPages({ query, limit, tbs:'qdr:w' });
    for (const result of hits) {
      const item = parseCommunityCase(result, {channelId,program,school,now});
      if (item) cases.set(item.id,item);
    }
  }
  return [...cases.values()];
}
