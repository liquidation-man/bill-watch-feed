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

// 2026-08-14: 오너 지적 — "고시로 분야를 나누지 말고 통신, 건축 이런식으로
// 나누면 안될까." '고시'는 문서 형식(KEYWORD_TAGS에서 뺐다)이라 이제
// 안 붙고, 실제 내용(국가데이터처의 통계작성 승인)으로 '통계' 태그가 붙는다.
test('국가데이터처 통계작성 고시 — 형식(고시) 대신 내용(통계) 태그', () => {
  const tags = tagDecree({ org: '국가데이터처', title: '통계작성의 변경승인(협의) 고시(산업안전보건실태조사)' });
  assert.deepEqual(tags, ['통계']);
});

test('관세청 품목분류 변경고시 — 관세청 매핑(세금)만 붙고 고시는 안 붙는다', () => {
  const tags = tagDecree({ org: '관세청', title: '수출입물품 등에 대한 품목분류 변경고시' });
  assert.deepEqual(tags, ['세금']);
});

test('구내통신설비·선로설비 기술기준 고시 — 형식은 고시지만 내용은 통신', () => {
  const tags = tagDecree({ org: '국립전파연구원', title: '접지설비·구내통신설비·선로설비 및 통신공동구등에 대한 기술기준' });
  assert.deepEqual(tags, ['통신']);
});

test('건축 기준 행정예고 — 주거·건축 상세 분류로 잡는다', () => {
  const tags = tagDecree({ org: '국토교통부', title: '다중생활시설 건축기준 일부개정 고시안 행정예고' });
  assert.ok(tags.includes('건축'));
});
