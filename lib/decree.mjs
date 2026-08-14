/**
 * 법제처 국가법령정보 공동활용 — 법령 검색(target=law)·행정규칙 검색(target=admrul)
 * 응답(XML) 파서 + 이 앱 이벤트 형태로 변환. 순수 함수 — 네트워크를 모른다.
 *
 * `lsHistory`(law-history.mjs)와 달리 이 둘은 **type=XML이 유효하다**
 * (2026-08-14 실제 호출로 확인 — __fixtures__/law-search-sample.xml,
 * admrul-search-sample.xml. OC는 커밋에서 test로 치환했다 — 법제처 OC는
 * 사용자 이메일 아이디라 공개 저장소에 실값을 남기지 않는다).
 *
 * 국회사무처 의안(bills/*.json)과는 다른 축이다 — "법이 되기 전"(의안)이
 * 아니라 "법이 된 후"(법령 제정·개정·폐지, 대통령령·부령·행정규칙·고시 포함)를
 * 다룬다. category는 전부 '개정'으로 고정한다(PLAN.md §4 카테고리 표) — 이
 * 소스가 다루는 게 전부 "법이 이미 만들어진 뒤의 변경"이기 때문이다.
 *
 * ⚠️ 오너 지시(2026-08-14): "대통령령이 하나 추가됐다고 대통령령 카테고리를
 * 만들란 게 아니고, 그게 부동산 관련이면 부동산 게시판에 추가해야지" — 법령
 * 종류(대통령령·고시 등)는 카테고리로 안 쓰고, tags.mjs의 도메인 태그
 * (부동산·세금·환경 등)로 분류해 기존 "분야" 필터에 자연스럽게 섞인다.
 */
import { tagDecree } from './tags.mjs';

const LAW_TAGS = ['법령일련번호', '법령명한글', '법령구분명', '제개정구분명', '공포일자', '소관부처명', '법령상세링크'];
const ADMRUL_TAGS = ['행정규칙일련번호', '행정규칙명', '행정규칙종류', '제개정구분명', '발령일자', '소관부처명', '행정규칙상세링크'];

function fieldsFromBlock(xml, tags) {
  const out = {};
  for (const tag of tags) {
    const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`);
    const m = re.exec(xml);
    out[tag] = m ? (m[1] ?? m[2] ?? '').trim() : '';
  }
  return out;
}

/** "20260814" → "2026-08-14". 8자리가 아니면 빈 문자열 — 지어내지 않는다. */
function formatDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return '';
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * 법제처 링크는 절대경로("/DRF/...")로 오고 &amp; 로 이스케이프돼 있으며,
 * 우리 OC(사용자 이메일 아이디)가 쿼리에 그대로 박혀 있다. 이 저장소는
 * public이라 실제 OC를 그대로 저장하면 안 된다 — `OC=test`로 바꿔도 문서
 * 조회 자체는 그대로 된다(2026-08-14 실측, HTTP 200 동일 응답). 태그 값을
 * 지어내지 않는 이 앱의 원칙과 같은 이유로, 여기서도 "동작하는 척"이 아니라
 * 실제로 확인한 대체값만 쓴다.
 */
function absoluteLawUrl(path) {
  if (!path) return '';
  const url = path.replace(/&amp;/g, '&');
  return `https://www.law.go.kr${url.replace(/([?&])OC=[^&]*/, '$1OC=test')}`;
}

/** XML 응답 문자열 → <law id="N">...</law> 블록별 필드 객체 배열. */
export function parseLawSearchXml(xml) {
  const blocks = xml.match(/<law id="\d+">[\s\S]*?<\/law>/g) || [];
  return blocks.map((b) => fieldsFromBlock(b, LAW_TAGS));
}

/** XML 응답 문자열 → <admrul id="N">...</admrul> 블록별 필드 객체 배열. */
export function parseAdmrulSearchXml(xml) {
  const blocks = xml.match(/<admrul id="\d+">[\s\S]*?<\/admrul>/g) || [];
  return blocks.map((b) => fieldsFromBlock(b, ADMRUL_TAGS));
}

/** 법령 검색 결과 행 하나 → 이 앱의 피드 이벤트. */
export function eventFromLawRow(row) {
  const title = row['법령명한글'];
  const org = row['소관부처명'] || '';
  return {
    id: `LAW_${row['법령일련번호']}`,
    title,
    kind: row['법령구분명'], // 법률·대통령령·총리령·부령
    stage: row['제개정구분명'] || '', // 제정·일부개정·전부개정·타법개정·폐지
    category: '개정',
    date: formatDate(row['공포일자']),
    org,
    sourceUrl: absoluteLawUrl(row['법령상세링크']),
    tags: tagDecree({ org, title }),
  };
}

/** 행정규칙(훈령·예규·고시) 검색 결과 행 하나 → 이 앱의 피드 이벤트.
 *  종류가 "고시"면 tags.mjs KEYWORD_TAGS의 '고시'도 같이 잡힌다(제목에
 *  "고시"라는 말이 없어도 종류 자체가 고시이므로 확실하게 붙일 수 있다). */
export function eventFromAdmrulRow(row) {
  const kind = row['행정규칙종류']; // 훈령·예규·고시
  const title = row['행정규칙명'];
  const org = row['소관부처명'] || '';
  const tags = new Set(tagDecree({ org, title }));
  if (kind === '고시') tags.add('고시');
  return {
    id: `ADMRUL_${row['행정규칙일련번호']}`,
    title,
    kind,
    stage: row['제개정구분명'] || '',
    category: '개정',
    date: formatDate(row['발령일자']),
    org,
    sourceUrl: absoluteLawUrl(row['행정규칙상세링크']),
    tags: [...tags],
  };
}
