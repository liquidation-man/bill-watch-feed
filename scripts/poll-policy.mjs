#!/usr/bin/env node
/** 정책브리핑 정책뉴스 HTML 목록을 읽어 policy/*.json과 통합 index.json을 갱신한다. */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeedItems } from '../lib/build-index.mjs';
import { parsePolicyHtml, policyFromRow } from '../lib/policy.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = join(root, 'policy');
const INDEX_PATH = join(root, 'index.json');
const SOURCE_DIRS = ['bills', 'decrees', 'laws', 'gwanbo', 'policy'];

async function loadDir(name) {
  const dir = join(root, name);
  const files = await readdir(dir).catch(() => []);
  return Promise.all(files.filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8'))));
}

const res = await fetch('https://www.korea.kr/news/policyNewsList.do', { headers: { 'User-Agent': 'bill-watch-feed/1.0' }, signal: AbortSignal.timeout(20000) });
if (!res.ok) throw new Error(`정책브리핑 HTTP ${res.status}`);
const rows = parsePolicyHtml(await res.text());
if (rows.length === 0) throw new Error('정책브리핑 목록에서 항목을 찾지 못함(HTML 구조 변경 가능)');

await mkdir(OUTPUT_DIR, { recursive: true });
const tracked = new Map((await loadDir('policy')).map((item) => [item.billId, item]));
let added = 0;
for (const row of rows) {
  const entity = policyFromRow(row);
  if (tracked.has(entity.billId)) continue;
  tracked.set(entity.billId, entity);
  await writeFile(join(OUTPUT_DIR, `${entity.billId}.json`), `${JSON.stringify(entity, null, 2)}\n`);
  added += 1;
}
if (added === 0) {
  console.log('poll-policy: 새 항목 없음');
} else {
  const lists = await Promise.all(SOURCE_DIRS.map(loadDir));
  const items = buildFeedItems(...lists);
  await writeFile(INDEX_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2)}\n`);
  console.log(`poll-policy: ${added}건 추가, 정책뉴스 ${tracked.size}건 추적 중`);
}
