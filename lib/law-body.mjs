/**
 * 법제처 국가법령정보 공동활용 — 법령 본문 조회(target=law, lawService.do,
 * lawSearch.do와 다른 엔드포인트) 응답(XML) 파서. 검색 결과가 아니라 법령
 * 하나의 전체 조문을 준다.
 *
 * ⚠️ 오너 지시(2026-08-14, "조직도 같은 것도 없네")에 대한 답 — 별도
 * "조직도" API는 못 찾았지만, 각 부처의 "OO부와 그 소속기관 직제"
 * 대통령령이 그 부처의 조직(국·과·소속기관) 법적 근거다. 이 문서의 조문을
 * 그대로 보여주는 게 지어내지 않고 조직도를 제공하는 방법이다 — 표나
 * 트리 구조로 재가공하지 않는다(조문 문장 자체가 원문이자 유일하게 확실한
 * 근거).
 *
 * 실물 확인(2026-08-14, __fixtures__/law-body-sample.xml — "국방부와 그
 * 소속기관 직제"): 조문 안에 항·호가 별도 태그 없이 <조문내용> CDATA 하나에
 * 그대로 들어 있다. 그대로 옮긴다 — 문단을 임의로 쪼개지 않는다.
 */

function fieldsFromBlock(xml, tags) {
  const out = {};
  for (const tag of tags) {
    const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`);
    const m = re.exec(xml);
    out[tag] = m ? (m[1] ?? m[2] ?? '').trim() : '';
  }
  return out;
}

const ARTICLE_TAGS = ['조문번호', '조문여부', '조문제목', '조문내용'];

/** 법령 본문 XML → {title, ministry, articles[]}. articles는 "장" 제목(전문)도 포함한다. */
export function parseLawBodyXml(xml) {
  const title = fieldsFromBlock(xml, ['법령명_한글'])['법령명_한글'];
  const ministry = (/<소관부처[^>]*>([^<]*)<\/소관부처>/.exec(xml) || [])[1] || '';

  const blocks = xml.match(/<조문단위[^>]*>[\s\S]*?<\/조문단위>/g) || [];
  const articles = blocks
    .map((b) => fieldsFromBlock(b, ARTICLE_TAGS))
    .filter((a) => a['조문내용']) // 내용 없는 조문(삭제된 조 등)은 뺀다 — 빈 조를 지어내지 않는다
    .map((a) => ({
      number: a['조문번호'],
      isChapterHeading: a['조문여부'] === '전문',
      title: a['조문제목'] || '',
      content: a['조문내용'],
    }));

  return { title, ministry, articles };
}
