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
import { administrationFromDate } from '../lib/administration.mjs';
import { eventFromAdmrulRow, eventFromLawRow, parseAdmrulSearchXml, parseLawSearchXml } from '../lib/decree.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BILLS_DIR = join(root, 'bills');
const DECREES_DIR = join(root, 'decrees');
const LAWS_DIR = join(root, 'laws');
const INDEX_PATH = join(root, 'index.json');
const API_BASE = 'http://www.law.go.kr/DRF/lawSearch.do';
const RECENT_DISPLAY = 30; // 회차당 조회 건수 — 호출 예의(poll-law-history.mjs와 동일 원칙)

const OC = process.env.LAWGO_OC;
if (!OC) {
  console.error('LAWGO_OC 가 없다. .env 를 채우거나 환경변수로 넘겨라.');
  process.exit(1);
}

async function callApi(target) {
  const url = new URL(API_BASE);
  url.searchParams.set('OC', OC);
  url.searchParams.set('target', target);
  url.searchParams.set('type', 'XML'); // law·admrul은 XML이 유효하다(lsHistory와 다름, 2026-08-14 실측)
  url.searchParams.set('sort', 'ddes'); // 공포일자/발령일자 내림차순 — 최신순
  url.searchParams.set('display', String(RECENT_DISPLAY));

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`법제처 API HTTP ${res.status}`);
  return res.text();
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

/** decree.mjs의 이벤트 하나를 decrees/<id>.json 파일 형태로 바꾼다.
 *  bills/*.json과 같은 최상위 모양(billId·title·events·tags)을 맞춰서
 *  bill-watch 쪽 fetchBill이 같은 방식으로 읽을 수 있게 한다. */
function eventToDecreeFile(event) {
  return {
    billId: event.id,
    title: event.title,
    org: event.org,
    kind: event.kind,
    events: [
      {
        stage: event.stage,
        category: event.category,
        administration: administrationFromDate(event.date),
        date: event.date,
        detail: '',
        sourceUrl: event.sourceUrl,
      },
    ],
    tags: event.tags,
  };
}

async function main() {
  await mkdir(DECREES_DIR, { recursive: true });
  const tracked = await loadJsonDir(DECREES_DIR);
  let changed = false;

  const [lawXml, admrulXml] = await Promise.all([callApi('law'), callApi('admrul')]);
  const lawEvents = parseLawSearchXml(lawXml).map(eventFromLawRow);
  const admrulEvents = parseAdmrulSearchXml(admrulXml).map(eventFromAdmrulRow);

  for (const event of [...lawEvents, ...admrulEvents]) {
    if (tracked.has(event.id)) continue; // 법령일련번호/행정규칙일련번호는 개정마다 새로 매겨진다 — 이미 있으면 그대로 둔다
    tracked.set(event.id, eventToDecreeFile(event));
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
  const items = buildFeedItems(bills, [...tracked.values()], laws);
  await writeFile(INDEX_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2) + '\n');
  console.log(`poll-decrees: 법령·행정규칙 ${tracked.size}건 추적 중, 피드 ${items.length}건`);
}

await main();
