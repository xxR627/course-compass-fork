import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createCourseCompassServer } from './_serve.mjs';
import { validateSkillCandidates } from './_employment-jd-model.mjs';
import { entryJobType, smartRecruitersPosting, applySourceObservations } from './_fetch-official-jobs.mjs';
import { jobLinkIdentity } from './_employment-data.mjs';
import { mergeJobRadar } from './_merge-jobradar.mjs';
import { evidenceReviewProjection, validateEvidenceReview } from './_employment-evidence-review.mjs';
import {
  sanitizeText,
  structureMatchCopilot,
  structureJdParse,
  structureCompareCopilot,
  structureEvidenceCopilot,
  discoverLocalModels,
  callCloudChat,
  resetLlmRouterState,
} from './_employment-llm.mjs';
const data = JSON.parse(readFileSync(new URL('./_cc-data.json', import.meta.url), 'utf8'));
global.window = {};
window.CC_DATA = data;
eval(readFileSync(new URL('./_cc-engine.js', import.meta.url), 'utf8'));
const CC = window.CC;
const p = data.personas.find((x) => x.id === 'p_chinese');
const reqs = CC.allRequirements();
console.log('REQ_COUNT', reqs.length, 'jobs', reqs.filter(r=>r.kind==='job').length, 'comps', reqs.filter(r=>r.kind==='competition').length);
const fm = CC.forwardMatch(p, reqs);
assert.equal(fm.all.length, reqs.length);
assert.ok(fm.all.every(m => m.matchVersion === CC.MATCH_VERSION && ['PASS', 'FAIL', 'UNKNOWN'].includes(m.eligibility.status)));
console.log('TOP_MATCHES', fm.all.slice(0, 3).map(m => [m.req.title, m.matchScore, m.eligibility.status, m.tier]));
const targets = p.targetJobIds;
const an = CC.analyzeTargets(p, { reqIds: targets });
console.log('ANALYSIS', an.skills.slice(0, 6).map((s) => [s.skillName, s.status, s.recommendedCourseIds.length, s.upgradeCourseIds.length]));
const gaps = CC.computeGaps(p, targets);
console.log('GAPS', gaps.slice(0, 4).map((g) => [g.skillName, g.status, g.action.slice(0, 28)]));
const topo = CC.topoSortCourses(p.major, p.completedCourseIds);
console.log('TOPO order/ready/blocked', topo.order.length, topo.readyNow.length, topo.blocked.length, 'first3', topo.order.slice(0, 3));
const upCid = (an.skills.find((s) => s.upgradeCourseIds.length) || {}).upgradeCourseIds?.[0] || topo.readyNow[0];
const plan = CC.buildUpgradePlan(p, upCid, '', gaps);
console.log('PLAN', plan && { course: plan.courseId, hours: plan.totalHours, weeks: plan.weeksNeeded, fits: plan.fitsBudget, tasks: plan.tasks.length });
const bullets = CC.buildGroundedBullets(p, targets[0]);
console.log('BULLETS', bullets.slice(0, 3).map((b) => ({ t: b.text.slice(0, 50), ev: b.evidenceId, v: b.verified, ph: b.placeholders })));
const jd = '岗位：Java后端开发实习生\n要求：2027届本科，熟悉Java、Spring Boot、MySQL，了解Redis，有Git协作经验，每周到岗4天。';
const core = CC.parseJdCore(p, jd);
console.log('JD', core.jobTitle, core.skills.map((s) => [s.skillName, s.weight, s.status]), 'gates', core.hardGates.map((g) => g.label));
console.log('JAVA_NE_JS', CC.extractSkillsFromText('Java 和 JavaScript 与 MySQL 和 SQL查询').map((s) => s.skillId + (s.subTag ? ':' + s.subTag : '')));
const st = { profile: { major: '汉语言文学', grade: '大三', graduationDate: '2028-06', rank: 18, rankTotal: 120, gpa: 82, weeklyHours: 8, courses: [{ name: '现代汉语', status: '已通过' }, { name: '市场营销（选修）', status: '在修' }], achievements: [{ title: '校公众号排版运营', desc: '负责栏目排版与发布' }] }, paths: ['jiuye'] };
const cp = CC.ccProfileFromState(st);
console.log('BRIDGE', cp.major, cp.graduationYear, cp.completedCourseIds, cp.evidences.map((e) => e.skillIds));
const realJob = reqs.find((r) => r.kind === 'job' && r.skills.length);
console.log('REALJOB', realJob.id, realJob.title, realJob.org, 'skills', realJob.skills.length, realJob.citation.trustTier, realJob.postUrl ? 'url-ok' : 'NO-URL', 'jdLen', (realJob.jdText || '').length);
assert.equal(cp.graduationYear, 2028);
assert.equal(cp.completedCourseIds.length, 1);
assert.equal(cp.inProgressCourseIds.length, 1);
assert.ok(cp.evidences.every(e => !CC.hasVerifiedEvidence(e)));
assert.equal(CC.majorOf('音乐表演'), null);
const empty=CC.ccProfileFromState({profile:{major:'音乐表演',grade:'大三',gpa:null}});
assert.equal(empty.graduationYear,null);
assert.equal(empty.gpaPercent,null);
const gate={kind:'job',jobType:'campus',hardGate:{minDegree:'bachelor',graduationYears:[2028],minGpaPercent:80}};
assert.equal(CC.evaluateEligibility(empty,gate).status,'UNKNOWN');
assert.equal(CC.evaluateEligibility({...cp,degree:'bachelor'},gate).status,'PASS');
assert.equal(CC.evaluateEligibility({...cp,degree:'bachelor',gpaPercent:0},gate).status,'FAIL');
assert.equal(CC.evaluateEligibility(cp,realJob).status,'UNKNOWN');
assert.equal(CC.salaryParse('不发放100元/天的餐费补助'), null);
assert.equal(CC.salaryParse('实习薪资：200-250元/天').monthlyMax,5437.5);
const snapshot={...realJob,sourceSnapshot:{status:'observed_active',lastSeenAt:'2026-11-15',applyEndAt:'2026-11-18'}};
assert.equal(CC.jobFreshness(snapshot,new Date('2026-11-19T02:00:00Z')).status,'expired');
assert.equal(CC.jobFreshness({...snapshot,sourceSnapshot:{...snapshot.sourceSnapshot,applyEndAt:null}},new Date('2026-11-19T02:00:00Z')).status,'observed_active');
assert.equal(CC.jobFreshness({...snapshot,sourceSnapshot:{...snapshot.sourceSnapshot,lastSeenAt:'2026-11-01',applyEndAt:null}},new Date('2026-11-19T02:00:00Z')).status,'stale');
assert.ok(Array.isArray(data.campusCalendar) && data.campusCalendar.length >= 100);
assert.equal(CC.hasHardcoreExperience(CC.ccProfileFromState({profile:data.personas.find(x=>x.id==='p_cs')})), true);
assert.equal(CC.hasHardcoreExperience(CC.ccProfileFromState({profile:data.personas.find(x=>x.id==='p_mat')})), false);
{
  const j=CC.allRequirements().find(x=>x.id==='tx_1283126524891177984');
  const b={schemaVersion:CC.EMPLOYMENT_SCHEMA_VERSION,major:'cs',degree:'bachelor',graduationYear:2027,completedCourseIds:['cs_intro','cs_ds','cs_db','cs_java'],inProgressCourseIds:[],evidences:[]};
  const s=ev=>CC.forwardMatch({...b,evidences:ev?[ev]:[]},[j],new Date('2026-11-20T00:00:00Z')).all[0].matchScore;
  const sk=j.skills.slice(0,3).map(x=>x.skillId);
  const vIntern=s({id:'1',type:'实习',title:'后端实习',skillIds:sk,verificationStatus:'user_confirmed',hasPortfolio:true});
  const vProj=s({id:'2',type:'项目',title:'开源项目',skillIds:sk,verificationStatus:'user_confirmed',hasPortfolio:true});
  const vComp=s({id:'3',type:'竞赛',title:'蓝桥杯',skillIds:sk,verificationStatus:'user_confirmed',hasPortfolio:true});
  const vCw=s({id:'4',type:'课设',title:'课设',skillIds:sk,verificationStatus:'user_confirmed',hasPortfolio:true});
  const vNone=s(null);
  assert.ok(vIntern>vProj && vProj>vComp && vComp>vCw && vCw>vNone, 'Evidence tiers must remain strictly descending');
}
const imported=CC.makeImportedJob({jdText:'岗位：固件工程师\n熟悉 STM32，有 CAN 总线开发经验优先。'},cp);
assert.equal(CC.jobFamilyOf(imported).id,'firmware');
CC.setImportedJobs([imported]);
const task=CC.roadmapTasksOf(CC.computeGaps(cp,[imported.id])).find(item=>item.skillId==='industrial_bus');
assert.deepEqual(task.hours,[5,9]);
assert.ok(task.prerequisites.length&&task.criteria.length===2&&task.steps.length===3);
assert.equal(CC.reviewRoadmapEvidence(task,{notes:['仅一个用例'],artifactUrl:'https://example.com/'}).status,'partial');
assert.equal(CC.reviewRoadmapEvidence(task,{notes:['正常记录','过滤记录'],artifactUrl:'javascript:void(0)'}).readyForReview,false);
assert.equal(CC.reviewRoadmapEvidence(task,{notes:['正常记录','过滤记录'],artifactUrl:'https://example.com/'}).readyForReview,true);
const projection=evidenceReviewProjection({criteria:task.criteria,excerpt:'姓名：王同学\n成功收到报文 A1。邮件：person@example.com'});
assert.doesNotMatch(projection.excerpt,/王同学|person@example.com/);
assert.throws(()=>evidenceReviewProjection({criteria:task.criteria,excerpt:'成功',profile:{}}),/INVALID_REVIEW_INPUT/);
const findings=[{index:0,assessment:'supports',quote:'收到报文 A1'},{index:1,assessment:'unclear',quote:''}];
assert.deepEqual(validateEvidenceReview({findings},projection),findings);
assert.throws(()=>validateEvidenceReview({findings:[{...findings[0],quote:'通过全部用例'},findings[1]]},projection),/UNGROUNDED_REVIEW/);
const evidenceMapProfile=CC.ccProfileFromState({profile:{major:'计算机',courses:[{name:'Python',status:'已通过'},{name:'Java',status:'在修'}],
  evidences:[{id:'demo-course-map',title:'Python 示例',description:'本机运行记录',skillIds:['python'],type:'项目',verificationStatus:'unverified'}]}});
