import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dateToIso, lawFromHistoryRows, parseLawHistoryHtml, slugify } from './law-history.mjs';

const FIXTURE = readFileSync(fileURLToPath(new URL('./__fixtures__/lshistory-sample.html', import.meta.url)), 'utf-8');

test('실물 응답(2026-08-14 확보)에서 5개 행을 파싱한다', () => {
  const rows = parseLawHistoryHtml(FIXTURE);
  assert.equal(rows.length, 5);
});

test('첫 행 — 제정, 대통령령', () => {
  const rows = parseLawHistoryHtml(FIXTURE);
  const first = rows[0];
  assert.equal(first.stage, '제정');
  assert.equal(first.lawType, '대통령령');
  assert.equal(first.ministry, '기획재정부');
  assert.equal(first.promulgationDate, '1971.6.22');
  assert.equal(first.mst, '19943');
  assert.equal(first.isCurrent, false);
});

test('마지막 행 — 소득세법, 현행', () => {
  const rows = parseLawHistoryHtml(FIXTURE);
  const last = rows.at(-1);
  assert.equal(last.title, '소득세법');
  assert.equal(last.isCurrent, true);
  assert.equal(last.effectiveDate, '2026.7.1');
});

test('현행은 정확히 하나뿐이어야 한다', () => {
  const rows = parseLawHistoryHtml(FIXTURE);
  const currentCount = rows.filter((r) => r.isCurrent).length;
  assert.equal(currentCount, 1);
});

test('slugify — 공백만 제거', () => {
  assert.equal(slugify('소득세법'), '소득세법');
  assert.equal(slugify('법인세법 시행령'), '법인세법시행령');
});

test('dateToIso — 점 표기를 ISO로', () => {
  assert.equal(dateToIso('1971.6.22'), '1971-06-22');
  assert.equal(dateToIso('2026.7.1'), '2026-07-01');
});

test('dateToIso — 형식이 안 맞으면 빈 문자열, 지어내지 않는다', () => {
  assert.equal(dateToIso(''), '');
  assert.equal(dateToIso(undefined), '');
  assert.equal(dateToIso('이상한값'), '');
});

test('lawFromHistoryRows — 실물 5개 행을 게시글 하나로(제목=현행 제목, 이력 5개)', () => {
  const rows = parseLawHistoryHtml(FIXTURE);
  const law = lawFromHistoryRows('소득세법', rows);
  assert.equal(law.title, '소득세법');
  assert.equal(law.billId, 'LAWHIST_소득세법');
  assert.equal(law.events.length, 5);
  assert.equal(law.events[0].date, '1971-06-22'); // 공포일자 오름차순 재정렬
  assert.equal(law.events.at(-1).date, '2026-04-21'); // 공포일자(시행일자 2026-07-01보다 이르다)
  assert.equal(law.events[0].category, '개정');
  assert.match(law.events[0].sourceUrl, /MST=19943/);
  assert.match(law.events[0].detail, /기획재정부/);
});
