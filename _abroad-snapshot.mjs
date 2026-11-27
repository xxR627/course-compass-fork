import { assertAbroadShape, assertOfficialProgram } from './_abroad-contract.mjs';

const budget = 320000;
const byteSize = value => Buffer.byteLength(JSON.stringify(value).replaceAll('<', '\\u003c'));

export function assertAbroadSnapshot(snapshot) {
  if (byteSize(snapshot) >= budget) throw new Error('Study abroad snapshot exceeds the 320KB inline budget');
  const indexes = {};
  for (const [key, type] of Object.entries({
    universities: 'University', programs: 'StudyAbroadProgram', cases: 'AdmissionCase',
  })) {
    const index = indexes[key] = new Map();
    for (const value of snapshot[key]) {
      assertAbroadShape(type, value);
      if (index.has(value.id)) throw new Error('Duplicate study abroad record ' + value.id);
      index.set(value.id, value);
    }
  }
  for (const program of snapshot.programs) {
    const university = indexes.universities.get(program.universityId);
    if (!university) throw new Error('Study abroad snapshot is missing university ' + program.universityId);
    assertOfficialProgram(program, university);
  }
  for (const item of snapshot.cases) {
    if (!indexes.programs.has(item.programId)) throw new Error('Study abroad snapshot is missing program ' + item.programId);
  }
}

export function buildAbroadSnapshot(db) {
  const snapshot = { schemaVersion: '1.0', universities: [], programs: [], cases: [] };
  const groups = new Map();
  for (const program of db.listPrograms({ limit: 1000 })) {
    if (program.livenessStatus === 'archived') continue;
    const university = db.getUniversity(program.universityId);
    const key = university.region + '/' + program.discipline;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ program, university });
  }
  const lanes = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([, entries]) => entries.sort((a,b) =>
    Number(b.program.livenessStatus === 'active') - Number(a.program.livenessStatus === 'active')));
  const published = new Set();
  for (let round = 0; lanes.some(entries => entries.length > round); round++) {
    for (const entries of lanes) {
      const entry = entries[round];
      if (!entry) continue;
      const { program, university } = entry;
      const newUniversity = !published.has(university.id);
      const outcomes = ['offer', 'conditional_offer', 'reject', 'waitlist'];
      const samples = outcomes.flatMap(outcome => db.listCases({ programId: program.id, outcome, limit: 2 }));
      if (newUniversity) snapshot.universities.push(university);
      snapshot.programs.push(program);
      snapshot.cases.push(...samples);
      if (byteSize(snapshot) < budget) {
        published.add(university.id);
      } else {
        snapshot.cases.length -= samples.length;
        snapshot.programs.pop();
        if (newUniversity) snapshot.universities.pop();
      }
    }
  }
  assertAbroadSnapshot(snapshot);
  return snapshot;
}
