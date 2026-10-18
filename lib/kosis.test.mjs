import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildStatQuery, formatPeriod, parseStatTable } from './kosis.mjs';

const fixture = () => readFile(new URL('./__fixtures__/kosis-stat-table.html', import.meta.url), 'utf8');

test('피벗 표를 시점×분류 세로형으로 푼다', async () => {
  const { periods, rows } = parseStatTable(await fixture());
  assert.deepEqual(periods, ['202412', '202512']);
  assert.equal(rows.length, 6); // 3개 계열 × 2개 시점
  assert.deepEqual(rows[0], { prd: '202412', keys: ['KT', 'xDSL'], value: 209884 });
  assert.deepEqual(rows[1], { prd: '202512', keys: ['KT', 'xDSL'], value: 192279 });
});

test('병합된 표측 머리칸도 분류값을 그대로 이어받는다', async () => {
  const { rows } = parseStatTable(await fixture());
  const hfc = rows.filter((row) => row.keys[1] === 'HFC');
  assert.equal(hfc.length, 2);
  assert.deepEqual(hfc.map((row) => row.keys[0]), ['KT', 'KT']);
});

test('표의 마지막 행(first-end/merge-end)도 빠뜨리지 않는다', async () => {
  const { rows } = parseStatTable(await fixture());
  const last = rows.filter((row) => row.keys[0] === '기타');
  assert.deepEqual(last.map((row) => row.value), [null, 3392]);
});

test('0과 수록값 없음을 구분한다', async () => {
  const { rows } = parseStatTable(await fixture());
  assert.equal(rows.find((row) => row.keys[1] === 'HFC' && row.prd === '202412').value, 0);
  assert.equal(rows.find((row) => row.keys[0] === '기타' && row.prd === '202412').value, null);
});

test('값 개수가 시점 수와 어긋나면 조용히 넘어가지 않는다', async () => {
  // 2025.12 의 원데이터·가중치 두 칸을 통째로 지워 한 행만 시점 수와 어긋나게 만든다.
  const broken = (await fixture()).replace(/<td class='value' title='192,279'>[\s\S]*?(?=<\/tr>)/, '');
  assert.throws(() => parseStatTable(broken), /시점 2개와 맞지 않는다/);
});

test('조회 본문은 분류축 순서대로 OV_L 번호를 매긴다', () => {
  const query = buildStatQuery({
    orgId: '127',
    tblId: 'DT_127006_A004',
    listId: 'A41_10',
    periods: ['202412', '202512'],
    items: ['T001'],
    classes: [{ id: 'A', items: ['A02'] }, { id: 'B', items: ['B01', 'B04'] }],
  });
  const fieldList = JSON.parse(query.get('fieldList'));
  assert.deepEqual(fieldList[0], { targetId: 'PRD', targetValue: '', prdValue: 'M,202412,202512,@' });
  assert.deepEqual(fieldList.filter((f) => f.targetId === 'OV_L1_ID').map((f) => f.targetValue), ['A02']);
  assert.deepEqual(fieldList.filter((f) => f.targetId === 'OV_L2_ID').map((f) => f.targetValue), ['B01', 'B04']);
  assert.equal(query.get('rowAxis'), 'A,B');
  assert.equal(query.get('colAxis'), 'TIME');
  assert.equal(query.get('endNum'), '4'); // 항목1 × 시점2 × 분류(1×2)
});

test('빈 조회조건은 요청을 만들기 전에 막는다', () => {
  assert.throws(() => buildStatQuery({ orgId: '127', tblId: 'X', listId: '', periods: [], items: ['T001'], classes: [{ id: 'A', items: ['A01'] }] }), /기간/);
});

test('시점 코드는 KOSIS 화면 표기로 바꾼다', () => {
  assert.equal(formatPeriod('202512'), '2025.12');
  assert.equal(formatPeriod('2025'), '2025');
});
