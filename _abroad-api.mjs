import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openAbroadDb } from './_abroad-db.mjs';
import { employmentEngine, readEmploymentData } from './_employment-data.mjs';
import { callCloudChat, getEnvCloudConfig, getEnvCloudProviders } from './_employment-llm.mjs';
import { runAbroadCrawl } from './_crawl-abroad.mjs';

const defaultDb = fileURLToPath(new URL('./_research/abroad.db', import.meta.url));
const emptyCatalog = { universities: [], programs: [], cases: [] };
const programPath = '/api/abroad/programs';
const casePath = '/api/abroad/cases';
const evaluatePath = '/api/abroad/evaluate';
const outlinePath = '/api/abroad/llm/sop-outline';
const comparePath = '/api/abroad/llm/compare';
const triggerPath = '/api/abroad/crawl/trigger';

function directLoopback(request) {
  const address = request.socket?.remoteAddress?.replace(/^::ffff:/, '');
  const host = request.headers.host || '';
  return (address === '127.0.0.1' || address === '::1') &&
    /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host) &&
    !Object.keys(request.headers).some(name => name === 'forwarded' || name.startsWith('x-forwarded-'));
}

async function comparePrograms(rows, fetcher, stream) {
  const providers = getEnvCloudProviders();
  const cloudConfig = getEnvCloudConfig();
  const available = rows.filter(row => row.status !== 'FAIL');
  if ((!cloudConfig && !providers.length) || available.length < 2) return { mode:'rule_fallback', rows };
  try {
    const modelRows = available.map(({programId,band,status,nextDeadline,action}) => ({programId,band,status,nextDeadline,action}));
    const result = await callCloudChat({
      cloudConfig, providers, fetcher, stream, maxTokens:250, temperature:0,
      system:'你是留学申请排程助手。输入是已核验项目评估。结合截止日和待办先后，返回一个 JSON 数组，将输入的 programId 各使用一次，按建议办理顺序排列。只输出 JSON 数组，不输出说明，不新增或变更任何事实。',
      userContent:modelRows,
    });
    const order = JSON.parse(result.text.trim());
    const byId = new Map(available.map(row => [row.programId,row]));
    if (!Array.isArray(order) || order.length !== byId.size || new Set(order).size !== byId.size ||
      order.some(id => !byId.has(id))) return { mode:'rule_fallback', rows };
    return { mode:'cloud', rows:[...order.map(id=>byId.get(id)), ...rows.filter(row=>row.status==='FAIL')] };
  } catch {
    return { mode:'rule_fallback', rows };
  }
}

