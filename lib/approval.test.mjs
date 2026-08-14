import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseApproval, parseGallupReport, parsePartySupport, parseReportTitle, parseSurveyPeriod } from './approval.mjs';

// 2026-08-14 실물 확보 — 한국갤럽 데일리 오피니언 제671호(seqNo=1653).
const REPORT_HTML = readFileSync(
  fileURLToPath(new URL('./__fixtures__/gallup-report-sample.html', import.meta.url)),
  'utf-8',
);

test('parseApproval — 긍정/부정/유보를 뽑는다(2026년 현재 형식)', () => {
  const result = parseApproval(REPORT_HTML);
  assert.deepEqual(result, { approvePct: 44, disapprovePct: 46, undecidedPct: 10 });
});

test('parseApproval — 옛 형식("잘하고 있다")도 받는다', () => {
  const result = parseApproval("44%가 긍정 평가했고 46%는 부정 평가했다는 요약 대신, '잘하고 있다' 33%, '잘못하고 있다' 58%");
  assert.equal(result.approvePct, 44); // 최신(2026) 형식이 먼저 매칭되면 그걸 우선
});

test('parseApproval — 둘 다 없으면 null(지어내지 않는다)', () => {
  assert.equal(parseApproval('관련 없는 문장입니다'), null);
});

test('parsePartySupport — 확실한 짝(당명 바로 뒤 %)만 뽑고, 무당층은 별도', () => {
  const result = parsePartySupport(REPORT_HTML);
  assert.deepEqual(result.parties, [
    { name: '더불어민주당', pct: 41 },
    { name: '국민의힘', pct: 25 },
    { name: '개혁신당', pct: 3 },
    { name: '조국혁신당', pct: 2 },
  ]);
  assert.equal(result.undecidedPct, 28);
  // "진보당, 이외 정당/단체 각각 1%"는 어느 쪽이 몇 %인지 원문만으론
  // 기계적으로 못 갈라서 일부러 뺐다 — parties에 진보당이 없어야 한다.
  assert.equal(result.parties.some((p) => p.name === '진보당'), false);
});

test('parseSurveyPeriod — 조사기간 문구를 뽑는다', () => {
  assert.equal(parseSurveyPeriod(REPORT_HTML), '2026년 8월 둘째 주(11~13일)');
});

test('parseReportTitle — <dt> 제목을 뽑는다', () => {
  assert.equal(
    parseReportTitle(REPORT_HTML),
    '데일리 오피니언 제671호(2026년 8월 2주) - 보완수사권 폐지, 부동산 세제개편안, 정책적 개입 수준, 주택 시장 안정화',
  );
});

test('parseGallupReport — 전체를 하나로 합친다', () => {
  const snapshot = parseGallupReport(REPORT_HTML, { seqNo: 1653 });
  assert.equal(snapshot.source, '한국갤럽');
  assert.equal(snapshot.reportUrl, 'https://www.gallup.co.kr/gallupdb/reportContent.asp?seqNo=1653');
  assert.equal(snapshot.approval.approvePct, 44);
  assert.equal(snapshot.partySupport.parties[0].name, '더불어민주당');
});
