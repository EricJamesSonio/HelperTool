import { esc } from './highlight.js';
import { fileIcon } from './fileIcons.js';
import { state } from '../app_manager/appState.js';

const FOLDER = '<span class="ide-ficon"><svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1.5 3.5a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg></span>';

const TITLES = { mod: 'Modified files', new: 'New files', del: 'Deleted files' };
const EMPTY = { mod: 'No modified files.', new: 'No new files.', del: 'No deleted files.' };
const TIP = { C: 'Conflict', D: 'Deleted', M: 'Modified', R: 'Renamed', A: 'Added (new)', U: 'Untracked (new)' };
const HINT = 'Click a file to open it at its first change.';

let overlay = null;
let ctx = null;
let cur = 'mod';
let busy = false;
let reverting = false;
let revertOpen = false;
let armed = false;
let picked = new Set();

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function listFor(data, kind) {
  if (kind === 'new') return data.added;
  if (kind === 'del') return data.deleted;
  return data.modified;
}

function allPaths(data) {
  const out = [];
  data.modified.forEach((r) => out.push(r.path));
  data.added.forEach((r) => out.push(r.path));
  data.deleted.forEach((r) => out.push(r.path));
  return out;
}

function pickedCount(data, key) {
  return listFor(data, key).filter((r) => picked.has(r.path)).length;
}

function revertTotal(data) {
  return pickedCount(data, 'mod') + pickedCount(data, 'new') + pickedCount(data, 'del');
}

function prunePicked(data) {
  const live = new Set(allPaths(data));
  for (const p of Array.from(picked)) {
    if (!live.has(p)) picked.delete(p);
  }
}

