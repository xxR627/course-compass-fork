import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { employmentEngine, readEmploymentData } from './_employment-data.mjs';

function dcg(grades) {
  return grades.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
}

function ndcg(grades, ideal, limit) {
  const maximum = dcg(ideal.slice(0, limit));
  return maximum ? dcg(grades.slice(0, limit)) / maximum : null;
}

function assertAbroadRanking(engine) {
  const profile = { schoolTier:'211', major:'cs', gpa:87, courses:[
    {name:'程序设计基础', status:'已修'}, {name:'线性代数', status:'已修'},
  ] };
  const prefs = { budgetRmb:250000, language:{ieltsOverall:7,ieltsSubMin:6.5} };
  const base = {
    livenessStatus:'active', tierGpaRules:{'211':83,blockedTiers:[]}, allowedMajors:['cs'],
    prereqMode:'core_required', prereqCourseTags:['prog_basic'], langPolicy:'required_at_submit',
    ieltsOverall:6.5, ieltsSubMin:6, greGmatPolicy:'not_required', estTotalRmbPerYear:200000, rounds:[],
  };
  const programs = [
    {...base,id:'list_blocked',tierGpaRules:{'211':83,blockedTiers:['211']}},
    {...base,id:'unknown',tierGpaRules:{blockedTiers:[]}},
    {...base,id:'expensive',estTotalRmbPerYear:400000},
    {...base,id:'aligned'},
    {...base,id:'missing_courses',prereqCourseTags:['cs_core','research_methods']},
  ];
  const cases = [
    {id:'offer_far',outcome:'offer',undergradTier:'985',gpaPercent:96,majorFamily:'econ'},
    {id:'offer_near',outcome:'offer',undergradTier:'211',gpaPercent:86,majorFamily:'cs'},
    {id:'offer_partial',outcome:'conditional_offer',undergradTier:'211',gpaPercent:82,majorFamily:'cs'},
    {id:'reject_far',outcome:'reject',undergradTier:'overseas',gpaPercent:93,majorFamily:'other'},
    {id:'reject_near',outcome:'reject',undergradTier:'211',gpaPercent:88,majorFamily:'cs'},
  ].map(item => ({...item,programId:'aligned'}));
  const fixedDate = new Date('2026-11-27T00:00:00Z');
  const ranked = engine.matchAbroadPrograms(profile,prefs,programs,fixedDate,cases);
  assert.equal(ranked.at(-1).program.id,'list_blocked');
  assert.equal(ranked.at(-1).eligibility.status,'FAIL');
  const programLabels = {aligned:3,expensive:2,missing_courses:1,unknown:0,list_blocked:0};
  const programGrades = ranked.map(item=>programLabels[item.program.id]);
  const topCases = engine.similarAbroadCases(profile,cases,{programId:'aligned'});
  const offerLabels = {offer_near:3,offer_partial:2,offer_far:0};
  const cautionLabels = {reject_near:3,reject_far:0};
  const offerGrades = topCases.offers.map(item=>offerLabels[item.id]);
  const cautionGrades = topCases.cautions.map(item=>cautionLabels[item.id]);
  for (const [label, grades, ideal] of [
    ['programs',programGrades,[3,2,1,0,0]], ['offers',offerGrades,[3,2,0]], ['cautions',cautionGrades,[3,0]],
  ]) {
    assert.equal(grades.length,ideal.length,'Missing abroad ranking candidates in ' + label);
    const score = ndcg(grades,ideal,5);
    assert.ok(score >= 0.95,'Study abroad ' + label + ' NDCG@5: ' + score);
  }
}

