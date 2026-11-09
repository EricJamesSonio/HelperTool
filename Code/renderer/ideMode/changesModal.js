import { esc } from './highlight.js';
import { fileIcon } from './fileIcons.js';
import { state } from '../app_manager/appState.js';

const FOLDER = '<span class="ide-ficon"><svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1.5 3.5a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg></span>';

const TITLES = { mod: 'Modified files', new: 'New files', del: 'Deleted files' };
const EMPTY = { mod: 'No modified files.', new: 'No new files.', del: 'No deleted files.' };
const TIP = { C: 'Conflict', D: 'Deleted', M: 'Modified', R: 'Renamed', A: 'Added (new)', U: 'Untracked (new)' };

let overlay = null;
let ctx = null;
let cur = 'mod';
let busy = false;

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function listFor(data, kind) {
  if (kind === 'new') return data.added;
  if (kind === 'del') return data.deleted;
  return data.modified;
}

function rowHtml(r) {
  const i = r.rel.lastIndexOf('/');
  const name = i < 0 ? r.rel : r.rel.slice(i + 1);
  const dir = i < 0 ? '' : r.rel.slice(0, i);
  const icon = r.kind === 'dir' ? FOLDER : fileIcon(name);
  const letter = r.kind === 'dir' ? 'U' : r.s;
  return '<div class="ide-ch-item ide-cmd-item' + (r.kind === 'del' ? ' del' : '') + '" data-p="' + attr(r.path) + '" data-t="' + r.kind + '" data-gs="' + letter + '" title="' + attr(r.rel + ' - ' + (TIP[letter] || '')) + '">' +
    icon +
    '<span class="ide-ch-name">' + esc(name) + (r.kind === 'dir' ? '/' : '') + '</span>' +
    (dir ? '<span class="ide-ch-dir">' + esc(dir) + '</span>' : '') +
    '<span class="ide-ch-gs">' + letter + '</span>' +
  '</div>';
}

function tabHtml(key, label, count) {
  return '<button type="button" class="ide-cmd-tab' + (cur === key ? ' active' : '') + '" data-cm="tab" data-tab="' + key + '">' +
    esc(label) + ' <span class="ide-cmd-n">' + count + '</span></button>';
}

function render() {
  if (!overlay || !ctx) return;
  const data = ctx.getChanges();
  if (cur === 'del' && !data.deleted.length) cur = 'mod';
  let tabs = tabHtml('mod', 'Modified', data.modified.length) + tabHtml('new', 'New', data.added.length);
  if (data.deleted.length) tabs += tabHtml('del', 'Deleted', data.deleted.length);
  overlay.querySelector('.ide-cmd-tabs').innerHTML = tabs;
  overlay.querySelector('.ide-um-title').textContent = TITLES[cur];
  const list = listFor(data, cur);
  const body = overlay.querySelector('.ide-um-body');
  const keep = body.scrollTop;
  body.innerHTML = list.length
    ? list.map(rowHtml).join('')
    : '<div class="ide-um-msg">' + esc(EMPTY[cur]) + '</div>';
  body.scrollTop = keep;
  overlay.querySelector('.ide-um-sum').textContent = list.length + ' item' + (list.length === 1 ? '' : 's');
}

function close() {
  if (!overlay) return;
  document.removeEventListener('keydown', onKey, true);
  overlay.remove();
  overlay = null;
  ctx = null;
}

function onKey(e) {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.cf-overlay')) return;
  e.preventDefault();
  e.stopPropagation();
  close();
}

async function refresh() {
  if (busy || !ctx || !ctx.refresh) return;
  busy = true;
  try {
    await ctx.refresh();
  } catch (_) {}
  busy = false;
  render();
}

async function firstChangedLine(filePath) {
  const root = state.selectedRepoPath;
  if (!root || !window.ideLineAPI) return null;
  try {
    const res = await window.ideLineAPI.diff(root, filePath);
    if (!res || !res.success) return null;
    if (res.kind === 'new') return 1;
    const hunks = res.hunks || [];
    if (!hunks.length) return null;
    const h = hunks[0];
    return Math.max(1, h.nc > 0 ? h.ns : h.ns + 1);
  } catch (_) {
    return null;
  }
}

async function openAtChange(filePath, c) {
  const line = await firstChangedLine(filePath);
  if (!line) {
    c.onOpenFile(filePath);
    return;
  }
  document.dispatchEvent(new CustomEvent('ide:open-at', { detail: { path: filePath, line, col: 0, len: 0 } }));
}

function onClick(e) {
  if (e.target === overlay) {
    close();
    return;
  }
  const cm = e.target.closest('[data-cm]');
  if (cm) {
    const act = cm.dataset.cm;
    if (act === 'close') close();
    else if (act === 'refresh') refresh();
    else if (act === 'tab') {
      cur = cm.dataset.tab || 'mod';
      render();
    }
    return;
  }
  const item = e.target.closest('.ide-cmd-item');
  if (!item) return;
  const t = item.dataset.t;
  const p = item.dataset.p;
  const c = ctx;
  if (t === 'del') return;
  close();
  if (!c) return;
  if (t === 'dir') c.onRevealDir(p);
  else openAtChange(p, c);
}

const SHELL =
  '<div class="ide-um-box ide-cmd-box" role="dialog" aria-modal="true">' +
    '<div class="ide-um-head">' +
      '<span class="ide-um-title">Changes</span>' +
      '<span class="ide-um-sum"></span>' +
      '<span class="ide-um-spacer"></span>' +
      '<button type="button" class="ide-um-x" data-cm="close" title="Close (Esc)">&times;</button>' +
    '</div>' +
    '<div class="ide-cmd-tabs"></div>' +
    '<div class="ide-um-body"></div>' +
    '<div class="ide-um-foot">' +
      '<span class="ide-um-hint">Click a file to open it at its first change.</span>' +
      '<span class="ide-um-spacer"></span>' +
      '<button type="button" class="ide-um-btn" data-cm="refresh">Refresh</button>' +
      '<button type="button" class="ide-um-btn primary" data-cm="close">Close</button>' +
    '</div>' +
  '</div>';

export function openChangesModal(kind, context) {
  if (!context || typeof context.getChanges !== 'function') return;
  cur = kind === 'new' || kind === 'del' ? kind : 'mod';
  if (overlay) {
    ctx = context;
    render();
    return;
  }
  ctx = context;
  overlay = document.createElement('div');
  overlay.className = 'ide-um-overlay';
  overlay.innerHTML = SHELL;
  overlay.addEventListener('click', onClick);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey, true);
  render();
}