import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { assertAbroadShape, assertOfficialProgram } from './_abroad-contract.mjs';

const defaultFile = fileURLToPath(new URL('./_research/abroad.db', import.meta.url));
const ddl = readFileSync(new URL('./_abroad-schema.sql', import.meta.url), 'utf8');
const columnsOf = (db, table) => db.prepare('PRAGMA table_info(' + table + ')').all().map(row => row.name);
const jsonColumn = column => column.endsWith('_json');
const fieldOf = column => column.toLowerCase().replace(/_json$/, '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function decode(row) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).map(([column, value]) =>
    [fieldOf(column), jsonColumn(column) ? JSON.parse(value) : value]));
}

function writer(db, table) {
  const columns = columnsOf(db, table);
  const values = columns.map(() => '?');
  const updates = columns.slice(1).map(column => column + '=excluded.' + column);
  const statement = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.join(',')})
    ON CONFLICT(id) DO UPDATE SET ${updates.join(',')}`);
  return record => statement.run(...columns.map(column =>
    jsonColumn(column) ? JSON.stringify(record[fieldOf(column)]) : record[fieldOf(column)]));
}

function hamming(left, right) {
  let bits = BigInt('0x' + left) ^ BigInt('0x' + right);
  let distance = 0;
  while (bits) {
    bits &= bits - 1n;
    distance++;
  }
  return distance;
}

export function openAbroadDb(file = defaultFile) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA foreign_keys=OFF; PRAGMA busy_timeout=5000');
    transaction(db, () => {
      const version = db.prepare('PRAGMA user_version').get().user_version;
      if (version > 2) throw new Error('Unsupported abroad database version ' + version);
      if (version === 0) db.exec(ddl + '\nPRAGMA user_version=2;');
      if (version === 1) {
        const table = ddl.match(/CREATE TABLE IF NOT EXISTS abroad_programs \([\s\S]*?\) STRICT;/)[0];
        db.exec(table.replace('abroad_programs', 'abroad_programs_v2') + `
          INSERT INTO abroad_programs_v2 SELECT * FROM abroad_programs;
          DROP TABLE abroad_programs;
          ALTER TABLE abroad_programs_v2 RENAME TO abroad_programs;
          CREATE INDEX idx_abroad_prog_disc ON abroad_programs(discipline, est_total_rmb_per_year);
          PRAGMA user_version=2;`);
        if (db.prepare('PRAGMA foreign_key_check').get()) throw new Error('Study abroad migration violated foreign keys');
      }
    });
    db.exec('PRAGMA foreign_keys=ON');
    const saveUniversity = writer(db, 'abroad_universities');
    const saveProgram = writer(db, 'abroad_programs');
    const saveCase = writer(db, 'abroad_cases');
    const university = db.prepare('SELECT * FROM abroad_universities WHERE id=?');
    const program = db.prepare('SELECT * FROM abroad_programs WHERE id=?');
    const caseScope = db.prepare('SELECT * FROM abroad_cases WHERE program_id=? AND outcome=? AND intake_term=? ORDER BY id');
    return {
      upsert({ universities = [], programs = [], cases = [] }) {
        return transaction(db, () => {
          for (const record of universities) {
            assertAbroadShape('University', record);
            saveUniversity(record);
          }
          for (const record of programs) {
            assertAbroadShape('StudyAbroadProgram', record);
            const school = decode(university.get(record.universityId));
            if (!school) throw new Error('Unknown university ' + record.universityId);
            assertOfficialProgram(record, school);
            saveProgram(record);
          }
          for (const record of cases) {
            assertAbroadShape('AdmissionCase', record);
            const duplicate = caseScope.all(record.programId, record.outcome, record.intakeTerm)
              .find(row => row.id !== record.id && row.simhash64 === record.simhash64);
            if (!duplicate) saveCase(record);
          }
        });
      },
      getProgram(id) { return decode(program.get(id)); },
      getUniversity(id) { return decode(university.get(id)); },
      readCatalog() {
        db.exec('BEGIN');
        try {
          const result = {
            universities: db.prepare('SELECT * FROM abroad_universities ORDER BY id').all().map(decode),
            programs: db.prepare('SELECT * FROM abroad_programs ORDER BY id').all().map(decode),
            cases: db.prepare('SELECT * FROM abroad_cases ORDER BY id').all().map(decode),
          };
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
      findSimilarCases({ programId, outcome, intakeTerm, simhash64, maxDistance = 3 }) {
        if (!/^[a-f0-9]{16}$/.test(simhash64) || !Number.isInteger(maxDistance) || maxDistance < 0 || maxDistance > 64) {
          throw new TypeError('Invalid SimHash query');
        }
        return caseScope.all(programId, outcome, intakeTerm)
          .filter(row => hamming(row.simhash64, simhash64) <= maxDistance).map(decode);
      },
      listPrograms({ region = null, discipline = null, limit = 50 } = {}) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('Invalid result limit');
        return db.prepare(`SELECT p.* FROM abroad_programs p JOIN abroad_universities u ON u.id=p.university_id
          WHERE (? IS NULL OR u.region=?) AND (? IS NULL OR p.discipline=?)
          ORDER BY p.est_total_rmb_per_year, p.id LIMIT ?`).all(region, region, discipline, discipline, limit).map(decode);
      },
      listCases({ programId, outcome = null, limit = 50 }) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('Invalid result limit');
        return db.prepare(`SELECT * FROM abroad_cases WHERE program_id=? AND (? IS NULL OR outcome=?)
          ORDER BY verified_at DESC, id LIMIT ?`).all(programId, outcome, outcome, limit).map(decode);
      },
      recordCrawlRun({ runId, startedAt, finishedAt = null, status, programsVerified = 0, casesUpserted = 0, scamsRejected = 0, summary = null }) {
        db.prepare(`INSERT INTO abroad_crawl_runs (run_id, started_at, finished_at, status, programs_verified, cases_upserted, scams_rejected, summary_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET finished_at=excluded.finished_at, status=excluded.status,
            programs_verified=excluded.programs_verified, cases_upserted=excluded.cases_upserted,
            scams_rejected=excluded.scams_rejected, summary_json=excluded.summary_json`)
          .run(runId, startedAt, finishedAt, status, programsVerified, casesUpserted, scamsRejected, summary ? JSON.stringify(summary) : null);
      },
      listCrawlRuns(limit = 10) {
        return db.prepare('SELECT * FROM abroad_crawl_runs ORDER BY started_at DESC LIMIT ?').all(limit).map(decode);
      },
      close() { db.close(); },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
