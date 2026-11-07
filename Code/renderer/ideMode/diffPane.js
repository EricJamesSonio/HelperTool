import { highlightRange, langFor, esc } from './highlight.js';
import { state } from '../app_manager/appState.js';

const LS_MODE = 'helpertool-ide-diff-mode';
const FOLD_STEP = 40;
const FOLD_ALL_MAX = 80;
const MAX_VIEW_LINES = 12000;

const SV = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
const I_UP = SV + '<path d="M3.5 10L8 5.5 12.5 10"/></svg>';
const I_DOWN = SV + '<path d="M3.5 6L8 10.5 12.5 6"/></svg>';
const I_SPLIT = SV + '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M8 3v10"/></svg>';
const I_INLINE = SV + '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 8h12"/></svg>';
const I_FILE = SV + '<path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5z"/><path d="M9 1.5v4h4"/></svg>';
const I_FOLD = SV + '<path d="M4 6l4 4 4-4"/></svg>';

const TEMPLATE =
  '<div class="ide-dv-head">' +
    '<div class="ide-dv-title"><span class="ide-dv-name"></span><span class="ide-dv-path"></span></div>' +
    '<div class="ide-dv-actions">' +
      '<span class="ide-dv-stat"></span>' +
      '<span class="ide-dv-count"></span>' +
      '<button type="button" class="ide-dv-btn" data-a="prev" title="Previous change (Alt+Up)">' + I_UP + '</button>' +
      '<button type="button" class="ide-dv-btn" data-a="next" title="Next change (Alt+Down)">' + I_DOWN + '</button>' +
      '<button type="button" class="ide-dv-btn" data-a="mode" title="Toggle side-by-side / inline"></button>' +
      '<button type="button" class="ide-dv-btn" data-a="open" title="Open current file">' + I_FILE + '</button>' +
    '</div>' +
  '</div>' +
  '<div class="ide-dv-sub"></div>' +
  '<div class="ide-dv-body" tabindex="0"></div>';

let els = null;
let hooks = {};
let tabRef = null;
let model = null;
let mode = readMode();
let chgIdx = -1;

function readMode() {
  try {
    return localStorage.getItem(LS_MODE) === 'inline' ? 'inline' : 'split';
  } catch (_) {
    return 'split';
  }
}

function writeMode(v) {
  try { localStorage.setItem(LS_MODE, v); } catch (_) {}
}

function relPath(p) {
  const n = String(p || '').replace(/\\/g, '/');
  const r = (state.selectedRepoPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (r && n.toLowerCase().indexOf(r.toLowerCase() + '/') === 0) return n.slice(r.length + 1);
  return n;
}

function splitLines(content) {
  const a = String(content || '').split(/\r?\n/);
  if (a.length && a[a.length - 1] === '') a.pop();
  return a;
}

function parseDiff(text) {
  const hunks = [];
  let h = null;
  const raws = String(text || '').split('\n');
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i].replace(/\r$/, '');
    if (raw.indexOf('@@') === 0) {
      const m = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!m) continue;
      h = {
        oldStart: Number(m[1]),
        oldCount: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newCount: m[4] === undefined ? 1 : Number(m[4]),
        lines: [],
      };
      hunks.push(h);
      continue;
    }
    if (!h) continue;
    const ch = raw.charAt(0);
    if (ch === ' ') h.lines.push({ k: 'c', text: raw.slice(1) });
    else if (ch === '-') h.lines.push({ k: 'd', text: raw.slice(1) });
    else if (ch === '+') h.lines.push({ k: 'a', text: raw.slice(1) });
  }
  return hunks;
}

function buildRows(hunks, newLines) {
  const rows = [];
  let o = 1;
  let n = 1;
  for (const h of hunks) {
    const os = h.oldCount === 0 ? h.oldStart + 1 : h.oldStart;
    const ns = h.newCount === 0 ? h.newStart + 1 : h.newStart;
    const gap = ns - n;
    if (gap > 0) rows.push({ k: 'f', o, n, count: gap });
    o = os;
    n = ns;
    for (const l of h.lines) {
      if (l.k === 'c') rows.push({ k: 'c', o: o++, n: n++, text: l.text });
      else if (l.k === 'd') rows.push({ k: 'd', o: o++, text: l.text });
      else rows.push({ k: 'a', n: n++, text: l.text });
    }
  }
  if (newLines) {
    const remain = newLines.length - (n - 1);
    if (remain > 0) rows.push({ k: 'f', o, n, count: remain });
  }
  return rows;
}

