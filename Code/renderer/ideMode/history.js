import { state } from '../app_manager/appState.js';
import { esc } from './highlight.js';
import { fileIcon } from './fileIcons.js';

const KEY = 'helpertool-ide-history:';
const TTL = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 150;
const MAX_TEXT = 120000;
const SWEEP_MS = 10 * 60 * 1000;
const CTX = 2;
const MAX_CELLS = 1000000;
const MAX_ROWS = 300;

const ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 10a7 7 0 1 0 2-4.9"/><path d="M3 3v4h4"/><path d="M10 6v4l3 2"/></svg>';
const FOLDER = '<span class="ide-ficon"><svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1.5 3.5a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg></span>';

const SHELL =
'<div class="ide-hx-box" role="dialog" aria-modal="true">' +
  '<div class="ide-hx-head">' +
    '<span class="ide-hx-title">History</span>' +
    '<span class="ide-hx-sum"></span>' +
    '<span class="ide-hx-spacer"></span>' +
    '<button type="button" class="ide-hx-x" data-hx="close" title="Close (Esc or F4)">&times;</button>' +
  '</div>' +
  '<div class="ide-hx-bar">' +
    '<button type="button" class="ide-hx-btn2" data-hx="undolast">Undo latest</button>' +
    '<button type="button" class="ide-hx-btn2" data-hx="redolast">Redo</button>' +
    '<span class="ide-hx-spacer"></span>' +
    '<button type="button" class="ide-hx-btn2" data-hx="toggleall">Collapse all</button>' +
    '<button type="button" class="ide-hx-btn2 danger" data-hx="clear">Clear history</button>' +
  '</div>' +
  '<div class="ide-hx-body"></div>' +
  '<div class="ide-hx-foot"><span class="ide-hx-hint"></span></div>' +
'</div>';

let handlers = {};
let btn = null;
let badge = null;
let overlay = null;
let list = [];
let listKey = '';
let busy = false;
let notice = null;
let clearArmed = false;
let inited = false;
let collapsed = new Set();
let diffCache = new Map();
let watchObs = null;

function normRepo(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function curKey() {
  return normRepo(state.selectedRepoPath);
}

function fresh(arr) {
  const now = Date.now();
  return arr.filter((e) => e && typeof e.t === 'number' && now - e.t < TTL);
}

function read(key) {
  try {
    const raw = localStorage.getItem(KEY + key);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? fresh(data) : [];
  } catch (_) {
    return [];
  }
}

function write() {
  if (!listKey) return;
  let tries = 0;
  for (;;) {
    try {
      localStorage.setItem(KEY + listKey, JSON.stringify(list));
      return;
    } catch (_) {
      tries++;
      if (tries > 60 || !list.length) return;
      list.shift();
    }
  }
}

function sync() {
  const k = curKey();
  if (k !== listKey) {
    listKey = k;
    list = k ? read(k) : [];
  }
  return list;
}

function sweepAll() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(KEY) === 0) keys.push(k);
    }
    for (const k of keys) {
      const arr = read(k.slice(KEY.length));
      if (!arr.length) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(arr));
    }
  } catch (_) {}
}

function nameOf(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
}

function relOf(p) {
  const root = (state.selectedRepoPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const n = String(p || '').replace(/\\/g, '/');
  return root && n.toLowerCase().indexOf(root.toLowerCase() + '/') === 0 ? n.slice(root.length + 1) : n;
}

function ago(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  return Math.round(m / 60) + 'h ago';
}

function normText(s) {
  return String(s).replace(/\r\n/g, '\n');
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
    } else {
      op.n = n++;
    }
  }
  return ops;
}

function diffRow(op) {
  const cls = op.k === 'a' ? 'add' : op.k === 'd' ? 'del' : 'ctx';
  const sign = op.k === 'a' ? '+' : op.k === 'd' ? '-' : '';
  return '<div class="ide-hx-dr ' + cls + '">' +
    '<span class="ide-hx-dn">' + (op.k === 'a' ? '' : op.o) + '</span>' +
    '<span class="ide-hx-dn">' + (op.k === 'd' ? '' : op.n) + '</span>' +
    '<span class="ide-hx-ds">' + sign + '</span>' +
    '<span class="ide-hx-dt">' + (op.text ? esc(op.text) : '&nbsp;') + '</span>' +
  '</div>';
}