function mean(values) {
  const known = values.filter(value => value != null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

const rounded = value => value == null ? null : Number(value.toFixed(4));
const roundMetrics = metrics => Object.fromEntries(Object.entries(metrics).map(([name,value]) => [name, rounded(value)]));
const minimumRankingGrades = 30;
const rankingParticipantTarget = 100;
const splitMethod = 'snapshot-and-case-hash-80-20';
const isCompleteRankingCase = item => item.labels.size >= minimumRankingGrades && item.candidateCount === item.labels.size;

function readReviewDocuments(file) {
  const text=readFileSync(file,'utf8');
  return file.toLowerCase().endsWith('.ndjson')?text.split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line)):[JSON.parse(text)];
}
function readCohort(files, engine, catalogHash, {strict=false}={}) {
  const cases = [];
  const seen = new Set();
  const studentFeedback = [];
  let ungradedCases = 0;
  for (const document of files.flatMap(readReviewDocuments)) {
    const now = new Date(document.asOf);
    if (!Array.isArray(document.cases) || !document.cases.length || !Number.isFinite(now.getTime()))
      throw new Error('Each review file must supply asOf and at least one case');
    if (document.catalogHash && document.catalogHash !== catalogHash)
      throw new Error('Review catalog hash differs. Supply the original snapshot with --catalog.');
    if (document.taxonomyVersion && document.taxonomyVersion !== engine.TAXONOMY_VERSION)
      throw new Error('Review taxonomy version differs.');
    if (strict && (document.format!=='course-compass-employment-review-v1'||document.catalogHash!==catalogHash||
      document.taxonomyVersion!==engine.TAXONOMY_VERSION||document.matchVersion!==engine.MATCH_VERSION))
      throw new Error('Cohort requires the original catalog, match and taxonomy versions.');

    for (const review of document.cases) {
      const caseId=typeof review.caseId==='string'?review.caseId.toLowerCase():null;
      const candidates=Array.isArray(review.candidates)?new Set(review.candidates.map(item=>item?.jobId)):null;
      if(strict){
        if(!/^[a-f0-9]{32}$/.test(caseId||'')||seen.has(caseId))
          throw new Error('Missing or duplicate participant ID in cohort.');
        if(!candidates?.size||candidates.size!==review.candidates.length||candidates.size>40||
          [...candidates].some(id=>!engine.JOB_BY_ID.has(id))) throw new Error('Invalid cohort candidates.');
      }
      if(caseId) seen.add(caseId);
      const feedback = Object.fromEntries(Object.entries(review.studentFeedback || {}).filter(([id])=>engine.JOB_BY_ID.has(id)));
      for (const value of Object.values(feedback)) {
        if (typeof value?.explanationUseful === 'boolean') studentFeedback.push(Number(value.explanationUseful));
      }
      const labels = new Map(Object.entries(review.labels || {}).filter(([,label]) => label?.grade != null));
      if (!labels.size) {
        ungradedCases++;
        continue;
      }
      const postings = [];
      for (const [id,label] of labels) {
        const job = engine.REQ_BY_ID.get(id);
        if (job?.kind !== 'job' || !Number.isInteger(label.grade) || label.grade < 0 || label.grade > 3 ||
          (strict&&(!candidates.has(id)||(label.explanationMatches!=null&&typeof label.explanationMatches!=='boolean'))))
          throw new Error('Unknown job or invalid relevance grade: ' + id);
        postings.push(job);
      }
      const profile = review.projection || engine.ccProfileFromState({ profile:review.profile, jobs:{ preferences:review.preferences } });
      cases.push({
        id:caseId,
        candidateCount:candidates?.size??null,
        snapshot:document.catalogHash,
        matchVersion:document.matchVersion,
        taxonomyVersion:document.taxonomyVersion,
        labels,
        feedback,
        baseline:engine.forwardMatch(profile, postings, now).all,
      });
    }
  }
  return { cases, studentFeedback, ungradedCases, uniqueCaseIds:seen.size, caseIds:seen };
}

function cohortCoverage(cohort) {
  return {
    uniqueCaseIds:cohort.uniqueCaseIds,
    participantsWithGrades:cohort.cases.length,
    participantsWithoutGrades:cohort.ungradedCases,
    participantsWithFiveOrMoreGrades:cohort.cases.filter(item=>item.labels.size>=5).length,
    participantsWithThirtyOrMoreGrades:cohort.cases.filter(item=>item.labels.size>=minimumRankingGrades).length,
    participantsWithAllCandidatesGraded:cohort.cases.filter(item=>item.candidateCount===item.labels.size).length,
    completeRankingCases:cohort.cases.filter(isCompleteRankingCase).length,
    participantsWithGradeVariation:cohort.cases.filter(item=>new Set([...item.labels.values()].map(label=>label.grade)).size>=2).length,
    gradedPostings:cohort.cases.reduce((count,item)=>count+item.labels.size,0),
    explanationLabels:cohort.cases.reduce((count,item)=>count+[...item.labels.values()].filter(label=>typeof label.explanationMatches==='boolean').length,0),
  };
}

