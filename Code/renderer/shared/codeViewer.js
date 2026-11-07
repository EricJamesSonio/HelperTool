import { highlightRange, langFor, esc } from '../ideMode/highlight.js';
import { createMinimap } from '../ideMode/minimap.js';

const LH = 20;
const PAD = 8;
const BUF = 30;
const MAX_LINE = 3000;
const MAX_LINES = 20000;
const MAX_ROWS = 8000;
const MIN_MM_ROWS = 40;
const SHEET_ID = 'codeViewerCss';
const FALLBACK_FONT = "ui-monospace, 'Cascadia Code', Consolas, monospace";

let measuredW = 0;

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(SHEET_ID)) return;
  const link = document.createElement('link');
  link.id = SHEET_ID;
  link.rel = 'stylesheet';
  link.href = './styles/code-viewer.css';
  document.head.appendChild(link);
}

function charWidth() {
  if (measuredW) return measuredW;
  let fam = '';
  try {
    fam = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
  } catch (_) {
    fam = '';
  }
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = '13px ' + (fam || FALLBACK_FONT);
  measuredW = ctx.measureText('MMMMMMMMMM').width / 10 || 7.8;
  return measuredW;
}

function clip(s) {
  const t = String(s == null ? '' : s);
  return t.length > MAX_LINE ? t.slice(0, MAX_LINE) + ' ...' : t;
}

function splitText(text) {
  const a = String(text == null ? '' : text).split(/\r\n|\r|\n/);
  if (a.length > 1 && a[a.length - 1] === '') a.pop();
  return a.map(clip);
}

function digitsFor(n) {
  return Math.max(3, String(n).length);
}

function codeRowHtml(i, h) {
  return '<div class="cv-r"><span class="cv-n">' + (i + 1) + '</span><span class="cv-t">' + h + '</span></div>';
}

function diffRowHtml(r) {
  if (r.t === '...' || r.t === '@') {
    return '<div class="cv-r ' + (r.t === '@' ? 'cv-hunk' : 'cv-fold') + '">' +
      '<span class="cv-n"></span><span class="cv-n"></span><span class="cv-s"></span>' +
      '<span class="cv-t">' + esc(r.text) + '</span></div>';
  }
  const cls = r.t === '+' ? ' cv-add' : r.t === '-' ? ' cv-del' : '';
  const sign = r.t === '+' ? '+' : r.t === '-' ? '-' : '';
  return '<div class="cv-r' + cls + '">' +
    '<span class="cv-n">' + (r.a || '') + '</span>' +
    '<span class="cv-n">' + (r.b || '') + '</span>' +
    '<span class="cv-s">' + sign + '</span>' +
    '<span class="cv-t">' + r.h + '</span></div>';
}

function highlightDiffRows(list, lg) {
  const sides = [[], []];
  for (const r of list) {
    if (r.t === ' ' || r.t === '+') sides[0].push(r);
    else if (r.t === '-') sides[1].push(r);
  }
  for (const group of sides) {
    if (!group.length) continue;
    const texts = group.map((r) => r.text);
    const parts = highlightRange(texts, 0, texts.length - 1, lg).split('\n');
    for (let i = 0; i < group.length; i++) group[i].h = parts[i] === undefined ? '' : parts[i];
  }
}

