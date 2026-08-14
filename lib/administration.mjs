/**
 * 이벤트 날짜 → 그 시점의 정부(대통령 임기) 매핑. 오너 지시(2026-08-14)로
 * "어느 정부에서 있었던 일인지" 축을 추가한다.
 *
 * 날짜는 위키백과로 실측 확인했다(2026-08-14) — 박근혜 파면 2017-03-10,
 * 문재인 취임 2017-05-10, 윤석열 파면 2025-04-04, 이재명 취임 2025-06-04.
 * 파면·궐위로 대통령 권한대행이 서던 공백기(황교안 2017-03-11~05-09,
 * 한덕수 등 2025-04-05~06-03)는 특정 정부 소속이 아니다 — null. 지어내지 않는다.
 */
const ADMINISTRATIONS = [
  { name: '이명박정부', start: '2008-02-25', end: '2013-02-24' },
  { name: '박근혜정부', start: '2013-02-25', end: '2017-03-10' },
  { name: '문재인정부', start: '2017-05-10', end: '2022-05-09' },
  { name: '윤석열정부', start: '2022-05-10', end: '2025-04-04' },
  { name: '이재명정부', start: '2025-06-04', end: null }, // 현재 진행 중
];

/** YYYY-MM-DD 문자열 비교로 판정한다 — 이 저장소 전체가 이 날짜 형식을 쓴다. */
export function administrationFromDate(dateStr) {
  if (!dateStr) return null;
  for (const admin of ADMINISTRATIONS) {
    if (dateStr >= admin.start && (admin.end == null || dateStr <= admin.end)) {
      return admin.name;
    }
  }
  return null; // 권한대행 공백기이거나 2008-02-25 이전 — 지어내지 않는다
}
