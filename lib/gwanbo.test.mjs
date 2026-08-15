import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { gwanboFromRow, parseGwanboHtml, parseGwanboSearchJson } from './gwanbo.mjs';

test('관보 HTML에서 실제 있는 필드만 읽는다', async () => {
  const rows = parseGwanboHtml(await readFile(new URL('./__fixtures__/gwanbo-sample.html', import.meta.url), 'utf8'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-08-14');
  assert.equal(rows[0].kind, '대통령령');
  assert.equal(rows[0].org, '');
  assert.match(rows[0].sourceUrl, /contentId=I0/);
});

test('관보 검색 JSON은 필수값 없는 행을 버린다', () => {
  const body = { data: [{ category_name: '고시', list: [{ stored_toc_seq: 'I123', stored_field_subject: '환경부고시', keyword_field_regdate: '20260814', stored_organ_nm: '환경부', stored_field_url: '/viewer?id=1' }, { stored_field_subject: '날짜 없음' }] }] };
  const rows = parseGwanboSearchJson(body);
  assert.equal(rows.length, 1);
  const entity = gwanboFromRow(rows[0]);
  assert.equal(entity.billId, 'GWANBO_I123');
  assert.deepEqual(entity.tags, ['환경']);
});
