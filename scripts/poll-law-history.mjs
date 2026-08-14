#!/usr/bin/env node
/**
 * 법제처 국가법령정보 공동활용 — 법령 연혁을 조회해 laws/*.json 을 채운다.
 *
 * 대상(watchlist)은 bills/*.json 중 "본회의의결"까지 간 의안의 법령명이다 —
 * 아직 국회를 통과한 의안이 없으면(2026-08-14 현재 전부 발의 단계) watchlist가
 * 비고, 그러면 아무것도 안 쓰고 조용히 끝난다. 지어내지 않는다.
 *
 * ⚠️ 호출 예의(PLAN.md "법제처 법령연혁 API — 실제 호출 검증" 절, 오너 지시
 * 2026-08-14): 짧은 시간 과다호출은 비정상 접근으로 간주돼 제한될 수 있다.
 * 그래서 1) 한 회 실행당 법령 수를 MAX_QUERIES_PER_RUN 으로 못박고, 넘치면
 * 자르고 로그로 남긴다(조용한 절단 금지) 2) 법령 사이에 간격을 둔다.
 *
 * 사용: LAWGO_OC=xxx node scripts/poll-law-history.mjs
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLawHistoryHtml, slugify } from '../lib/law-history.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BILLS_DIR = join(root, 'bills');
const LAWS_DIR = join(root, 'laws');
const API_BASE = 'http://www.law.go.kr/DRF/lawSearch.do';
const MAX_QUERIES_PER_RUN = 10; // 호출 예의 — 한 번에 너무 많이 안 부른다
const REQUEST_INTERVAL_MS = 2000; // 법령 사이 간격

const OC = process.env.LAWGO_OC;
if (!OC) {
  console.error('LAWGO_OC 가 없다. .env 를 채우거나 환경변수로 넘겨라.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "OO법 일부개정법률안" 같은 접미사를 떼고 법제처 검색에 쓸 핵심 법명만 남긴다. */
function bareTitle(billTitle) {
  return billTitle.replace(/(일부개정법률안|전부개정법률안|제정법률안|폐지법률안)$/, '');
}

/** bills/*.json 중 본회의의결까지 간 것만 법령명을 뽑는다. 순수 함수. */
export function deriveWatchlist(bills) {
  const names = new Set();
  for (const bill of bills) {
    const passed = bill.events?.some((e) => e.stage === '본회의의결');
    if (passed) names.add(bareTitle(bill.title));
  }
  return [...names];
}

async function fetchLawHistory(query) {
  const url = new URL(API_BASE);
  url.searchParams.set('OC', OC);
  url.searchParams.set('target', 'lsHistory');
  url.searchParams.set('type', 'HTML'); // JSON/XML은 HTML 래퍼로 응답한다(실측) — HTML만 유효
  url.searchParams.set('query', query);
  url.searchParams.set('display', '20');

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`법제처 API HTTP ${res.status}`);
  const html = await res.text();
  return parseLawHistoryHtml(html);
}

async function main() {
  const billFiles = (await readdir(BILLS_DIR).catch(() => [])).filter((f) => f.endsWith('.json'));
  const bills = await Promise.all(billFiles.map((f) => readFile(join(BILLS_DIR, f), 'utf-8').then(JSON.parse)));
  const watchlist = deriveWatchlist(bills);

  if (watchlist.length === 0) {
    console.log('poll-law-history: 본회의의결까지 간 의안이 아직 없다 — watchlist 비어 있음, 종료');
    return;
  }

  const toQuery = watchlist.slice(0, MAX_QUERIES_PER_RUN);
  if (watchlist.length > MAX_QUERIES_PER_RUN) {
    console.log(
      `poll-law-history: watchlist ${watchlist.length}건 중 ${MAX_QUERIES_PER_RUN}건만 이번 회차에 조회(호출 예의) — 나머지는 다음 회차`,
    );
  }

  await mkdir(LAWS_DIR, { recursive: true });
  let written = 0;
  for (const [i, query] of toQuery.entries()) {
    if (i > 0) await sleep(REQUEST_INTERVAL_MS);
    const rows = await fetchLawHistory(query);
    if (rows.length === 0) {
      console.log(`poll-law-history: "${query}" 결과 없음`);
      continue;
    }
    const slug = slugify(rows[0].title);
    await writeFile(join(LAWS_DIR, `${slug}.json`), JSON.stringify({ title: rows[0].title, history: rows }, null, 2) + '\n');
    written += 1;
  }
  console.log(`poll-law-history: ${written}/${toQuery.length}건 저장`);
}

await main();
