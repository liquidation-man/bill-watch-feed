#!/usr/bin/env node
/**
 * 한국갤럽 데일리 오피니언 최신호에서 대통령 직무수행 지지율·정당 지지율을
 * 받아 approval.json을 채운다(2026-08-14, 오너 지시 "대통령/당별 지지율" —
 * nesdc.go.kr엔 수치 자체가 없어서 조사기관 홈페이지를 직접 본다, PLAN.md
 * §여론조사 지지율 절 참고). 한국갤럽 하나만 하는 파일럿이다 — 다른
 * 조사기관은 형식이 달라 각자 파서가 필요하므로 나중 확장.
 *
 * API가 아니라 공개 HTML 페이지라 별도 인증 키가 없다. euc-kr로 응답하므로
 * TextDecoder로 직접 디코드한다(이 프로젝트엔 iconv 류 의존성이 없다).
 *
 * 사용: node scripts/poll-approval.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGallupReport } from '../lib/approval.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_PATH = join(root, 'approval.json');
const LIST_URL = 'https://www.gallup.co.kr/gallupdb/report.asp';
const REPORT_URL_BASE = 'https://www.gallup.co.kr/gallupdb/reportContent.asp';

async function fetchEucKr(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`갤럽 HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder('euc-kr').decode(buf);
}

/** 목록 페이지에서 "데일리 오피니언"의 가장 큰 seqNo를 찾는다(최신호).
 *  못 찾으면 null — 지어내지 않는다. */
function latestDailyOpinionSeqNo(listHtml) {
  const seqNos = [];
  const rowRe = /fn_viewContents\('(\d+)'\)[^>]*>\s*데일리 오피니언/g;
  let m;
  while ((m = rowRe.exec(listHtml)) !== null) seqNos.push(Number(m[1]));
  if (seqNos.length === 0) return null;
  return Math.max(...seqNos);
}

async function main() {
  const listHtml = await fetchEucKr(LIST_URL);
  const seqNo = latestDailyOpinionSeqNo(listHtml);
  if (seqNo == null) {
    console.error('poll-approval: 목록에서 데일리 오피니언 최신호를 못 찾았다 — 사이트 구조가 바뀌었을 수 있다');
    process.exit(1);
  }

  const reportHtml = await fetchEucKr(`${REPORT_URL_BASE}?seqNo=${seqNo}`);
  const snapshot = parseGallupReport(reportHtml, { seqNo });

  if (!snapshot.approval && !snapshot.partySupport) {
    console.error('poll-approval: 지지율·정당지지도 둘 다 못 뽑았다 — 저장하지 않는다(지어내지 않는다)');
    process.exit(1);
  }

  await mkdir(root, { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({ ...snapshot, fetchedAt: new Date().toISOString() }, null, 2) + '\n',
  );
  console.log(`poll-approval: ${snapshot.reportTitle || `seqNo=${seqNo}`} 저장 완료`);
}

await main();
