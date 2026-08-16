const POPUP_BASE = 'https://likms.assembly.go.kr/bill/coactorListPopup.do';

function cleanText(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanImageUrl(src) {
  if (!src || src.includes('/no-img_mem.png')) return undefined;
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('/')) return `https://likms.assembly.go.kr${src}`;
  return src;
}

export function parseProposerPopup(html) {
  const members = [];
  const itemRe = /<li>\s*([\s\S]*?)\s*<\/li>/gi;
  for (const match of html.matchAll(itemRe)) {
    const block = match[1];
    if (!block.includes('assembly.go.kr/members/')) continue;
    const image = block.match(/<img[^>]+src="([^"]+)"/i)?.[1];
    const ps = [...block.matchAll(/<p(?:\s+class="([^"]+)")?[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => ({ className: m[1] ?? '', text: cleanText(m[2]) }));
    const name = ps.find((p) => p.text && !p.className && /^[가-힣]{2,4}$/.test(p.text))?.text;
    if (!name) continue;
    const party = ps.find((p) => p.className.includes('jdang'))?.text || undefined;
    members.push({ name, ...(party ? { party } : {}), ...(cleanImageUrl(image) ? { profileImageUrl: cleanImageUrl(image) } : {}) });
  }
  return members;
}

export async function fetchProposerMembers(billId, fetchImpl = fetch) {
  if (!billId) return [];
  const url = new URL(POPUP_BASE);
  url.searchParams.set('billId', billId);
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const html = await res.text();
  return parseProposerPopup(html);
}
