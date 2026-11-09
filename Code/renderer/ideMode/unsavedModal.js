import { state } from '../app_manager/appState.js';
import { esc } from './highlight.js';
import { fileIcon } from './fileIcons.js';
import * as editor from './editor.js';

const CTX = 2;
const MAX_CELLS = 4000000;
const MAX_LINES = 60000;
const CLS = { c: 'ctx', a: 'add', d: 'del' };

const SHELL =
'<div class="ide-um-box" role="dialog" aria-modal="true">' +
  '<div class="ide-um-head">' +
    '<span class="ide-um-title">Unsaved changes</span>' +
    '<span class="ide-um-sum"></span>' +
    '<span class="ide-um-spacer"></span>' +
    '<button type="button" class="ide-um-x" data-um="close" title="Close (Esc)">&times;</button>' +
  '</div>' +
  '<div class="ide-um-body"></div>' +
  '<div class="ide-um-foot">' +
    '<span class="ide-um-hint"></span>' +
    '<span class="ide-um-spacer"></span>' +
    '<button type="button" class="ide-um-btn danger" data-um="discardall">Discard all</button>' +
    '<button type="button" class="ide-um-btn" data-um="close">Close</button>' +
    '<button type="button" class="ide-um-btn primary" data-um="saveall">Save all</button>' +
  '</div>' +
'</div>';

let overlay = null;
let collapsed = new Set();
let notice = null;
let busy = false;
let armed = new Set();

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function relPath(p) {
  const n = String(p || '').replace(/\\/g, '/');
  const r = (state.selectedRepoPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (r && n.toLowerCase().indexOf(r.toLowerCase() + '/') === 0) return n.slice(r.length + 1);
  return n;
}

function splitLines(text) {
  const t = String(text || '');
  return t === '' ? [] : t.split('\n');
}

function lcsOps(a, b) {
  const n = a.length;
  const m = b.length;
  const out = [];
  if (!n || !m || n * m > MAX_CELLS) {
    for (let i = 0; i < n; i++) out.push({ k: 'd', text: a[i] });
    for (let j = 0; j < m; j++) out.push({ k: 'a', text: b[j] });
    return out;
  }
  const w = m + 1;
  const t = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) t[i * w + j] = t[(i + 1) * w + j + 1] + 1;
      else t[i * w + j] = Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ k: 'c', text: a[i] });
      i++;
      j++;
    } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) {
      out.push({ k: 'd', text: a[i] });
      i++;
    } else {
      out.push({ k: 'a', text: b[j] });
      j++;
    }
  }
  while (i < n) {
    out.push({ k: 'd', text: a[i] });
    i++;
  }
  while (j < m) {
    out.push({ k: 'a', text: b[j] });
    j++;
  }
  return out;
}

