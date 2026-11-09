import { state } from '../app_manager/appState.js';
import { esc } from './highlight.js';
import { fileIcon } from './fileIcons.js';

const KEY = 'helpertool-ide-history:';
const TTL = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 150;
const MAX_TEXT = 120000;
const SWEEP_MS = 10 * 60 * 1000;

const ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 10a7 7 0 1 0 2-4.9"/><path d="M3 3v4h4"/><path d="M10 6v4l3 2"/></svg>';
const FOLDER = '<span class="ide-ficon"><svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1.5 3.5a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg></span>';

const SHELL =
'<div class="ide-hx-box" role="dialog" aria-modal="true">' +
  '<div class="ide-hx-head">' +
    '<span class="ide-hx-title">History</span>' +
    '<span class="ide-hx-sum"></span>' +
    '<span class="ide-hx-spacer"></span>' +
    '<button type="button" class="ide-hx-x" data-hx="close" title="Close (Esc)">&times;</button>' +
  '</div>' +
  '<div class="ide-hx-bar">' +
    '<button type="button" class="ide-hx-btn2" data-hx="undolast">Undo latest</button>' +
    '<button type="button" class="ide-hx-btn2" data-hx="redolast">Redo</button>' +
    '<span class="ide-hx-spacer"></span>' +
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
  return '<div class="ide-hx-row' + (e.undone ? ' undone' : '') + '" data-id="' + e.id + '">' +
    icon +
    '<div class="ide-hx-main">' +
      '<div class="ide-hx-rtitle">' + esc(titleOf(e)) + (e.undone ? '<span class="ide-hx-tag">undone</span>' : '') + '</div>' +
      '<div class="ide-hx-rsub" title="' + esc(subOf(e)) + '">' + esc(subOf(e)) + '</div>' +
    '</div>' +
    '<span class="ide-hx-time">' + esc(ago(e.t)) + '</span>' +
    '<button type="button" class="ide-hx-act' + (e.undone ? ' redo' : '') + '" data-hx="' + act + '" data-id="' + e.id + '"' + (busy ? ' disabled' : '') + '>' + (e.undone ? 'Redo' : 'Undo') + '</button>' +
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
  const clearBtn = overlay.querySelector('[data-hx="clear"]');
  clearBtn.disabled = busy || !items.length;
  clearBtn.textContent = clearArmed ? 'Sure? Clear all' : 'Clear history';
  clearBtn.classList.toggle('armed', clearArmed);
  const hint = overlay.querySelector('.ide-hx-hint');
  hint.textContent = notice ? notice.text : 'History is kept for 24 hours, then deleted automatically.';
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
  else if (act === 'clear') {
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

function close() {
  if (!overlay) return;
  document.removeEventListener('keydown', onKey, true);
  overlay.remove();
  overlay = null;
  notice = null;
  clearArmed = false;
}

function open() {
  if (overlay) return;
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
  render();
}

function makeBtn() {
  btn = document.createElement('button');
  btn.id = 'ideHistoryBtn';
  btn.type = 'button';
  btn.className = 'tool-btn ide-hx-btn';
  btn.title = 'History: undo or redo recent pastes and file edits (last 24 hours)';
  btn.setAttribute('aria-label', 'History');
  btn.innerHTML = ICON + '<span class="ide-hx-count" hidden></span>';
  badge = btn.querySelector('.ide-hx-count');
  btn.addEventListener('click', () => {
    if (overlay) close();
    else open();
  });
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
  document.addEventListener('repo:switched', () => {
    listKey = '';
    updateBadge();
    if (overlay) render();
  });
  setInterval(sweep, SWEEP_MS);
  startPlacing();
}