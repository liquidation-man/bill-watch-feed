import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildFeedItems } from './build-index.mjs';

const BILL = {
  billId: 'B1',
  title: '테스트법 일부개정법률안',
  tags: ['세금'],
  events: [{ stage: '발의', category: '입법안', administration: '이재명정부', date: '2026-08-10' }],
};

const DECREE = {
  billId: 'LAW_1',
  title: '테스트법 시행령',
  tags: [],
  events: [{ stage: '일부개정', category: '개정', administration: '이재명정부', date: '2026-08-14' }],
};

test('bills·decrees를 합쳐 최신순으로 정렬한다', () => {
  const items = buildFeedItems([BILL], [DECREE]);
  assert.equal(items.length, 2);
  assert.equal(items[0].billId, 'LAW_1'); // 2026-08-14가 2026-08-10보다 최신
  assert.equal(items[1].billId, 'B1');
});

test('decree 아이템도 FeedItem과 같은 모양이다', () => {
  const [item] = buildFeedItems([], [DECREE]);
  assert.equal(item.title, '테스트법 시행령');
  assert.equal(item.category, '개정');
  assert.equal(item.stage, '일부개정');
});

test('둘 다 비어 있으면 빈 배열 — 지어내지 않는다', () => {
  assert.deepEqual(buildFeedItems([], []), []);
});

test('같은 법령이 LAWHIST(누적 이력)로 승격되면 낱개 LAW_ 스냅샷은 피드에서 빠진다', () => {
  const flatSnapshot = {
    billId: 'LAW_999',
    title: '국세기본법',
    tags: [],
    events: [{ stage: '일부개정', category: '개정', administration: '이재명정부', date: '2026-08-11' }],
  };
  const history = {
    billId: 'LAWHIST_국세기본법',
    title: '국세기본법',
    tags: ['세금'],
    events: [
      { stage: '제정', category: '개정', administration: null, date: '1974-12-21' },
      { stage: '일부개정', category: '개정', administration: '이재명정부', date: '2026-08-11' },
    ],
  };
  const items = buildFeedItems([], [flatSnapshot], [history]);
  assert.equal(items.filter((i) => i.billId === 'LAW_999').length, 0);
  assert.equal(items.filter((i) => i.billId === 'LAWHIST_국세기본법').length, 2);
});