function computeStats(m) {
  let add = 0;
  let del = 0;
  for (const r of m.rows) {
    if (r.k === 'a') add++;
    else if (r.k === 'd') del++;
  }
  m.add = add;
  m.del = del;
}

function ensureHtml(rows, lang) {
  const todo = rows.filter((r) => r.k !== 'f' && r.h === undefined);
  if (!todo.length) return;
  const texts = todo.map((r) => r.text);
  const html = highlightRange(texts, 0, texts.length - 1, lang).split('\n');
  for (let i = 0; i < todo.length; i++) todo[i].h = html[i] === undefined ? '' : html[i];
}

function foldHtml(r, i) {
  const can = !!model.newLines;
  return '<div class="ide-fold' + (can ? '' : ' disabled') + '" data-fold="' + i + '">' +
    '<span class="ide-fold-ic">' + I_FOLD + '</span>' +
    '<span>' + r.count + ' unchanged line' + (r.count === 1 ? '' : 's') + '</span>' +
    (can ? '<span class="ide-fold-hint">click to expand, shift+click for all</span>' : '') +
  '</div>';
}

function cell(row, kind) {
  if (!row) return '<div class="ide-dc empty"></div>';
  const no = kind === 'del' ? row.o : row.n;
  return '<div class="ide-dc ' + kind + '"><span class="ide-dn">' + no + '</span><span class="ide-dt">' + row.h + '</span></div>';
}

function splitHtml(rows) {
  let out = '';
  let id = 0;
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r.k === 'f') {
      out += foldHtml(r, i);
      i++;
      continue;
    }
    if (r.k === 'c') {
      out += '<div class="ide-dr">' +
        '<div class="ide-dc ctx"><span class="ide-dn">' + r.o + '</span><span class="ide-dt">' + r.h + '</span></div>' +
        '<div class="ide-dc ctx"><span class="ide-dn">' + r.n + '</span><span class="ide-dt">' + r.h + '</span></div>' +
      '</div>';
      i++;
      continue;
    }
    let first = true;
    while (i < rows.length && (rows[i].k === 'd' || rows[i].k === 'a')) {
      const dels = [];
      const adds = [];
      while (i < rows.length && rows[i].k === 'd') dels.push(rows[i++]);
      while (i < rows.length && rows[i].k === 'a') adds.push(rows[i++]);
      const nmax = Math.max(dels.length, adds.length);
      for (let j = 0; j < nmax; j++) {
        const mark = first ? ' data-chg="' + (id++) + '"' : '';
        first = false;
        out += '<div class="ide-dr"' + mark + '>' + cell(dels[j], 'del') + cell(adds[j], 'add') + '</div>';
      }
    }
  }
  return out;
}

function inlineHtml(rows) {
  let out = '';
  let id = 0;
  let prevChg = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.k === 'f') {
      out += foldHtml(r, i);
      prevChg = false;
      continue;
    }
    const chg = r.k !== 'c';
    const mark = chg && !prevChg ? ' data-chg="' + (id++) + '"' : '';
    prevChg = chg;
    const cls = r.k === 'd' ? 'del' : r.k === 'a' ? 'add' : 'ctx';
    const sign = r.k === 'd' ? '-' : r.k === 'a' ? '+' : '';
    out += '<div class="ide-dr1 ' + cls + '"' + mark + '>' +
      '<span class="ide-dn">' + (r.o || '') + '</span>' +
      '<span class="ide-dn">' + (r.n || '') + '</span>' +
      '<span class="ide-dsign">' + sign + '</span>' +
      '<span class="ide-dt">' + r.h + '</span>' +
    '</div>';
  }
  return out;
}

function renderView() {
  const total = model.lines.length;
  if (!total) {
    els.body.innerHTML = '<div class="ide-dv-msg">This file is empty at this commit.</div>';
    return;
  }
  const lines = total > MAX_VIEW_LINES ? model.lines.slice(0, MAX_VIEW_LINES) : model.lines;
  if (!model.html) model.html = highlightRange(lines, 0, lines.length - 1, model.lang).split('\n');
  let out = '<div class="ide-dv-view">';
  for (let i = 0; i < lines.length; i++) {
    out += '<div class="ide-dr1 ctx"><span class="ide-dn">' + (i + 1) + '</span><span class="ide-dt">' + (model.html[i] || '') + '</span></div>';
  }
  if (total > MAX_VIEW_LINES) out += '<div class="ide-dv-msg">Showing the first ' + MAX_VIEW_LINES + ' of ' + total + ' lines.</div>';
  out += '</div>';
  els.body.innerHTML = out;
}

