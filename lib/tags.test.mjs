import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { tagBill } from './tags.mjs';

test('재정경제기획위 + 세법 키워드 — 세금 하나로 합쳐진다(중복 없음)', () => {
  const tags = tagBill({ committee: '재정경제기획위원회', title: '소득세법 일부개정법률안' });
  assert.deepEqual(tags, ['세금']);
});

test('국토교통위 + "사업 추진" 키워드 — 부동산·특정사업 둘 다', () => {
  const tags = tagBill({ committee: '국토교통위원회', title: '새만금사업 추진 및 지원에 관한 특별법 일부개정법률안' });
  assert.equal(tags.includes('부동산'), true);
  assert.equal(tags.includes('특정사업'), true);
});

test('법제사법위 — 법', () => {
  const tags = tagBill({ committee: '법제사법위원회', title: '스토킹범죄의 처벌 등에 관한 법률 일부개정법률안' });
  assert.deepEqual(tags, ['법']);
});

test('매핑 안 되는 위원회·키워드 — 빈 배열, 지어내지 않는다', () => {
  const tags = tagBill({ committee: '정무위원회', title: '전자금융거래법 일부개정법률안' });
  assert.deepEqual(tags, []);
});

test('소관위 미배정(발의만 된 의안) — 키워드만으로 판단', () => {
  const tags = tagBill({ committee: '', title: '조세특례제한법 일부개정법률안' });
  assert.deepEqual(tags, ['세금']);
});
