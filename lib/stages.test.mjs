import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isConcluded, stagesFromRecord, toBill } from './stages.mjs';

const PROPOSED_ONLY = {
  BILL_ID: 'B1',
  BILL_NAME: '테스트법 일부개정법률안',
  COMMITTEE: null,
  PROPOSE_DT: '2026-08-12',
  PROC_RESULT: null,
  AGE: '22',
  DETAIL_LINK: 'http://example/B1',
  PROPOSER: '홍길동의원 등 10인',
  LAW_PROC_DT: null,
  LAW_PROC_RESULT_CD: null,
  LAW_PRESENT_DT: null,
  CMT_PROC_RESULT_CD: null,
  CMT_PROC_DT: null,
  CMT_PRESENT_DT: null,
  PROC_DT: null,
};

test('발의만 된 의안은 이벤트가 하나뿐', () => {
  const stages = stagesFromRecord(PROPOSED_ONLY);
  assert.equal(stages.length, 1);
  assert.equal(stages[0].stage, '발의');
  assert.equal(stages[0].date, '2026-08-12');
});

test('빈 문자열/공백 detail 도 아니고 null 도 아니면 채운다', () => {
  const stages = stagesFromRecord(PROPOSED_ONLY);
  assert.equal(stages[0].detail, '홍길동의원 등 10인 발의');
});

test('본회의까지 끝나면 6단계 전부', () => {
  const done = {
    ...PROPOSED_ONLY,
    CMT_PRESENT_DT: '2026-08-13',
    CMT_PROC_DT: '2026-08-14',
    CMT_PROC_RESULT_CD: '가결',
    LAW_PRESENT_DT: '2026-08-15',
    LAW_PROC_DT: '2026-08-16',
    LAW_PROC_RESULT_CD: '체계자구심사 완료',
    PROC_DT: '2026-08-17',
    PROC_RESULT: '가결',
  };
  const stages = stagesFromRecord(done);
  assert.equal(stages.length, 6);
  assert.equal(stages.at(-1).stage, '본회의의결');
});

test('회의 단계에는 인터넷의사중계 링크가, 발의에는 없다', () => {
  const done = {
    ...PROPOSED_ONLY,
    CMT_PRESENT_DT: '2026-08-13',
    CMT_PROC_DT: '2026-08-14',
    CMT_PROC_RESULT_CD: '가결',
    LAW_PRESENT_DT: '2026-08-15',
    LAW_PROC_DT: '2026-08-16',
    LAW_PROC_RESULT_CD: '체계자구심사 완료',
    PROC_DT: '2026-08-17',
    PROC_RESULT: '가결',
  };
  const stages = stagesFromRecord(done);
  const byStage = Object.fromEntries(stages.map((s) => [s.stage, s]));
  assert.equal(byStage['발의'].webcastUrl, undefined);
  assert.equal(byStage['위원회상정'].webcastUrl, 'https://www.webcast.go.kr/');
  assert.equal(byStage['본회의의결'].webcastUrl, 'https://www.webcast.go.kr/');
});

test('isConcluded — PROC_DT 있어야 true', () => {
  assert.equal(isConcluded(PROPOSED_ONLY), false);
  assert.equal(isConcluded({ ...PROPOSED_ONLY, PROC_DT: '2026-08-17' }), true);
});

test('toBill — billId/title/이벤트를 옮긴다', () => {
  const bill = toBill(PROPOSED_ONLY);
  assert.equal(bill.billId, 'B1');
  assert.equal(bill.title, '테스트법 일부개정법률안');
  assert.equal(bill.assemblyTerm, 22);
  assert.equal(bill.events.length, 1);
});
