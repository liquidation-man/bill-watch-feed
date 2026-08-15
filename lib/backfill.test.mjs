import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { advanceBackfillState, splitPageByCutoff } from './backfill.mjs';

test('splitPageByCutoff: AGE=22는 컷오프를 안 본다(임기 자체가 컷오프 이후)', () => {
  const rows = [{ PROPOSE_DT: '2020-01-01' }]; // 있을 수 없는 날짜여도 22대면 그냥 통과
  assert.deepEqual(splitPageByCutoff(rows, 22, '2022-05-10'), { keep: rows, hitCutoff: false });
});

test('splitPageByCutoff: AGE=21은 컷오프 이전 행을 만나면 그 앞까지만 남기고 멈춘다', () => {
  const rows = [
    { PROPOSE_DT: '2024-01-01' },
    { PROPOSE_DT: '2022-06-01' },
    { PROPOSE_DT: '2022-01-01' }, // 컷오프(2022-05-10) 이전 — 여기서 멈춤
    { PROPOSE_DT: '2020-01-01' },
  ];
  const result = splitPageByCutoff(rows, 21, '2022-05-10');
  assert.equal(result.hitCutoff, true);
  assert.deepEqual(result.keep, [{ PROPOSE_DT: '2024-01-01' }, { PROPOSE_DT: '2022-06-01' }]);
});

test('splitPageByCutoff: AGE=21이어도 컷오프에 안 걸리면 전부 남긴다', () => {
  const rows = [{ PROPOSE_DT: '2024-01-01' }, { PROPOSE_DT: '2023-01-01' }];
  const result = splitPageByCutoff(rows, 21, '2022-05-10');
  assert.equal(result.hitCutoff, false);
  assert.deepEqual(result.keep, rows);
});

test('advanceBackfillState: 정상 페이지면 pIndex만 증가', () => {
  const next = advanceBackfillState({ age: 22, pIndex: 3, ages: [22, 21], rowsEmpty: false, hitCutoff: false });
  assert.deepEqual(next, { age: 22, pIndex: 4, done: false });
});

test('advanceBackfillState: 페이지가 비면 다음 AGE로 넘어간다', () => {
  const next = advanceBackfillState({ age: 22, pIndex: 50, ages: [22, 21], rowsEmpty: true, hitCutoff: false });
  assert.deepEqual(next, { age: 21, pIndex: 1, done: false });
});

test('advanceBackfillState: 컷오프에 걸려도 다음 AGE가 있으면 넘어간다', () => {
  // splitPageByCutoff는 실제로 age===21에서만 hitCutoff를 낼 수 있지만, 이 함수
  // 자체는 순수하게 "지금 AGE가 끝났다"만 보고 판단한다 — 함수 경계를 그대로 테스트.
  const next = advanceBackfillState({ age: 22, pIndex: 80, ages: [22, 21], rowsEmpty: false, hitCutoff: true });
  assert.deepEqual(next, { age: 21, pIndex: 1, done: false });
});

test('advanceBackfillState: 마지막 AGE까지 끝나면 done', () => {
  const next = advanceBackfillState({ age: 21, pIndex: 80, ages: [22, 21], rowsEmpty: true, hitCutoff: false });
  assert.deepEqual(next, { age: 21, pIndex: 80, done: true });
});

// ── 18~22대 확장 (2026-08-15) ──────────────────────────────────────────
test('splitPageByCutoff: AGE=20은 컷오프를 안 본다(임기 전체가 컷오프 이전)', () => {
  const rows = [{ PROPOSE_DT: '2018-01-01' }, { PROPOSE_DT: '2016-01-01' }];
  assert.deepEqual(splitPageByCutoff(rows, 20, '2022-05-10'), { keep: rows, hitCutoff: false });
});

test('splitPageByCutoff: AGE=19·18도 컷오프를 안 본다', () => {
  for (const age of [19, 18]) {
    const rows = [{ PROPOSE_DT: '2014-01-01' }, { PROPOSE_DT: '2012-01-01' }];
    assert.deepEqual(splitPageByCutoff(rows, age, '2022-05-10'), { keep: rows, hitCutoff: false });
  }
});

test('advanceBackfillState: 5개 AGE에서 22→21→20→19→18 순서로 넘어간다', () => {
  const ages = [22, 21, 20, 19, 18];
  // 22대 끝 → 21대
  let next = advanceBackfillState({ age: 22, pIndex: 200, ages, rowsEmpty: true, hitCutoff: false });
  assert.deepEqual(next, { age: 21, pIndex: 1, done: false });
  // 21대 컷오프 → 20대
  next = advanceBackfillState({ age: 21, pIndex: 50, ages, rowsEmpty: false, hitCutoff: true });
  assert.deepEqual(next, { age: 20, pIndex: 1, done: false });
  // 20대 끝 → 19대
  next = advanceBackfillState({ age: 20, pIndex: 100, ages, rowsEmpty: true, hitCutoff: false });
  assert.deepEqual(next, { age: 19, pIndex: 1, done: false });
  // 19대 끝 → 18대
  next = advanceBackfillState({ age: 19, pIndex: 100, ages, rowsEmpty: true, hitCutoff: false });
  assert.deepEqual(next, { age: 18, pIndex: 1, done: false });
  // 18대 끝 → done
  next = advanceBackfillState({ age: 18, pIndex: 100, ages, rowsEmpty: true, hitCutoff: false });
  assert.deepEqual(next, { age: 18, pIndex: 100, done: true });
});