function diffBody(ops) {
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
  let rows = 0;
  for (let i = 0; i < n; i++) {
    if (!show[i]) {
      hidden++;
      continue;
    }
    if (hidden) {
      out += '<div class="ide-hx-gap">' + hidden + ' unchanged line' + (hidden === 1 ? '' : 's') + '</div>';
      hidden = 0;
    }
    if (rows >= MAX_ROWS) {
      out += '<div class="ide-hx-gap">More changes not shown here.</div>';
      return out;
    }
    out += diffRow(ops[i]);
    rows++;
  }
  if (hidden) out += '<div class="ide-hx-gap">' + hidden + ' unchanged line' + (hidden === 1 ? '' : 's') + '</div>';
  return out;
}

function editDetail(e) {
  if (e.big) {
    return '<div class="ide-hx-note">This file was too large to keep in history, so it cannot be undone.</div>';
  }
  const from = e.undone ? e.before : e.after;
  const to = e.undone ? e.after : e.before;
  const ops = diffLines(splitLines(from), splitLines(to));
  let add = 0;
  let del = 0;
  for (const op of ops) {
    if (op.k === 'a') add++;
    else if (op.k === 'd') del++;
  }
  const head = '<div class="ide-hx-dhead">' + (e.undone ? 'Redo will apply' : 'Undo will change') +
    ' <span class="ide-hx-pa">+' + add + '</span> <span class="ide-hx-pd">-' + del + '</span>' +
    '<span class="ide-hx-dleg">red lines are removed, green lines are restored</span></div>';
  if (!add && !del) {
    return head + '<div class="ide-hx-note">Only line endings or spaces at the end of the file change.</div>';
  }
  return head + '<div class="ide-hx-diff">' + diffBody(ops) + '</div>';
}

function pasteDetail(e) {
  const from = relOf(e.from);
  const to = relOf(e.to);
  let text;
  if (e.mode === 'copy') {
    text = e.undone
      ? 'Redo will copy <b>' + esc(from) + '</b> to <b>' + esc(to) + '</b> again.'
      : 'Undo will move the copy <b>' + esc(to) + '</b> to the Recycle Bin. The original <b>' + esc(from) + '</b> stays.';
  } else {
    text = e.undone
      ? 'Redo will move <b>' + esc(from) + '</b> to <b>' + esc(to) + '</b> again.'
      : 'Undo will move <b>' + esc(to) + '</b> back to <b>' + esc(from) + '</b>.';
  }
  return '<div class="ide-hx-note">' + text + '</div>';
}

function detailFor(e) {
  const ck = e.id + '|' + (e.undone ? 1 : 0);
  let html = diffCache.get(ck);
  if (html === undefined) {
    html = e.type === 'edit' ? editDetail(e) : pasteDetail(e);
    diffCache.set(ck, html);
    if (diffCache.size > 200) diffCache.delete(diffCache.keys().next().value);
  }
  return html;
}

function undoableCount() {
  let n = 0;
  for (const e of sync()) {
    if (!e.undone) n++;
  }
  return n;
}

function updateBadge() {
  if (!badge) return;
  const n = undoableCount();
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.hidden = !n;
}

function onAdd(e) {
  const d = e && e.detail;
  if (!d || !curKey()) return;
  sync();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    t: Date.now(),
    type: d.type,
    undone: false,
  };
  if (d.type === 'paste') {
    if (!d.from || !d.to) return;
    entry.mode = d.mode === 'cut' ? 'cut' : 'copy';
    entry.from = d.from;
    entry.to = d.to;
    entry.kind = d.kind === 'folder' ? 'folder' : 'file';
  } else if (d.type === 'edit') {
    if (!d.path || typeof d.before !== 'string' || typeof d.after !== 'string') return;
    entry.path = d.path;
    entry.eol = d.eol === '\r\n' ? '\r\n' : '\n';
    if (d.before.length > MAX_TEXT || d.after.length > MAX_TEXT) {
      entry.big = true;
      entry.before = '';
      entry.after = '';
    } else {
      entry.before = d.before;
      entry.after = d.after;
    }
  } else {
    return;
  }
  list.push(entry);
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  write();
  updateBadge();
  if (overlay) render();
}