function splitCohort(cohort,catalogHash) {
  const digest=id=>createHash('sha256').update('cc-employment-cohort-v1:'+catalogHash+':'+id).digest('hex');
  const ranked=cohort.cases.filter(isCompleteRankingCase).map(item=>({item,key:digest(item.id)})).sort((a,b)=>a.key.localeCompare(b.key));
  const cut=ranked.length-Math.ceil(ranked.length*0.2);
  const group=items=>{
    const cases=items.map(({item})=>item);
    const studentFeedback=cases.flatMap(item=>Object.values(item.feedback).flatMap(value=>
      typeof value?.explanationUseful==='boolean'?[Number(value.explanationUseful)]:[]));
    return {cases,studentFeedback,ungradedCases:0,uniqueCaseIds:cases.length};
  };
  return [group(ranked.slice(0,cut)),group(ranked.slice(cut))];
}

function describeSplit(training,validation,method) {
  return {method,training:cohortCoverage(training),validation:cohortCoverage(validation),
    trainingCaseIds:training.cases.map(item=>item.id),validationCaseIds:validation.cases.map(item=>item.id)};
}

function pilotReport(files, engine, catalogHash) {
  const latest=new Map();
  for (const document of files.flatMap(readReviewDocuments)) {
    if(document.format!=='course-compass-employment-review-v1' || document.catalogHash!==catalogHash ||
      document.matchVersion!==engine.MATCH_VERSION || document.taxonomyVersion!==engine.TAXONOMY_VERSION ||
      !Array.isArray(document.cases)) throw new Error('Pilot export does not match the supplied catalog and versions.');
    const exportedAt=Date.parse(document.asOf);
    if(!Number.isFinite(exportedAt)) throw new Error('Invalid pilot export date.');
    for(const item of document.cases){
      if(!item.pilot) continue;
      const id=typeof item.caseId==='string'?item.caseId.toLowerCase():'';
      const pilot=engine.employmentPilotResponse(item.pilot);
      if(!/^[a-f0-9]{32}$/.test(id)||!pilot||Date.parse(pilot.reviewedAt)>exportedAt)
        throw new Error('Pilot response has an invalid case ID, date, or snapshot.');
      if(latest.get(id)?.exportedAt>=exportedAt) continue;
      latest.set(id,{pilot,exportedAt});
    }
  }
  const records=[...latest.values()].map(entry=>entry.pilot);
  return summarizePilot(records);
}

function summarizePilot(records) {
  const responses=records.filter(item=>Object.keys(item.answers).length||Object.keys(item.topJobTrust).length);
  const tally=(values,positive)=>{
    const known=values.filter(Boolean);
    const counts=Object.fromEntries([...new Set(known)].map(value=>[value,known.filter(answer=>answer===value).length]));
    return { responses:known.length,counts,positiveRate:known.length?rounded((counts[positive]||0)/known.length):null };
  };
  const scores=Object.fromEntries([
    ['directionUseful','yes'],['scoreMeaning','profile_alignment'],['explanationEvidence','yes'],['roadmapActionable','yes'],
  ].map(([key,positive])=>[key,tally(responses.map(item=>item.answers[key]),positive)]));
  const ratedJobs=responses.flatMap(item=>Object.values(item.topJobTrust));
  const fullyRated=responses.filter(item=>item.topJobIds.length===5 && Object.keys(item.topJobTrust).length===5).length;
  return { casesStarted:records.length, participantsWithAnswers:responses.length, completeTopFiveRatings:fullyRated,
    completeQuestionnaires:responses.filter(item=>Object.keys(item.answers).length===4&&item.topJobIds.length>0&&
      item.topJobIds.every(id=>Object.hasOwn(item.topJobTrust,id))).length,
    ...scores, topFiveTrust:tally(ratedJobs,'yes') };
}