function renderDiff() {
  if (!model.rows.length) {
    els.body.innerHTML = '<div class="ide-dv-msg">No differences between these versions.</div>';
    return;
  }
  ensureHtml(model.rows, model.lang);
  els.body.innerHTML = '<div class="ide-dv-diff ' + (mode === 'split' ? 'is-split' : 'is-inline') + '">' +
    (mode === 'split' ? splitHtml(model.rows) : inlineHtml(model.rows)) +
  '</div>';
}

function updateHead() {
  if (!tabRef) return;
  const spec = tabRef.spec || {};
  const isDiff = !!model && model.kind === 'diff';
  const isView = !!model && model.kind === 'view';
  els.btnPrev.hidden = !isDiff;
  els.btnNext.hidden = !isDiff;
  els.btnMode.hidden = !isDiff;
  els.btnMode.innerHTML = mode === 'split' ? I_INLINE : I_SPLIT;
  els.btnMode.title = mode === 'split' ? 'Switch to inline view' : 'Switch to side-by-side view';
  if (isDiff) {
    els.stat.innerHTML = model.isNew
      ? '<span class="ide-dv-add">New file</span>'
      : '<span class="ide-dv-add">+' + model.add + '</span> <span class="ide-dv-del">\u2212' + model.del + '</span>';
  } else if (isView) {
    els.stat.textContent = model.lines.length + ' lines';
  } else {
    els.stat.textContent = '';
  }
  els.count.textContent = '';
  const left = esc(spec.leftLabel || '');
  const right = esc(spec.rightLabel || '');
  if (isDiff && mode === 'split') {
    els.sub.className = 'ide-dv-sub split';
    els.sub.innerHTML = '<div class="ide-dv-l">' + left + '</div><div class="ide-dv-r">' + right + '</div>';
  } else if (isDiff) {
    els.sub.className = 'ide-dv-sub';
    els.sub.innerHTML = '<div class="ide-dv-l">' + left + ' \u2192 ' + right + '</div>';
  } else if (isView) {
    els.sub.className = 'ide-dv-sub';
    els.sub.innerHTML = '<div class="ide-dv-l">' + right + ' (read only)</div>';
  } else {
    els.sub.className = 'ide-dv-sub';
    els.sub.innerHTML = '';
  }
}

function render() {
  if (!model || !els) return;
  const st = els.body.scrollTop;
  els.root.dataset.lang = model.lang || '';
  if (model.kind === 'error') {
    els.body.innerHTML = '<div class="ide-dv-msg err">' + esc(model.message || 'Failed to load') + '</div>';
  } else if (model.kind === 'view') {
    renderView();
  } else {
    renderDiff();
  }
  els.body.scrollTop = st;
  updateHead();
}

async function load(tab) {
  const spec = tab.spec || {};
  const api = window.electronAPI.git;
  const lang = langFor(tab.fileName);
  let m;
  try {
    if (tab.kind === 'view') {
      const res = await api.fileContent(spec.repo, spec.rightHash, spec.filePath);
      if (!res || !res.success) throw new Error((res && res.error) || 'Cannot read file at this commit');
      m = { kind: 'view', lang, lines: splitLines(res.content) };
    } else {
      const jobs = [api.fileContent(spec.repo, spec.rightHash, spec.filePath)];
      if (spec.leftHash) jobs.push(api.diffCommits(spec.repo, spec.leftHash, spec.rightHash, spec.filePath));
      const out = await Promise.all(jobs);
      const rRes = out[0];
      const dRes = out[1];
      const newLines = rRes && rRes.success ? splitLines(rRes.content) : null;
      let rows;
      if (!spec.leftHash) {
        if (!newLines) throw new Error('Cannot read file at this commit');
        rows = newLines.map((t, i) => ({ k: 'a', n: i + 1, text: t }));
      } else {
        if (!dRes || dRes.success === false) throw new Error((dRes && dRes.error) || 'Cannot compute diff');
        rows = buildRows(parseDiff(dRes.diff || ''), newLines);
      }
      m = { kind: 'diff', lang, rows, newLines, isNew: !spec.leftHash };
      computeStats(m);
    }
  } catch (err) {
    m = { kind: 'error', lang, message: err && err.message ? err.message : String(err) };
  }
  tab.dv = { model: m, scrollTop: 0 };
  if (tabRef === tab) {
    model = m;
    render();
  }
}

function setHead(tab) {
  els.name.textContent = tab.kind === 'view' ? tab.fileName + ' (read only)' : tab.fileName;
  els.path.textContent = relPath(tab.filePath);
}

function saveScroll() {
  if (tabRef && tabRef.dv && els) tabRef.dv.scrollTop = els.body.scrollTop;
}