async function fsOp(args) {
  const api = window.ideHistoryAPI;
  if (!api || typeof api.op !== 'function') {
    return { success: false, error: 'History service is not loaded. Fully restart the app.' };
  }
  try {
    return await api.op(args);
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
}

async function applyEdit(entry, undo) {
  if (entry.big) return { success: false, error: 'This file was too large to keep in history.' };
  const want = undo ? entry.before : entry.after;
  const expect = undo ? entry.after : entry.before;
  const name = nameOf(entry.path);
  let res = null;
  try {
    res = await window.electronAPI.readFile(entry.path);
  } catch (_) {
    res = null;
  }
  if (!res || !res.success || typeof res.content !== 'string') {
    return { success: false, error: 'Cannot read ' + name };
  }
  if (normText(res.content) !== expect) {
    return { success: false, error: name + ' changed since then. Undo or redo the newer changes first.' };
  }
  const out = entry.eol === '\r\n' ? want.replace(/\n/g, '\r\n') : want;
  let w = null;
  try {
    w = await window.electronAPI.writeFile(entry.path, out);
  } catch (err) {
    w = { success: false, error: err && err.message ? err.message : String(err) };
  }
  return w && w.success ? { success: true } : { success: false, error: (w && w.error) || 'Could not write ' + name };
}

function applyPaste(entry, undo) {
  if (entry.mode === 'copy') {
    return undo
      ? fsOp({ op: 'remove', path: entry.to })
      : fsOp({ op: 'copy', from: entry.from, to: entry.to });
  }
  return undo
    ? fsOp({ op: 'move', from: entry.to, to: entry.from })
    : fsOp({ op: 'move', from: entry.from, to: entry.to });
}

async function run(id, undo) {
  if (busy) return;
  const entry = sync().find((x) => x.id === id);
  if (!entry) return;
  if (undo === !!entry.undone) return;
  busy = true;
  notice = null;
  render();
  let res;
  try {
    res = entry.type === 'edit' ? await applyEdit(entry, undo) : await applyPaste(entry, undo);
  } catch (err) {
    res = { success: false, error: err && err.message ? err.message : String(err) };
  }
  busy = false;
  if (res && res.success) {
    entry.undone = undo;
    entry.ut = Date.now();
    write();
    if (entry.type === 'edit') {
      if (handlers.reloadFile) handlers.reloadFile(entry.path);
    } else {
      if (entry.mode === 'cut') {
        const a = undo ? entry.to : entry.from;
        const b = undo ? entry.from : entry.to;
        document.dispatchEvent(new CustomEvent('ide:path-moved', { detail: { from: a, to: b } }));
      }
      if (handlers.refreshTree) handlers.refreshTree();
    }
    notice = { text: (undo ? 'Undone: ' : 'Redone: ') + titleOf(entry), err: false };
  } else {
    notice = { text: (res && res.error) || 'That did not work.', err: true };
  }
  updateBadge();
  render();
}

function titleOf(e) {
  if (e.type === 'edit') return 'Edited ' + nameOf(e.path);
  if (e.mode === 'cut') return 'Moved ' + nameOf(e.to);
  return 'Pasted copy of ' + nameOf(e.to);
}

function subOf(e) {
  if (e.type === 'edit') return relOf(e.path);
  return relOf(e.from) + ' \u2192 ' + relOf(e.to);
}

function rowHtml(e) {
  const name = e.type === 'edit' ? nameOf(e.path) : nameOf(e.to);
  const icon = e.type === 'paste' && e.kind === 'folder' ? FOLDER : fileIcon(name);
  const act = e.undone ? 'redo' : 'undo';
  const open = !collapsed.has(e.id);
  return '<div class="ide-hx-item' + (e.undone ? ' undone' : '') + (open ? ' open' : '') + '" data-id="' + e.id + '">' +
    '<div class="ide-hx-row">' +
      '<span class="ide-hx-chev"></span>' +
      icon +
      '<div class="ide-hx-main" data-hx="tog" data-id="' + e.id + '" title="Click to show or hide the changes">' +
        '<div class="ide-hx-rtitle">' + esc(titleOf(e)) + (e.undone ? '<span class="ide-hx-tag">undone</span>' : '') + '</div>' +
        '<div class="ide-hx-rsub" title="' + esc(subOf(e)) + '">' + esc(subOf(e)) + '</div>' +
      '</div>' +
      '<span class="ide-hx-time">' + esc(ago(e.t)) + '</span>' +
      '<button type="button" class="ide-hx-act' + (e.undone ? ' redo' : '') + '" data-hx="' + act + '" data-id="' + e.id + '"' + (busy ? ' disabled' : '') + '>' + (e.undone ? 'Redo' : 'Undo') + '</button>' +
    '</div>' +
    (open ? '<div class="ide-hx-detail">' + detailFor(e) + '</div>' : '') +
  '</div>';
}

function render() {
  if (!overlay) return;
  const items = sync().slice().reverse();
  const body = overlay.querySelector('.ide-hx-body');
  const keep = body.scrollTop;
  body.innerHTML = items.length
    ? items.map(rowHtml).join('')
    : '<div class="ide-hx-empty">Nothing here yet. Pasted files, moves and saved edits show up here for 24 hours.</div>';
  body.scrollTop = keep;
  const n = undoableCount();
  overlay.querySelector('.ide-hx-sum').textContent = items.length + ' change' + (items.length === 1 ? '' : 's') + ', ' + n + ' can be undone';
  const hasUndo = items.some((e) => !e.undone);
  const hasRedo = items.some((e) => e.undone);
  overlay.querySelector('[data-hx="undolast"]').disabled = busy || !hasUndo;
  overlay.querySelector('[data-hx="redolast"]').disabled = busy || !hasRedo;
  const allBtn = overlay.querySelector('[data-hx="toggleall"]');
  allBtn.disabled = !items.length;
  const anyOpen = items.some((e) => !collapsed.has(e.id));
  allBtn.textContent = anyOpen ? 'Collapse all' : 'Expand all';
  const clearBtn = overlay.querySelector('[data-hx="clear"]');
  clearBtn.disabled = busy || !items.length;
  clearBtn.textContent = clearArmed ? 'Sure? Clear all' : 'Clear history';
  clearBtn.classList.toggle('armed', clearArmed);
  const hint = overlay.querySelector('.ide-hx-hint');
  hint.textContent = notice ? notice.text : 'History is kept for 24 hours, then deleted automatically. Press F4 to open or close.';
  hint.classList.toggle('err', !!(notice && notice.err));
}

function undoLatest() {
  const items = sync();
  for (let i = items.length - 1; i >= 0; i--) {
    if (!items[i].undone) {
      run(items[i].id, true);
      return;
    }
  }
}

function redoLatest() {
  let pick = null;
  for (const e of sync()) {
    if (e.undone && (!pick || (e.ut || 0) > (pick.ut || 0))) pick = e;
  }
  if (pick) run(pick.id, false);
}

function toggleAll() {
  const items = sync();
  const anyOpen = items.some((e) => !collapsed.has(e.id));
  if (anyOpen) {
    for (const e of items) collapsed.add(e.id);
  } else {
    collapsed = new Set();
  }
  render();
}

function onClick(e) {
  if (e.target === overlay) {
    close();
    return;
  }
  const b = e.target.closest('[data-hx]');
  if (!b) return;
  const act = b.dataset.hx;
  if (act !== 'clear' && clearArmed) {
    clearArmed = false;
    render();
  }
  if (act === 'close') close();
  else if (act === 'undo') run(b.dataset.id, true);
  else if (act === 'redo') run(b.dataset.id, false);
  else if (act === 'undolast') undoLatest();
  else if (act === 'redolast') redoLatest();
  else if (act === 'toggleall') toggleAll();
  else if (act === 'tog') {
    const id = b.dataset.id;
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    render();
  } else if (act === 'clear') {
    if (!clearArmed) {
      clearArmed = true;
      render();
      return;
    }
    clearArmed = false;
    sync();
    list = [];
    write();
    notice = null;
    collapsed = new Set();
    diffCache = new Map();
    updateBadge();
    render();
  }
}

function onKey(e) {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.cf-overlay')) return;
  e.preventDefault();
  e.stopPropagation();
  close();
}

function isOtherModal(node) {
  if (!node || node.nodeType !== 1 || node === overlay) return false;
  const c = typeof node.className === 'string' ? node.className : '';
  if (c.indexOf('ide-hx-') !== -1) return false;
  if (node.getAttribute && node.getAttribute('role') === 'dialog') return true;
  return /overlay|modal|dialog|popup/i.test(c);
}

function onOtherKey(e) {
  if (!overlay) return;
  const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
  const hitF = plain && (e.key === 'F2' || e.key === 'F3');
  const hitTerm = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === '`' || e.code === 'Backquote');
  if (hitF || hitTerm) close();
}

