#!/usr/bin/env node
/**
 * 실제 열린국회정보 API 대신 고정된 목데이터를 index.json/bills/*.json 에 쓴다.
 * 인증키를 받으면 이 파일이 아니라 scripts/poll.mjs(신규)를 만들어 실제 호출로
 * 바꾼다 — 이 파일은 로컬 개발·CI 배관 확인용으로 남겨 둔다.
 *
 * 사용: node scripts/mock-poll.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const bill = {
  billId: 'sample-2200001',
  title: '(샘플) ○○법 일부개정법률안',
  committee: '행정안전위원회',
  proposer: '홍길동 의원 등 10인',
  assemblyTerm: 22,
  events: [
    { date: '2026-08-01', stage: '발의', detail: '의안이 접수됐습니다.', sourceUrl: '' },
    { date: '2026-08-10', stage: '입법예고', detail: '입법예고 기간이 시작됐습니다.', sourceUrl: '' },
  ],
};

const index = {
  generatedAt: new Date().toISOString(),
  items: [...bill.events]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((e) => ({ billId: bill.billId, title: bill.title, stage: e.stage, date: e.date })),
};

await mkdir(join(root, 'bills'), { recursive: true });
await writeFile(join(root, 'bills', `${bill.billId}.json`), JSON.stringify(bill, null, 2) + '\n');
await writeFile(join(root, 'index.json'), JSON.stringify(index, null, 2) + '\n');

console.log('mock-poll: wrote index.json + bills/%s.json', bill.billId);
