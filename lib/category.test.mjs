import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { categoryFromStage } from './category.mjs';

test('발의 — 입법안', () => {
  assert.equal(categoryFromStage('발의'), '입법안');
});

test('위원회·법사위 4단계 — 전부 입법', () => {
  for (const stage of ['위원회상정', '위원회심사', '법사위상정', '법사위심사']) {
    assert.equal(categoryFromStage(stage), '입법');
  }
});

test('본회의의결 — 의결', () => {
  assert.equal(categoryFromStage('본회의의결'), '의결');
});

test('매핑 없는 stage(개정·정책 등)는 null — 지어내지 않는다', () => {
  assert.equal(categoryFromStage('공포'), null);
  assert.equal(categoryFromStage('알수없음'), null);
});
