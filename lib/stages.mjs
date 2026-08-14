/**
 * 열린국회정보 "의안정보 통합 API"(서비스ID nzmimeepazxkubdpn) 응답 한 행을
 * 이벤트 배열로 바꾼다. 순수 함수 — 네트워크·파일시스템을 모른다.
 *
 * 필드는 2026-08-13 실제 API 호출로 확인했다(추측 아님):
 *   PROPOSE_DT              발의일
 *   CMT_PRESENT_DT / CMT_PROC_DT / CMT_PROC_RESULT_CD    소관위 상정/심사/결과
 *   LAW_PRESENT_DT / LAW_PROC_DT / LAW_PROC_RESULT_CD    법사위 상정/심사/결과
 *   PROC_DT / PROC_RESULT   본회의 처리일/결과
 *
 * 값이 없는 필드는 null 로 온다. 값이 있는 단계만 이벤트로 만든다 — 아직
 * 안 지난 단계를 "예정"으로 지어내지 않는다.
 *
 * 위원회·본회의 단계는 국회 인터넷의사중계시스템(webcast.go.kr)이 실시간
 * 생중계한다(2026-08-14 확인). 위원회별 딥링크를 주는 API는 없어서
 * 메인 페이지 링크만 붙인다 — "오늘의 생중계"에서 사람이 직접 찾아야 한다.
 */
const WEBCAST_URL = 'https://www.webcast.go.kr/';
const MEETING_STAGES = new Set(['위원회상정', '위원회심사', '법사위상정', '법사위심사', '본회의의결']);

export function stagesFromRecord(r) {
  const stages = [];
  const push = (stage, date, detail) => {
    if (!date) return;
    const event = { stage, date, detail: detail || '', sourceUrl: r.DETAIL_LINK || '' };
    if (MEETING_STAGES.has(stage)) event.webcastUrl = WEBCAST_URL;
    stages.push(event);
  };
  push('발의', r.PROPOSE_DT, r.PROPOSER ? `${r.PROPOSER} 발의` : '');
  push('위원회상정', r.CMT_PRESENT_DT, r.COMMITTEE || '');
  push('위원회심사', r.CMT_PROC_DT, r.CMT_PROC_RESULT_CD || '');
  push('법사위상정', r.LAW_PRESENT_DT, '');
  push('법사위심사', r.LAW_PROC_DT, r.LAW_PROC_RESULT_CD || '');
  push('본회의의결', r.PROC_DT, r.PROC_RESULT || '');
  return stages;
}

/** 본회의까지 끝나서 더 이상 재조회할 필요가 없는 의안인지. */
export function isConcluded(record) {
  return Boolean(record.PROC_DT);
}

/** API 행을 이 앱의 bills/<id>.json 형태로 바꾼다. */
export function toBill(record) {
  return {
    billId: record.BILL_ID,
    title: record.BILL_NAME,
    committee: record.COMMITTEE || '',
    proposer: record.PROPOSER || '',
    assemblyTerm: Number(record.AGE),
    events: stagesFromRecord(record),
  };
}
