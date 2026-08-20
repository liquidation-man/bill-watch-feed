#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const OUTPUT_PATH = join(root, 'pledge-status.json');
const NEC_BASE = 'https://policy.nec.go.kr';
const LIST_URL = `${NEC_BASE}/plc/commiment/initUELCommimentListPresident.do`;
const MAIN_URL = `${NEC_BASE}/plc/commiment/initUELCommiment.do?menuId=WINNR8`;

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function post(url, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'user-agent': 'Mozilla/5.0',
      referer: MAIN_URL,
    },
    body,
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

function extractAction(html) {
  const match = html.match(/<form id="frmPromiseView"[^>]*action\s*=\s*"([^"]+)"/);
  if (!match) throw new Error('promise popup form action not found');
  return match[1].startsWith('http') ? match[1] : `${NEC_BASE}${match[1]}`;
}

function promiseSeqFromList(list) {
  const row = list.find((item) => item.hbjname === '이재명') ?? list[0];
  if (!row?.fileinfo) throw new Error('이재명 당선인 10대공약 fileinfo not found');
  for (const part of row.fileinfo.split(',')) {
    const cols = part.split('||');
    if (cols[0] === '10대공약' && cols[2]) return { seq: cols[2], row };
  }
  throw new Error('10대공약 OCR sequence not found');
}

function parsePledges(html) {
  const text = stripTags(html);
  const start = text.indexOf('제21대 대통령선거');
  const slice = start >= 0 ? text.slice(start) : text;
  const pattern = /(\d+)\.\s*\[([^\]]+)\]\s*([^]+?)\s*공약 내용 펼치기/g;
  const pledges = [];
  for (const match of slice.matchAll(pattern)) {
    const title = match[3].trim();
    if (!title) continue;
    pledges.push({
      id: `lee-2025-${match[1].padStart(2, '0')}`,
      title,
      category: match[2].trim(),
      status: '추적 전',
      sourceUrl: MAIN_URL,
    });
  }
  if (pledges.length === 0) throw new Error('parsed pledge count is zero');
  return pledges;
}

async function main() {
  const listText = await post(LIST_URL, {
    sgId: '20250603',
    subSgId: '120250603',
    pageIndex: '1',
    hSggId: 'ALL',
    chkSgTypecode: '',
  });
  const { list } = JSON.parse(listText);
  const { seq } = promiseSeqFromList(list);

  const popupShell = await post(extractAction(await fetch(MAIN_URL, { headers: { 'user-agent': 'Mozilla/5.0' } }).then((r) => r.text())), {
    ocrCnvrSeqNo: seq,
    menuName: '제21대 대통령선거',
  });
  const viewHtml = await post(extractAction(popupShell), {
    ocrCnvrSeqNo: seq,
    menuName: '제21대 대통령선거',
  });
  const pledges = parsePledges(viewHtml);
  const snapshot = {
    source: '중앙선거관리위원회 정책·공약마당 제21대 대통령선거 당선인 10대공약',
    sourceUrl: MAIN_URL,
    updatedAt: new Date().toISOString(),
    note: '공약 목록 원천만 연결했다. 이행 여부는 별도 검증 원천이 연결될 때까지 추정하지 않는다.',
    pledges,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`poll-pledges: ${pledges.length}개 공약 저장`);
}

main().catch((error) => {
  console.error(`poll-pledges: ${error.message}`);
  process.exit(1);
});
