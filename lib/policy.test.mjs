import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parsePolicyHtml, parsePolicyRss, policyFromRow } from './policy.mjs';

test('정책브리핑 HTML 목록을 파싱한다', async () => {
  const rows = parsePolicyHtml(await readFile(new URL('./__fixtures__/policy-sample.html', import.meta.url), 'utf8'));
  assert.deepEqual(rows, [{ id: '148970148', title: '한 총리 "주택공급상황, 매주 현장 점검"', date: '2026-08-15', org: '국무조정실', sourceUrl: 'https://www.korea.kr/news/policyNewsView.do?newsId=148970148' }]);
  assert.deepEqual(policyFromRow(rows[0]).tags, ['부동산']);
});

test('RSS를 파싱하고 식별자 없는 항목은 지어내지 않는다', () => {
  const xml = '<rss><channel><item><title><![CDATA[정책 발표]]></title><link>https://www.korea.kr/news/policyNewsView.do?newsId=123</link><pubDate>Fri, 14 Aug 2026 09:00:00 +0900</pubDate><author>환경부</author></item><item><title>링크 없음</title></item></channel></rss>';
  const rows = parsePolicyRss(xml);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, '123');
  assert.equal(rows[0].date, '2026-08-14');
});
