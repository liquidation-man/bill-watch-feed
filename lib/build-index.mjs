/**
 * bills/*.json(국회 의안)·decrees/*.json(법령·행정규칙 최근 변경)·
 * laws/*.json(법령 누적 연혁, poll-law-history.mjs)을 합쳐 index.json에
 * 실릴 최신순 상위 N개를 만든다. 세 폴러가 각자 실행돼도(어느 쪽이 마지막에
 * 돌든) index.json이 항상 세 소스를 다 반영하도록, index.json을 쓰는
 * 스크립트는 매번 이 함수로 전부 다시 읽어 계산한다 — 한쪽이 다른 쪽이 넣은
 * 걸 덮어쓰지 않는다. 순수 함수.
 *
 * 세 소스 전부 같은 모양(billId·title·events[]·tags)이라 구분 없이 합친다.
 * laws/*.json은 이력이 수십 건일 수 있지만 특별 취급 안 한다 — 옛날 이벤트는
 * 어차피 최신 100건 밖으로 밀려난다(오늘 활동이 있는 한).
 *
 * ⚠️ 오너 지시(2026-08-14): "게시글이 여러 개면 안 되고, 눌렀을 때 이력이 쭉
 * 나와야지." — poll-law-history.mjs가 어떤 법령의 laws/LAWHIST_*.json을 한 번
 * 만들면, 그 법령의 decrees/LAW_*.json(같은 제목의 낱개 스냅샷)은 이제 낡은
 * 중복이다 — LAWHIST 쪽이 그 이벤트까지 포함한 전체 이력이라 정보가 더
 * 많다. 그래서 제목이 같으면 LAW_ 쪽을 피드에서 뺀다(파일 자체는 남겨둔다 —
 * poll-law-history.mjs가 다음 watchlist를 만들 때 참고하므로).
 */
export const FEED_LIMIT = 100;

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

/** bills·decrees·laws 배열(가변 개수)을 합쳐 최신순 상위 FEED_LIMIT개로 자른다. */
export function buildFeedItems(...entityLists) {
  const entities = entityLists.flat();
  const lawHistoryTitles = new Set(entities.filter((e) => e.billId?.startsWith('LAWHIST_')).map((e) => e.title));
  const deduped = entities.filter((e) => !(e.billId?.startsWith('LAW_') && lawHistoryTitles.has(e.title)));
  const items = deduped.flatMap(itemsFromEntity);
  return items.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, FEED_LIMIT);
}
