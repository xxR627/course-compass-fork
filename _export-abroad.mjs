import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openAbroadDb } from './_abroad-db.mjs';
import { buildAbroadSnapshot } from './_abroad-snapshot.mjs';
import { updateEmploymentData } from './_employment-data.mjs';

const file = fileURLToPath(new URL('./_research/abroad.db', import.meta.url));
if (!existsSync(file)) throw new Error('Missing _research/abroad.db');
const db = openAbroadDb(file);
try {
  const snapshot = buildAbroadSnapshot(db);
  if (!snapshot.programs.length) throw new Error('No study abroad programs to publish');
  updateEmploymentData(data => {
    if (JSON.stringify(data.studyAbroad) === JSON.stringify(snapshot)) return null;
    data.studyAbroad = snapshot;
    return snapshot.programs.length;
  }, undefined, data => JSON.stringify(data, null, 2) + '\n');
  console.log('Study abroad snapshot ready:', snapshot.programs.length, 'programs and', snapshot.cases.length, 'cases');
} finally {
  db.close();
}
