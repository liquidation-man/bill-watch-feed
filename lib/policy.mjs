/** 대한민국 정책브리핑 RSS/정책뉴스 목록 HTML 파서. */
import { administrationFromDate } from './administration.mjs';
import { tagDecree } from './tags.mjs';

const BASE = 'https://www.korea.kr';

function decodeHtml(value = '') {
  return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function text(value = '') {
  return decodeHtml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function policyDateToIso(value) {
  const m = /(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/.exec(value || '');
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

export function parsePolicyHtml(html) {
  const rows = [];
  const re = /<a[^>]+href=["']([^"']*policyNewsView\.do\?[^"']*newsId=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = re.exec(html))) {
    const body = match[3];
    const title = text(/<strong[^>]*>([\s\S]*?)<\/strong>/.exec(body)?.[1]);
    const source = body.slice(body.search(/class=["']source["']/));
    const values = [...source.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => text(m[1])).filter(Boolean);
    const date = policyDateToIso(values.find((v) => policyDateToIso(v)) || '');
    const org = values.find((v) => !policyDateToIso(v)) || '';
    if (title && date) rows.push({ id: match[2], title, date, org, sourceUrl: new URL(decodeHtml(match[1]), BASE).href });
  }
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

export function parsePolicyRss(xml) {
  const rows = [];
  for (const item of xml.match(/<item\b[\s\S]*?<\/item>/gi) || []) {
    const field = (name) => text(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(item)?.[1]);
    const sourceUrl = field('link');
    const id = /[?&]newsId=(\d+)/.exec(sourceUrl)?.[1] || '';
    const title = field('title');
    const date = policyDateToIso(field('pubDate')) || (() => { const d = new Date(field('pubDate')); return Number.isNaN(d.valueOf()) ? '' : d.toISOString().slice(0, 10); })();
    const org = field('author') || field('dc:creator');
    if (id && title && date) rows.push({ id, title, date, org, sourceUrl });
  }
  return rows;
}

export function policyFromRow(row) {
  return {
    billId: `POLICY_${row.id}`,
    title: row.title,
    org: row.org || '',
    kind: '정책뉴스',
    events: [{ stage: '정책뉴스', category: '정책', administration: administrationFromDate(row.date), date: row.date, detail: row.org || '', sourceUrl: row.sourceUrl || '' }],
    tags: tagDecree({ org: row.org || '', title: row.title }),
  };
}
