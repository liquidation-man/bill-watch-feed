import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { normalizePollState, parsePositiveInt, selectOpenBillBatch } from './poll-cursor.mjs';

const bills = ['B1', 'B2', 'B3', 'B4'].map((billId) => ({ billId, events: [] }));

test('parsePositiveInt: 환경변수 값이 양수일 때만 쓴다', () => {
  assert.equal(parsePositiveInt('3', 200), 3);
  assert.equal(parsePositiveInt('0', 200), 200);
  assert.equal(parsePositiveInt('nope', 200), 200);
});

test('normalizePollState: 깨진 state는 null cursor로 복구한다', () => {
  assert.deepEqual(normalizePollState(null), { nextBillId: null });
  assert.deepEqual(normalizePollState({ nextBillId: '' }), { nextBillId: null });
  assert.deepEqual(normalizePollState({ nextBillId: 'B2' }), { nextBillId: 'B2' });
});

test('selectOpenBillBatch: cursor부터 제한된 배치만 고르고 다음 cursor를 넘긴다', () => {
  const result = selectOpenBillBatch(bills, { nextBillId: 'B2' }, 2);
  assert.deepEqual(result.batch.map((b) => b.billId), ['B2', 'B3']);
  assert.deepEqual(result.nextState, { nextBillId: 'B4' });
  assert.equal(result.totalOpen, 4);
  assert.equal(result.wrapped, false);
});

test('selectOpenBillBatch: 끝에 닿으면 다음 회차를 처음으로 감싼다', () => {
  const result = selectOpenBillBatch(bills, { nextBillId: 'B4' }, 2);
  assert.deepEqual(result.batch.map((b) => b.billId), ['B4', 'B1']);
  assert.deepEqual(result.nextState, { nextBillId: 'B2' });
  assert.equal(result.wrapped, true);
});

test('selectOpenBillBatch: 사라진 cursor는 다음 billId 또는 처음으로 복구한다', () => {
  assert.deepEqual(selectOpenBillBatch(bills, { nextBillId: 'B2.5' }, 1).batch.map((b) => b.billId), ['B3']);
  assert.deepEqual(selectOpenBillBatch(bills, { nextBillId: 'Z9' }, 1).batch.map((b) => b.billId), ['B1']);
});
