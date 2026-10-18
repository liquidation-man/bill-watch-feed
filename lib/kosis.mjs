/**
 * KOSIS(국가통계포털) 통계표 조회 파서.
 *
 * KOSIS 통계표 화면(statHtml)은 `/statHtml/html.do` 에 조회조건을 POST 하면
 * 피벗된 HTML 표를 JSON(`result`) 으로 돌려준다. 이 모듈은 그 요청 본문을 만들고
 * 응답 표를 세로형(tidy) 행으로 푸는 순수 함수만 담는다. 네트워크는 모른다.
 */

/**
 * 통계표 화면이 조회할 때 보내는 폼 필드 전체. 서버가 값이 비어 있어도 필드 자체는
 * 있어야 조회를 받아주므로, 화면이 보내는 그대로 둔다. 조회조건에 따라 달라지는
 * 필드만 buildStatQuery 가 덮어쓴다.
 */
const BASE_FIELDS = {
  jsonStr: "",
  language: "ko",
  file: "",
  analText: "",
  scrId: "",
  isFirst: "Y",
  contextPath: "/statHtml",
  ordColIdx: "",
  ordType: "",
  logSeq: "",
  vwCd: "MT_ZTITLE",
  connPath: "I2",
  pub: "2",
  pubLog: "0",
  viewKind: "",
  viewSubKind: "",
  doAnal: "N",
  analType: "",
  analCmpr: "",
  analTime: "",
  analCombo: "",
  originData: "",
  analClass: "",
  analItem: "",
  itm_id: "",
  mode: "",
  dataOpt: "ko",
  noSelect: "",
  view: "table",
  mobChk: "false",
  analWithCHGRATE: "",
  defaulPeriodArr: "",
  defaultClassArr: "",
  defaultItmArr: "",
  existStblCmmtKor: "Y",
  existStblCmmtEng: "N",
  selectAllFlag: "",
  selectTimeRangeCnt: "",
  funcPrdSe: "",
  isChangedDataOpt: "",
  itemMultiply: "",
  dimCo: "",
  dbUser: "NSI.",
  usePivot: "N",
  isChangedTableType: "N",
  isChangedPeriodCo: "N",
  isChangedPrdSort: "N",
  p_chkStatus: "",
  p_objVarId: "",
  p_lvl: "",
  p_logicFlag: "",
  p_classAllChkYn: "N",
  p_classAllSelectYn: "N",
  useAddFuncLog: "",
  chargerLvl: "",
  st: "",
  new_win: "",
  first_open: "",
  debug: "",
  maxCellOver: "",
  inheritYn: "N",
  originOrgId: "",
  originTblId: "",
  pubSeType: "",
  relChkOrgId: "",
  relChkTblId: "",
  highLightStr: "",
  markType: "",
  docId: "",
  itmNm: "",
  cmmtChk: "",
  labelOriginData: "원자료 함께 보기",
  diviSearchYn: "N",
  orderStr: "",
  startNum: "1",
  lastChk: "N",
  colClsAt: "N",
  analyzable: "true",
  tmprScrId: "",
  expDash: "Y",
  smblYn: "Y",
  CellUnit_remote: "Y",
  codeYn: "Y",
  downGridFileType: "sdmx",
  downGridCellMerge: "",
  downGridMeta: "Y",
  downGridCsvType: "UTF-8",
  downGridCsv: "Y",
  downGridTxtType: "UTF-8",
  downGridSdmxType: "data",
  downSort: "desc",
  pointType: "screen",
  downLargeFileType: "csv",
  exprYn: "Y",
  downLargeExprType: "2",
  downLargeSort: "desc",
  naviInfo: "tabTimeText",
  enableLevelExpr: "Y",
  enableParentLevel: "Y",
  enableCellUnit: "Y",
  enableWeight: "Y",
  compValue: "",
  compValue01: "",
  compValue02: "",
};

/**
 * `/statHtml/html.do` 로 보낼 요청 본문을 만든다.
 *
 * `classes` 는 분류축 순서대로 준다. 예를 들어 초고속인터넷 기술방식별 표는
 * `[{ id: 'A', items: ['A01', ...] }, { id: 'B', items: ['B01', ...] }]` 이고,
 * 각 분류는 요청에서 `OV_L1_ID`, `OV_L2_ID` 로 번호가 매겨진다.
 */
