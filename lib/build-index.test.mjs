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

test('관보와 정책브리핑도 기존 소스와 함께 합친다', () => {
  const gwanbo = { billId: 'GWANBO_1', title: '관보 항목', tags: [], events: [{ stage: '고시', category: '관보', date: '2026-08-15' }] };
  const policy = { billId: 'POLICY_1', title: '정책 항목', tags: [], events: [{ stage: '정책뉴스', category: '정책', date: '2026-08-16' }] };
  const items = buildFeedItems([BILL], [DECREE], [], [gwanbo], [policy]);
  assert.deepEqual(items.map((item) => item.billId), ['POLICY_1', 'GWANBO_1', 'LAW_1', 'B1']);
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

// 2026-08-14: 오너 지시 "과거 데이터 싹다 넣도록" — 예전엔 최신 100건으로
// 잘랐다. 150개짜리 이력 하나(법령이력처럼 누적이 큰 경우를 흉내)를 넣어
// 100건 넘게 살아남는지 확인한다 — 자르는 코드가 되살아나면 이 테스트가 깨진다.
test('100건보다 많아도 안 자른다(캡 없음)', () => {
  const bigHistory = {
    billId: 'LAWHIST_큰법',
    title: '큰법',
    tags: [],
    events: Array.from({ length: 150 }, (_, i) => ({
      stage: '일부개정',
      category: '개정',
      administration: null,
      date: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`,
    })),
  };
  const items = buildFeedItems([], [], [bigHistory]);
  assert.equal(items.length, 150);
});