function measureRanked(ranked, labels, feedback) {
  const grades = ranked.map(result => labels.get(result.req.id).grade);
  const ideal = grades.slice().sort((a,b) => b - a);
  const relevant = grades.filter(grade => grade >= 2).length;
  const top5 = ranked.slice(0,5);
  const rated = ranked.map(result => feedback[result.req.id]?.roleRelevant)
    .filter(value => typeof value === 'boolean').map(Number);
  return {
    ndcg5:ndcg(grades, ideal, 5),
    ndcg10:ndcg(grades, ideal, 10),
    precision5:grades.slice(0,5).filter(grade => grade >= 2).length / top5.length,
    recall10:relevant ? grades.slice(0,10).filter(grade => grade >= 2).length / relevant : null,
    explanationAgreement:mean(top5.map(result => labels.get(result.req.id).explanationMatches)
      .filter(value => typeof value === 'boolean').map(Number)),
    studentRelevanceNdcg5:rated.includes(1) && rated.includes(0) ? ndcg(rated, rated.slice().sort((a,b) => b - a),5) : null,
  };
}

function evaluateCases(cohort, engine, weights = null) {
  const topJobs = new Set();
  const topDirections = new Set();
  const metrics = [];
  let unknown = 0;
  let rankedCount = 0;
  for (const review of cohort.cases) {
    const ranked = weights ? engine.rankWithMatchWeights(review.baseline, weights) : review.baseline;
    metrics.push(measureRanked(ranked, review.labels, review.feedback));
    for (const { req } of ranked.slice(0,5)) {
      topJobs.add(req.id);
      const family = engine.jobFamilyOf(req);
      if (family) topDirections.add(family.directionId);
    }
    unknown += ranked.filter(result => result.eligibility.status === 'UNKNOWN').length;
    rankedCount += ranked.length;
  }
  return {
    labeledCases:metrics.length,
    ungradedCases:cohort.ungradedCases,
    judgmentScope:'expert-graded-postings-only',
    completeRankingCases:cohort.cases.filter(isCompleteRankingCase).length,
    judgedPostings:rankedCount,
    studentRankingFeedbackCases:metrics.filter(row => row.studentRelevanceNdcg5 != null).length,
    metrics:{
      ...Object.fromEntries(Object.keys(metrics[0]).map(key => [key, mean(metrics.map(row => row[key]))])),
      catalogCoverage:topJobs.size / engine.DATA.jobs.length,
      directionCoverage:topDirections.size / engine.CAREER_DIRECTIONS.length,
      unknownGateRate:unknown / rankedCount,
      studentExplanationUseful:mean(cohort.studentFeedback),
    },
    studentFeedbackCount:cohort.studentFeedback.length,
  };
}

function reviewedCohorts(training, validation, engine, catalogHash) {
  const seen = new Set();
  for (const cohort of [training, validation]) {
    const informative = cohort.cases.filter(review => new Set([...review.labels.values()].map(label => label.grade)).size >= 2);
    if (!informative.length) throw new Error('Each cohort needs at least one case with different human relevance grades.');
    for (const id of cohort.caseIds || cohort.cases.map(review=>review.id)) {
      if (!/^[a-f0-9]{32}$/.test(id || ''))
        throw new Error('Calibration requires a case ID from the browser review export.');
      if (seen.has(id)) throw new Error('Duplicate participant across or within calibration cohorts: ' + id);
      seen.add(id);
    }
    for (const review of cohort.cases) {
      if (review.snapshot !== catalogHash || review.matchVersion !== engine.MATCH_VERSION || review.taxonomyVersion !== engine.TAXONOMY_VERSION)
        throw new Error('Calibration cases must match the frozen catalog, scoring and taxonomy versions.');
    }
  }
}

function* candidateWeights(training, baseline) {
  const keys = Object.keys(baseline);
  const values = new Map(keys.map(key => [key, new Set()]));
  for (const review of training.cases) for (const { factors } of review.baseline) {
    for (const key of keys) if (Number.isFinite(factors[key])) values.get(key).add(factors[key]);
  }
  const supported = keys.filter(key => values.get(key).size >= 2);
  for (const add of supported) for (const subtract of supported) {
    if (add === subtract) continue;
    for (const points of [2,4]) {
      const increased = (Math.round(baseline[add] * 100) + points) / 100;
      const decreased = (Math.round(baseline[subtract] * 100) - points) / 100;
      if (decreased > 0) yield { ...baseline, [add]:increased, [subtract]:decreased };
    }
  }
}

function improvesTraining(candidate, best) {
  for (const key of ['ndcg5','precision5','studentRelevanceNdcg5']) {
    const delta = (candidate[key] ?? 0) - (best[key] ?? 0);
    if (Math.abs(delta) > 1e-9) return delta > 0;
  }
  return false;
}

