import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { tagBill, tagDecree } from './tags.mjs';

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

test('정무위 — 금융(2026-08-14 확장)', () => {
  const tags = tagBill({ committee: '정무위원회', title: '전자금융거래법 일부개정법률안' });
  assert.deepEqual(tags, ['금융']);
});

test('소관위 미배정 + 키워드도 없음 — 빈 배열, 지어내지 않는다', () => {
  const tags = tagBill({ committee: '', title: '국회법 일부개정법률안' });
  assert.deepEqual(tags, []);
});

test('소관위 미배정(발의만 된 의안) — 키워드만으로 판단', () => {
  const tags = tagBill({ committee: '', title: '조세특례제한법 일부개정법률안' });
  assert.deepEqual(tags, ['세금']);
});

// 2026-08-14: 오너 지적 — "자동차 관련인데 부동산에 붙어있다". 국토교통부·
// 국토교통위원회는 부동산뿐 아니라 도로·철도·항공·자동차·물류(교통)도 소관이라,
// 제목이 명백히 교통 쪽이면 부동산 대신 교통으로 바뀌어야 한다.
test('국토교통부 소관 대통령령이라도 자동차 관련이면 부동산이 아니라 교통', () => {
  const tags = tagDecree({ org: '국토교통부', title: '자동차손해배상 보장법 시행령' });
  assert.deepEqual(tags, ['교통']);
});

test('국토교통부 소관 + 도로·항공·물류 키워드 — 전부 교통으로 분류', () => {
  assert.deepEqual(tagDecree({ org: '국토교통부', title: '도로안전시설 설치 및 관리지침' }), ['교통']);
  assert.deepEqual(tagDecree({ org: '국토교통부', title: '항공사업법 일부개정법률안' }), ['교통']);
  assert.deepEqual(tagDecree({ org: '국토교통부', title: '물류시설의 개발 및 운영에 관한 법률' }), ['교통']);
});

test('국토교통위 소관이어도 부동산 키워드가 있으면 부동산을 유지한다', () => {
  const tags = tagBill({ committee: '국토교통위원회', title: '도시 및 주거환경정비법 일부개정법률안' });
  assert.deepEqual(tags, ['부동산']);
});

test('국토교통위 소관 + 교통·부동산 키워드가 둘 다 없으면 그대로 부동산(기존 동작 유지)', () => {
  const tags = tagBill({ committee: '국토교통위원회', title: '새만금사업 추진 및 지원에 관한 특별법 일부개정법률안' });
  assert.equal(tags.includes('부동산'), true);
  assert.equal(tags.includes('교통'), false);
});
