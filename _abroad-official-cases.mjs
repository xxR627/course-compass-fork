import { createHash } from 'node:crypto';
import { assertAbroadShape } from './_abroad-contract.mjs';
import { scrapeUniversityPage } from './_abroad-program-ingestor.mjs';

const normalize = text => text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const programName = text => normalize(text).replace(/\bprogramme?\s+|\bprogram\s+/g, '');

export async function collectOfficialAbroadCase(reviewed, program, university, { client, fetchImpl, now = new Date(), robotsCache }) {
  const { sourceUrl, evidence, intakeTerm } = reviewed;
  if (typeof evidence !== 'string' || !/^I was admitted to\b/i.test(evidence) ||
      !/^20\d{2}Fall$/.test(intakeTerm) ||
      !programName(evidence).includes(programName(program.titleEn)) ||
      !normalize(evidence).includes('fall ' + intakeTerm.slice(0,4))) {
    throw new Error('Expected a reviewed first-person admission statement with an explicit intake');
  }
  const page = await scrapeUniversityPage(sourceUrl, university, { client, fetchImpl, robotsCache });
  if (!normalize(page.markdown).includes(normalize(evidence))) {
    throw new Error('Reviewed admission statement is missing from the official student story');
  }
  const hash = createHash('sha256').update([sourceUrl,program.id,intakeTerm,evidence].join('\n')).digest('hex');
  const item = {
    id:'case_edu_' + hash.slice(0,24), schemaVersion:'1.0', programId:program.id, intakeTerm,
    outcome:'offer', undergradTier:'unknown', undergradSchoolTag:'unknown', undergradMajor:'unknown',
    majorFamily:'other', gpaPercent:null, gpaRawText:'unknown', rankBucket:'unknown', langText:'unknown',
    greGmatText:null, highlights:[], submittedMonth:null, decisionMonth:null,
    keyTakeaway:'院校官网刊载的学生自述确认了录取与入学届别，申请背景及录取条件未核实。',
    sourceChannel:'edu_public', sourceLabel:'院校官网学生分享', sourceUrl:page.sourceUrl,
    simhash64:hash.slice(0,16), verifiedAt:now.toISOString(),
  };
  assertAbroadShape('AdmissionCase', item);
  return item;
}