export function createCodeViewer(host, options) {
  ensureStyles();
  const opt = Object.assign({ minimap: true }, options || {});
  host.classList.add('cv');
  host.innerHTML =
    '<div class="cv-body">' +
      '<div class="cv-scroll" tabindex="0"><div class="cv-sizer"><div class="cv-inner"></div></div></div>' +
      '<div class="cv-mm" hidden></div>' +
    '</div>' +
    '<div class="cv-msg" hidden></div>';

  const body = host.querySelector('.cv-body');
  const scroll = host.querySelector('.cv-scroll');
  const sizer = host.querySelector('.cv-sizer');
  const inner = host.querySelector('.cv-inner');
  const mmHost = host.querySelector('.cv-mm');
  const msg = host.querySelector('.cv-msg');
  const mm = opt.minimap ? createMinimap(mmHost, scroll) : null;

  let mode = 'msg';
  let lang = 'plain';
  let lines = [];
  let rFrom = -1;
  let rTo = -1;
  let raf = 0;
  let ro = null;

  function setSizer(count, maxLen, gutterPx) {
    sizer.style.height = (count * LH + PAD * 2) + 'px';
    sizer.style.minWidth = Math.ceil(gutterPx + maxLen * charWidth() + 48) + 'px';
  }

  function updateMinimap(list, lg, tints) {
    if (!mm) return;
    const on = list.length >= MIN_MM_ROWS;
    mmHost.hidden = !on;
    if (on) mm.setContent(list, lg, true, tints);
  }

  function showBody() {
    msg.hidden = true;
    body.hidden = false;
  }

  function resetScroll() {
    scroll.scrollTop = 0;
    scroll.scrollLeft = 0;
  }

  function render(force) {
    raf = 0;
    if (mode !== 'code') return;
    const top = scroll.scrollTop;
    const h = scroll.clientHeight || 600;
    const last = lines.length - 1;
    const vFrom = Math.max(0, Math.floor((top - PAD) / LH));
    const vTo = Math.min(last, Math.ceil((top + h - PAD) / LH));
    if (!force && vFrom >= rFrom && vTo <= rTo) return;
    const from = Math.max(0, vFrom - BUF);
    const to = Math.min(last, vTo + BUF);
    const parts = highlightRange(lines, from, to, lang).split('\n');
    let out = '';
    for (let i = 0; i < parts.length; i++) out += codeRowHtml(from + i, parts[i]);
    inner.innerHTML = out;
    inner.style.top = (PAD + from * LH) + 'px';
    rFrom = from;
    rTo = to;
  }

  function showMessage(text, tone) {
    mode = 'msg';
    lines = [];
    inner.innerHTML = '';
    mmHost.hidden = true;
    body.hidden = true;
    msg.textContent = text || '';
    msg.dataset.tone = tone || 'muted';
    msg.hidden = false;
  }

  function showCode(text, o) {
    const opts = o || {};
    let arr = splitText(text);
    if (arr.length === 1 && arr[0] === '') {
      showMessage(opts.empty || 'This file is empty.', 'muted');
      return;
    }
    if (arr.length > MAX_LINES) {
      const extra = arr.length - MAX_LINES;
      arr = arr.slice(0, MAX_LINES);
      arr.push('... ' + extra + ' more line(s) not shown');
    }
    showBody();
    mode = 'code';
    lines = arr;
    lang = opts.lang || langFor(opts.name || '');
    host.dataset.lang = lang;
    const digits = digitsFor(arr.length);
    sizer.style.setProperty('--cv-digits', String(digits));
    inner.dataset.mode = 'code';
    let maxLen = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].length > maxLen) maxLen = arr[i].length;
    }
    setSizer(arr.length, maxLen, digits * charWidth() + 22);
    if (!opts.keepScroll) resetScroll();
    rFrom = -1;
    rTo = -1;
    updateMinimap(arr, lang, null);
    render(true);
  }

  function showDiff(rows, o) {
    const opts = o || {};
    const src = rows || [];
    if (!src.length) {
      showMessage(opts.empty || 'No changes to show.', 'muted');
      return;
    }
    const list = [];
    let maxNo = 0;
    let maxLen = 0;
    for (let i = 0; i < src.length && i < MAX_ROWS; i++) {
      const r = src[i];
      const row = { t: r.t, text: clip(r.text), a: r.a, b: r.b, h: '' };
      if (row.a > maxNo) maxNo = row.a;
      if (row.b > maxNo) maxNo = row.b;
      if (row.text.length > maxLen) maxLen = row.text.length;
      list.push(row);
    }
    if (src.length > MAX_ROWS) list.push({ t: '...', text: (src.length - MAX_ROWS) + ' more row(s) not shown', h: '' });

    showBody();
    mode = 'diff';
    lines = [];
    lang = opts.lang || langFor(opts.name || '');
    host.dataset.lang = lang;
    highlightDiffRows(list, lang);
    let out = '';
    for (let i = 0; i < list.length; i++) out += diffRowHtml(list[i]);
    const digits = digitsFor(maxNo);
    sizer.style.setProperty('--cv-digits', String(digits));
    inner.dataset.mode = 'diff';
    inner.innerHTML = out;
    inner.style.top = PAD + 'px';
    setSizer(list.length, maxLen, 2 * (digits * charWidth() + 22) + 18);
    if (!opts.keepScroll) resetScroll();
    const texts = list.map((r) => (r.t === '...' || r.t === '@' ? '' : r.text));
    const tints = list.map((r) => (r.t === '+' ? 'add' : r.t === '-' ? 'del' : null));
    updateMinimap(texts, lang, tints);
  }

  function onScroll() {
    if (mode === 'code' && !raf) raf = requestAnimationFrame(() => render(false));
    if (mm && !mmHost.hidden) mm.sync();
  }

  function destroy() {
    scroll.removeEventListener('scroll', onScroll);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (ro) ro.disconnect();
    ro = null;
    if (mm) mm.destroy();
    host.innerHTML = '';
    host.classList.remove('cv');
  }

  scroll.addEventListener('scroll', onScroll, { passive: true });
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => {
      if (mode !== 'code') return;
      rFrom = -1;
      rTo = -1;
      if (!raf) raf = requestAnimationFrame(() => render(true));
    });
    ro.observe(scroll);
  }

  return { el: host, showCode, showDiff, showMessage, resetScroll, destroy };
}