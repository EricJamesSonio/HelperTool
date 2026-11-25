/**
 * PDF Writer model: groups analyzed pages into sections and classifies them.
 * Pure functions, no DOM access.
 */

const ROMAN_HEADING = /^\s*[IVXLC]{1,6}\.\s+\S/;
const TOC_LINE = /^[IVXLC]+\.\s+.+\s\d{1,4}$/;
const BULLET_START = /^[\u25cf\u2022\u25aa\u25e6\u25cb\u25a0\u25a1]/;
const HEADING_WORDS = new Set([
  'acknowledgement',
  'acknowledgements',
  'abstract',
  'table of contents',
  'conclusion',
  'conclusions',
  'narrative experience',
  'daily journal',
  'projects',
  'introduction',
]);

export const KIND_LABEL = {
  flow: 'Editable text',
  slots: 'Fixed layout',
  toc: 'Contents (auto numbers)',
  locked: 'Images (kept as is)',
  blank: 'Blank (kept as is)',
};

export const EDITABLE_KINDS = ['flow', 'slots'];

export function norm(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isCentered(line, width) {
  return Math.abs((line.l + line.r) / 2 - width / 2) <= 8;
}

export function isHeadingLine(line, width) {
  const text = String((line && line.t) || '').trim();
  if (!text) return false;
  if (ROMAN_HEADING.test(text)) return true;
  if (HEADING_WORDS.has(norm(text))) return true;
  if (text.length <= 60 && text === text.toUpperCase() && /[A-Z]{4}/.test(text)) return true;
  return !!(line.bold && isCentered(line, width) && text.length <= 70);
}

function medianOf(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function gapRatio(lines) {
  if (lines.length < 3) return 0;
  const deltas = [];
  for (let i = 1; i < lines.length; i++) deltas.push(lines[i].base - lines[i - 1].base);
  const med = medianOf(deltas.filter((d) => d > 0)) || 1;
  return Math.max.apply(null, deltas) / Math.max(med, 1);
}

function classify(pages, lines) {
  if (pages.some((p) => p.locked)) return 'locked';
  if (!lines.length) return 'blank';
  const tocHits = lines.filter((l) => TOC_LINE.test(l.t.trim())).length;
  if (tocHits >= 4) return 'toc';
  if (pages.length === 1 && lines.length <= 24 && gapRatio(lines) >= 3.5) return 'slots';
  return 'flow';
}

export function pageLabel(sec) {
  return sec.start === sec.end
    ? 'Page ' + (sec.start + 1)
    : 'Pages ' + (sec.start + 1) + '-' + (sec.end + 1);
}

export function buildSections(analysis, overrides) {
  const pages = (analysis && analysis.pages) || [];
  const splits = new Set((overrides && overrides.splits) || []);
  const joins = new Set((overrides && overrides.joins) || []);
  const starts = [];
  pages.forEach((page, i) => {
    let start = i === 0;
    if (i > 0) {
      const prev = pages[i - 1];
      const first = page.lines[0];
      if (!!page.locked !== !!prev.locked) start = true;
      else if (first && isHeadingLine(first, page.width)) start = true;
      if (joins.has(i)) start = false;
      if (splits.has(i)) start = true;
    }
    if (start) starts.push(i);
  });
  return starts.map((start, n) => {
    const end = (n + 1 < starts.length ? starts[n + 1] : pages.length) - 1;
    const ps = pages.slice(start, end + 1);
    const lines = ps.flatMap((p) => p.lines.map((l) => Object.assign({ page: p.index }, l)));
    const width = ps[0].width;
    const sec = { id: 'S' + (n + 1), start, end, lines, width, height: ps[0].height };
    sec.kind = classify(ps, lines);
    const first = lines[0];
    sec.hasHeading = !!first && isHeadingLine(first, width);
    if (first) sec.title = first.t.trim().slice(0, 56);
    else sec.title = sec.kind === 'locked' ? 'Images' : 'Blank';
    return sec;
  });
}

export function describeLines(lines, width) {
  const deltas = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].page === lines[i - 1].page) {
      const d = lines[i].base - lines[i - 1].base;
      if (d > 0) deltas.push(d);
    }
  }
  const pitch = medianOf(deltas) || 14;
  const out = [];
  let current = null;
  lines.forEach((line, i) => {
    const text = line.t.trim();
    if (!text) return;
    if (i === 0 && isHeadingLine(line, width)) {
      out.push({ type: 'heading', text, lines: 1 });
      current = null;
      return;
    }
    const prev = lines[i - 1];
    const bullet = BULLET_START.test(text);
    const gap = prev && prev.page === line.page && line.base - prev.base > pitch * 1.5;
    if (!current || bullet || gap) {
      current = { type: bullet ? 'bullet' : 'paragraph', text, lines: 1 };
      out.push(current);
    } else {
      current.text += ' ' + text;
      current.lines += 1;
    }
  });
  return out;
}