/**
 * 대통령 직무수행 지지율·정당 지지율 — 한국갤럽 데일리 오피니언 파일럿
 * (2026-08-14, 오너 지시: "대통령/당별 지지율" 홈화면 요청).
 *
 * ⚠️ 이 조사기관 하나만 다룬다. `nesdc.go.kr`(중앙선거여론조사심의위원회)은
 * 조사 "방법론 등록·공표시점 신고" 시스템이지 수치 자체를 공표하지 않는다
 * (2026-08-14 실물 확인 — 상세 페이지의 "여론조사결과" 항목엔 공표 매체명과
 * 질문지 PDF만 있고 정당별 % 표가 없다). 실제 수치의 출처는 각 조사기관
 * 자신의 홈페이지이고, 기관마다 형식이 달라 기관별로 따로 파서가 필요하다
 * — 이번엔 한국갤럽만 만든다. 다른 기관은 나중 확장.
 *
 * 한국갤럽 리포트는 PDF가 아니라 읽을 수 있는 HTML(euc-kr)이라 API 없이도
 * 정규식으로 긁을 수 있다. 문장 안에 숫자가 자연어로 섞여 있어서, "당명
 * 바로 뒤에 %가 오는" 확실한 짝만 뽑는다 — "진보당, 이외 정당/단체 각각
 * 1%"처럼 %가 여러 항목에 걸쳐 있는 건 어느 항목이 정확히 몇 %인지 원문만
 * 봐선 기계적으로 못 가르므로 지어내지 않고 뺀다(이 앱의 기존 원칙과 동일).
 */

const UNDECIDED_RE = /무당\s*\(無黨\)\s*층\s*(\d+(?:\.\d+)?)%/;
const PARTY_PAIR_RE = /([가-힣]+(?:\/[가-힣]+)?)\s*(\d+(?:\.\d+)?)%/g;
// "진보당, 이외 정당/단체 각각 1%"처럼 %가 여러 항목에 걸린 문구에서
// 숫자 바로 앞 단어가 정당명이 아니라 "각각" 같은 부사인 경우 — 정당명이
// 아니므로 지어내지 않고 뺀다.
const NON_PARTY_WORDS = new Set(['각각', '이상', '이하', '기준', '최대', '최소']);

/** "...현재 지지하는 정당은(...) 더불어민주당 41%, ... 무당(無黨)층 28%다." 문단에서
 *  정당별 지지율과 무당층을 뽑는다. 문단을 못 찾으면 null — 지어내지 않는다. */
export function parsePartySupport(text) {
  const m = /현재 지지하는 정당은[\s\S]*?무당\s*\(無黨\)\s*층\s*\d+(?:\.\d+)?%(?:다)?\.?/.exec(text);
  if (!m) return null;
  const paragraph = m[0];
  const undecidedMatch = UNDECIDED_RE.exec(paragraph);
  const withoutUndecided = paragraph.replace(UNDECIDED_RE, '');

  const parties = [];
  let pm;
  PARTY_PAIR_RE.lastIndex = 0;
  while ((pm = PARTY_PAIR_RE.exec(withoutUndecided)) !== null) {
    if (NON_PARTY_WORDS.has(pm[1])) continue;
    parties.push({ name: pm[1], pct: Number(pm[2]) });
  }
  return {
    parties,
    undecidedPct: undecidedMatch ? Number(undecidedMatch[1]) : null,
  };
}

/** "44%가 긍정 평가했고 46%는 부정 평가했다. 10%는 의견을 유보했다." 문장에서
 *  긍정·부정·유보율을 뽑는다. 옛 리포트(2023년 이전)는 "'잘하고 있다' 33%"
 *  형식이라 그것도 같이 받는다. 못 찾으면 null. */
export function parseApproval(text) {
  const modern = /(\d+(?:\.\d+)?)%\s*(?:가|는)?\s*긍정\s*평가(?:했고|하고|했으며)?\s*(\d+(?:\.\d+)?)%\s*(?:는|가)?\s*부정\s*평가/.exec(text);
  if (modern) {
    const reserved = /(\d+(?:\.\d+)?)%\s*는\s*의견을\s*유보/.exec(text);
    return { approvePct: Number(modern[1]), disapprovePct: Number(modern[2]), undecidedPct: reserved ? Number(reserved[1]) : null };
  }
  const legacy = /'?잘하고\s*있다'?\s*(\d+(?:\.\d+)?)%,\s*'?잘못하고\s*있다'?\s*(\d+(?:\.\d+)?)%/.exec(text);
  if (legacy) {
    return { approvePct: Number(legacy[1]), disapprovePct: Number(legacy[2]), undecidedPct: null };
  }
  return null;
}

/** "2026년 8월 둘째 주(11~13일)" 같은 조사기간 문구를 뽑는다. 못 찾으면 빈 문자열. */
export function parseSurveyPeriod(text) {
  const m = /(\d{4}년\s*\d{1,2}월\s*[^(]+?주\([^)]+\))/.exec(text);
  return m ? m[1] : '';
}

/** <dt>...</dt>에 든 리포트 제목("데일리 오피니언 제671호(2026년 8월 2주) - ...")을 뽑는다. */
export function parseReportTitle(html) {
  const m = /<dt>([^<]*데일리 오피니언[^<]*)<\/dt>/.exec(html);
  return m ? m[1].trim() : '';
}

/** 리포트 HTML(euc-kr→utf-8 변환된 것) 하나를 이 앱이 쓸 스냅샷 하나로 바꾼다.
 *  섹션을 못 찾으면 그 섹션은 null — 지어내지 않는다. 순수 함수. */
export function parseGallupReport(html, { seqNo }) {
  const approval = parseApproval(html);
  const partySupport = parsePartySupport(html);
  return {
    source: '한국갤럽',
    reportTitle: parseReportTitle(html),
    reportUrl: `https://www.gallup.co.kr/gallupdb/reportContent.asp?seqNo=${seqNo}`,
    period: parseSurveyPeriod(html),
    approval,
    partySupport,
  };
}
