#!/usr/bin/env node
/**
 * 실제 API 대신 가짜 응답 행 하나를 lib/stages.mjs 로 돌려서 index.json/bills/*.json
 * 을 채운다. 진짜 poll.mjs 와 같은 변환 함수를 쓰므로 스키마가 어긋날 일이 없다.
 *
 * 사용: node scripts/mock-poll.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toBill } from '../lib/stages.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const fakeRecord = {
  BILL_ID: 'sample-2200001',
  BILL_NAME: '(샘플) ○○법 일부개정법률안',
  COMMITTEE: '행정안전위원회',
  PROPOSE_DT: '2026-08-01',
  PROC_RESULT: null,
  AGE: '22',
  DETAIL_LINK: '',
  PROPOSER: '홍길동의원 등 10인',
  CMT_PRESENT_DT: '2026-08-10',
  CMT_PROC_DT: null,
  CMT_PROC_RESULT_CD: null,
  LAW_PRESENT_DT: null,
  LAW_PROC_DT: null,
  LAW_PROC_RESULT_CD: null,
  PROC_DT: null,
};

const bill = toBill(fakeRecord);
const index = {
  generatedAt: new Date().toISOString(),
  items: bill.events
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((e) => ({ billId: bill.billId, title: bill.title, stage: e.stage, date: e.date })),
};

await mkdir(join(root, 'bills'), { recursive: true });
await writeFile(join(root, 'bills', `${bill.billId}.json`), JSON.stringify(bill, null, 2) + '\n');
await writeFile(join(root, 'index.json'), JSON.stringify(index, null, 2) + '\n');

console.log('mock-poll: wrote index.json + bills/%s.json', bill.billId);
