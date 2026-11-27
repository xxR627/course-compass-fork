import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schema = JSON.parse(readFileSync(new URL('./study-abroad.schema.json', import.meta.url), 'utf8'));
const ajv = addFormats(new Ajv({ strict: true }));
ajv.addSchema(schema);

export function assertAbroadShape(type, record) {
  const validate = ajv.getSchema(schema.$id + '#/$defs/' + type);
  if (!validate) throw new Error('Unknown abroad contract: ' + type);
  if (!validate(record)) {
    const error = validate.errors[0];
    const field = error.params.missingProperty || error.params.additionalProperty;
    throw new Error(type + error.instancePath + (field ? '/' + field : '') + ' ' + error.message);
  }
}

export function assertOfficialProgram(program, university) {
  const link = new URL(program.officialUrl);
  const domain = university.officialDomain;
  if (link.protocol !== 'https:' || link.username || link.password || link.port ||
      (link.hostname !== domain && !link.hostname.endsWith('.' + domain))) {
    throw new Error('StudyAbroadProgram/officialUrl must belong to the university domain');
  }
}