function filterNumber(query, name) {
  const value = query.get(name);
  if (value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError('Invalid ' + name);
  return number;
}

function matches(query, name, value) {
  return !query.get(name) || query.get(name) === value;
}

function profileProjection(value) {
  const profile = value?.profile;
  const prefs = value?.abroadPrefs;
  if (!profile || Array.isArray(profile) || typeof profile !== 'object' ||
      (prefs != null && (Array.isArray(prefs) || typeof prefs !== 'object'))) return null;
  if (profile.courses != null && (!Array.isArray(profile.courses) || profile.courses.some(
    course => !course || typeof course !== 'object' || Array.isArray(course)))) return null;
  return {
    profile: {
      schoolTier: profile.schoolTier, gpa: profile.gpa, major: profile.major,
      courses: (profile.courses || []).map(({ id, name, status }) => ({ id, name, status })),
      completedCourseIds: Array.isArray(profile.completedCourseIds) ? profile.completedCourseIds.filter(id => typeof id === 'string') : [],
      evidences: Array.isArray(profile.evidences) ? profile.evidences.filter(item => item && typeof item.type === 'string')
        .map(({ type, verificationStatus }) => ({ type, verificationStatus })) : [],
    },
    prefs: {
      schoolTier: prefs?.schoolTier, gpa: prefs?.gpa, budgetRmb: prefs?.budgetRmb,
      language: prefs?.language, meetsGreGmat: prefs?.meetsGreGmat,
    },
  };
}

export function createAbroadApiHandler({
  catalogFile, abroadDbPath = defaultDb, llmFetcher,
  abroadManifest = process.env.CC_ABROAD_MANIFEST, abroadCrawlRunner = runAbroadCrawl,
} = {}) {
  let inProgress = false;
  function loadCatalog(data) {
    const fallback = data.studyAbroad || emptyCatalog;
    if (!existsSync(abroadDbPath)) return { catalog: fallback, source: 'snapshot' };
    const db = openAbroadDb(abroadDbPath);
    try {
      const catalog = db.readCatalog();
      return catalog.programs.length ? { catalog, source: 'warehouse' } : { catalog: fallback, source: 'snapshot' };
    } finally {
      db.close();
    }
  }

  return async function handleAbroad(request, pathname, send, readJson, response) {
    if (pathname === triggerPath) {
      if (request.method !== 'POST' || !directLoopback(request)) {
        request.resume();
        const allowedMethod = request.method === 'POST';
        send(allowedMethod ? 403 : 405, { error: allowedMethod ? 'LOOPBACK_ONLY' : 'POST_REQUIRED' });
        return true;
      }
      const body = await readJson({ maxBytes: 512 });
      if (!body.ok) { send(body.status, { error: body.error }); return true; }
      if (!abroadManifest || inProgress) {
        send(inProgress ? 409 : 503, { error: inProgress ? 'CRAWL_IN_PROGRESS' : 'ABROAD_MANIFEST_NOT_CONFIGURED' });
        return true;
      }
      inProgress = true;
      try {
        const result = await abroadCrawlRunner({ manifest: abroadManifest, abroadDbPath });
        send(200, { programs: result.programs.length, cases: result.cases.length });
      } catch (error) {
        console.error('Study abroad crawl:', error.message);
        send(502, { error: 'ABROAD_CRAWL_FAILED' });
      } finally {
        inProgress = false;
      }
      return true;
    }
    if (![programPath, casePath, evaluatePath, outlinePath, comparePath].includes(pathname)) return false;
    const method = [evaluatePath, outlinePath, comparePath].includes(pathname) ? 'POST' : 'GET';
    if (request.method !== method) {
      request.resume();
      send(405, { error: method + '_REQUIRED' });
      return true;
    }
    try {
      const data = readEmploymentData(catalogFile);
      const { catalog, source } = loadCatalog(data);
      if (method === 'POST') {
        const body = await readJson({ maxBytes: 32768 });
        if (!body.ok) { send(body.status, { error: body.error }); return true; }
        const projected = profileProjection(body.value);
        if (!projected) { send(400, { error: 'INVALID_PROFILE' }); return true; }
        const engine = employmentEngine(data);
        if (pathname === comparePath) {
          const ids = body.value.programIds;
          if (!Array.isArray(ids) || ids.length < 2 || ids.length > 4 || new Set(ids).size !== ids.length ||
              ids.some(id => typeof id !== 'string')) { send(400, { error:'INVALID_PROGRAM_IDS' }); return true; }
          const programs = catalog.programs.filter(item => ids.includes(item.id));
          if (programs.length !== ids.length) { send(404, { error:'PROGRAM_NOT_FOUND' }); return true; }
          const ranked = engine.matchAbroadPrograms(projected.profile, projected.prefs, programs, new Date(), catalog.cases);
          const rows = engine.buildAbroadComparison(ranked);
          const stream = request.headers.accept?.includes('text/event-stream');
          if (stream) {
            response.writeHead(200, { 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
            response.write('event: assessment\ndata: ' + JSON.stringify({ source, mode:'rule_fallback', rows }) + '\n\n');
          }
          const result = body.value.useCloud === true ? await comparePrograms(rows, llmFetcher, stream) : { mode:'rule_fallback', rows };
          if (stream) {
            if (!response.destroyed) response.end('event: result\ndata: ' + JSON.stringify({ source, ...result }) + '\n\n');
          } else send(200, { source, ...result });
          return true;
        }
        if (pathname === outlinePath) {
          const program = catalog.programs.find(item => item.id === body.value.programId);
          if (!program) { send(404, { error: 'PROGRAM_NOT_FOUND' }); return true; }
          const evidences = Array.isArray(body.value.profile.evidences) ? body.value.profile.evidences : [];
          projected.profile.evidences = evidences.filter(item => item && typeof item === 'object').map(item => ({
            id:item.id, title:item.title, verificationStatus:item.verificationStatus,
            skillIds:item.skillIds, metrics:item.metrics,
          }));
          send(200, { source, mode:'rule_fallback', ...engine.buildAbroadOutline(projected.profile, program) });
          return true;
        }
        const ranked = engine.matchAbroadPrograms(projected.profile, projected.prefs, catalog.programs, new Date(), catalog.cases);
        const available = ranked.filter(item => item.band !== 'blocked');
        const payload = { source, readinessScore: available[0]?.score ?? null, blockedCount: ranked.length - available.length };
        for (const band of ['reach', 'match', 'safety']) payload[band] = available.filter(item => item.band === band);
        send(200, payload);
        return true;
      }
      const query = new URL(request.url, 'http://localhost').searchParams;
      const limit = filterNumber(query, 'limit') ?? 50;
      const offset = filterNumber(query, 'offset') ?? 0;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new RangeError('Invalid limit');
      if (!Number.isSafeInteger(offset)) throw new RangeError('Invalid offset');
      let items;
      if (pathname === programPath) {
        const schools = new Map(catalog.universities.map(school => [school.id, school]));
        const budget = filterNumber(query, 'maxBudgetRmb');
        const term = (query.get('q') || '').trim().toLowerCase();
        items = catalog.programs.map(program => ({ ...program, university: schools.get(program.universityId) }))
          .filter(program => matches(query, 'region', program.university?.region) && matches(query, 'discipline', program.discipline) &&
            matches(query, 'langPolicy', program.langPolicy) &&
            (budget === null || (program.estTotalRmbPerYear !== null && program.estTotalRmbPerYear <= budget)) &&
            (!term || [program.titleZh, program.titleEn, program.university?.nameZh, program.university?.nameEn].join(' ').toLowerCase().includes(term)));
      } else {
        const min = filterNumber(query, 'gpaMin');
        const max = filterNumber(query, 'gpaMax');
        if (min !== null && max !== null && min > max) throw new RangeError('Invalid GPA range');
        items = catalog.cases.filter(item => ['programId', 'undergradTier', 'majorFamily', 'outcome']
          .every(key => matches(query, key, item[key])) &&
          (min === null || (item.gpaPercent !== null && item.gpaPercent >= min)) &&
          (max === null || (item.gpaPercent !== null && item.gpaPercent <= max)));
      }
      send(200, { source, items: items.slice(offset, offset + limit), total: items.length });
    } catch (error) {
      if (!(error instanceof RangeError)) console.error('Study abroad API:', error.message);
      if (response?.headersSent) {
        if (!response.destroyed) response.end();
        return true;
      }
      send(error instanceof RangeError ? 400 : 500,
        { error: error instanceof RangeError ? 'INVALID_FILTER' : 'ABROAD_DATA_UNAVAILABLE' });
    }
    return true;
  };
}
