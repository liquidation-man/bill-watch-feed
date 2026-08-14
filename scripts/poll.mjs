#!/usr/bin/env node
/**
 * 실제 열린국회정보 "의안정보 통합 API" 를 조회해 bills/*.json + index.json 을 채운다.
 * GitHub Actions 가 주기 실행하고, 바뀐 파일이 있으면 그 워크플로가 커밋한다
 * (이 스크립트는 git 을 모른다 — 파일만 쓴다).
 *
 * 두 단계로 조회한다:
 *   1. 최신 N건 — 새로 발의된 의안을 잡는다 (최신순 정렬 확인됨, 2026-08-13)
 *   2. 아직 본회의 의결 전인 추적 중 의안 — BILL_ID 로 재조회해 진행 단계를 잡는다
 *      (그러지 않으면 "최신 N건" 창을 벗어난 의안은 다음 단계를 영영 못 본다)
 *
 * 사용: ASSEMBLY_API_KEY=xxx node scripts/poll.mjs
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagesFromRecord, toBill } from '../lib/stages.mjs';
import { tagBill } from '../lib/tags.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BILLS_DIR = join(root, 'bills');
const INDEX_PATH = join(root, 'index.json');
const API_BASE = 'https://open.assembly.go.kr/portal/openapi/nzmimeepazxkubdpn';
const AGE = 22;
const RECENT_PAGE_SIZE = 50;
const FEED_LIMIT = 100;

const KEY = process.env.ASSEMBLY_API_KEY;
if (!KEY) {
  console.error('ASSEMBLY_API_KEY 가 없다. .env 를 채우거나 환경변수로 넘겨라.');
  process.exit(1);
}

async function callApi(params) {
  const url = new URL(API_BASE);
  url.searchParams.set('KEY', KEY);
  url.searchParams.set('Type', 'json');
  url.searchParams.set('AGE', String(AGE));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const body = await res.json();
  const rows = body?.nzmimeepazxkubdpn?.[1]?.row;
  return Array.isArray(rows) ? rows : [];
}

async function loadTrackedBills() {
  await mkdir(BILLS_DIR, { recursive: true });
  const files = (await readdir(BILLS_DIR)).filter((f) => f.endsWith('.json'));
  const bills = new Map();
  for (const f of files) {
    const bill = JSON.parse(await readFile(join(BILLS_DIR, f), 'utf8'));
    bills.set(bill.billId, bill);
  }
  return bills;
}

/** 기존 이벤트에 없는 새 이벤트만 이어붙인다. stage 이름으로 중복을 가린다. */
function mergeEvents(existing, incoming) {
  const seen = new Set(existing.map((e) => e.stage));
  const added = incoming.filter((e) => !seen.has(e.stage));
  return { events: [...existing, ...added], addedCount: added.length };
}

/** 저장된 bill 이 본회의 의결까지 끝났는지 — 끝났으면 더 재조회하지 않는다. */
function isBillConcluded(bill) {
  return bill.events.some((e) => e.stage === '본회의의결');
}

async function main() {
  const tracked = await loadTrackedBills();
  let changed = false;

  // 1. 최신 N건 — 새 발의 잡기
  const recent = await callApi({ pIndex: 1, pSize: RECENT_PAGE_SIZE });
  for (const record of recent) {
    if (tracked.has(record.BILL_ID)) continue;
    tracked.set(record.BILL_ID, toBill(record));
    changed = true;
  }

  // 2. 아직 안 끝난 추적 중 의안 — 진행 단계 갱신
  // 소관위원회는 발의 때 비어 있다가 나중에 채워진다 — 그때 태그도 다시 계산해야
  // 한다(2026-08-14, 태깅 규칙 도입 전엔 여기서 안 옮겨서 소급이 안 됐던 버그).
  const open = [...tracked.values()].filter((b) => !isBillConcluded(b));
  for (const bill of open) {
    const rows = await callApi({ pIndex: 1, pSize: 1, BILL_ID: bill.billId });
    if (rows.length === 0) continue;
    const incoming = stagesFromRecord(rows[0]);
    const { events, addedCount } = mergeEvents(bill.events, incoming);
    const committee = rows[0].COMMITTEE || bill.committee;
    const tags = tagBill({ committee, title: bill.title });
    const committeeChanged = committee !== bill.committee;
    if (addedCount > 0 || committeeChanged) {
      tracked.set(bill.billId, { ...bill, committee, events, tags });
      changed = true;
    }
  }

  if (!changed) {
    console.log('poll: 새 이벤트 없음');
    return;
  }

  for (const bill of tracked.values()) {
    await writeFile(join(BILLS_DIR, `${bill.billId}.json`), JSON.stringify(bill, null, 2) + '\n');
  }

  const items = [...tracked.values()]
    .flatMap((b) =>
      b.events.map((e) => ({
        billId: b.billId,
        title: b.title,
        stage: e.stage,
        category: e.category,
        administration: e.administration,
        date: e.date,
        tags: b.tags || [],
      })),
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, FEED_LIMIT);

  await writeFile(INDEX_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2) + '\n');
  console.log(`poll: 의안 ${tracked.size}건 추적 중, 피드 ${items.length}건`);
}

await main();
