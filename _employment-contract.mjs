import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schema = JSON.parse(readFileSync(new URL('./employment.schema.json', import.meta.url), 'utf8'));
const schemaKey = 'employment.schema.json';
const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('./study-abroad.schema.json', import.meta.url), 'utf8')));
ajv.addSchema(schema, schemaKey);

export function assertEmploymentShape(definition, value, subject = definition) {
  const validate = ajv.getSchema(schemaKey + '#/$defs/' + definition);
  if (!validate) throw new Error('Unknown employment contract: ' + definition);
  if (!validate(value)) {
    const [error] = validate.errors;
    const property = error.params.missingProperty || '';
    throw new Error(`${subject}${error.instancePath}${property ? '/' + property : ''} ${error.message}`);
  }
}

export function assertEmploymentCatalog(data, knownSkills) {
  const ids = new Set();
  for (const job of data.jobs) {
    const fail = reason => { throw new Error(`JobPosting ${job.id}: ${reason}`); };
    const hash = job.jdText ? createHash('sha256').update(job.jdText).digest('hex') : null;
    if (ids.has(job.id)) fail('duplicate job id');
    ids.add(job.id);
    if (job.jdHash !== hash) fail('jdHash does not match jdText');
    if (job.skills.some(skill => !knownSkills.has(skill.skillId))) fail('unknown skill id');

    const snapshot = job.sourceSnapshot;
    if (['confirmed_active', 'observed_active'].includes(snapshot.status) && !snapshot.lastSeenAt)
      fail('active observation requires lastSeenAt');
    if (snapshot.closedAt && !['closed','archived'].includes(snapshot.status))
      fail('closure date requires a closed or archived posting');
    if (snapshot.applyUrl && snapshot.linkScope !== 'job_detail') fail('direct apply URL requires job_detail');
    if (job.salary) {
      const { min, max, monthlyMin, monthlyMax, raw, sourceSpan } = job.salary;
      if (min > max || monthlyMin > monthlyMax) fail('invalid salary bounds');
      if (!sourceSpan.includes(raw) || !job.jdText.includes(sourceSpan)) fail('salary is missing its JD evidence');
    }
    const annotation = job.modelRequirements;
    if (annotation) {
      if (annotation.jdHash !== hash) fail('model requirements reference an older JD');
      for (const item of annotation.items) {
        if (!knownSkills.has(item.skillId) || job.jdText.slice(...item.sourceOffset) !== item.textSpan)
          fail('model requirement is missing its JD evidence');
      }
    }
  }
}
