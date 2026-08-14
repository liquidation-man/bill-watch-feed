import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { administrationFromDate } from './administration.mjs';

test('2010년(이명박정부 재임 중)', () => {
  assert.equal(administrationFromDate('2010-06-01'), '이명박정부');
});

test('박근혜 파면일(2017-03-10) — 파면 당일까지 박근혜정부', () => {
  assert.equal(administrationFromDate('2017-03-10'), '박근혜정부');
});

test('권한대행 공백기(2017-03-11~05-09)는 null — 지어내지 않는다', () => {
  assert.equal(administrationFromDate('2017-04-01'), null);
});

test('문재인 취임일(2017-05-10)부터 문재인정부', () => {
  assert.equal(administrationFromDate('2017-05-10'), '문재인정부');
});

test('윤석열 파면일(2025-04-04)까지 윤석열정부', () => {
  assert.equal(administrationFromDate('2025-04-04'), '윤석열정부');
});

test('이재명 취임일(2025-06-04)부터 이재명정부, 종료일 없음(현재 진행)', () => {
  assert.equal(administrationFromDate('2025-06-04'), '이재명정부');
  assert.equal(administrationFromDate('2026-08-14'), '이재명정부');
});

test('날짜 없으면 null', () => {
  assert.equal(administrationFromDate(null), null);
  assert.equal(administrationFromDate(''), null);
});

test('2008-02-25 이전은 null — 매핑 밖', () => {
  assert.equal(administrationFromDate('2005-01-01'), null);
});
