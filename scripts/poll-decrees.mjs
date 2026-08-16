#!/usr/bin/env node
/**
 * 법제처 국가법령정보 공동활용 — 최근 공포된 법령(target=law)·발령된 행정규칙
 * (target=admrul)을 조회해 decrees/*.json + index.json을 채운다. 국회 의안
 * (poll.mjs)과는 다른 소스라 별도 스크립트다 — "법이 되기 전"이 아니라
 * "법이 된 후"(대통령령·부령·훈령·예규·고시)를 다룬다.
 *
 * sort=ddes(공포일자/발령일자 내림차순)로 최신 N건만 본다 — 국가법령정보
 * 전체(법령만 5,607건, 행정규칙은 24,138건, 2026-08-14 실측)를 한 번에
 * 백필하지 않는다. poll.mjs가 "최신 N건"만 보는 것과 같은 원칙.
 *
 * 사용: LAWGO_OC=xxx node scripts/poll-decrees.mjs
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeedItems } from '../lib/build-index.mjs';
import {
  eventFromAdmrulRow,
  eventFromLawRow,
  eventToDecreeFile,
  parseAdmrulSearchXml,
  parseLawSearchXml,
} from '../lib/decree.mjs';
import { parseLawBodyXml } from '../lib/law-body.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BILLS_DIR = join(root, 'bills');
const DECREES_DIR = join(root, 'decrees');
const LAWS_DIR = join(root, 'laws');
const GWANBO_DIR = join(root, 'gwanbo');
const POLICY_DIR = join(root, 'policy');
const INDEX_PATH = join(root, 'index.json');
const SEARCH_API_BASE = 'http://www.law.go.kr/DRF/lawSearch.do';
const BODY_API_BASE = 'http://www.law.go.kr/DRF/lawService.do';
const RECENT_DISPLAY = 30; // 회차당 조회 건수 — 호출 예의(poll-law-history.mjs와 동일 원칙)
const TARGETED_ADMRUL_QUERIES = [
  // 최신순 30건만 보면 오래된 현행 고시가 빠진다. 오너가 예로 든 구내통신선로설비처럼
  // 생활 분류에 중요한 행정규칙은 작은 키워드 묶음으로 따로 백필한다.
  '구내통신설비',
  '선로설비',
  '통신공동구',
  '정보통신',
  '방송통신',
  '건축기준',
  '녹색건축',
  '다중생활시설',
];
const TARGETED_DISPLAY = 10;
const MAX_ORG_BODY_FETCHES = 5; // "직제" 본문은 커서(194KB급) — 회차당 상한

/**
 * "OO부와 그 소속기관 직제" — 오너 지시(2026-08-14 "조직도 같은 것도 없네")
 * 에 대한 답. 별도 조직도 API는 없지만, 각 부처 "직제" 대통령령의 조문이
 * 그 부처 조직(국·과·소속기관)의 법적 원본이다(2026-08-14 실물 확인,
 * lib/law-body.mjs). 새로 잡힌 "직제"류 법령만 본문(조문)까지 받아둔다.
 */
function isOrgDecree(title) {
  return /직제$/.test(title);
}

const OC = process.env.LAWGO_OC;
if (!OC) {
  console.error('LAWGO_OC 가 없다. .env 를 채우거나 환경변수로 넘겨라.');
  process.exit(1);
}

async function callApi(target, { query, display = RECENT_DISPLAY } = {}) {
  const url = new URL(SEARCH_API_BASE);
  url.searchParams.set('OC', OC);
  url.searchParams.set('target', target);
  url.searchParams.set('type', 'XML'); // law·admrul은 XML이 유효하다(lsHistory와 다름, 2026-08-14 실측)
  url.searchParams.set('sort', 'ddes'); // 공포일자/발령일자 내림차순 — 최신순
  url.searchParams.set('display', String(display));
  if (query) url.searchParams.set('query', query);

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`법제처 API HTTP ${res.status}`);
  return res.text();
}

/** 법령 하나의 전체 조문(본문)을 받는다. mst는 법령일련번호. */
async function fetchLawBody(mst) {
  const url = new URL(BODY_API_BASE);
  url.searchParams.set('OC', OC);
  url.searchParams.set('target', 'law');
  url.searchParams.set('MST', mst);
  url.searchParams.set('type', 'XML');

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`법제처 API HTTP ${res.status}`);
  return parseLawBodyXml(await res.text());
}

async function loadJsonDir(dir) {
  const files = await readdir(dir).catch(() => []);
  const items = new Map();
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    const item = JSON.parse(await readFile(join(dir, f), 'utf8'));
    items.set(item.billId, item);
  }
  return items;
}

async function main() {
  await mkdir(DECREES_DIR, { recursive: true });
  const tracked = await loadJsonDir(DECREES_DIR);
  let changed = false;

  const [lawXml, admrulXml, ...targetedAdmrulXmls] = await Promise.all([
    callApi('law'),
    callApi('admrul'),
    ...TARGETED_ADMRUL_QUERIES.map((query) => callApi('admrul', { query, display: TARGETED_DISPLAY })),
  ]);
  const lawEvents = parseLawSearchXml(lawXml).map(eventFromLawRow);
  const admrulRows = [admrulXml, ...targetedAdmrulXmls].flatMap(parseAdmrulSearchXml);
  const admrulEvents = [...new Map(admrulRows.map((row) => [row['행정규칙일련번호'], row])).values()].map(eventFromAdmrulRow);

  let orgBodyFetches = 0;
  for (const event of [...lawEvents, ...admrulEvents]) {
    if (tracked.has(event.id)) continue; // 법령일련번호/행정규칙일련번호는 개정마다 새로 매겨진다 — 이미 있으면 그대로 둔다

    let articles;
    if (isOrgDecree(event.title) && event.id.startsWith('LAW_') && orgBodyFetches < MAX_ORG_BODY_FETCHES) {
      orgBodyFetches += 1;
      const mst = event.id.slice('LAW_'.length);
      try {
        articles = (await fetchLawBody(mst)).articles;
      } catch (err) {
        console.log(`poll-decrees: "${event.title}" 본문 조회 실패(${err.message}) — 조문 없이 저장`);
      }
    }

    tracked.set(event.id, eventToDecreeFile(event, articles));
    changed = true;
  }

  if (!changed) {
    console.log('poll-decrees: 새 항목 없음');
    return;
  }

  for (const decree of tracked.values()) {
    await writeFile(join(DECREES_DIR, `${decree.billId}.json`), JSON.stringify(decree, null, 2) + '\n');
  }

  const bills = [...(await loadJsonDir(BILLS_DIR)).values()];
  const laws = [...(await loadJsonDir(LAWS_DIR)).values()];
  const gwanbo = [...(await loadJsonDir(GWANBO_DIR)).values()];
  const policy = [...(await loadJsonDir(POLICY_DIR)).values()];
  const items = buildFeedItems(bills, [...tracked.values()], laws, gwanbo, policy);
  await writeFile(INDEX_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2) + '\n');
  console.log(`poll-decrees: 법령·행정규칙 ${tracked.size}건 추적 중, 피드 ${items.length}건`);
}

await main();
