import { assertAbroadShape, assertOfficialProgram } from './_abroad-contract.mjs';
import { createFirecrawlClient } from './_firecrawl-client.mjs';
import { isRobotsAllowed } from './_firecrawl-local-serve.mjs';

function contentLines(markdown) {
  return markdown.split(/\r?\n/).map(line => line.trim().replace(/^[-*]\s+/, '')).filter(Boolean);
}

export function extractProgramEvidence(markdown) {
  const lines = contentLines(markdown);
  const requirement = lines.find(line =>
    /^(?:A minimum of|Applicants (?:must|should) (?:hold|have|possess)|Applicants seeking admission .+ should have obtained|Minimum entry requirement|Entry requires|(?:You )?have completed a first- or second-cycle|Have completed a first-cycle|(?:Academic|Entry|Admission) requirements?\s*:?.{12,}|(?:Candidates|Students) must hold a (?:bachelor|first)|An? (?:upper second-class|first-class|recognised|recognized) (?:honours |bachelor))/i.test(line));
  const requirementQuote = requirement?.split(/\s+/).slice(0, 24).join(' ');
  if (!requirementQuote) throw new Error('No explicit entry requirement found in the official page');

  const durationLine = lines.find(line => /^(?:#+\s*)?(?:full.time duration|duration:|scope of studies and planned duration:|full.time:\s*\d+\s+(?:years?|months?))/i.test(line));
  const duration = (durationLine || '').match(/\b(\d{1,2})\s+(?:calendar\s+)?(years?|months?)\b/i);
  const feeIndex = lines.findIndex(line => /^(?:#+\s*)?(?:overseas|international) tuition fees(?:\s*\([^)]*\))?\s*:?$/i.test(line));
  const feeLine = feeIndex < 0 ? '' : lines[feeIndex + 1] || '';
  const tuition = feeLine.match(/^([£€$])\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\s+per (?:year|programme|program))?$/i);
  const euroFee = lines.map(line => line.match(/^Tuition fee per year\s*\([^)]*\)\s*:\s*([\d ,]+)\s+EUR$/i)).find(Boolean);
  const hkFee = lines.map(line => line.match(/^Full-time:\s*HK\$([\d,]+)$/i)).find(Boolean);
  const language = lines.find(line => /\bIELTS\b.*\b(?:each|every) (?:component|band|section)\b/i.test(line));
  const scores = (language || '').match(/\bIELTS(?: Academic)?\s*[:：]?\s*(\d(?:\.\d)?)\s+overall[^\d]*(\d(?:\.\d)?)\s+in (?:each|every)\b/i)
    || lines.map(line => line.match(/^IELTS\s*\(Academic Module\):\s*Overall score:\s*(\d(?:\.\d)?)\s+and All sub-score:\s*(\d(?:\.\d)?)/i)).find(Boolean);
  const period = lines.map(line => line.match(/next application period.+?from (\d{1,2}) to (\d{1,2}) ([A-Za-z]+) (20\d{2})/i)).find(Boolean);
  const month = period && ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(period[3].toLowerCase()) + 1;
  const date = day => period[4] + '-' + String(month).padStart(2, '0') + '-' + day.padStart(2, '0');
  const deadlineLines = [...new Set(lines.filter(line => /^Full-time:.*\(Round \d+\)/i.test(line)))];
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const rounds = deadlineLines.length === 1 ? [...deadlineLines[0].matchAll(/(\d{1,2}) ([A-Za-z]{3}) (20\d{2}) \((Round \d+)\)/gi)].flatMap(([,day,mon,year,round]) => {
    const index = monthNames.indexOf(mon.toLowerCase());
    return index < 0 ? [] : [{round,deadline:year + '-' + String(index + 1).padStart(2,'0') + '-' + day.padStart(2,'0')}];
  }) : [];
  return {
    requirementQuote,
    ...(duration ? { durationMonths: Number(duration[1]) * (/year/i.test(duration[2]) ? 12 : 1) } : {}),
    ...(hkFee ? { tuitionCurrency:'HKD', tuitionAmount:Number(hkFee[1].replaceAll(',', '')) } :
      euroFee ? { tuitionCurrency:'EUR', tuitionAmount:Number(euroFee[1].replace(/[ ,]/g, '')) } :
      tuition && tuition[1] !== '$' ? {
      tuitionCurrency: tuition[1] === '£' ? 'GBP' : 'EUR',
      tuitionAmount: Number(tuition[2].replaceAll(',', '')),
    } : {}),
    ...(scores ? { ieltsOverall: Number(scores[1]), ieltsSubMin: Number(scores[2]) } : {}),
    ...(month ? { rounds: [{ round:'官网申请期', openDate:date(period[1]), deadline:date(period[2]) }] } : {}),
    ...(rounds.length ? { rounds } : {}),
  };
}

async function fetchRobotsTextOnce(originUrl, university, fetchImpl) {
  let current = new URL('/robots.txt', originUrl);
  for (let hop = 0; hop <= 3; hop++) {
    assertOfficialProgram({ officialUrl: current.href }, university);
    let lastError;
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetchImpl(current, {
          redirect: 'manual',
          signal: AbortSignal.timeout(12000),
          headers: { 'user-agent': 'CourseCompassBot/1.0 (+https://course-compass.local; robots-compliant)', accept: 'text/plain,*/*' },
        });
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!response) throw lastError || new Error('Official site robots.txt request timed out');
    if (response.status && [301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.('location');
      if (!location) throw new Error('Official site robots.txt redirect missing Location');
      current = new URL(location, current);
      continue;
    }
    if (response.status === 404 || response.status === 410) return '';
    if (!response.ok) throw new Error('Official site robots.txt is unavailable (HTTP ' + response.status + ')');
    return await response.text();
  }
  throw new Error('Official site robots.txt exceeded redirect limit');
}

async function checkRobots(url, university, fetchImpl, robotsCache) {
  const origin = url.origin;
  let textPromise = robotsCache?.get(origin);
  if (!textPromise) {
    textPromise = fetchRobotsTextOnce(url, university, fetchImpl);
    if (robotsCache) {
      robotsCache.set(origin, textPromise);
      textPromise.catch(() => {
        if (robotsCache.get(origin) === textPromise) robotsCache.delete(origin);
      });
    }
  }
  const robotsTxt = await textPromise;
  if (robotsTxt && !isRobotsAllowed(robotsTxt, url.pathname + url.search, ['firecrawl', 'firecrawllocal', 'coursecompass'])) {
    throw new Error('Official project URL is blocked by robots.txt');
  }
}

export async function scrapeUniversityPage(officialUrl, university, { client, fetchImpl = fetch, robotsCache } = {}) {
  assertOfficialProgram({ officialUrl }, university);
  const requestedUrl = new URL(officialUrl);
  await checkRobots(requestedUrl, university, fetchImpl, robotsCache);
  const { markdown, metadata } = await client.scrapePage({ url: requestedUrl.href, maxAge: 0 });
  const finalUrl = new URL(metadata?.url || metadata?.sourceURL || requestedUrl.href);
  assertOfficialProgram({ officialUrl: finalUrl.href }, university);
  if (finalUrl.href !== requestedUrl.href) await checkRobots(finalUrl, university, fetchImpl, robotsCache);
  return { markdown, sourceUrl: finalUrl.href };
}

export async function refreshOfficialProgram(university, reviewedProgram, {
  client = createFirecrawlClient({ embeddedFallback: true }), fetchImpl = fetch, now = new Date(), robotsCache,
} = {}) {
  assertAbroadShape('University', university);
  assertAbroadShape('StudyAbroadProgram', reviewedProgram);
  if (reviewedProgram.universityId !== university.id) throw new Error('Program university ID mismatch');
  const { markdown, sourceUrl } = await scrapeUniversityPage(reviewedProgram.officialUrl, university, { client, fetchImpl, robotsCache });
  const evidence = extractProgramEvidence(markdown);
  if (evidence.tuitionAmount !== undefined &&
      (reviewedProgram.tuitionAmount !== evidence.tuitionAmount || reviewedProgram.tuitionCurrency !== evidence.tuitionCurrency)) {
    throw new Error('Official tuition changed. Review the annual RMB estimate before publishing.');
  }
  const refreshed = { ...reviewedProgram, ...evidence, officialUrl: sourceUrl, verifiedAt: now.toISOString() };
  if (refreshed.livenessStatus !== 'archived' && refreshed.rounds.length) {
    const today = now.toISOString().slice(0, 10);
    refreshed.livenessStatus = refreshed.rounds.some(round => round.deadline >= today) ? 'active' : 'closed_season';
  }
  assertAbroadShape('StudyAbroadProgram', refreshed);
  return refreshed;
}
