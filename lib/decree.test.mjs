import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { eventFromAdmrulRow, eventFromLawRow, parseAdmrulSearchXml, parseLawSearchXml } from './decree.mjs';

const LAW_FIXTURE = readFileSync(fileURLToPath(new URL('./__fixtures__/law-search-sample.xml', import.meta.url)), 'utf-8');
const ADMRUL_FIXTURE = readFileSync(
  fileURLToPath(new URL('./__fixtures__/admrul-search-sample.xml', import.meta.url)),
  'utf-8',
);

test('실물 응답(2026-08-14 확보, target=law)에서 5개 행을 파싱한다', () => {
  const rows = parseLawSearchXml(LAW_FIXTURE);
  assert.equal(rows.length, 5);
});

test('법령 첫 행 — 방위산업기술 보호법 시행령, 대통령령, 타법개정', () => {
  const rows = parseLawSearchXml(LAW_FIXTURE);
  const first = rows[0];
  assert.equal(first['법령명한글'], '방위산업기술 보호법 시행령');
  assert.equal(first['법령구분명'], '대통령령');
  assert.equal(first['제개정구분명'], '타법개정');
  assert.equal(first['공포일자'], '20260814');
});

test('eventFromLawRow — 날짜 포맷·소스링크·category 고정', () => {
  const rows = parseLawSearchXml(LAW_FIXTURE);
  const event = eventFromLawRow(rows[0]);
  assert.equal(event.id, 'LAW_288763');
  assert.equal(event.date, '2026-08-14');
  assert.equal(event.category, '개정');
  assert.equal(event.kind, '대통령령');
  assert.match(event.sourceUrl, /^https:\/\/www\.law\.go\.kr\/DRF\/lawService\.do\?/);
  assert.ok(!event.sourceUrl.includes('&amp;'), '엔티티가 실제 & 로 풀려야 한다');
  assert.match(event.sourceUrl, /[?&]OC=test(&|$)/, '실제 OC가 public 저장소에 남으면 안 된다 — test로 치환');
});

test('실물 응답(2026-08-14 확보, target=admrul)에서 5개 행을 파싱한다', () => {
  const rows = parseAdmrulSearchXml(ADMRUL_FIXTURE);
  assert.equal(rows.length, 5);
});

test('eventFromAdmrulRow — 종류가 고시면 태그에 고시가 붙는다', () => {
  const rows = parseAdmrulSearchXml(ADMRUL_FIXTURE);
  const admrulRow = rows.find((r) => r['행정규칙종류'] === '고시');
  assert.ok(admrulRow, '픽스처에 고시가 최소 하나는 있어야 테스트가 의미 있다');
  const event = eventFromAdmrulRow(admrulRow);
  assert.ok(event.tags.includes('고시'));
  assert.equal(event.category, '개정');
});

test('eventFromAdmrulRow — 소관부처(관세청)로 세금 태그도 같이 붙는다', () => {
  const rows = parseAdmrulSearchXml(ADMRUL_FIXTURE);
  const customsRow = rows.find((r) => r['소관부처명'] === '관세청');
  assert.ok(customsRow, '픽스처에 관세청 발령분이 있어야 테스트가 의미 있다');
  const event = eventFromAdmrulRow(customsRow);
  assert.ok(event.tags.includes('세금'));
});

test('eventFromAdmrulRow — 훈령·예규에 도메인 키워드·소관부처 매핑이 없으면 빈 배열(지어내지 않는다)', () => {
  const rows = parseAdmrulSearchXml(ADMRUL_FIXTURE);
  const plain = rows.find((r) => r['행정규칙종류'] === '예규'); // "도로안전시설 설치 및 관리지침", 국토교통부
  assert.ok(plain);
  const event = eventFromAdmrulRow(plain);
  assert.deepEqual(event.tags, ['부동산']); // 국토교통부 → 부동산(MINISTRY_TAGS) — 이건 매핑이 있는 사례
});

test('eventFromLawRow — 소관부처로 도메인 태그를 뽑는다', () => {
  const rows = parseLawSearchXml(LAW_FIXTURE);
  const event = eventFromLawRow(rows[1]); // "방위사업청과 그 소속기관 직제 시행규칙", 방위사업청
  assert.deepEqual(event.tags, []); // 방위사업청은 매핑에 없다 — 지어내지 않는다
});