function onOtherClose() {
  close();
}

function unwatchOthers() {
  if (watchObs) {
    watchObs.disconnect();
    watchObs = null;
  }
  document.removeEventListener('keydown', onOtherKey, true);
  document.removeEventListener('ide:close-search', onOtherClose);
}

function watchOthers() {
  unwatchOthers();
  watchObs = new MutationObserver((muts) => {
    if (!overlay) return;
    if (!document.body.classList.contains('ide-mode')) {
      close();
      return;
    }
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (isOtherModal(n)) {
          close();
          return;
        }
      }
    }
  });
  watchObs.observe(document.body, { childList: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', onOtherKey, true);
  document.addEventListener('ide:close-search', onOtherClose);
}

function close() {
  if (!overlay) return;
  unwatchOthers();
  document.removeEventListener('keydown', onKey, true);
  overlay.remove();
  overlay = null;
  notice = null;
  clearArmed = false;
}

function open() {
  if (overlay) return;
  document.dispatchEvent(new CustomEvent('ide:close-search'));
  sweepAll();
  listKey = '';
  sync();
  updateBadge();
  overlay = document.createElement('div');
  overlay.className = 'ide-hx-overlay';
  overlay.innerHTML = SHELL;
  overlay.addEventListener('click', onClick);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey, true);
  watchOthers();
  render();
}