export function show(tab) {
  if (!els || !tab) return;
  saveScroll();
  tabRef = tab;
  chgIdx = -1;
  setHead(tab);
  if (tab.dv && tab.dv.model) {
    model = tab.dv.model;
    render();
    els.body.scrollTop = tab.dv.scrollTop || 0;
    els.body.focus({ preventScroll: true });
    return;
  }
  model = null;
  els.sub.innerHTML = '';
  els.stat.textContent = '';
  els.btnPrev.hidden = true;
  els.btnNext.hidden = true;
  els.btnMode.hidden = true;
  els.body.innerHTML = '<div class="ide-dv-msg">Loading...</div>';
  els.body.focus({ preventScroll: true });
  load(tab);
}

export function hide() {
  if (!els) return;
  saveScroll();
  tabRef = null;
  model = null;
}

function goChange(dir) {
  if (!model || model.kind !== 'diff') return;
  const list = els.body.querySelectorAll('[data-chg]');
  const n = list.length;
  if (!n) return;
  if (chgIdx < 0 || chgIdx >= n) chgIdx = dir > 0 ? 0 : n - 1;
  else chgIdx = (chgIdx + dir + n) % n;
  const old = els.body.querySelector('.ide-chg-cur');
  if (old) old.classList.remove('ide-chg-cur');
  const el = list[chgIdx];
  el.classList.add('ide-chg-cur');
  el.scrollIntoView({ block: 'center' });
  els.count.textContent = (chgIdx + 1) + ' of ' + n;
}

function expandFold(i, all) {
  if (!model || model.kind !== 'diff' || !model.newLines) return;
  const r = model.rows[i];
  if (!r || r.k !== 'f') return;
  const take = all || r.count <= FOLD_ALL_MAX ? r.count : FOLD_STEP;
  const rest = r.count - take;
  const fromTop = i === model.rows.length - 1;
  const start = fromTop ? 0 : rest;
  const add = [];
  for (let j = 0; j < take; j++) {
    const off = start + j;
    add.push({ k: 'c', o: r.o + off, n: r.n + off, text: model.newLines[r.n - 1 + off] || '' });
  }
  let repl = add;
  if (rest > 0) {
    if (fromTop) repl = add.concat([{ k: 'f', o: r.o + take, n: r.n + take, count: rest }]);
    else repl = [{ k: 'f', o: r.o, n: r.n, count: rest }].concat(add);
  }
  model.rows.splice(i, 1, ...repl);
  render();
}

function onBodyClick(e) {
  const f = e.target.closest('.ide-fold');
  if (!f || f.classList.contains('disabled')) return;
  expandFold(Number(f.dataset.fold), e.shiftKey);
}

function onHeadClick(e) {
  const btn = e.target.closest('.ide-dv-btn');
  if (!btn) return;
  const a = btn.dataset.a;
  if (a === 'prev') goChange(-1);
  else if (a === 'next') goChange(1);
  else if (a === 'mode') {
    mode = mode === 'split' ? 'inline' : 'split';
    writeMode(mode);
    chgIdx = -1;
    render();
  } else if (a === 'open') {
    if (tabRef && hooks.onOpenFile) hooks.onOpenFile(tabRef.filePath);
  }
}

function onKey(e) {
  if ((e.altKey && e.key === 'ArrowDown') || (e.key === 'F3' && !e.shiftKey)) {
    e.preventDefault();
    goChange(1);
  } else if ((e.altKey && e.key === 'ArrowUp') || (e.key === 'F3' && e.shiftKey)) {
    e.preventDefault();
    goChange(-1);
  }
}

export function mount(host, h) {
  hooks = h || {};
  host.innerHTML = TEMPLATE;
  els = {
    root: host,
    name: host.querySelector('.ide-dv-name'),
    path: host.querySelector('.ide-dv-path'),
    stat: host.querySelector('.ide-dv-stat'),
    count: host.querySelector('.ide-dv-count'),
    sub: host.querySelector('.ide-dv-sub'),
    body: host.querySelector('.ide-dv-body'),
    btnPrev: host.querySelector('[data-a="prev"]'),
    btnNext: host.querySelector('[data-a="next"]'),
    btnMode: host.querySelector('[data-a="mode"]'),
  };
  els.btnMode.innerHTML = mode === 'split' ? I_INLINE : I_SPLIT;
  host.querySelector('.ide-dv-head').addEventListener('click', onHeadClick);
  els.body.addEventListener('click', onBodyClick);
  host.addEventListener('keydown', onKey);
}