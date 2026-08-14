/**
 * stage(소스별 세분화, 기계 판독용) → category(사용자 노출용 5종 고정) 매핑.
 * PLAN.md §4 "카테고리 체계 재정비" 설계를 그대로 코드화한다.
 *
 * 개정·정책 카테고리는 담당 stage가 아직 없다(법제처 법령연혁·정책브리핑
 * API 키 미확보 — PLAN.md 참고) — 매핑을 지어내지 않고 비워 둔다.
 */
const STAGE_TO_CATEGORY = {
  발의: '입법안',
  위원회상정: '입법',
  위원회심사: '입법',
  법사위상정: '입법',
  법사위심사: '입법',
  본회의의결: '의결',
};

/** 매핑이 없는 stage는 null — 카테고리 미정을 지어내지 않는다. */
export function categoryFromStage(stage) {
  return STAGE_TO_CATEGORY[stage] ?? null;
}
