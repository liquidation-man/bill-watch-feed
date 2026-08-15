#!/usr/bin/env node
/**
 * 법제처 국가법령정보 공동활용 — 법령 연혁을 조회해 laws/*.json + index.json 을
 * 채운다. "법령명 하나 = 게시글 하나, 이력은 누적"(오너 지시 2026-08-14,
 * PLAN.md "게시글 구조 명세")을 이 스크립트가 실제로 만든다.
 *
 * watchlist는 두 소스에서 모은다:
 *   1. bills/*.json 중 "본회의의결"까지 간 의안의 법명(국회를 통과한 것)
 *   2. decrees/*.json 중 target=law로 잡힌 것(LAW_ 접두사, poll-decrees.mjs)
 *      — 행정규칙(ADMRUL_, 고시·훈령·예규)은 lsHistory 대상인지 확인 못 해서
 *      뺀다(지어내지 않는다).
 *
 * ⚠️ 호출 예의(PLAN.md "법제처 법령연혁 API — 실제 호출 검증" 절, 오너 지시
 * 2026-08-14): 짧은 시간 과다호출은 비정상 접근으로 간주돼 제한될 수 있다.
 * 그래서 1) 한 회 실행당 법령 수를 MAX_QUERIES_PER_RUN 으로 못박고, 넘치면
 * 자르고 로그로 남긴다(조용한 절단 금지) 2) 법령 사이에 간격을 둔다
 * 3) 아직 한 번도 안 본 법명을 이미 추적 중인 것보다 우선한다.
 *
 * 사용: LAWGO_OC=xxx node scripts/poll-law-history.mjs
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeedItems } from '../lib/build-index.mjs';
import { lawFromHistoryRows, parseLawHistoryHtml, slugify } from '../lib/law-history.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BILLS_DIR = join(root, 'bills');
const DECREES_DIR = join(root, 'decrees');
const LAWS_DIR = join(root, 'laws');
const GWANBO_DIR = join(root, 'gwanbo');
const POLICY_DIR = join(root, 'policy');
const INDEX_PATH = join(root, 'index.json');
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

/** bills(본회의의결 통과분)·decrees(target=law로 잡힌 것)에서 법명을 뽑는다. 순수 함수. */
export function deriveWatchlist(bills, decrees = []) {
  const names = new Set();
  for (const bill of bills) {
    const passed = bill.events?.some((e) => e.stage === '본회의의결');
    if (passed) names.add(bareTitle(bill.title));
  }
  for (const decree of decrees) {
    if (decree.billId?.startsWith('LAW_')) names.add(decree.title);
  }
  return [...names];
}

async function fetchLawHistory(query) {
  const url = new URL(API_BASE);
  url.searchParams.set('OC', OC);
  url.searchParams.set('target', 'lsHistory');
  url.searchParams.set('type', 'HTML'); // JSON/XML은 HTML 래퍼로 응답한다(실측) — HTML만 유효
  url.searchParams.set('query', query);
  url.searchParams.set('display', '100'); // 오래된 법은 이력이 길다 — 20으로는 잘렸다(2026-08-14 실측)

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`법제처 API HTTP ${res.status}`);
  const html = await res.text();
  return parseLawHistoryHtml(html);
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
  const bills = await loadJsonDir(BILLS_DIR);
  const decrees = await loadJsonDir(DECREES_DIR);
  const watchlist = deriveWatchlist([...bills.values()], [...decrees.values()]);

  if (watchlist.length === 0) {
    console.log('poll-law-history: watchlist 비어 있음(본회의의결 통과분·법령 소스 둘 다 없음) — 종료');
    return;
  }

  await mkdir(LAWS_DIR, { recursive: true });
  const tracked = await loadJsonDir(LAWS_DIR);
  const isTracked = (name) => tracked.has(`LAWHIST_${slugify(name)}`);
  const toQuery = [...watchlist.filter((n) => !isTracked(n)), ...watchlist.filter((n) => isTracked(n))].slice(
    0,
    MAX_QUERIES_PER_RUN,
  );
  if (watchlist.length > MAX_QUERIES_PER_RUN) {
    console.log(
      `poll-law-history: watchlist ${watchlist.length}건 중 ${MAX_QUERIES_PER_RUN}건만 이번 회차에 조회(호출 예의, 새 법명 우선) — 나머지는 다음 회차`,
    );
  }

  let written = 0;
  for (const [i, query] of toQuery.entries()) {
    if (i > 0) await sleep(REQUEST_INTERVAL_MS);
    const rows = await fetchLawHistory(query);
    if (rows.length === 0) {
      console.log(`poll-law-history: "${query}" 결과 없음`);
      continue;
    }
    const law = lawFromHistoryRows(query, rows);
    tracked.set(law.billId, law);
    await writeFile(join(LAWS_DIR, `${law.billId}.json`), JSON.stringify(law, null, 2) + '\n');
    written += 1;
  }

  if (written === 0) {
    console.log('poll-law-history: 저장된 게 없어 index.json은 그대로 둔다');
    return;
  }

  const gwanbo = [...(await loadJsonDir(GWANBO_DIR)).values()];
  const policy = [...(await loadJsonDir(POLICY_DIR)).values()];
  const items = buildFeedItems([...bills.values()], [...decrees.values()], [...tracked.values()], gwanbo, policy);
  await writeFile(INDEX_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2) + '\n');
  console.log(`poll-law-history: ${written}/${toQuery.length}건 저장, 법령 ${tracked.size}건 추적 중, 피드 ${items.length}건`);
}

await main();