const formatted = report => ({ ...report, metrics:roundMetrics(report.metrics) });

function assessCandidate(selected, baseline, heldOutDelta, training, validation) {
  const completeCases = training.completeRankingCases + validation.completeRankingCases;
  const evaluatedCases = training.labeledCases + validation.labeledCases;
  const reportedMetrics = ['ndcg5','ndcg10','precision5','recall10','studentRelevanceNdcg5'];
  const regressions = reportedMetrics.filter(key=>heldOutDelta[key] != null && heldOutDelta[key] < -1e-9);
  const improvedAtFive = ['ndcg5','precision5'].some(key=>heldOutDelta[key] > 1e-9);
  const reasons = [];
  if (selected === baseline) reasons.push('no_training_improvement');
  if (completeCases < rankingParticipantTarget || evaluatedCases !== completeCases) reasons.push('insufficient_complete_cases');
  if (regressions.length) reasons.push('held_out_regression');
  if (!improvedAtFive) reasons.push('no_held_out_top_five_improvement');
  return {status:reasons.length?'retain_baseline':'candidate_for_review',reasons,regressions,
    completeCases,minimumCompleteCases:rankingParticipantTarget,recommendedWeights:reasons.length?baseline:selected};
}

function calibrate(training, validation, engine, catalogHash) {
  reviewedCohorts(training, validation, engine, catalogHash);
  const trainBaseline = evaluateCases(training, engine);
  let trainCandidate = trainBaseline;
  let selected = engine.MATCH_WEIGHTS;
  let tried = 0;
  for (const weights of candidateWeights(training, engine.MATCH_WEIGHTS)) {
    tried++;
    const candidate = evaluateCases(training, engine, weights);
    if (improvesTraining(candidate.metrics, trainCandidate.metrics)) {
      selected = weights;
      trainCandidate = candidate;
    }
  }
  const validationBaseline = evaluateCases(validation, engine);
  const validationCandidate = selected === engine.MATCH_WEIGHTS ? validationBaseline : evaluateCases(validation, engine, selected);
  const heldOutDelta = Object.fromEntries(Object.keys(validationBaseline.metrics).map(key => {
    const baseline = validationBaseline.metrics[key];
    const candidate = validationCandidate.metrics[key];
    return [key, baseline != null && candidate != null ? candidate - baseline : null];
  }));
  return { baselineWeights:engine.MATCH_WEIGHTS, candidateWeights:selected, candidatesTested:tried,
    selectedOnTraining:selected !== engine.MATCH_WEIGHTS,
    assessment:assessCandidate(selected,engine.MATCH_WEIGHTS,heldOutDelta,trainBaseline,validationBaseline),
    training:{ baseline:formatted(trainBaseline), candidate:formatted(trainCandidate) },
    validation:{ baseline:formatted(validationBaseline), candidate:formatted(validationCandidate), delta:roundMetrics(heldOutDelta) },
  };
}