function rowHtml(r, withCheck) {
  const i = r.rel.lastIndexOf('/');
  const name = i < 0 ? r.rel : r.rel.slice(i + 1);
  const dir = i < 0 ? '' : r.rel.slice(0, i);
  const icon = r.kind === 'dir' ? FOLDER : fileIcon(name);
  const letter = r.kind === 'dir' ? 'U' : r.s;
  const check = withCheck
    ? '<input type="checkbox" class="ide-rv-row" data-rvp="' + attr(r.path) + '"' + (picked.has(r.path) ? ' checked' : '') + '>'
    : '';
  return '<div class="ide-ch-item ide-cmd-item' + (r.kind === 'del' ? ' del' : '') + '" data-p="' + attr(r.path) + '" data-t="' + r.kind + '" data-gs="' + letter + '" title="' + attr(r.rel + ' - ' + (TIP[letter] || '')) + '">' +
    check +
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

function setNote(text, isErr) {
  if (!overlay) return;
  const el = overlay.querySelector('.ide-um-hint');
  if (!el) return;
  el.textContent = text || HINT;
  el.classList.toggle('err', !!isErr);
}

function optHtml(key, label, desc, data) {
  const count = listFor(data, key).length;
  const got = pickedCount(data, key);
  const off = count === 0;
  const part = got > 0 && got < count;
  const shown = part ? got + '/' + count : String(count);
  return '<label class="ide-rv-opt' + (off ? ' off' : '') + '">' +
    '<input type="checkbox" data-rv="' + key + '"' + (part ? ' data-part="1"' : '') + (got > 0 && got === count ? ' checked' : '') + (off ? ' disabled' : '') + '>' +
    '<span class="ide-rv-l">' + esc(label) + '</span>' +
    '<span class="ide-rv-n">' + shown + '</span>' +
    '<span class="ide-rv-d">' + esc(desc) + '</span>' +
  '</label>';
}

function renderRevert() {
  if (!overlay || !ctx) return;
  const box = overlay.querySelector('.ide-rv');
  const toggle = overlay.querySelector('[data-cm="rv-toggle"]');
  const data = ctx.getChanges();
  const all = data.modified.length + data.added.length + data.deleted.length;
  if (!all && !reverting) revertOpen = false;
  if (toggle) {
    toggle.disabled = all === 0 || reverting;
    toggle.classList.toggle('open', revertOpen);
  }
  box.classList.toggle('open', revertOpen);
  if (!revertOpen) {
    box.innerHTML = '';
    return;
  }
  const total = revertTotal(data);
  const label = reverting ? 'Reverting...' : (armed ? 'Click again to confirm' : 'Revert selected (' + total + ')');
  box.innerHTML =
    '<div class="ide-rv-title">Revert to the last commit</div>' +
    '<div class="ide-rv-sub">Tick the files to revert. Edits are discarded, new files go to the trash, deleted files come back.</div>' +
    optHtml('mod', 'Modified', 'discard edits', data) +
    optHtml('new', 'New', 'remove from the project', data) +
    optHtml('del', 'Deleted', 'bring back', data) +
    '<div class="ide-rv-act">' +
      '<button type="button" class="ide-um-btn" data-cm="rv-cancel"' + (reverting ? ' disabled' : '') + '>Cancel</button>' +
      '<button type="button" class="ide-um-btn danger' + (armed ? ' armed' : '') + '" data-cm="rv-go"' + (!total || reverting ? ' disabled' : '') + '>' + esc(label) + '</button>' +
    '</div>';
  box.querySelectorAll('[data-part="1"]').forEach((el) => {
    el.indeterminate = true;
  });
}

function render() {
  if (!overlay || !ctx) return;
  const data = ctx.getChanges();
  if (cur === 'del' && !data.deleted.length) cur = 'mod';
  prunePicked(data);
  let tabs = tabHtml('mod', 'Modified', data.modified.length) + tabHtml('new', 'New', data.added.length);
  if (data.deleted.length) tabs += tabHtml('del', 'Deleted', data.deleted.length);
  overlay.querySelector('.ide-cmd-tabs').innerHTML = tabs;
  overlay.querySelector('.ide-um-title').textContent = TITLES[cur];
  const list = listFor(data, cur);
  const body = overlay.querySelector('.ide-um-body');
  const keep = body.scrollTop;
  body.innerHTML = list.length
    ? list.map((r) => rowHtml(r, revertOpen)).join('')
    : '<div class="ide-um-msg">' + esc(EMPTY[cur]) + '</div>';
  body.scrollTop = keep;
  overlay.querySelector('.ide-um-sum').textContent = list.length + ' item' + (list.length === 1 ? '' : 's');
  renderRevert();
}

function close() {
  if (!overlay) return;
  document.removeEventListener('keydown', onKey, true);
  overlay.remove();
  overlay = null;
  ctx = null;
  revertOpen = false;
  armed = false;
  picked = new Set();
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

async function stillDiffers(root, filePath) {
  if (!window.ideLineAPI) return false;
  try {
    const r = await window.ideLineAPI.diff(root, filePath);
    return !!(r && r.success && r.kind === 'tracked' && r.hunks && r.hunks.length);
  } catch (_) {
    return false;
  }
}

async function doRevert() {
  if (reverting || !ctx) return;
  const c = ctx;
  const api = window.ideRevertAPI;
  const root = state.selectedRepoPath;
  if (!api || !root) {
    armed = false;
    setNote('Revert is not available. Fully restart the app and try again.', true);
    renderRevert();
    return;
  }
  const data = c.getChanges();
  const restore = [];
  const remove = [];
  const modPaths = new Set();
  data.modified.forEach((r) => {
    if (picked.has(r.path)) {
      restore.push(r.path);
      modPaths.add(r.path);
    }
  });
  data.deleted.forEach((r) => {
    if (picked.has(r.path)) restore.push(r.path);
  });
  data.added.forEach((r) => {
    if (picked.has(r.path)) remove.push(r.path);
  });
  if (!restore.length && !remove.length) return;
  reverting = true;
  armed = false;
  setNote('Reverting...', false);
  renderRevert();
  let res = null;
  try {
    res = await api.run({ root, restore, remove });
  } catch (err) {
    res = { success: false, error: err && err.message ? err.message : 'Revert failed' };
  }
  const failed = res && res.failed ? res.failed.slice() : [];
  let restored = res && res.restored ? res.restored.slice() : [];
  const removed = res && res.removed ? res.removed : [];
  const bad = new Set();
  for (const p of restored) {
    if (modPaths.has(p) && (await stillDiffers(root, p))) {
      bad.add(p);
      failed.push({ path: p, error: 'Still differs from the last commit' });
    }
  }
  restored = restored.filter((p) => !bad.has(p));
  reverting = false;
  document.dispatchEvent(new CustomEvent('ide:reverted', { detail: { restored, removed } }));
  document.dispatchEvent(new CustomEvent('ide:tree-changed'));
  if (c.refresh) {
    try {
      await c.refresh();
    } catch (_) {}
  }
  if (!overlay) return;
  if (!res || res.success === false) {
    setNote((res && res.error) || 'Revert failed.', true);
  } else {
    let text = 'Restored ' + restored.length + ', removed ' + removed.length;
    if (failed.length) {
      const f = failed[0];
      const nm = String(f.path || '').split(/[\\/]/).pop();
      text += ', ' + failed.length + ' failed (' + nm + ': ' + (f.error || 'unknown error') + ')';
    }
    setNote(text, failed.length > 0);
  }
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

function onChange(e) {
  if (!ctx) return;
  const t = e.target;
  if (!t || !t.matches) return;
  const data = ctx.getChanges();
  if (t.matches('[data-rvp]')) {
    const p = t.getAttribute('data-rvp');
    if (t.checked) picked.add(p);
    else picked.delete(p);
  } else if (t.matches('[data-rv]')) {
    const list = listFor(data, t.getAttribute('data-rv'));
    list.forEach((r) => {
      if (t.checked) picked.add(r.path);
      else picked.delete(r.path);
    });
  } else {
    return;
  }
  armed = false;
  render();
}

function onClick(e) {
  if (e.target === overlay) {
    close();
    return;
  }
  if (e.target.closest && e.target.closest('.ide-rv-row')) return;
  const cm = e.target.closest('[data-cm]');
  if (cm) {
    const act = cm.dataset.cm;
    if (act === 'close') close();
    else if (act === 'refresh') refresh();
    else if (act === 'tab') {
      cur = cm.dataset.tab || 'mod';
      render();
    } else if (act === 'rv-toggle') {
      if (cm.disabled) return;
      revertOpen = !revertOpen;
      armed = false;
      if (revertOpen && ctx) picked = new Set(allPaths(ctx.getChanges()));
      setNote('', false);
      render();
    } else if (act === 'rv-cancel') {
      revertOpen = false;
      armed = false;
      render();
    } else if (act === 'rv-go') {
      if (cm.disabled) return;
      if (!armed) {
        armed = true;
        renderRevert();
        return;
      }
      doRevert();
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
    '<div class="ide-rv"></div>' +
    '<div class="ide-um-foot">' +
      '<span class="ide-um-hint">' + HINT + '</span>' +
      '<span class="ide-um-spacer"></span>' +
      '<button type="button" class="ide-um-btn danger" data-cm="rv-toggle" title="Reset files to the last commit">Revert all...</button>' +
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
  revertOpen = false;
  armed = false;
  picked = new Set();
  overlay = document.createElement('div');
  overlay.className = 'ide-um-overlay';
  overlay.innerHTML = SHELL;
  overlay.addEventListener('click', onClick);
  overlay.addEventListener('change', onChange);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey, true);
  render();
}