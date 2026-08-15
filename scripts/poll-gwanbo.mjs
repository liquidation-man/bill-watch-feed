#!/usr/bin/env node
/** 최근 7일 전자관보 목차를 읽어 gwanbo/*.json과 통합 index.json을 갱신한다. */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeedItems } from '../lib/build-index.mjs';
import { gwanboFromRow, parseGwanboSearchJson } from '../lib/gwanbo.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = join(root, 'gwanbo');
const INDEX_PATH = join(root, 'index.json');
const SOURCE_DIRS = ['bills', 'decrees', 'laws', 'gwanbo', 'policy'];
const DAYS = 7;

async function loadDir(name) {
  const dir = join(root, name);
  const files = await readdir(dir).catch(() => []);
  return Promise.all(files.filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8'))));
}

async function fetchDay(date) {
  const compact = date.toISOString().slice(0, 10).replaceAll('-', '');
  const body = new URLSearchParams({ mode: 'daily', index: 'gwanbo', query: `keyword_field_regdate:[${compact} TO ${compact}] AND keyword_category_order:(@@ORDER_NUM)`, pQuery_tmp: '', pageNo: '1', listSize: '10000', sort: '' });
  const res = await fetch('https://gwanbo.go.kr/SearchRestApi.jsp', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'bill-watch-feed/1.0' }, body, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`전자관보 HTTP ${res.status}`);
  return parseGwanboSearchJson(await res.text());
}

await mkdir(OUTPUT_DIR, { recursive: true });
const tracked = new Map((await loadDir('gwanbo')).map((item) => [item.billId, item]));
let added = 0;
for (let offset = 0; offset < DAYS; offset += 1) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offset);
  for (const row of await fetchDay(date)) {
    const entity = gwanboFromRow(row);
    if (tracked.has(entity.billId)) continue;
    tracked.set(entity.billId, entity);
    await writeFile(join(OUTPUT_DIR, `${entity.billId}.json`), `${JSON.stringify(entity, null, 2)}\n`);
    added += 1;
  }
}
if (added === 0) {
  console.log('poll-gwanbo: 새 항목 없음');
} else {
  const lists = await Promise.all(SOURCE_DIRS.map(loadDir));
  const items = buildFeedItems(...lists);
  await writeFile(INDEX_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2)}\n`);
  console.log(`poll-gwanbo: ${added}건 추가, 관보 ${tracked.size}건 추적 중`);
}
