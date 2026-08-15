/**
 * bills/*.json(국회 의안)·decrees/*.json(법령·행정규칙 최근 변경)·
 * laws/*.json(법령 누적 연혁)·gwanbo/*.json(관보)·policy/*.json(정책브리핑)을 합쳐 index.json에
 * 실릴 최신순 전체 목록을 만든다. 세 폴러가 각자 실행돼도(어느 쪽이 마지막에
 * 돌든) index.json이 항상 세 소스를 다 반영하도록, index.json을 쓰는
 * 스크립트는 매번 이 함수로 전부 다시 읽어 계산한다 — 한쪽이 다른 쪽이 넣은
 * 걸 덮어쓰지 않는다. 순수 함수.
 *
 * 다섯 소스 전부 같은 모양(billId·title·events[]·tags)이라 구분 없이 합친다.
 *
 * ⚠️ 2026-08-14 — 예전엔 여기서 최신 100건으로 잘랐다("옛날 이벤트는 밀려난다"고
 * 적혀 있었다). 오너 지시로 그 캡을 없앴다("과거 데이터 싹다 넣도록") —
 * 실측 당시 1,100건이었고 법령이력(laws/*.json)이 누적될수록 계속 늘어난다.
 * bill-watch 쪽 필터 칩 숫자가 "일부만 반영된 총계"가 아니라 실제 전체를
 * 반영해야 한다는 오너 지적(2026-08-14, "뒤에 붙은 숫자가... 총숫자고")과
 * 같은 맥락 — 자르면 그 숫자 자체가 거짓이 된다. index.json이 계속 커진다는
 * 트레이드오프는 오너가 알고 선택했다(bill-watch App.tsx 캐시 주석도 같이
 * 고쳤다 — "아무리 쌓여도 안 커진다"는 이제 안 맞는 말이었다).
 */

/** {billId, title, events[], tags} 모양 파일 하나 → 이벤트별 피드 아이템 배열. */
function itemsFromEntity(entity) {
  return entity.events.map((e) => ({
    billId: entity.billId,
    title: entity.title,
    stage: e.stage,
    category: e.category,
    administration: e.administration,
    date: e.date,
    tags: entity.tags || [],
  }));
}

/** bills·decrees·laws·gwanbo·policy 배열을 합쳐 최신순 전체를 만든다. 자르지 않는다. */
export function buildFeedItems(...entityLists) {
  const entities = entityLists.flat();
  const lawHistoryTitles = new Set(entities.filter((e) => e.billId?.startsWith('LAWHIST_')).map((e) => e.title));
  const deduped = entities.filter((e) => !(e.billId?.startsWith('LAW_') && lawHistoryTitles.has(e.title)));
  const items = deduped.flatMap(itemsFromEntity);
  return items.sort((a, b) => (a.date < b.date ? 1 : -1));
}
