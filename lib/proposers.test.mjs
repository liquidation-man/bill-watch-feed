import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProposerPopup } from './proposers.mjs';

test('제안자목록 팝업에서 이름·정당·사진을 의원 수만큼 읽는다', () => {
  const html = `
    <ul class="member_list_img">
      <li><a href="https://www.assembly.go.kr/members/22nd/KIMWISANG"><div><img src="https://example.com/kim.png"></div><p>김위상</p><p>金渭相</p><p class="jdang">국민의힘</p></a></li>
      <li><a href="https://www.assembly.go.kr/members/22nd/KIMSUNGYO"><div><img src="/bill/static/img/bi/no-img_mem.png"></div><p>김선교</p><p>金善敎</p><p class="jdang">국민의힘</p></a></li>
    </ul>`;
  assert.deepEqual(parseProposerPopup(html), [
    { name: '김위상', party: '국민의힘', profileImageUrl: 'https://example.com/kim.png' },
    { name: '김선교', party: '국민의힘' },
  ]);
});