if (process.argv.includes('--self-test')) {
  assert.equal(ndcg([3,2,0], [3,2,0], 5), 1);
  assert.ok(ndcg([0,2,3], [3,2,0], 5) < 1);
  assert.equal(ndcg([0], [0], 5), null);
  assert.ok(!improvesTraining({ ndcg5:0.8, precision5:1 }, { ndcg5:0.9, precision5:0 }));
  assert.ok(improvesTraining({ ndcg5:0.9, precision5:0.6, studentRelevanceNdcg5:1 },
    { ndcg5:0.9, precision5:0.6, studentRelevanceNdcg5:0.7 }));

  const engine = employmentEngine(readEmploymentData());
  assertAbroadRanking(engine);
  const snapshot = engine.snapshotHash(engine.DATA.jobs);
  const [a,b] = engine.DATA.jobs;
  const pilot=summarizePilot([
    { answers:{scoreMeaning:'profile_alignment',directionUseful:'unsure'},topJobIds:[a.id,b.id],topJobTrust:{[a.id]:'yes',[b.id]:'no'} },
    { answers:{scoreMeaning:'hiring_chance'},topJobIds:[a.id],topJobTrust:{} },
    { answers:{},topJobIds:[a.id],topJobTrust:{} },
  ]);
  assert.equal(pilot.casesStarted,3);
  assert.equal(pilot.participantsWithAnswers,2);
  assert.equal(pilot.scoreMeaning.positiveRate,0.5);
  assert.equal(pilot.directionUseful.counts.unsure,1);
  assert.equal(pilot.roadmapActionable.positiveRate,null);
  assert.equal(pilot.topFiveTrust.positiveRate,0.5);
  const rankingCase=(id,count,candidateCount)=>({id,candidateCount,labels:new Map(
    engine.DATA.jobs.slice(0,count).map(job=>[job.id,{grade:2}]),
  ),feedback:{}});
  const coverageFixture={cases:[rankingCase('a',30,30),rankingCase('b',39,40),rankingCase('c',5,5),rankingCase('d',40,40)],
    uniqueCaseIds:4,ungradedCases:0};
  assert.equal(cohortCoverage(coverageFixture).completeRankingCases,2);
  assert.equal(cohortCoverage(coverageFixture).participantsWithThirtyOrMoreGrades,3);
  assert.deepEqual(splitCohort(coverageFixture,snapshot).flatMap(group=>group.cases.map(item=>item.id)).sort(),['a','d']);
  const fixtureMatch = (req, skills, project, matchScore) => ({
    req, matchScore, factors:{ skills, project }, confidence:0.65,
    eligibility:{ status:'UNKNOWN', failed:[] },
    freshness:{ status:'observed_active', ended:false, score:0.85 },
    coveredSkillIds:[], evidenceRefs:[], tier:'challenge',
  });
  const baseline = [fixtureMatch(a,0.6,0.4,54),fixtureMatch(b,0.56,0.47,53)];
  const cohort = (digit,gradeA,gradeB) => ({
    cases:[{ id:digit.repeat(32), snapshot, matchVersion:engine.MATCH_VERSION, taxonomyVersion:engine.TAXONOMY_VERSION,
      baseline, labels:new Map([[a.id,{grade:gradeA}], [b.id,{grade:gradeB}]]), feedback:{} }],
    ungradedCases:0, studentFeedback:[],
  });
  const training = cohort('a',0,3);
  const validation = cohort('b',3,0);
  const report = calibrate(training,validation,engine,snapshot);
  assert.ok(report.selectedOnTraining);
  assert.ok(report.training.candidate.metrics.ndcg5 > report.training.baseline.metrics.ndcg5);
  assert.ok(report.validation.delta.ndcg5 < 0);
  assert.ok(report.assessment.reasons.includes('held_out_regression'));
  assert.deepEqual(report.assessment.recommendedWeights,engine.MATCH_WEIGHTS);
  const completeGroup=size=>({labeledCases:size,completeRankingCases:size});
  const positiveDelta={ndcg5:0.02,ndcg10:0,precision5:0,recall10:0};
  assert.equal(assessCandidate(report.candidateWeights,engine.MATCH_WEIGHTS,positiveDelta,completeGroup(80),completeGroup(20)).status,
    'candidate_for_review');
  assert.ok(assessCandidate(report.candidateWeights,engine.MATCH_WEIGHTS,positiveDelta,completeGroup(79),completeGroup(20)).reasons
    .includes('insufficient_complete_cases'));
  assert.ok(assessCandidate(report.candidateWeights,engine.MATCH_WEIGHTS,{...positiveDelta,studentRelevanceNdcg5:-0.01},
    completeGroup(80),completeGroup(20)).regressions.includes('studentRelevanceNdcg5'));
  assert.throws(() => calibrate(training,cohort('a',3,0),engine,snapshot),/Duplicate participant/);
  const failed = { ...baseline[1], eligibility:{ status:'FAIL', failed:[{label:'fixture'}] } };
  const rescored = engine.rankWithMatchWeights([failed,baseline[0]],report.candidateWeights);
  assert.equal(rescored[1].eligibility.status,'FAIL');
  assert.equal(rescored[1].tier,'challenge');
  assert.equal(rescored[1].freshness,failed.freshness);

  // Experience Intel Ranking NDCG@5 self-test across diverse student personas
  if (Array.isArray(engine.DATA.experienceIntel?.items) && engine.DATA.experienceIntel.items.length >= 8) {
    const expItems = engine.DATA.experienceIntel.items;
    const evalPersonas = [
      { personaId: 'p_chinese', path: 'jiuye', relevantPred: it => it.directionIds.includes('content') || it.directionIds.includes('product') },
      { personaId: 'p_cs', path: 'jiuye', relevantPred: it => it.directionIds.includes('software') || it.directionIds.includes('data') },
      { personaId: 'p_mat', path: 'jiuye', relevantPred: it => it.directionIds.includes('embedded') || it.directionIds.includes('automation') },
      { personaId: 'p_cs', path: 'baoyan', relevantPred: it => it.paths.includes('baoyan') },
    ];
    const ndcgScores = evalPersonas.map(({ personaId, path, relevantPred }) => {
      const per = engine.DATA.personas.find(x => x.id === personaId);
      const ranked = engine.rankExperienceIntel(per, [path], expItems, {}, new Date('2026-11-27T00:00:00Z'));
      const grades = ranked.map(it => relevantPred(it) ? 3 : (it.paths.includes(path) ? 1 : 0));
      const ideal = [...grades].sort((x, y) => y - x);
      return ndcg(grades, ideal, 5);
    });
    const meanIntelNdcg5 = mean(ndcgScores);
    assert.ok(meanIntelNdcg5 >= 0.85, `Expected experience intel NDCG@5 >= 0.85, got ${meanIntelNdcg5}`);
  }
  console.log('Employment metric checks passed');
} else {
  const args = process.argv.slice(2);
  const catalogAt = args.indexOf('--catalog');
  const catalogFile = catalogAt < 0 ? new URL('./_cc-data.json', import.meta.url) : args[catalogAt+1];
  if (catalogAt >= 0) args.splice(catalogAt,2);
  const isCalibration = args[0] === '--calibrate';
  const isPilot = args[0] === '--pilot';
  const isCohort = args[0] === '--cohort';
  if (isCalibration || isPilot || isCohort) args.shift();
  const split = args.indexOf('--validation');
  const trainFiles = split < 0 ? args : args.slice(0,split);
  const validationFiles = split < 0 ? [] : args.slice(split+1);
  if (!catalogFile || !trainFiles.length || (split >= 0 && (!isCalibration || !validationFiles.length)))
    throw new Error('Usage: _employment-eval.mjs [--catalog snapshot.json] [--pilot | --cohort | --calibrate] review.json [...] [--validation review.json ...]');

  const data = readEmploymentData(catalogFile);
  const engine = employmentEngine(data);
  const catalogHash = engine.snapshotHash(data.jobs);
  let result;
  if (isPilot) {
    result=pilotReport(trainFiles,engine,catalogHash);
  } else if(isCohort || (isCalibration && !validationFiles.length)) {
    const cohort=readCohort(trainFiles,engine,catalogHash,{strict:true});
    const [training,validation]=splitCohort(cohort,catalogHash);
    const coverage=cohortCoverage(cohort);
    const partition=describeSplit(training,validation,splitMethod);
    if (isCalibration) {
      if (!training.cases.length || !validation.cases.length)
        throw new Error('Calibration needs at least two complete ranking cases to split. Inspect coverage with --cohort.');
      result={coverage,partition,...calibrate(training,validation,engine,catalogHash)};
    } else {
      result={coverage,sizeTarget:{target:rankingParticipantTarget,minimumGradesPerCase:minimumRankingGrades,
        observed:coverage.completeRankingCases,met:coverage.completeRankingCases>=rankingParticipantTarget},proposedSplit:partition};
    }
  } else {
    const training = readCohort(trainFiles, engine, catalogHash,{strict:isCalibration});
    if (!training.cases.length) throw new Error('No human relevance grades are present in the supplied review cases.');
    if (isCalibration) {
      const validation = readCohort(validationFiles, engine, catalogHash,{strict:true});
      result = {partition:describeSplit(training,validation,'explicit-files'),...calibrate(training,validation,engine,catalogHash)};
    } else {
      const {labeledCases, metrics, ...summary} = evaluateCases(training,engine);
      result = { cases:labeledCases, ...summary, ...roundMetrics(metrics) };
    }
  }
  console.log(JSON.stringify({ catalogHash, matchVersion:engine.MATCH_VERSION, taxonomyVersion:engine.TAXONOMY_VERSION, ...result }, null, 2));
}