export function buildStatQuery({ orgId, tblId, listId, statId = '', periods, items, classes, prdSe = 'M', prdSort = 'asc' }) {
  if (!periods?.length) throw new Error('기간을 1개 이상 지정해야 한다');
  if (!items?.length) throw new Error('항목을 1개 이상 지정해야 한다');
  if (!classes?.length) throw new Error('분류를 1개 이상 지정해야 한다');

  const fieldList = [{ targetId: 'PRD', targetValue: '', prdValue: `${prdSe},${periods.join(',')},@` }];
  for (const item of items) fieldList.push({ targetId: 'ITM_ID', targetValue: item, prdValue: '' });
  classes.forEach((cls, index) => {
    for (const value of cls.items) fieldList.push({ targetId: `OV_L${index + 1}_ID`, targetValue: value, prdValue: '' });
  });

  const cells = items.length * periods.length * classes.reduce((total, cls) => total * cls.items.length, 1);
  return new URLSearchParams({
    ...BASE_FIELDS,
    prdSort,
    orgId,
    tblId,
    listId,
    statId,
    periodStr: prdSe,
    // 첫 분류축이 표측 기준이 된다.
    obj_var_id: classes[0].id,
    fieldList: JSON.stringify(fieldList),
    classAllArr: JSON.stringify(classes.map((cls, i) => ({ objVarId: cls.id, ovlSn: String(i + 1) }))),
    classSet: JSON.stringify(classes.map((cls, i) => ({ objVarId: cls.id, ovlSn: String(i + 1), visible: 'true' }))),
    // 분류를 표측(row), 시점을 표두(col)로 놓아야 조회가 성립한다.
    rowAxis: classes.map((cls) => cls.id).join(','),
    colAxis: 'TIME',
    endNum: String(cells),
    reqCellCnt: String(cells),
  });
}

/** 통계표 메타(g_jsonStatInfo)에서 수록기간·분류코드 같은 조회 준비물을 꺼낸다. */
export function parseStatMeta(html) {
  const raw = /var g_jsonStatInfo\s*=\s*'([\s\S]*?)';/.exec(html)?.[1];
  if (!raw) throw new Error('통계표 메타(g_jsonStatInfo)를 찾지 못했다');
  const meta = JSON.parse(raw);
  return {
    tblNm: meta.tblNm,
    orgNm: meta.orgNm,
    unitNm: meta.unitNm,
    listId: meta.paramInfo?.listId ?? '',
    statId: meta.statId ?? '',
    containPeriod: (meta.containPeriod ?? '').trim(),
    periodStr: meta.periodStr,
    periods: meta.periodInfo?.[`list${meta.periodStr?.[0] ?? 'M'}`] ?? [],
    items: (meta.itemInfo?.itmList ?? []).map((it) => ({ id: it.itmId, name: it.scrKor })),
    classes: (meta.classInfoList ?? []).map((cls) => ({
      id: cls.classId,
      name: cls.classNm,
      items: cls.itmList.map((it) => ({ id: it.itmId, name: it.scrKor })),
    })),
  };
}

const title = (attrs = '') => /title='([^']*)'/.exec(attrs)?.[1] ?? '';

/**
 * 피벗된 통계표 HTML을 `{ prd, keys, value }` 세로형 행으로 푼다.
 *
 * 표두는 시점(`name='M202512'`), 표측은 분류축이며, 시점마다 원데이터/가중치
 * 두 칸이 번갈아 나오므로 짝수번째(원데이터)만 취한다. 수록값이 없는 칸은 null.
 */
export function parseStatTable(html) {
  const rows = String(html).split(/<tr[^>]*>/i).slice(1);
  if (!rows.length) throw new Error('통계표 행을 찾지 못했다');

  const periods = [...rows[0].matchAll(/name='M(\d{6})'/g)].map((m) => m[1]);
  if (!periods.length) throw new Error('통계표 표두에서 시점을 찾지 못했다');

  const out = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
    // 표측 머리칸은 first / merge / first-end / merge-end 어느 쪽이든 trHeader 를 갖는다.
    const heads = cells.filter((cell) => /trHeader/.test(cell[1])).map((cell) => title(cell[1]));
    if (heads.length < 2 || heads.some((key) => !key)) continue;

    const values = cells
      .filter((cell) => /class='value'/.test(cell[1]))
      .map((cell) => /<input type='hidden' value='([^']*)'\/>/.exec(cell[2])?.[1] ?? '')
      .filter((_, index) => index % 2 === 0);
    if (values.length !== periods.length) {
      throw new Error(`행 ${heads.join('/')}: 값 ${values.length}개가 시점 ${periods.length}개와 맞지 않는다`);
    }

    periods.forEach((prd, index) => {
      out.push({ prd, keys: heads, value: values[index] === '' ? null : Number(values[index]) });
    });
  }
  if (!out.length) throw new Error('통계표에서 읽어낸 값이 없다');
  return { periods, rows: out };
}

/** `202512` → `2025.12`. KOSIS 화면 표기와 같은 모양으로 돌려준다. */
export function formatPeriod(prd) {
  const digits = String(prd);
  return digits.length === 6 ? `${digits.slice(0, 4)}.${digits.slice(4)}` : digits;
}
