#!/usr/bin/env node
/**
 * 의안 백필 — poll.mjs의 "최신 50건"이 못 잡는 과거 의안을 뒤로 채운다.
 * 오너 지시(2026-08-15): "윤석열 정부 취임일부터 현재까지"
 * (2022-05-10~, administration.mjs 기준) 의안을 다 채워달라 — 실존하는
 * 주가누르기방지법·레버리지상품 거래규제 개정안이 왜 안 보이는지 조사하다
 * 나온 요청이다.
 *
 * 윤석열 취임(2022-05-10)은 21대 국회 임기(2020-05-30~2024-05-29) 중이라
 * AGE=21·22 둘 다 조회한다. 22대(2024-05-30~)는 임기 자체가 컷오프 이후라
 * 전체를 담고, 21대는 컷오프 이후분만 남긴다(lib/backfill.mjs 참고).
 *
 * 규모가 크다(22대만 17,200건+) — 한 번에 다 안 부른다. backfill-state.json에
 * "AGE별로 어디까지 봤는지"(다음 pIndex)를 저장해 poll.yml 6시간 주기마다
 * 이어서 진행한다(법령연혁 폴러의 MAX_QUERIES_PER_RUN과 같은 절제 원칙).
 *
 * 목록 API 응답 한 행에 이미 발의~본회의의결까지 전 단계 날짜가 다 들어있다
 * (끝난 의안은) — poll.mjs의 "재조회" 단계가 필요 없다. 목록을 훑어서
 * toBill()로 바로 저장한다. 이미 poll.mjs·이전 회차가 잡아둔 의안은
 * billId로 걸러 건너뛴다(중복 저장 안 함, 진행 단계 갱신은 poll.mjs 몫).
 *
 * 사용: ASSEMBLY_API_KEY=xxx node scripts/backfill-bills.mjs
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceBackfillState, splitPageByCutoff } from '../lib/backfill.mjs';
import { buildFeedItems } from '../lib/build-index.mjs';
import { toBill } from '../lib/stages.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BILLS_DIR = join(root, 'bills');
const DECREES_DIR = join(root, 'decrees');
const LAWS_DIR = join(root, 'laws');
const GWANBO_DIR = join(root, 'gwanbo');
const POLICY_DIR = join(root, 'policy');
const INDEX_PATH = join(root, 'index.json');
const STATE_PATH = join(root, 'backfill-state.json');
const API_BASE = 'https://open.assembly.go.kr/portal/openapi/nzmimeepazxkubdpn';
const PAGE_SIZE = 100;
const PAGES_PER_RUN = 20; // 한 회차 최대 2,000건 조회 — 호출 예의
const CUTOFF_DATE = '2022-05-10'; // 윤석열정부 취임일(lib/administration.mjs와 같은 값)
const AGES = [22, 21]; // 22대 먼저 끝내고 21대(컷오프 이후분)로

const KEY = process.env.ASSEMBLY_API_KEY;
if (!KEY) {
  console.error('ASSEMBLY_API_KEY 가 없다. .env 를 채우거나 환경변수로 넘겨라.');
  process.exit(1);
}

async function callApi(params) {
  const url = new URL(API_BASE);
  url.searchParams.set('KEY', KEY);
  url.searchParams.set('Type', 'json');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const body = await res.json();
  const rows = body?.nzmimeepazxkubdpn?.[1]?.row;
  return Array.isArray(rows) ? rows : [];
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, 'utf8'));
  } catch {
    return { age: AGES[0], pIndex: 1, done: false };
  }
}

async function loadTrackedIds() {
  await mkdir(BILLS_DIR, { recursive: true });
  const files = (await readdir(BILLS_DIR)).filter((f) => f.endsWith('.json'));
  return new Set(files.map((f) => f.replace(/\.json$/, '')));
}

async function loadJsonDir(dir) {
  const files = await readdir(dir).catch(() => []);
  const items = [];
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    items.push(JSON.parse(await readFile(join(dir, f), 'utf8')));
  }
  return items;
}

async function main() {
  let state = await loadState();
  if (state.done) {
    console.log('backfill-bills: 이미 완료됨(state.done=true) — 할 일 없음');
    return;
  }

  const tracked = await loadTrackedIds();
  let written = 0;

  for (let page = 0; page < PAGES_PER_RUN; page += 1) {
    const rows = await callApi({ AGE: state.age, pIndex: state.pIndex, pSize: PAGE_SIZE });
    const { keep, hitCutoff } = splitPageByCutoff(rows, state.age, CUTOFF_DATE);

    for (const record of keep) {
      if (tracked.has(record.BILL_ID)) continue;
      const bill = toBill(record);
      await writeFile(join(BILLS_DIR, `${bill.billId}.json`), JSON.stringify(bill, null, 2) + '\n');
      tracked.add(bill.billId);
      written += 1;
    }

    state = advanceBackfillState({ age: state.age, pIndex: state.pIndex, ages: AGES, rowsEmpty: rows.length === 0, hitCutoff });
    if (state.done || rows.length === 0 || hitCutoff) {
      // AGE가 바뀌었거나 완료됐으면 이번 회차는 여기서 끝 — 다음 회차에 이어감
      if (!state.done) continue;
      break;
    }
  }

  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n');

  if (written === 0) {
    console.log(`backfill-bills: 새로 받은 건 없음(state: AGE${state.age} pIndex${state.pIndex} done=${state.done})`);
    return;
  }

  const bills = await loadJsonDir(BILLS_DIR);
  const decrees = await loadJsonDir(DECREES_DIR);
  const laws = await loadJsonDir(LAWS_DIR);
  const gwanbo = await loadJsonDir(GWANBO_DIR);
  const policy = await loadJsonDir(POLICY_DIR);
  const items = buildFeedItems(bills, decrees, laws, gwanbo, policy);
  await writeFile(INDEX_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2) + '\n');
  console.log(
    `backfill-bills: ${written}건 신규 저장, 누적 ${tracked.size}건, 피드 ${items.length}건 (state: AGE${state.age} pIndex${state.pIndex} done=${state.done})`,
  );
}

await main();
