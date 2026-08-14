/**
 * 의안 백필(과거로 훑어 채우기)의 순수 로직 — 네트워크·파일시스템을 모른다.
 * poll.mjs의 "최신 50건"은 앞으로만 쌓이고 과거는 영영 안 잡힌다(2026-08-15
 * 오너 지적 — 주가누르기방지법 등 실존 법안이 안 보인 원인). 오너 지시:
 * "윤석열 정부 취임일부터 현재까지" — administration.mjs 기준 2022-05-10.
 *
 * 그 날짜는 21대 국회 임기(2020-05-30~2024-05-29) 중이라 AGE=21·22 둘 다
 * 조회해야 한다. 22대는 국회 임기 자체가 컷오프 이후라 전체를 다 담고,
 * 21대는 컷오프 이후분만 남긴다. 규모가 커서(22대만 17,200건+) 한 회차에
 * 페이지 수를 못박고 state.json으로 다음 회차에 이어간다(법령연혁 폴러의
 * MAX_QUERIES_PER_RUN과 같은 절제 원칙 — 스크립트는 scripts/backfill-bills.mjs).
 */

/** AGE=21 페이지에서만 컷오프 이전 행을 걸러낸다 — 응답이 최신순이라 걸러진
 *  지점 이후는 더 볼 필요가 없다(hitCutoff=true로 알린다). 22대는 임기 자체가
 *  컷오프 이후라 그대로 다 남긴다. */
export function splitPageByCutoff(rows, age, cutoffDate) {
  if (age !== 21) return { keep: rows, hitCutoff: false };
  const keep = [];
  for (const r of rows) {
    if (r.PROPOSE_DT && r.PROPOSE_DT < cutoffDate) return { keep, hitCutoff: true };
    keep.push(r);
  }
  return { keep, hitCutoff: false };
}

/** 이번 페이지 처리 결과(비었는지·컷오프에 걸렸는지)로 다음 state를 정한다.
 *  지금 AGE가 끝났으면 ages 목록의 다음 AGE로, 마지막 AGE까지 끝났으면 done. */
export function advanceBackfillState({ age, pIndex, ages, rowsEmpty, hitCutoff }) {
  if (rowsEmpty || hitCutoff) {
    const ageIndex = ages.indexOf(age);
    if (ageIndex + 1 < ages.length) return { age: ages[ageIndex + 1], pIndex: 1, done: false };
    return { age, pIndex, done: true };
  }
  return { age, pIndex: pIndex + 1, done: false };
}
