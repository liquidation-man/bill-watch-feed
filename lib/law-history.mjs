/**
 * 법제처 국가법령정보 공동활용 — 법령 연혁 목록 조회(target=lsHistory) 응답 파서.
 *
 * 이 API는 `type=HTML`만 유효하다 — JSON/XML을 시도했더니 둘 다 HTML 래퍼
 * 페이지가 돌아왔다(PLAN.md "법제처 법령연혁 API — 실제 호출 검증" 절,
 * 2026-08-14 실측). 그래서 JSON.parse가 아니라 HTML 테이블을 정규식으로 긁는다.
 *
 * 표 구조(실물 확인, __fixtures__/lshistory-sample.html)는 <tr> 하나당
 * <td> 9개 고정 순서다: 순번·법령명(링크)·소관부처·개정구분·법종구분·
 * 공포번호·공포일자·시행일자·현행연혁. 링크의 MST가 그 버전의 고유 식별자다.
 */

const TR_RE = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const TD_RE = /<td[^>]*>([\s\S]*?)<\/td>/g;
const A_RE = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
const MST_RE = /[?&]MST=(\d+)/;

function stripTags(html) {
  return html.replace(/<[^>]*>/g, '').trim();
}

/** HTML 문자열 하나를 법령 연혁 행 배열로 바꾼다. 순수 함수 — 네트워크를 모른다. */
export function parseLawHistoryHtml(html) {
  const rows = [];
  let trMatch;
  while ((trMatch = TR_RE.exec(html)) !== null) {
    const cells = [];
    let tdMatch;
    TD_RE.lastIndex = 0;
    const trBody = trMatch[1];
    while ((tdMatch = TD_RE.exec(trBody)) !== null) {
      cells.push(tdMatch[1]);
    }
    // 헤더 행(th만 있는 행)이나 형식이 다른 행은 조용히 건너뛴다 — 9개가 아니면 데이터 행이 아니다.
    if (cells.length !== 9) continue;

    const linkMatch = A_RE.exec(cells[1]);
    if (!linkMatch) continue;
    const href = linkMatch[1].replace(/&amp;/g, '&');
    const mstMatch = MST_RE.exec(href);

    rows.push({
      title: stripTags(linkMatch[2]),
      mst: mstMatch ? mstMatch[1] : null,
      ministry: stripTags(cells[2]),
      stage: stripTags(cells[3]), // 제정·일부개정·타법개정·폐지 등
      lawType: stripTags(cells[4]), // 법률·대통령령 등
      promulgationNo: stripTags(cells[5]),
      promulgationDate: stripTags(cells[6]),
      effectiveDate: stripTags(cells[7]),
      isCurrent: stripTags(cells[8]) === '현행',
    });
  }
  return rows;
}

/** 법령명을 슬러그로 정규화 — "OO법 일부개정법률안" 같은 접미사가 여긴 원래 없지만, 공백만 제거한다. */
export function slugify(title) {
  return title.replace(/\s+/g, '');
}
