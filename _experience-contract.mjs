import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { employmentEngine, readEmploymentData } from './_employment-data.mjs';

const schema = JSON.parse(readFileSync(new URL('./experience-intel.schema.json', import.meta.url), 'utf8'));
const validate = addFormats(new Ajv2020({ strict: true })).compile(schema);
let taxonomy;

export function assertExperienceItem(item, subject = 'ExperienceIntelItem') {
  if (!validate(item)) {
    const [error] = validate.errors;
    const property = error.params.missingProperty || error.params.additionalProperty;
    throw new Error(`${subject}${error.instancePath}${property ? '/' + property : ''} ${error.message}`);
  }

  if (!taxonomy) {
    // The engine extends the catalog with the same skill IDs used in employment matching.
    const engine = employmentEngine(readEmploymentData());
    taxonomy = {
      mappedSkillIds: engine.SKILL_BY_ID,
      directionIds: new Set(engine.CAREER_DIRECTIONS.map(direction => direction.id)),
      familyIds: new Set(engine.CAREER_DIRECTIONS.flatMap(direction => direction.families.map(family => family.id))),
    };
  }
  for (const [property, knownIds] of Object.entries(taxonomy)) {
    const invalidIndex = item[property].findIndex(id => !knownIds.has(id));
    if (invalidIndex !== -1) {
      throw new Error(`${subject}/${property}/${invalidIndex} has unknown ID ${item[property][invalidIndex]}`);
    }
  }
}