function toggleModal() {
  if (overlay) close();
  else open();
}

function onGlobalKey(e) {
  if (e.key !== 'F4' || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
  if (!document.body.classList.contains('ide-mode')) return;
  e.preventDefault();
  e.stopPropagation();
  toggleModal();
}

function makeBtn() {
  btn = document.createElement('button');
  btn.id = 'ideHistoryBtn';
  btn.type = 'button';
  btn.className = 'tool-btn ide-hx-btn';
  btn.title = 'History: undo or redo recent pastes and file edits (last 24 hours) (F4)';
  btn.setAttribute('aria-label', 'History');
  btn.innerHTML = ICON + '<span class="ide-hx-count" hidden></span>';
  badge = btn.querySelector('.ide-hx-count');
  btn.addEventListener('click', toggleModal);
  updateBadge();
}

function placeBtn() {
  const ext = document.getElementById('ideExtBtn');
  const anchor = ext || document.getElementById('ideCsBtn') || document.getElementById('ideNavSearch');
  if (!anchor) return false;
  if (!btn) makeBtn();
  if (!btn.isConnected || (ext && ext.nextElementSibling !== btn)) anchor.after(btn);
  return !!ext;
}

function startPlacing() {
  let ticks = 0;
  const timer = setInterval(() => {
    ticks++;
    if (placeBtn() || ticks > 40) clearInterval(timer);
  }, 400);
  placeBtn();
}

function injectCss() {
  if (document.getElementById('ideHistoryCss')) return;
  const link = document.createElement('link');
  link.id = 'ideHistoryCss';
  link.rel = 'stylesheet';
  link.href = './styles/ide-history.css';
  document.head.appendChild(link);
}

function sweep() {
  sweepAll();
  listKey = '';
  sync();
  updateBadge();
  if (overlay) render();
}

export function init(h) {
  handlers = h || {};
  if (inited) return;
  inited = true;
  injectCss();
  sweepAll();
  document.addEventListener('ide:history-add', onAdd);
  document.addEventListener('keydown', onGlobalKey, true);
  document.addEventListener('repo:switched', () => {
    listKey = '';
    updateBadge();
    if (overlay) render();
  });
  setInterval(sweep, SWEEP_MS);
  startPlacing();
}