const evidenceMap=CC.employmentEvidenceMappings(evidenceMapProfile);
assert.ok(evidenceMap.some(item=>item.skillId==='python'&&item.source==='course'&&item.status==='completed'));
assert.ok(evidenceMap.some(item=>item.skillId==='java'&&item.source==='course'&&item.status==='in_progress'));
assert.ok(evidenceMap.some(item=>item.skillId==='python'&&item.source==='evidence'&&item.status==='unverified'));
assert.equal(CC.reverseStatusOf(evidenceMapProfile,'python'),'LEARNED_UNVERIFIED');
assert.deepEqual(CC.employmentEvidenceMappings({...evidenceMapProfile,personalized:false}),[]);
CC.setImportedJobs([]);
const facts = CC.jobFactsOf({jdText:'【岗位职责】开发固件；支持设备联调\n【任职要求】\n本科及以上，熟悉 CAN 总线和 Linux\n工作城市：深圳\n发布日期：2026-11-19\n有 RTOS 项目经验优先\n实习薪资：200-250元/天'});
assert.equal(facts.responsibilities.length,2);
assert.match(facts.hardRequirements[0].sourceSpan,/本科及以上/);
assert.equal(facts.bonus.length,1);
for (const key of ['protocols','tools','location','postedDate','experience','salary']) assert.equal(facts[key].length,1,key);
assert.deepEqual(CC.jobFactsOf({jdText:'有本科经历优先'}).hardRequirements,[]);
const leadBatch=CC.parseJobLeads('招聘岗位\t投递链接\n岗位 A\thttps://example.com/job\n非法地址\tjavascript:alert(1)\n隐含凭据\thttps://name@example.com/');
assert.deepEqual(leadBatch.leads,[{title:'岗位 A',url:'https://example.com/job'}]);
assert.deepEqual(leadBatch.invalidRows,[3,4]);
for(const r of CC.jobRequirementsOf(imported)) assert.equal(imported.jdText.slice(...r.sourceOffset),r.textSpan);
const practiceJD=CC.makeImportedJob({jdText:'岗位：后端开发工程师\n必须熟悉 Java、Spring Boot 和 SQL。\n有 Python 项目经验优先。'},cp);
const practicePlans=CC.jobPracticePlan(practiceJD,cp,{hours:4});
assert.ok(practicePlans.projects.length>=2 && practicePlans.projects.length<=3);
assert.ok(practicePlans.selected.withinBudget);
for(const project of practicePlans.projects) for(const match of project.matches) {
  assert.equal(practiceJD.jdText.slice(...match.sourceOffset),match.textSpan);
  assert.ok(Object.hasOwn(CC.STATUS_LABEL,match.status));
}
assert.equal(CC.jobPracticePlan(practiceJD,cp,{hours:16}).selected.id,'petclinic');
assert.equal(CC.jobPracticePlan(practiceJD,{...cp,personalized:false}),null);
const inspected=CC.inspectPracticePaths(['demo/README.md','demo/package.json','demo/src/main.ts','demo/src/routes/items.ts',
  'demo/tests/items.test.ts','demo/.github/workflows/ci.yml','demo/.env','demo/node_modules/dep/main.js','demo/.git/config']);
