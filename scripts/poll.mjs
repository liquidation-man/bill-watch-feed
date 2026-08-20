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
import { buildFeedItems } from '../lib/build-index.mjs';
import { stagesFromRecord, toBill } from '../lib/stages.mjs';
import { tagBill } from '../lib/tags.mjs';
import { fetchProposerMembers } from '../lib/proposers.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BILLS_DIR = join(root, 'bills');
const DECREES_DIR = join(root, 'decrees');
const LAWS_DIR = join(root, 'laws');
const GWANBO_DIR = join(root, 'gwanbo');
const POLICY_DIR = join(root, 'policy');
const INDEX_PATH = join(root, 'index.json');
const API_BASE = 'https://open.assembly.go.kr/portal/openapi/nzmimeepazxkubdpn';
const AGE = 22;
const RECENT_PAGE_SIZE = 50;

/** decrees/*.json·laws/*.json — poll-decrees.mjs·poll-law-history.mjs가 채운다.
 *  없어도(디렉터리 자체가 없어도) 빈 배열. */
async function loadOtherEntities(dir) {
  const files = await readdir(dir).catch(() => []);
  const items = [];
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    items.push(JSON.parse(await readFile(join(dir, f), 'utf8')));
  }
  return items;
}

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

function needsProposerMembers(bill) {
  return /등\s*\d+\s*(인|명)?/.test(bill.proposer ?? '') && !(bill.proposerMembers?.length > 1);
}

async function withProposerMembers(bill) {
  if (!needsProposerMembers(bill)) return bill;
  const proposerMembers = await fetchProposerMembers(bill.billId).catch(() => []);
  if (proposerMembers.length === 0) return bill;
  return { ...bill, proposerMembers, members: proposerMembers };
}

async function enrichTrackedProposerMembers(tracked) {
  let changed = false;
  for (const [billId, bill] of tracked) {
    if (!needsProposerMembers(bill)) continue;
    const enriched = await withProposerMembers(bill);
    if ((enriched.proposerMembers?.length ?? 0) > (bill.proposerMembers?.length ?? 0)) {
      tracked.set(billId, enriched);
      changed = true;
    }
  }
  return changed;
}

async function main() {
  const tracked = await loadTrackedBills();
  let changed = false;

  // 1. 최신 N건 — 새 발의 잡기
  const recent = await callApi({ pIndex: 1, pSize: RECENT_PAGE_SIZE });
  for (const record of recent) {
    if (tracked.has(record.BILL_ID)) continue;
    tracked.set(record.BILL_ID, await withProposerMembers(toBill(record)));
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
      const updated = await withProposerMembers({ ...bill, committee, events, tags });
      tracked.set(bill.billId, updated);
      changed = true;
    }
  }

  if (await enrichTrackedProposerMembers(tracked)) changed = true;

  if (!changed) {
    console.log('poll: 새 이벤트 없음');
    return;
  }

  for (const bill of tracked.values()) {
    await writeFile(join(BILLS_DIR, `${bill.billId}.json`), JSON.stringify(bill, null, 2) + '\n');
  }

  const decrees = await loadOtherEntities(DECREES_DIR);
  const laws = await loadOtherEntities(LAWS_DIR);
  const gwanbo = await loadOtherEntities(GWANBO_DIR);
  const policy = await loadOtherEntities(POLICY_DIR);
  const items = buildFeedItems([...tracked.values()], decrees, laws, gwanbo, policy);

  await writeFile(INDEX_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2) + '\n');
  console.log(`poll: 의안 ${tracked.size}건 추적 중, 피드 ${items.length}건`);
}

await main();
