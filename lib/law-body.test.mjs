import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseLawBodyXml } from './law-body.mjs';

const FIXTURE = readFileSync(fileURLToPath(new URL('./__fixtures__/law-body-sample.xml', import.meta.url)), 'utf-8');

test('실물 응답(2026-08-14 확보) — 제목·소관부처를 읽는다', () => {
  const body = parseLawBodyXml(FIXTURE);
  assert.equal(body.title, '국방부와 그 소속기관 직제');
  assert.equal(body.ministry, '국방부');
});

test('조문이 여러 개 파싱된다', () => {
  const body = parseLawBodyXml(FIXTURE);
  assert.ok(body.articles.length > 5, `조문이 너무 적다: ${body.articles.length}`);
});

test('제1장 "총칙"은 장 제목(전문)으로, 제2조는 일반 조문으로 구분된다', () => {
  const body = parseLawBodyXml(FIXTURE);
  const chapter = body.articles.find((a) => a.content.includes('제1장 총칙'));
  assert.ok(chapter);
  assert.equal(chapter.isChapterHeading, true);

  const art2 = body.articles.find((a) => a.title === '소속기관');
  assert.ok(art2);
  assert.equal(art2.isChapterHeading, false);
  assert.match(art2.content, /제2조\(소속기관\)/);
  assert.match(art2.content, /국방홍보원/);
});

test('내용 없는 조문은 버린다 — 지어내지 않는다', () => {
  const body = parseLawBodyXml(FIXTURE);
  assert.ok(body.articles.every((a) => a.content.length > 0));
});