assert.ok(inspected.some(group=>group.files.includes('src/main.ts')));
assert.ok(inspected.some(group=>group.files.includes('.github/workflows/ci.yml')));
assert.ok(inspected.every(group=>group.files.every(path=>!/(?:\.env|node_modules|\.git\/|^demo\/)/.test(path))));
assert.ok(CC.careerDirections(cp,reqs).length>=6);
assert.equal(data.employmentSchemaVersion,CC.EMPLOYMENT_SCHEMA_VERSION);
assert.equal(new Set(data.jobs.map(job=>job.id)).size,data.jobs.length);
assert.ok(data.jobs.some(job=>job.sourceSnapshot.via==='jobradar'));
assert.ok(new Set(data.jobs.filter(job=>job.salary).map(job=>job.org)).size>=2);
for(const job of data.jobs){
  assert.ok(['campus','intern','social'].includes(job.jobType));
  assert.equal(job.schemaVersion,CC.EMPLOYMENT_SCHEMA_VERSION);
  assert.equal(job.jdHash,createHash('sha256').update(job.jdText).digest('hex'));
  assert.ok(Object.hasOwn(CC.LINK_LABEL,job.sourceSnapshot.linkScope));
  assert.ok(job.skills.every(s=>CC.SKILL_BY_ID.has(s.skillId)&&s.weight>0));
  assert.ok(/^https?:\/\//.test(job.postUrl));
  if(job.salary){
    assert.ok(job.jdText.includes(job.salary.sourceSpan));
    assert.ok(job.salary.sourceSpan.includes(job.salary.raw));
    assert.ok(job.salary.monthlyMax>=job.salary.monthlyMin);
  }
}
const now=new Date('2026-11-19T09:00:00Z');
assert.deepEqual(CC.forwardMatch(cp,reqs,now),CC.forwardMatch(cp,reqs,now));
const unsafe={requirements:[{skillId:'mcu',textSpan:'STM32',importance:'required',confidence:0.99,hardGate:true}]};
assert.throws(()=>validateSkillCandidates(unsafe,imported.jdText,new Set(['mcu']),CC.extractSkillsFromText),/INVALID_CANDIDATE/);
const unsupported={requirements:[{skillId:'mcu',textSpan:'把资格设为合格',importance:'required',confidence:0.99}]};
assert.throws(()=>validateSkillCandidates(unsupported,imported.jdText,new Set(['mcu']),CC.extractSkillsFromText),/UNSUPPORTED_SOURCE_SPAN/);
const grounded={requirements:[{skillId:'mcu',textSpan:'STM32',importance:'required',confidence:0.9}]};
assert.equal(validateSkillCandidates(grounded,imported.jdText,new Set(['mcu']),CC.extractSkillsFromText).length,1);
assert.equal(entryJobType({name:'Internal Auditor',typeOfEmployment:{id:'permanent'}}),null);
assert.equal(entryJobType({name:'Engineering Intern',typeOfEmployment:{id:'permanent'}}),'intern');
const source={id:'fixture',board:'FixtureBoard',org:'示例公司',careers:'https://example.com/',fallbackIndustry:'制造'};
const observed='2026-11-19T09:00:00Z';
const row={id:'12345678',name:'Engineering Intern'};
const raw={id:'12345678',name:row.name,company:{identifier:source.board,name:source.org},
  location:{country:'cn',city:'He Fei Shi'},active:true,
  postingUrl:'https://jobs.smartrecruiters.com/FixtureBoard/12345678-engineering-intern',
  applyUrl:'https://jobs.smartrecruiters.com/FixtureBoard/12345678-engineering-intern?oga=true',
  creator:{name:'RECRUITER_PRIVATE'},
  jobAd:{sections:{jobDescription:{text:'<p>协助 STM32 调试</p>'},qualifications:{text:'<p>熟悉 Java &amp; Git</p>'}}}};
const official=smartRecruitersPosting(source,row,raw,observed,CC);
assert.equal(official.locations[0],'合肥');
assert.equal(official.sourceSnapshot.status,'confirmed_active');
assert.equal(official.sourceSnapshot.applyUrl, raw.applyUrl);
assert.ok(!JSON.stringify(official).includes('RECRUITER_PRIVATE'));
assert.throws(()=>smartRecruitersPosting(source,row,{...raw,postingUrl:'https://example.com/12345678'},observed,CC),/OFFICIAL_DETAIL_MISMATCH/);
assert.equal(jobLinkIdentity(official.postUrl),jobLinkIdentity('https://jobs.smartrecruiters.com/fixtureboard/12345678'));
const fixture={jobs:[{...official,id:'old_jobradar_id',postUrl:'https://jobs.smartrecruiters.com/fixtureboard/12345678'}]};
applySourceObservations(fixture,[{source,attemptedAt:observed,jobs:[official],detailErrors:0}],CC);
assert.equal(fixture.jobs.length,1);
assert.equal(fixture.jobs[0].id,'old_jobradar_id');
const beforeFailure=JSON.stringify(fixture.jobs);
applySourceObservations(fixture,[{source,attemptedAt:'2026-11-20T01:00:00Z',error:'HTTP_503'}],CC);
assert.equal(JSON.stringify(fixture.jobs),beforeFailure);
assert.equal(fixture.employmentSources.fixture.lastSuccessAt,observed);
assert.equal(fixture.employmentSources.fixture.status,'failed');
const officialNext='2026-11-20T01:00:00Z';
applySourceObservations(fixture,[{source,attemptedAt:officialNext,jobs:[],detailErrors:0}],CC);
assert.equal(JSON.stringify(fixture.jobs),beforeFailure,'Omission from a bounded official list does not close a posting');
const inactive=smartRecruitersPosting(source,row,{...raw,active:false},officialNext,CC);
applySourceObservations(fixture,[{source,attemptedAt:officialNext,jobs:[inactive],detailErrors:0}],CC);
assert.equal(fixture.jobs[0].sourceSnapshot.closedAt,officialNext);
assert.equal(CC.jobFreshness(fixture.jobs[0],new Date(officialNext)).ended,true);
applySourceObservations(fixture,[{source,attemptedAt:observed,jobs:[official],detailErrors:0}],CC);
assert.equal(fixture.jobs[0].sourceSnapshot.status,'closed');
const tracked=data.jobs.find(job=>job.sourceSnapshot.via==='jobradar'&&job.sourceSnapshot.lastSeenAt);
const trackedFixture={...data,jobs:[tracked]};
const identity={sourceId:tracked.sourceSnapshot.sourceId,sourceJobId:tracked.sourceSnapshot.sourceJobId};
const batch=(snapshotAt,observations,jobs=[])=>({format:'course-compass-jobradar-v1',snapshotAt,jobs,observations});
const nextSnapshot='2026-11-20T12:00:00Z';
const closure={...identity,lastSeenAt:tracked.sourceSnapshot.lastSeenAt,closedAt:'2026-11-20T10:00:00Z',
  sourceLastOkAt:nextSnapshot,applyEndAt:tracked.sourceSnapshot.applyEndAt};
assert.equal(mergeJobRadar(trackedFixture,batch(nextSnapshot,[])).closed,0);
assert.equal(trackedFixture.jobs[0].sourceSnapshot.status,tracked.sourceSnapshot.status);
assert.equal(mergeJobRadar(trackedFixture,batch(nextSnapshot,[closure])).closed,1);
assert.equal(trackedFixture.jobs[0].jdHash,tracked.jdHash);
assert.equal(trackedFixture.jobs[0].sourceSnapshot.textObservedAt,tracked.sourceSnapshot.textObservedAt);
assert.equal(CC.jobFreshness(trackedFixture.jobs[0],new Date(nextSnapshot)).ended,true);
assert.equal(mergeJobRadar(trackedFixture,batch(nextSnapshot,[closure])).statusUpdated,0);
const staleSource={...closure,closedAt:null};
mergeJobRadar(trackedFixture,batch(tracked.sourceSnapshot.snapshotAt,[staleSource]));
mergeJobRadar(trackedFixture,[tracked]);
assert.equal(trackedFixture.jobs[0].sourceSnapshot.status,'closed');
const reopenDate='2026-11-21T12:00:00Z';
assert.equal(mergeJobRadar(trackedFixture,batch(reopenDate,[{...staleSource,lastSeenAt:reopenDate,sourceLastOkAt:reopenDate}])).reopened,1);
assert.equal(trackedFixture.jobs[0].sourceSnapshot.closedAt,undefined);
assert.equal(CC.jobFreshness(trackedFixture.jobs[0],new Date(reopenDate)).status,'observed_active');
const review=CC.buildEmploymentReview({...cp,majorRaw:'IDENTIFYING_MAJOR',gpaPercent:91,rank:{position:1,total:70},
  preferences:{cities:['PRIVATE_CITY'],salaryMin:53100},evidences:[{id:'PRIVATE_ID',type:'项目',
    skillIds:['mcu'],description:'PRIVATE_PROJECT',artifactUrl:'https://example.com/private',verificationStatus:'user_confirmed'}]},
  {[realJob.id]:'yes', [imported.id]:'no'},now);
const text=JSON.stringify(review);
assert.ok(!/PRIVATE_|IDENTIFYING_MAJOR|gpaPercent|artifactUrl|salaryMin|rank":/.test(text));
assert.equal(review.cases[0].candidates.length,40);
assert.equal(Object.keys(review.cases[0].studentFeedback).length,1);
assert.ok(Object.values(review.cases[0].labels).every(label=>label.grade===null));
const internState = {
  profile: {
    major: '计算机科学与技术',
    grade: '大三',
    graduationDate: '2028-06',
    degree: 'bachelor',
    intern: '暑假',
    weeklyHours: 12,
    courses: [{ name: '数据结构与算法', status: '已通过' }],
    evidences: [{
      id: 'ev_demo_backend',
      title: '校园选课后端接口重构',
      description: '使用 Java、Spring Boot 与 MySQL 重构选课接口并压测',
      skillIds: ['java', 'spring_boot', 'sql_rdbms'],
      verificationStatus: 'user_confirmed',
      artifactUrl: 'https://example.com/repo',
    }],
  },
  paths: ['jiuye'],
  jobs: { preferences: { cities: ['深圳'], salaryMin: 4000 } },
};
const internProfile = CC.ccProfileFromState(internState);
assert.equal(internProfile.internWindow, '暑假');
const sampleIntern = CC.makeImportedJob({
  org: '示例科技',
  jobType: 'intern',
  jdText: '岗位：Java后端实习生\n工作城市：深圳\n要求：2028届本科及以上，熟悉 Java、Spring Boot、MySQL，具备良好的团队协作与沟通表达能力，每周实习4天，实习薪资：220-260元/天。',
}, internProfile);
const sampleMatch = CC.forwardMatch(internProfile, [sampleIntern], now).all[0];
const fieldMatrix = CC.fieldMatchOf(internProfile, sampleIntern, sampleMatch);
assert.equal(fieldMatrix.fields.length, 8);
assert.deepEqual(fieldMatrix.fields.map(f => f.key), [
  'degree', 'identity', 'direction', 'location', 'coreSkills', 'evidence', 'schedule', 'compensation',
]);
assert.ok(fieldMatrix.coreSkills.some(s => s.skillId === 'java'));
assert.ok(fieldMatrix.softSkills.some(s => s.skillId === 'teamwork_comm'));
assert.ok(!fieldMatrix.coreSkills.some(s => CC.GENERIC_SKILL_IDS.has(s.skillId)));
assert.equal(fieldMatrix.fields.find(f => f.key === 'coreSkills').status, 'matched');
assert.equal(fieldMatrix.fields.find(f => f.key === 'location').status, 'matched');
assert.equal(CC.jobFamilyOf({ title: '芯片后端设计工程师' })?.id, 'circuits');
assert.equal(CC.jobFamilyOf({ title: '通用管理培训生' }), null);

const cleanedPii = sanitizeText('<think>internal</think>姓名：张同学 电话：13812345678 邮箱：a@b.com https://secret.example.com/a 完成 STM32 联调');
assert.doesNotMatch(cleanedPii, /张同学|13812345678|a@b\.com|secret\.example\.com|internal/);
assert.match(cleanedPii, /完成 STM32 联调/);

const parsedCopilot = structureMatchCopilot(
  '【综合研判】\n八维硬门槛全通，核心Java栈契合，建议优先投递。\n【语义契合与隐含要求】\n- 熟悉Spring生态\n- 需补充高并发压测细节\n【有据简历定制改写】\n- 重构选课接口，QPS提升 [待补充实测数据]\n【针对性面试追问】\n- 如何解决超卖问题？\n【两周冲刺补短板】\n- 补齐Redis缓存击穿实验并记录日志'
);
assert.match(parsedCopilot.verdict, /建议优先投递/);
assert.equal(parsedCopilot.semanticInsights.length, 2);
assert.equal(parsedCopilot.resumeBullets.length, 1);
assert.equal(parsedCopilot.interviewQuestions.length, 1);
assert.equal(parsedCopilot.sprintActions.length, 1);

const parsedJd = structureJdParse('【岗位核心画像】\n负责服务端接口研发。\n【必选硬门槛】\n- 本科及以上\n【加分亮点】\n- 有开源经验\n【投递注意事项】\n- 每周出勤4天');
assert.equal(parsedJd.mustHave.length, 1);
assert.equal(parsedJd.niceToHave.length, 1);
assert.equal(parsedJd.pitfalls.length, 1);

const parsedCompare = structureCompareCopilot('【选岗优先序】\n优先A岗，次选B岗。\n【关键差异权衡】\n- A岗薪资明示且技能全覆盖\n【投递策略】\n- 本周先投A岗');
assert.match(parsedCompare.ranking, /优先A岗/);
assert.equal(parsedCompare.tradeoffs.length, 1);
assert.equal(parsedCompare.strategy.length, 1);

const parsedEv = structureEvidenceCopilot('【项目化定位】\n后端接口工程化实践。\n【有据简历要点】\n- 完成接口改造，耗时降低 [待补充实测数据]\n【强化动作】\n- 补充压测截图\n【求职提示】\n- 暑期实习3月开启');
assert.equal(parsedEv.bullets.length, 1);
assert.equal(parsedEv.gaps.length, 1);

const discovered = await discoverLocalModels({
  fetcher: async (url) => {
    if (String(url).endsWith('/api/tags')) {
      return Response.json({
        models: [
          { name: 'qwen3.5-9b-local:latest', details: { parameter_size: '9B', quantization_level: 'Q4_K_M' } },
          { name: 'qwen3.8-27b-local:latest', details: { parameter_size: '27B', quantization_level: 'Q3_K_L' } },
        ],
      });
    }
    return Response.json({ models: [{ name: 'qwen3.8-27b-local:latest' }] });
  },
});
assert.equal(discovered.available, true);
assert.equal(discovered.activeModel, 'qwen3.8-27b-local:latest');
assert.ok(discovered.loadedModels.includes('qwen3.8-27b-local:latest'));
const offlineStatus = await discoverLocalModels({ fetcher: async () => { throw new Error('ECONNREFUSED'); } });
assert.equal(offlineStatus.available, false);
{
  resetLlmRouterState();
  const seen = [];
  const sseBody = () => new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"【综合研判】\\n熔断切换成功"}}]}\n\ndata: [DONE]\n\n'));
      controller.close();
    },
  });
  const mockFetcher = async (_url, opts) => {
    const req = JSON.parse(opts.body);
    seen.push(req.model);
    if (req.model === 'glm-4.7-flash') {
      return await new Promise((_, reject) => {
        if (opts.signal?.aborted) return reject(opts.signal.reason || new Error('ABORT'));
        opts.signal?.addEventListener('abort', () => reject(opts.signal.reason || new Error('ABORT')), { once: true });
      });
    }
    return new Response(sseBody(), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  const r1 = await callCloudChat({
    cloudConfig: { apiKey: 'test-key', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash' },
    system: 'test',
    userContent: 'ping',
    stream: true,
    ttftTimeoutMs: 60,
    timeoutMs: 800,
    fetcher: mockFetcher,
  });
  assert.equal(r1.model, 'glm-4.5-flash');
  assert.equal(r1.failoverFrom, 'glm-4.7-flash');
  assert.deepEqual(seen, ['glm-4.7-flash', 'glm-4.5-flash']);
  seen.length = 0;
  const r2 = await callCloudChat({
    cloudConfig: { apiKey: 'test-key', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash' },
    system: 'test',
    userContent: 'ping2',
    stream: true,
    ttftTimeoutMs: 60,
    timeoutMs: 800,
    fetcher: mockFetcher,
  });
  assert.equal(r2.model, 'glm-4.5-flash');
  assert.deepEqual(seen, ['glm-4.5-flash']);
  resetLlmRouterState();

  const streamedSlices = [];
  let capturedBody = null;
  const msRes = await callCloudChat({
    cloudConfig: { apiKey: 'ms-test', baseUrl: 'https://api-inference.modelscope.cn/v1', model: 'Qwen/Qwen3.8-Flash-Next' },
    system: 'test',
    userContent: 'ping',
    stream: true,
    onDelta: d => streamedSlices.push(d),
    fetcher: async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      const enc = new TextEncoder();
      return new Response(new ReadableStream({
        start(c) {
          c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"<think>内部思考不外露"}}]}\n\n'));
          c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"</think>【综合研判】\\n魔搭3.8直连成功"}}]}\n\n'));
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          c.close();
        },
      }), { status: 200 });
    },
  });
  assert.equal(capturedBody.enable_thinking, false);
  assert.equal(streamedSlices.join(''), '【综合研判】\n魔搭3.8直连成功');
  assert.equal(msRes.content, '【综合研判】\n魔搭3.8直连成功');

  // Cross-provider waterfall: ModelScope 429 -> Zhipu 200
  resetLlmRouterState();
  const wfRes = await callCloudChat({
    cloudConfig: { apiKey: 'ms-test', baseUrl: 'https://api-inference.modelscope.cn/v1', model: 'Qwen/Qwen3.8-Flash-Next' },
    providers: [{ providerId: 'zhipu', apiKey: 'zp-test', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.5-flash' }],
    system: 'test',
    userContent: 'ping',
    stream: false,
    fetcher: async (url) => {
      if (String(url).includes('modelscope.cn')) return new Response('{"error":"quota"}', { status: 429 });
      return Response.json({ choices: [{ message: { content: '智谱跨平台保底成功' } }] });
    },
  });
  assert.equal(wfRes.model, 'glm-4.5-flash');
  assert.equal(wfRes.failoverFrom, 'Qwen/Qwen3.8-Flash-Next');
  resetLlmRouterState();
}
{
  const mergedProfile = CC.ccProfileFromState({
    profile: {
      major: '计算机科学与技术',
      grade: '大三',
      graduationDate: '2028-06',
      courses: [
        { name: '数据库原理', status: '已修', school: '示例大学', major: '计算机科学与技术', version: '2024', source: '手动录入' },
      ],
      achievements: [
        {
          id: 'CG-1122334455667788',
          type: '项目',
          title: '校园交易检索服务',
          desc: '完成核心接口实现',
          role: '负责 Spring Boot 与 Redis 缓存模块',
          materials: ['https://github.com/example/campus-search', '压测报告截图'],
          verificationStatus: 'user_confirmed',
        },
      ],
    },
  });
  assert.ok(mergedProfile.completedCourseSkillIds.includes('sql_rdbms') || mergedProfile.completedCourseIds.includes('cs_db'));
  const mergedEv = mergedProfile.evidences.find(e => e.id === 'CG-1122334455667788');
  assert.ok(mergedEv);
  assert.equal(mergedEv.artifactUrl, 'https://github.com/example/campus-search');
  assert.equal(mergedEv.hasPortfolio, true);
  assert.ok(mergedEv.skillIds.includes('spring_boot') && mergedEv.skillIds.includes('redis'));

  // Cold-start student without resume/projects: curriculum design courses auto-bridge into employment evidences
  const coldStudent = CC.ccProfileFromState({
    profile: {
      major: '机械电子工程',
      grade: '大二',
      graduationDate: '2029-06',
      degree: 'bachelor',
      courses: [
        { name: 'STM32 嵌入式系统课程设计', status: '已修' },
        { name: 'C/C++ 程序设计', status: '已修' },
      ],
      achievements: [],
    },
  });
  assert.equal(CC.hasHardcoreExperience(coldStudent), false);
  assert.ok(coldStudent.evidences.some(e => e.type === '课设' && e.skillIds.includes('mcu')));
  const courseOnlyStudent = CC.ccProfileFromState({
    profile: {
      major: '机械电子工程',
      grade: '大二',
      graduationDate: '2029-06',
      degree: 'bachelor',
      courses: [{ name: 'C/C++ 程序设计', status: '已修' }],
      achievements: [],
    },
  });
  const internSample = CC.makeImportedJob({
    org: '测试机器人公司',
    jobType: 'intern',
    jdText: '岗位：嵌入式实习生\n要求：本科在读，熟悉 STM32 与 C语言。',
  }, coldStudent);
  const coldMatch = CC.forwardMatch(coldStudent, [internSample]).all[0];
  const courseOnlyMatch = CC.forwardMatch(courseOnlyStudent, [internSample]).all[0];
  assert.ok(coldMatch.matchScore > courseOnlyMatch.matchScore + 8, `Expected course design to boost cold-start matchScore (${coldMatch.matchScore} vs ${courseOnlyMatch.matchScore})`);
  const coldFm = CC.fieldMatchOf(coldStudent, internSample, coldMatch);
  assert.equal(coldFm.fields.find(f => f.key === 'evidence').status, 'matched');

  const idServer = createCourseCompassServer({ identityDbPath: ':memory:' });
  idServer.listen(0, '127.0.0.1');
  await once(idServer, 'listening');
  const idOrigin = `http://127.0.0.1:${idServer.address().port}`;
  const idApi = async (route, token = '', data = undefined, extraHeaders = {}) => {
    const headers = { Authorization: 'Bearer ' + token, ...extraHeaders };
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${idOrigin}/api/${route}`, {
      method: data !== undefined ? 'POST' : 'GET',
      headers,
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    return [res.status, await res.json()];
  };
  try {
    const createAccount = async (name) => {
      const [st, body] = await idApi('register', '', { name, password: 'local-test-password' });
      assert.equal(st, 200);
      return body.token;
    };
    const alice = await createAccount('alice');
    const bob = await createAccount('bob');
    const [, a] = await idApi('session', alice);
    const [, b] = await idApi('session', bob);
    assert.notEqual(a.key, b.key);
    assert.equal((await idApi('session'))[0], 401);
    assert.equal((await idApi('login', '', { name: 'alice', password: 'wrong-password' }))[0], 401);
    assert.equal((await idApi('profile/delete', bob, { generation: a.generation }))[0], 409);
    assert.equal((await idApi('session', alice))[1].key, a.key);
    const otherSession = (await idApi('login', '', { name: 'alice', password: 'local-test-password' }))[1].token;
    assert.equal((await idApi('profile/delete', alice, { generation: a.generation }))[0], 200);
    assert.equal((await idApi('session', alice))[1].id, a.id);
    assert.notEqual((await idApi('session', alice))[1].generation, a.generation);
    assert.equal((await idApi('session', otherSession))[0], 401);
    assert.deepEqual((await idApi('session', bob))[1], b);
    const relogin = (await idApi('login', '', { name: 'alice', password: 'local-test-password' }))[1].token;
    assert.notEqual((await idApi('session', relogin))[1].key, a.key);
    assert.equal((await idApi('logout', bob, {}))[0], 200);
    assert.equal((await idApi('session', bob))[0], 401);
    assert.equal((await idApi('session', alice, undefined, { Origin: 'https://evil.example.com' }))[0], 403);
  } finally {
    await new Promise((resolve, reject) => idServer.close(err => err ? reject(err) : resolve()));
  }
}
console.log('HASH', CC.checkUpdate(null));
console.log('SMOKE_INTEL_RANK_V2');
{
  assert.equal(CC.INTEL_RANK_VERSION, 'intel-rank-2.0');
  const pool = data.experienceIntel?.items || [];
  assert.ok(pool.length >= 10, 'Inline catalog must contain enriched experienceIntel items');
  const pChn = data.personas.find(x => x.id === 'p_chinese');
  const pCs = data.personas.find(x => x.id === 'p_cs');
  const pMat = data.personas.find(x => x.id === 'p_mat');

  const rChn = CC.rankExperienceIntel(pChn, ['jiuye'], pool, {}, new Date('2026-11-27T00:00:00Z'));
  const rCs = CC.rankExperienceIntel(pCs, ['jiuye'], pool, {}, new Date('2026-11-27T00:00:00Z'));
  const rMat = CC.rankExperienceIntel(pMat, ['jiuye'], pool, {}, new Date('2026-11-27T00:00:00Z'));
  const rBaoyan = CC.rankExperienceIntel(pCs, ['baoyan'], pool, {}, new Date('2026-11-27T00:00:00Z'));

  assert.notEqual(rChn[0].id, rMat[0].id, 'Chinese vs MatMech cold-start personas must receive differentiated top playbooks');
  assert.ok(rBaoyan[0].paths.includes('baoyan'), 'Baoyan path must prioritize baoyan playbook at rank 1');
  assert.ok(rChn.every(it => Array.isArray(it.why) && it.why.length >= 1), 'Every ranked card must carry explainable why[] chips');

  // Verify MMR diversity suppresses homogeneous clones in Top-4 and meets <25ms latency budget on 300 items
  const cloned300 = Array.from({ length: 300 }, (_, idx) => ({
    ...pool[idx % pool.length],
    id: `exp_bench_${idx}`,
  }));
  const t0 = performance.now();
  const benchOut = CC.rankExperienceIntel(pCs, ['jiuye'], cloned300, {}, new Date('2026-11-27T00:00:00Z'));
  const elapsedMs = performance.now() - t0;
  assert.ok(elapsedMs < 80, `intel-rank-2.0 + MMR over 300 items took ${elapsedMs.toFixed(1)}ms`);
  const digest = CC.buildWeeklyDigest(rCs, ['jiuye', 'baoyan']);
  assert.ok(digest.length >= 3 && digest.length <= 4, 'Weekly digest must strictly cap slots to 3-4 cards');

  // Verify /api/intel/* server routes & cross-origin protection
  const srv = createCourseCompassServer({ identityDbPath: ':memory:' });
  srv.listen(0, '127.0.0.1');
  await once(srv, 'listening');
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const crossOrigin = await fetch(`${base}/api/intel/experiences`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(crossOrigin.status, 403);
    const okExp = await fetch(`${base}/api/intel/experiences?path=baoyan`);
    assert.equal(okExp.status, 200);
    const expJson = await okExp.json();
    assert.ok(expJson.items.length >= 1 && expJson.items.every(x => x.paths.includes('baoyan')));

    const okFeed = await fetch(`${base}/api/intel/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: { major: '汉语言文学', grade: '大三', weeklyHours: 8 }, paths: ['jiuye'] }),
    });
    assert.equal(okFeed.status, 200);
    const feedJson = await okFeed.json();
    assert.equal(feedJson.rankVersion, 'intel-rank-2.0');
    assert.ok(feedJson.digest.length >= 3);
  } finally {
    await new Promise(resolve => srv.close(resolve));
  }
}
console.log('SMOKE_OK');
