#!/usr/bin/env node
/**
 * KOSIS 「초고속인터넷 기술방식별·사업자별 회선 수」(orgId=127, tblId=DT_127006_A004)를
 * 원표 전 기간 내려받아 kosis/broadband-lines.{json,csv} 로 저장한다.
 *
 * KOSIS 공유서비스 API는 인증키가 필요해서, 통계표 화면이 쓰는 조회 경로를 그대로 탄다.
 *   1) statHtmlContent.do 로 통계표 메타(수록기간·분류코드)를 받고
 *   2) html.do 에 조회조건을 POST 해 피벗된 표를 받아
 *   3) 세로형으로 풀어 저장한다.
 *
 * 사용법: node scripts/fetch-kosis-broadband.mjs [--periods 202412,202512]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStatQuery, formatPeriod, parseStatMeta, parseStatTable } from '../lib/kosis.mjs';

const ORG_ID = '127';
const TBL_ID = 'DT_127006_A004';
const BASE = 'https://kosis.kr/statHtml';
const UA = 'bill-watch-feed/1.0';
const TIMEOUT = 90_000;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = join(root, 'kosis');

/** KOSIS는 간헐적으로 연결을 끊는다. 같은 쿠키를 유지한 채 지수 백오프로 다시 건다. */
const cookies = new Map();

function cookieHeader() {
  return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
}

function rememberCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

async function request(url, { body } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          'User-Agent': UA,
          Cookie: cookieHeader(),
          Referer: `${BASE}/statHtml.do?orgId=${ORG_ID}&tblId=${TBL_ID}`,
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' } : {}),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT),
      });
      rememberCookies(res);
      if (!res.ok) throw new Error(`KOSIS HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    }
  }
  throw lastError;
}

const metaHtml = await request(
  `${BASE}/statHtmlContent.do?orgId=${ORG_ID}&tblId=${TBL_ID}&pub=2&conn_path=I2&vw_cd=MT_ZTITLE&language=ko&dbUser=NSI.&tabYn=Y&itm_id=&obj_var_id=A`,
);
const meta = parseStatMeta(metaHtml);
console.log(`${meta.tblNm} — ${meta.containPeriod} (단위: ${meta.unitNm})`);

const wanted = process.argv.includes('--periods')
  ? process.argv[process.argv.indexOf('--periods') + 1].split(',')
  : meta.periods;
const periods = meta.periods.filter((prd) => wanted.includes(prd));
if (!periods.length) throw new Error('원표 수록기간과 겹치는 시점이 없다');

const body = buildStatQuery({
  orgId: ORG_ID,
  tblId: TBL_ID,
  listId: meta.listId,
  statId: meta.statId,
  periods,
  items: meta.items.map((item) => item.id),
  classes: meta.classes.map((cls) => ({ id: cls.id, items: cls.items.map((item) => item.id) })),
});

const payload = JSON.parse(await request(`${BASE}/html.do`, { body }));
if (!payload.result) throw new Error(`통계표 조회 실패: ${payload.errMsg ?? '응답에 result 없음'}`);
const { rows } = parseStatTable(payload.result.join(''));

const records = rows.map(({ prd, keys, value }) => ({
  period: formatPeriod(prd),
  year: Number(prd.slice(0, 4)),
  month: Number(prd.slice(4)),
  carrier: keys[0],
  technology: keys[1],
  lines: value,
})).sort((a, b) => a.year - b.year || a.month - b.month);

// KOSIS가 주는 '합계'와 사업자별 합이 어긋나면 조용히 저장하지 않는다.
const key = (r) => `${r.period}|${r.technology}`;
const totals = new Map(records.filter((r) => r.carrier === '합계').map((r) => [key(r), r.lines]));
const sums = new Map();
for (const r of records.filter((r) => r.carrier !== '합계')) sums.set(key(r), (sums.get(key(r)) ?? 0) + (r.lines ?? 0));
const mismatched = [...totals].filter(([k, total]) => total !== null && sums.get(k) !== total);
if (mismatched.length) throw new Error(`합계 불일치 ${mismatched.length}건: ${mismatched.slice(0, 3).map(([k]) => k).join(', ')}`);

await mkdir(OUTPUT_DIR, { recursive: true });
const dataset = {
  source: {
    provider: 'KOSIS 국가통계포털',
    producer: meta.orgNm,
    table: meta.tblNm,
    orgId: ORG_ID,
    tblId: TBL_ID,
    url: `https://kosis.kr/statHtml/statHtml.do?orgId=${ORG_ID}&tblId=${TBL_ID}&conn_path=I2`,
    unit: meta.unitNm,
    containPeriod: meta.containPeriod,
    fetchedAt: new Date().toISOString().slice(0, 10),
  },
  records,
};
await writeFile(join(OUTPUT_DIR, 'broadband-lines.json'), `${JSON.stringify(dataset, null, 2)}\n`);
const csv = ['period,year,month,carrier,technology,lines']
  .concat(records.map((r) => [r.period, r.year, r.month, r.carrier, r.technology, r.lines ?? ''].join(',')))
  .join('\n');
await writeFile(join(OUTPUT_DIR, 'broadband-lines.csv'), `${csv}\n`);

console.log(`시점 ${periods.length}개 · ${records.length}행 저장 (합계 검증 ${totals.size}건 통과)`);
