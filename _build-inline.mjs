import { readFileSync } from 'node:fs';
import { readEmploymentData, validateEmploymentData, writeEmploymentFile } from './_employment-data.mjs';
import { assertAbroadSnapshot } from './_abroad-snapshot.mjs';

const page = new URL('./index.html', import.meta.url);
const html = readFileSync(page, 'utf8');
const data = readEmploymentData();
validateEmploymentData(data);
if (data.studyAbroad) assertAbroadSnapshot(data.studyAbroad);
if (data.experienceIntel) {
  const expBytes = Buffer.byteLength(JSON.stringify(data.experienceIntel), 'utf8');
  if (expBytes > 280_000) {
    throw new Error(`Experience intel snapshot (${expBytes} bytes) exceeds 280KB inline budget`);
  }
}
const engine = readFileSync(new URL('./_cc-engine.js', import.meta.url), 'utf8').trimEnd();
const startMarker = '/*__CC_START__*/';
const endMarker = '/*__CC_END__*/';
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker, start + startMarker.length);
if (start < 0 || end < 0) throw new Error('Missing inline employment markers in index.html');
if (/<\/script/i.test(engine)) throw new Error('Employment engine contains an HTML script end tag');

const lineBreak = html.includes('\r\n') ? '\r\n' : '\n';
const inlineData = JSON.stringify(data).replaceAll('<', '\\u003c');
const block = [startMarker, 'window.CC_DATA = ' + inlineData + ';', engine, endMarker]
  .join('\n').replace(/\r?\n/g, lineBreak);
const output = html.slice(0, start) + block + html.slice(end + endMarker.length);
if (process.argv.includes('--check')) {
  if (output !== html) throw new Error('Employment bundle is stale. Run node _build-inline.mjs');
} else if (output !== html) {
  writeEmploymentFile(page, output);
}
console.log('Employment bundle ready:', data.jobs.length, 'job records');
