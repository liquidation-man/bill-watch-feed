import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  eventFromAdmrulRow,
  eventFromLawRow,
  eventToDecreeFile,
  parseAdmrulSearchXml,
  parseLawSearchXml,
} from './decree.mjs';

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

// 2026-08-14: 오너 지적 — "고시"는 문서 형식이지 분야가 아니다("통신,
// 건축 이런식으로 나누면 안될까"). 종류가 고시라고 무조건 '고시' 태그를
// 붙이던 걸 없앴다 — 소관부처(관세청→세금 등)로만 내용 분야를 판단한다.
test('eventFromAdmrulRow — 종류가 고시여도 형식 태그는 안 붙는다', () => {
  const rows = parseAdmrulSearchXml(ADMRUL_FIXTURE);
  const admrulRow = rows.find((r) => r['행정규칙종류'] === '고시');
  assert.ok(admrulRow, '픽스처에 고시가 최소 하나는 있어야 테스트가 의미 있다');
  const event = eventFromAdmrulRow(admrulRow);
  assert.equal(event.tags.includes('고시'), false);
  assert.equal(event.category, '개정');
});

test('eventFromAdmrulRow — 소관부처(관세청)로 세금 태그도 같이 붙는다', () => {
  const rows = parseAdmrulSearchXml(ADMRUL_FIXTURE);
  const customsRow = rows.find((r) => r['소관부처명'] === '관세청');
  assert.ok(customsRow, '픽스처에 관세청 발령분이 있어야 테스트가 의미 있다');
  const event = eventFromAdmrulRow(customsRow);
  assert.ok(event.tags.includes('세금'));
});

test('eventFromAdmrulRow — 국토교통부 소관이라도 도로 관련이면 부동산이 아니라 교통', () => {
  const rows = parseAdmrulSearchXml(ADMRUL_FIXTURE);
  const plain = rows.find((r) => r['행정규칙종류'] === '예규'); // "도로안전시설 설치 및 관리지침", 국토교통부
  assert.ok(plain);
  const event = eventFromAdmrulRow(plain);
  // 2026-08-14: 오너 지적("자동차 관련인데 부동산에 붙어있다")으로 tags.mjs가
  // 국토교통부=무조건 부동산이던 걸 고쳤다 — 이 항목도 그 대상이었다.
  assert.deepEqual(event.tags, ['교통']);
});

test('eventFromLawRow — 소관부처로 도메인 태그를 뽑는다', () => {
  const rows = parseLawSearchXml(LAW_FIXTURE);
  const event = eventFromLawRow(rows[1]); // "방위사업청과 그 소속기관 직제 시행규칙", 방위사업청
  assert.deepEqual(event.tags, []); // 방위사업청은 매핑에 없다 — 지어내지 않는다
});

test('eventFromAdmrulRow — 구내통신설비 기술기준 고시는 통신 태그로 내려간다', () => {
  const event = eventFromAdmrulRow({
    행정규칙일련번호: '2100000268620',
    행정규칙명: '접지설비·구내통신설비·선로설비 및 통신공동구등에 대한 기술기준',
    행정규칙종류: '고시',
    제개정구분명: '일부개정',
    발령일자: '20251128',
    소관부처명: '국립전파연구원',
    행정규칙상세링크: '/DRF/lawService.do?OC=test&amp;target=admrul&amp;ID=2100000268620&amp;type=HTML&amp;mobileYn=',
  });
  assert.equal(event.id, 'ADMRUL_2100000268620');
  assert.equal(event.kind, '고시');
  assert.deepEqual(event.tags, ['통신']);
});

test('eventFromAdmrulRow — 건축기준 고시안은 건축 태그를 포함한다', () => {
  const event = eventFromAdmrulRow({
    행정규칙일련번호: '1',
    행정규칙명: '다중생활시설 건축기준 일부개정 고시안 행정예고',
    행정규칙종류: '고시',
    제개정구분명: '일부개정',
    발령일자: '20260812',
    소관부처명: '국토교통부',
    행정규칙상세링크: '/DRF/lawService.do?OC=test&amp;target=admrul&amp;ID=1&amp;type=HTML',
  });
  assert.ok(event.tags.includes('건축'));
});

// 2026-08-14: 오너가 실제 앱에서 "상세 페이지에 아무 내용도 안 나온다"고
// 지적 — decrees/*.json의 detail이 항상 빈 문자열이었다. 소관부처·법령구분은
// 이미 event에 있는 값이라, 없는 걸 지어내지 않고 그 둘만으로 채운다.
test('eventToDecreeFile — detail을 소관부처·법령구분으로 채운다(빈 문자열로 남기지 않는다)', () => {
  const rows = parseLawSearchXml(LAW_FIXTURE);
  const event = eventFromLawRow(rows[0]); // "방위산업기술 보호법 시행령", 대통령령
  const file = eventToDecreeFile(event, undefined);
  assert.equal(file.events[0].detail, `${event.org} · ${event.kind}`);
  assert.notEqual(file.events[0].detail, '');
});

test('eventToDecreeFile — org가 없으면 kind만으로 채운다(지어내지 않는다)', () => {
  const event = { id: 'LAW_1', title: '테스트법', org: '', kind: '대통령령', stage: '제정', category: '개정', date: '2026-08-14', sourceUrl: '', tags: [] };
  const file = eventToDecreeFile(event, undefined);
  assert.equal(file.events[0].detail, '대통령령');
});