function diffLines(a, b) {
  let s = 0;
  const lim = Math.min(a.length, b.length);
  while (s < lim && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  const ops = [];
  for (let i = 0; i < s; i++) ops.push({ k: 'c', text: a[i] });
  const mid = lcsOps(a.slice(s, ea), b.slice(s, eb));
  for (const op of mid) ops.push(op);
  for (let i = ea; i < a.length; i++) ops.push({ k: 'c', text: a[i] });
  let o = 1;
  let n = 1;
  for (const op of ops) {
    if (op.k === 'c') {
      op.o = o++;
      op.n = n++;
    } else if (op.k === 'd') {
      op.o = o++;
      op.n = n;
      op.noNew = true;
    } else {
      op.n = n++;
    }
  }
  return ops;
}

function pairMark(d, a) {
  const x = d.text;
  const y = a.text;
  const lim = Math.min(x.length, y.length);
  let p = 0;
  while (p < lim && x[p] === y[p]) p++;
  let sx = x.length;
  let sy = y.length;
  while (sx > p && sy > p && x[sx - 1] === y[sy - 1]) {
    sx--;
    sy--;
  }
  if (p === 0 && sx === x.length) return;
  d.hl = [p, sx];
  a.hl = [p, sy];
}

function markPairs(ops) {
  let i = 0;
  while (i < ops.length) {
    if (ops[i].k !== 'd') {
      i++;
      continue;
    }
    const d0 = i;
    while (i < ops.length && ops[i].k === 'd') i++;
    const a0 = i;
    while (i < ops.length && ops[i].k === 'a') i++;
    const cnt = Math.min(a0 - d0, i - a0);
    for (let j = 0; j < cnt; j++) pairMark(ops[d0 + j], ops[a0 + j]);
  }
}

function textHtml(text, hl) {
  if (!text) return '&nbsp;';
  if (!hl || hl[1] <= hl[0]) return esc(text);
  return esc(text.slice(0, hl[0])) +
    '<mark class="ide-um-mk">' + esc(text.slice(hl[0], hl[1])) + '</mark>' +
    esc(text.slice(hl[1]));
}

function rowHtml(op) {
  const sign = op.k === 'a' ? '+' : op.k === 'd' ? '-' : '';
  const len = op.k === 'd' ? 0 : Math.min(op.text.length, 200);
  return '<div class="ide-um-r ' + CLS[op.k] + '" data-line="' + op.n + '" data-len="' + len + '">' +
    '<span class="ide-um-n">' + (op.k === 'a' ? '' : op.o) + '</span>' +
    '<span class="ide-um-n">' + (op.k === 'd' ? '' : op.n) + '</span>' +
    '<span class="ide-um-s">' + sign + '</span>' +
    '<span class="ide-um-t">' + textHtml(op.text, op.hl) + '</span>' +
  '</div>';
}

function gapHtml(count) {
  return '<div class="ide-um-gap">' + count + ' unchanged line' + (count === 1 ? '' : 's') + '</div>';
}

function bodyHtml(ops) {
  const n = ops.length;
  const show = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (ops[i].k === 'c') continue;
    const from = Math.max(0, i - CTX);
    const to = Math.min(n - 1, i + CTX);
    for (let j = from; j <= to; j++) show[j] = 1;
  }
  let out = '';
  let hidden = 0;
  for (let i = 0; i < n; i++) {
    if (!show[i]) {
      hidden++;
      continue;
    }
    if (hidden) {
      out += gapHtml(hidden);
      hidden = 0;
    }
    out += rowHtml(ops[i]);
  }
  if (hidden) out += gapHtml(hidden);
  return out;
}

function buildFile(f) {
  const a = splitLines(f.saved);
  const b = splitLines(f.content);
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return { add: 0, del: 0, html: '<div class="ide-um-msg">This file is too large to compare here. Open it to review your changes.</div>' };
  }
  const ops = diffLines(a, b);
  markPairs(ops);
  let add = 0;
  let del = 0;
  for (const op of ops) {
    if (op.k === 'a') add++;
    else if (op.k === 'd') del++;
  }
  if (!add && !del) {
    return { add, del, html: '<div class="ide-um-msg">Only line endings or whitespace at the end of the file changed.</div>' };
  }
  return { add, del, html: bodyHtml(ops) };
}

function fileHtml(f, model) {
  const isCollapsed = collapsed.has(f.path);
  const sure = armed.has(f.path);
  return '<div class="ide-um-file' + (isCollapsed ? ' collapsed' : '') + '" data-path="' + attr(f.path) + '">' +
    '<div class="ide-um-fh">' +
      '<span class="ide-um-chev"></span>' +
      fileIcon(f.name) +
      '<span class="ide-um-fname">' + esc(f.name) + '</span>' +
      '<span class="ide-um-fpath">' + esc(relPath(f.path)) + '</span>' +
      '<span class="ide-um-stat"><span class="ide-um-pa">+' + model.add + '</span><span class="ide-um-pd">-' + model.del + '</span></span>' +
      '<button type="button" class="ide-um-btn sm danger' + (sure ? ' armed' : '') + '" data-um="discard" data-path="' + attr(f.path) + '" title="Remove your unsaved changes in this file">' + (sure ? 'Sure?' : 'Discard') + '</button>' +
      '<button type="button" class="ide-um-btn sm" data-um="open" data-path="' + attr(f.path) + '">Open</button>' +
      '<button type="button" class="ide-um-btn sm primary" data-um="save" data-path="' + attr(f.path) + '">Save</button>' +
    '</div>' +
    '<div class="ide-um-fb">' + model.html + '</div>' +
  '</div>';
}

