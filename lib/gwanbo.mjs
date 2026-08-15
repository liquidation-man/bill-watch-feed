/** 대한민국 전자관보 일자별 검색 결과 파서. 네트워크를 모르는 순수 함수. */
import { administrationFromDate } from './administration.mjs';
import { tagDecree } from './tags.mjs';

const BASE = 'https://gwanbo.go.kr';

function decodeHtml(value = '') {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;|&#34;|&apos;|&#39;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function text(html = '') {
  return decodeHtml(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function gwanboDateToIso(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 8) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** 사이트의 일자별 화면을 브라우저가 렌더링한 HTML을 파싱한다. */
export function parseGwanboHtml(html) {
  const pageDate = gwanboDateToIso(/class=["']date["'][^>]*>([\s\S]*?)<\/[^>]+>/.exec(html)?.[1]);
  const rows = [];
  const sectionRe = /<h4[^>]*>([\s\S]*?)<\/h4>[\s\S]*?<ul[^>]*class=["']list["'][^>]*>([\s\S]*?)<\/ul>/g;
  let section;
  while ((section = sectionRe.exec(html))) {
    const kind = text(section[1]);
    const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
    let link;
    while ((link = linkRe.exec(section[2]))) {
      const attrs = link[1];
      const title = text(link[2]);
      const href = /href=["']([^"']+)["']/.exec(attrs)?.[1] || '';
      const onclick = /onclick=["']([\s\S]*?)["']/.exec(attrs)?.[1] || '';
      const sourceUrl = decodeHtml(href && !href.startsWith('#') ? href : /(?:click_daily_gwanbo|f_pdfViewer)\(\s*[\\'\"]([^\\'\"]+)/.exec(onclick)?.[1] || '');
      const id = /(?:contentId=|\/)(I\d{20,})/.exec(sourceUrl)?.[1] || '';
      if (id && title && pageDate) rows.push({ id, title, kind, date: pageDate, org: '', sourceUrl: new URL(sourceUrl, BASE).href });
    }
  }
  return rows;
}

/** SearchRestApi.jsp JSON 응답을 같은 행 형태로 바꾼다. */
export function parseGwanboSearchJson(body) {
  let parsed;
  try {
    parsed = typeof body === 'string' ? JSON.parse(body.trim()) : body;
  } catch {
    return [];
  }
  const rows = [];
  for (const group of parsed?.data || []) {
    for (const item of group.list || []) {
      const id = item.stored_toc_seq || '';
      const title = item.stored_field_subject || '';
      const date = gwanboDateToIso(item.keyword_field_regdate);
      if (!id || !title || !date) continue;
      const rawUrl = item.stored_field_url || '';
      rows.push({
        id,
        title,
        kind: item.stored_category_name || group.category_name || '',
        date,
        org: item.stored_organ_nm || '',
        sourceUrl: rawUrl ? new URL(decodeHtml(rawUrl), BASE).href : '',
      });
    }
  }
  return rows;
}

export function gwanboFromRow(row) {
  return {
    billId: `GWANBO_${row.id}`,
    title: row.title,
    org: row.org || '',
    kind: row.kind || '',
    events: [{
      stage: row.kind || '',
      category: '관보',
      administration: administrationFromDate(row.date),
      date: row.date,
      detail: [row.org, row.kind].filter(Boolean).join(' · '),
      sourceUrl: row.sourceUrl || '',
    }],
    tags: tagDecree({ org: row.org || '', title: row.title }),
  };
}
