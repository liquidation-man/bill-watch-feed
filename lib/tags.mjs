/**
 * 1차 규칙 기반 태깅 — PLAN.md "다차원 카테고리" 설계의 1단계.
 *
 * 오너가 예시로 든 축(법·부동산·세금·특정사업·고시·대통령·민주당) 중, 지금
 * 갖고 있는 국회사무처 데이터(소관위원회·법령명)로 **확실하게 판단 가능한 것만**
 * 규칙으로 매핑한다. 대통령·민주당(의원-정당 매핑 데이터 없음)은 손대지 않는다
 * — 억지로 끼워 맞추지 않는다(PLAN.md §4 "지금 억지로 끼워 맞추지 않는다"와 동일 원칙).
 *
 * 여기서 안 잡히면 태그가 빈 배열이다 — 그게 정상이다. 2차(LLM 보정)는 이
 * 미분류분만 다룬다(아직 미구현).
 */

// 실제 bills/*.json 에 나타난 소관위원회 중, 도메인이 분명한 것만 매핑한다
// (2026-08-14, 69건 실물 데이터 기준). 애매한 위원회(정무위·행안위 등)는 뺀다.
export const COMMITTEE_TAGS = {
  재정경제기획위원회: ['세금'],
  국토교통위원회: ['부동산'],
  법제사법위원회: ['법'],
};

const KEYWORD_TAGS = [
  { tag: '세금', re: /세법|과세|조세|관세/ },
  { tag: '부동산', re: /주택|부동산|정비법/ },
  { tag: '고시', re: /고시/ },
  { tag: '특정사업', re: /[가-힣0-9]+사업\s*(추진|지원)/ },
];

/** 의안 하나(committee·title)에서 확실한 도메인 태그만 뽑는다. 순수 함수. */
export function tagBill(bill) {
  const tags = new Set();
  for (const t of COMMITTEE_TAGS[bill.committee] || []) tags.add(t);
  for (const { tag, re } of KEYWORD_TAGS) {
    if (re.test(bill.title)) tags.add(tag);
  }
  return [...tags];
}