function render() {
  if (!overlay) return;
  const files = editor.getUnsavedFiles();
  if (!files.length) {
    close();
    return;
  }
  const body = overlay.querySelector('.ide-um-body');
  const keep = body.scrollTop;
  let totalAdd = 0;
  let totalDel = 0;
  let html = '';
  for (const f of files) {
    const model = buildFile(f);
    totalAdd += model.add;
    totalDel += model.del;
    html += fileHtml(f, model);
  }
  body.innerHTML = html;
  body.scrollTop = keep;
  overlay.querySelector('.ide-um-sum').innerHTML =
    files.length + ' file' + (files.length === 1 ? '' : 's') +
    ' <span class="ide-um-pa">+' + totalAdd + '</span> <span class="ide-um-pd">-' + totalDel + '</span>';
  const allBtn = overlay.querySelector('[data-um="discardall"]');
  const allSure = armed.has('*');
  allBtn.textContent = allSure ? 'Sure? Discard all' : 'Discard all';
  allBtn.classList.toggle('armed', allSure);
  const hint = overlay.querySelector('.ide-um-hint');
  hint.textContent = notice ? notice.text : 'Click a changed line to jump to it in the editor.';
  hint.classList.toggle('err', !!(notice && notice.err));
}

function close() {
  if (!overlay) return;
  document.removeEventListener('keydown', onKey, true);
  overlay.remove();
  overlay = null;
  notice = null;
  armed = new Set();
}

function onKey(e) {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.cf-overlay')) return;
  e.preventDefault();
  e.stopPropagation();
  close();
}

async function saveOne(path) {
  if (busy) return;
  busy = true;
  try {
    const ok = await editor.saveTab(path);
    notice = ok ? null : { text: 'Could not save that file.', err: true };
  } finally {
    busy = false;
  }
  render();
}

async function saveAll() {
  if (busy) return;
  busy = true;
  let failed = 0;
  try {
    const files = editor.getUnsavedFiles();
    for (const f of files) {
      const ok = await editor.saveTab(f.path);
      if (!ok) failed++;
    }
  } finally {
    busy = false;
  }
  notice = failed ? { text: failed + ' file(s) could not be saved.', err: true } : null;
  render();
}
function discardOne(path) {
  if (busy) return;
  if (!armed.has(path)) {
    armed = new Set([path]);
    render();
    return;
  }
  armed = new Set();
  const ok = editor.discardTab(path);
  notice = ok ? null : { text: 'Could not discard that file.', err: true };
  render();
}

function discardAll() {
  if (busy) return;
  if (!armed.has('*')) {
    armed = new Set(['*']);
    render();
    return;
  }
  armed = new Set();
  let failed = 0;
  for (const f of editor.getUnsavedFiles()) {
    if (!editor.discardTab(f.path)) failed++;
  }
  notice = failed ? { text: failed + ' file(s) could not be discarded.', err: true } : null;
  render();
}

async function onClick(e) {
  if (e.target === overlay) {
    close();
    return;
  }
  const um = e.target.closest('[data-um]');
  if (um) {
    const act = um.dataset.um;
    if (act === 'discard') {
      discardOne(um.dataset.path);
      return;
    }
    if (act === 'discardall') {
      discardAll();
      return;
    }
    if (armed.size) {
      armed = new Set();
      render();
    }
    if (act === 'close') close();
    else if (act === 'saveall') await saveAll();
    else if (act === 'save') await saveOne(um.dataset.path);
    else if (act === 'open') {
      const path = um.dataset.path;
      close();
      editor.openFile(path);
    }
    return;
  }
  if (armed.size) {
    armed = new Set();
    render();
  }
  const row = e.target.closest('.ide-um-r');
  if (row) {
    const file = row.closest('.ide-um-file');
    if (!file) return;
    const path = file.dataset.path;
    const line = Number(row.dataset.line) || 1;
    const len = Number(row.dataset.len) || 0;
    close();
    editor.openAt(path, line, 0, len);
    return;
  }
  const head = e.target.closest('.ide-um-fh');
  if (head) {
    const file = head.parentElement;
    const path = file.dataset.path;
    if (collapsed.has(path)) collapsed.delete(path);
    else collapsed.add(path);
    file.classList.toggle('collapsed');
  }
}

export function openUnsavedModal() {
  if (overlay) {
    render();
    return;
  }
  const files = editor.getUnsavedFiles();
  if (!files.length) return;
  collapsed = new Set();
  armed = new Set();
  notice = null;
  overlay = document.createElement('div');
  overlay.className = 'ide-um-overlay';
  overlay.innerHTML = SHELL;
  overlay.addEventListener('click', onClick);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey, true);
  render();
}