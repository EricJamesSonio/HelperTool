import { state } from '../app_manager/appState.js';
import { esc, pathKey } from './highlight.js';
import { fileIcon } from './fileIcons.js';
const POLL_MS = 10000;
const POLL_DIRS_MAX = 80;
const CH_MAX = 200;
const GS_RANK = { C: 5, D: 4, M: 3, R: 3, A: 2, U: 1 };
const GS_TIP = { C: 'Conflict', D: 'Deleted', M: 'Modified', R: 'Renamed', A: 'Added (new)', U: 'Untracked (new)' };

let changesEl = null;
let changesBody = null;
let changesCount = null;
let gitSig = '';
let gitInfo = { isRepo: false, files: [], dirs: [] };
let decor = new Map();
let untracked = new Set();
let pollTimer = 0;
let polling = false;
let lastPollRepo = null;

function resetGit() {
  gitSig = '';
  gitInfo = { isRepo: false, files: [], dirs: [] };
  decor = new Map();
  untracked = new Set();
  renderChanges();
}

function buildDecor() {
  decor = new Map();
  untracked = new Set();
  const root = state.selectedRepoPath ? pathKey(state.selectedRepoPath) : '';
  const bump = (start, letter) => {
    const up = letter === 'D' || letter === 'R' ? 'M' : letter;
    let cur = start;
    for (let n = 0; n < 60; n++) {
      const i = cur.lastIndexOf('/');
      if (i <= 0) break;
      cur = cur.slice(0, i);
      if (root && cur.length < root.length) break;
      const prev = decor.get(cur);
      if (!prev || GS_RANK[up] > prev.rank) decor.set(cur, { s: up, rank: GS_RANK[up] });
    }
  };
  for (const f of gitInfo.files) {
    const k = pathKey(f.p);
    decor.set(k, { s: f.s, rank: GS_RANK[f.s] || 1 });
    bump(k, f.s);
  }
  for (const d of gitInfo.dirs) {
    const k = pathKey(d);
    untracked.add(k);
    decor.set(k, { s: 'U', rank: 1 });
    bump(k, 'U');
  }
}

function statusOf(key) {
  const d = decor.get(key);
  if (d) return d;
  if (!untracked.size) return null;
  let cur = key;
  for (let n = 0; n < 60; n++) {
    const i = cur.lastIndexOf('/');
    if (i <= 0) return null;
    cur = cur.slice(0, i);
    if (untracked.has(cur)) return { s: 'U', rank: 1 };
  }
  return null;
}

function decorateEl(el, key, isFolder) {
  const st = key ? statusOf(key) : null;
  const s = st ? st.s : '';
  if ((el.dataset.gs || '') !== s) {
    if (s) el.dataset.gs = s;
    else delete el.dataset.gs;
  }
  const b = el.querySelector('.ide-gs');
  if (!b) return;
  const t = s ? (isFolder ? '\u25CF' : s) : '';
  if (b.textContent !== t) b.textContent = t;
  b.title = s ? GS_TIP[s] : '';
}

function applyDecor() {
  if (treeEl) {
    treeEl.querySelectorAll('.ide-row').forEach((r) => decorateEl(r, r.dataset.k, r.classList.contains('folder')));
  }
  if (oeListEl) {
    oeListEl.querySelectorAll('.ide-oe-item').forEach((r) => decorateEl(r, pathKey(r.dataset.path), false));
  }
}

function nativePath(p) {
  const repo = state.selectedRepoPath || '';
  return repo.indexOf('\\') !== -1 ? String(p).replace(/\//g, '\\') : String(p);
}

function relOf(p) {
  const root = (state.selectedRepoPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const n = String(p).replace(/\\/g, '/');
  return root && n.toLowerCase().indexOf(root.toLowerCase() + '/') === 0 ? n.slice(root.length + 1) : n;
}

function chRow(p, s, kind) {
  const rel = relOf(p);
  const i = rel.lastIndexOf('/');
  const name = i < 0 ? rel : rel.slice(i + 1);
  const dir = i < 0 ? '' : rel.slice(0, i);
  const icon = kind === 'dir' ? '<span class="ide-ficon">' + FOLDER_CLOSED + '</span>' : fileIcon(name);
  return '<div class="ide-ch-item' + (kind === 'del' ? ' del' : '') + '" data-p="' + attr(nativePath(p)) + '" data-t="' + kind + '" data-gs="' + s + '" title="' + attr(rel + ' - ' + GS_TIP[s]) + '">' +
    icon +
    '<span class="ide-ch-name">' + esc(name) + (kind === 'dir' ? '/' : '') + '</span>' +
    (dir ? '<span class="ide-ch-dir">' + esc(dir) + '</span>' : '') +
    '<span class="ide-ch-gs">' + (kind === 'dir' ? 'U' : s) + '</span>' +
  '</div>';
}

function chGroup(title, rows) {
  if (!rows.length) return '';
  const shown = rows.slice(0, CH_MAX).join('');
  const more = rows.length > CH_MAX ? '<div class="ide-ch-more">+' + (rows.length - CH_MAX) + ' more</div>' : '';
  return '<div class="ide-ch-sub">' + esc(title) + ' (' + rows.length + ')</div>' + shown + more;
}

function renderChanges() {
  if (!changesEl) return;
  const files = gitInfo.files.slice().sort((a, b) => a.p.localeCompare(b.p));
  const dirs = gitInfo.dirs.slice().sort();
  const total = files.length + dirs.length;
  changesEl.hidden = !gitInfo.isRepo || !total;
  if (changesEl.hidden) return;
  const conflicts = [];
  const modified = [];
  const added = [];
  const deleted = [];
  let nMod = 0;
  let nNew = dirs.length;
  for (const f of files) {
    if (f.s === 'C') {
      conflicts.push(chRow(f.p, 'C', 'file'));
      nMod++;
    } else if (f.s === 'D') {
      deleted.push(chRow(f.p, 'D', 'del'));
    } else if (f.s === 'U' || f.s === 'A') {
      added.push(chRow(f.p, f.s, 'file'));
      nNew++;
    } else {
      modified.push(chRow(f.p, f.s, 'file'));
      nMod++;
    }
  }
  for (const d of dirs) added.push(chRow(d, 'U', 'dir'));
  changesCount.innerHTML =
    (nMod ? '<button type="button" class="ide-ch-n m" data-ch="mod" title="Show only modified files">' + nMod + ' modified</button>' : '') +
    (nNew ? '<button type="button" class="ide-ch-n u" data-ch="new" title="Show only new files">' + nNew + ' new</button>' : '') +
    (deleted.length ? '<button type="button" class="ide-ch-n d" data-ch="del" title="Show only deleted files">' + deleted.length + ' deleted</button>' : '');
  changesBody.innerHTML =
    chGroup('Conflicts', conflicts) +
    chGroup('Modified', modified) +
    chGroup('New', added) +
    chGroup('Deleted', deleted);
}

function getChanges() {
  const out = { modified: [], added: [], deleted: [] };
  const files = gitInfo.files.slice().sort((a, b) => a.p.localeCompare(b.p));
  const dirs = gitInfo.dirs.slice().sort();
  for (const f of files) {
    const row = { path: nativePath(f.p), rel: relOf(f.p), s: f.s, kind: 'file' };
    if (f.s === 'D') {
      row.kind = 'del';
      out.deleted.push(row);
    } else if (f.s === 'U' || f.s === 'A') {
      out.added.push(row);
    } else {
      out.modified.push(row);
    }
  }
  for (const d of dirs) out.added.push({ path: nativePath(d), rel: relOf(d), s: 'U', kind: 'dir' });
  return out;
}

async function openChangesFilter(kind) {
  try {
    const mod = await import('./changesModal.js');
    mod.openChangesModal(kind, {
      getChanges,
      onOpenFile: (p) => {
        if (handlers.onOpenFile) handlers.onOpenFile(p);
      },
      onRevealDir: revealDir,
      refresh: pollOnce,
    });
  } catch (err) {
    console.error('[IDE] changes modal failed to open:', err);
  }
}

function revealDir(dirPath) {
  const repo = state.selectedRepoPath || '';
  const sep = repo.indexOf('\\') !== -1 ? '\\' : '/';
  const anc = ancestorsOf(dirPath + sep + '_');
  for (const a of anc) expanded.add(a);
  saveExpanded();
  revealKey = pathKey(dirPath);
  renderTree();
}

function onChangesClick(e) {
  const it = e.target.closest('.ide-ch-item');
  if (!it) return;
  const t = it.dataset.t;
  const p = it.dataset.p;
  if (t === 'file' && handlers.onOpenFile) handlers.onOpenFile(p);
  else if (t === 'dir') revealDir(p);
}

function dirSig(entries) {
  return entries.map((x) => (x.type === 'folder' ? 'd' : 'f') + x.name).join('|');
}

async function pollOnce() {
  if (polling || !treeEl) return;
  if (!document.body.classList.contains('ide-mode') || document.hidden) return;
  const api = window.ideWatchAPI;
  const repo = state.selectedRepoPath;
  if (!api || !repo || repo !== loadedRepo) return;
  polling = true;
  try {
    const list = [];
    if (cache.has(repo)) list.push(repo);
    for (const d of expanded) {
      if (list.length >= POLL_DIRS_MAX) break;
      if (d !== repo && cache.has(d)) list.push(d);
    }
    const [gs, ds] = await Promise.all([
      api.status(repo).catch(() => null),
      list.length ? api.dirs(list).catch(() => null) : Promise.resolve(null),
    ]);
    if (repo !== state.selectedRepoPath || repo !== loadedRepo) return;
    let dirsChanged = false;
    if (ds && ds.success && ds.dirs) {
      for (const d of list) {
        const r = ds.dirs[d];
        if (!r) continue;
        if (r.error) {
          cache.delete(d);
          continue;
        }
        const old = cache.get(d);
        if (!old) continue;
        if (dirSig(old.entries) !== dirSig(r.entries || [])) {
          cache.set(d, { entries: r.entries || [], truncated: !!r.truncated, error: null });
          dirsChanged = true;
        }
      }
    }
    if (gs && gs.success) {
      const info = gs.isRepo
        ? { isRepo: true, files: gs.files || [], dirs: gs.dirs || [] }
        : { isRepo: false, files: [], dirs: [] };
      const sig = info.isRepo + '|' + info.files.map((f) => f.s + f.p).join('\n') + '|' + info.dirs.join('\n');
      if (sig !== gitSig) {
        gitSig = sig;
        gitInfo = info;
        buildDecor();
        renderChanges();
        if (!dirsChanged) applyDecor();
      }
    }
    if (dirsChanged) renderTree();
  } finally {
    polling = false;
  }
}


const EXP_KEY = 'helpertool-ide-expanded:';
const DIM_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.cache', '__pycache__', '.swc']);

const SVG_OPEN = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
const I_FILE_ADD = SVG_OPEN + '<path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5z"/><path d="M9 1.5v4h4"/><path d="M8 8v4M6 10h4"/></svg>';
const I_FOLDER_ADD = SVG_OPEN + '<path d="M1.5 4v8.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1H7.5L6 3H2.5a1 1 0 0 0-1 1z"/><path d="M8 7.5v4M6 9.5h4"/></svg>';
const I_REFRESH = SVG_OPEN + '<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2.5v3h-3"/></svg>';
const I_COLLAPSE = SVG_OPEN + '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M5.5 8h5"/></svg>';
const I_CLEAR = SVG_OPEN + '<path d="M2.5 4h7M2.5 8h4M2.5 12h7"/><path d="M10.5 7.5l4 4M14.5 7.5l-4 4"/></svg>';

const FOLDER_CLOSED = '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1.5 3.5a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg>';
const FOLDER_OPEN = '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" opacity="0.6" d="M1.5 3.5a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1V6h-12z"/><path fill="currentColor" d="M2.2 7h12.6a.7.7 0 0 1 .67.9l-1.3 4.8a1 1 0 0 1-.97.8H2.5a1 1 0 0 1-1-1V8a1 1 0 0 1 .7-1z"/></svg>';

const TEMPLATE =
'<div class="ide-section ide-oe collapsed">' +
  '<div class="ide-section-head">' +
    '<span class="ide-sec-chev"></span><span class="ide-sec-name">File Express</span><span class="ide-sec-count"></span>' +
    '<span class="ide-sec-actions">' +
      '<button type="button" class="ide-sec-btn" data-act="clearall" title="Clear all open files">' + I_CLEAR + '</button>' +
    '</span>' +
  '</div>' +
  '<div class="ide-sec-body ide-oe-body">' +
    '<div class="ide-empty ide-oe-empty">No open files</div>' +
    '<div class="ide-oe-list"></div>' +
  '</div>' +
'</div>' +
'<div class="ide-section ide-changes collapsed" hidden>' +
  '<div class="ide-section-head">' +
    '<span class="ide-sec-chev"></span><span class="ide-sec-name">Changes</span><span class="ide-sec-count"></span>' +
    '<span class="ide-sec-actions">' +
      '<button type="button" class="ide-sec-btn" data-act="gitrefresh" title="Refresh changes">' + I_REFRESH + '</button>' +
    '</span>' +
  '</div>' +
  '<div class="ide-sec-body ide-ch-body"></div>' +
'</div>' +
'<div class="ide-section ide-files">' +
  '<div class="ide-section-head">' +
    '<span class="ide-sec-chev"></span><span class="ide-sec-name ide-repo-name">No folder opened</span>' +
    '<span class="ide-sec-actions">' +
      '<button type="button" class="ide-sec-btn" data-act="newfile" title="New File">' + I_FILE_ADD + '</button>' +
      '<button type="button" class="ide-sec-btn" data-act="newfolder" title="New Folder">' + I_FOLDER_ADD + '</button>' +
      '<button type="button" class="ide-sec-btn" data-act="refresh" title="Refresh Explorer">' + I_REFRESH + '</button>' +
      '<button type="button" class="ide-sec-btn" data-act="collapse" title="Collapse Folders">' + I_COLLAPSE + '</button>' +
    '</span>' +
  '</div>' +
  '<div class="ide-sec-body ide-tree"></div>' +
'</div>';

let treeEl = null;
let oeEmptyEl = null;
let oeListEl = null;
let oeCountEl = null;
let repoEl = null;
let handlers = {};
let cache = new Map();
let pending = new Map();
let expanded = new Set();
let loadedRepo = null;
let selected = null;
let activeKey = null;
let revealKey = null;
let renderSeq = 0;
let renderRaf = 0;
let saveTimer = 0;

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function baseName(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
}

function dirName(p) {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : p;
}

function loadExpanded(repo) {
  try {
    const raw = localStorage.getItem(EXP_KEY + repo);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (_) {
    return new Set();
  }
}

function saveExpanded() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (loadedRepo) localStorage.setItem(EXP_KEY + loadedRepo, JSON.stringify([...expanded]));
    } catch (_) {}
  }, 400);
}

function loadDir(dirPath) {
  if (cache.has(dirPath)) return Promise.resolve(cache.get(dirPath));
  if (pending.has(dirPath)) return pending.get(dirPath);
  const finish = (val) => {
    pending.delete(dirPath);
    cache.set(dirPath, val);
    return val;
  };
  const p = window.ideAPI.readDir(dirPath).then((res) => {
    if (res && res.success) return finish({ entries: res.entries || [], truncated: !!res.truncated, error: null });
    return finish({ entries: [], truncated: false, error: (res && res.error) || 'Cannot read folder' });
  }).catch((err) => finish({ entries: [], truncated: false, error: err && err.message ? err.message : 'Cannot read folder' }));
  pending.set(dirPath, p);
  return p;
}

async function ensureLoaded(dirPath) {
  const dir = await loadDir(dirPath);
  const subs = dir.entries.filter((e) => e.type === 'folder' && expanded.has(e.path));
  if (subs.length) await Promise.all(subs.map((e) => ensureLoaded(e.path)));
}

function rowsHtml(dirPath, depth, out) {
  const dir = cache.get(dirPath);
  if (!dir) return;
  if (dir.error) out.push('<div class="ide-note" style="--d:' + depth + '">' + esc(dir.error) + '</div>');
  const list = dir.entries;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const p = attr(e.path);
    const k = attr(pathKey(e.path));
    if (e.type === 'folder') {
      const open = expanded.has(e.path);
      out.push('<div class="ide-row folder' + (open ? ' open' : '') + (DIM_DIRS.has(e.name) ? ' dim' : '') + '" data-path="' + p + '" data-k="' + k + '" data-d="' + depth + '" style="--d:' + depth + '"><span class="ide-chev"></span><span class="ide-ficon">' + (open ? FOLDER_OPEN : FOLDER_CLOSED) + '</span><span class="ide-name">' + esc(e.name) + '</span><span class="ide-gs"></span></div>');
      out.push('<div class="ide-children"' + (open ? '' : ' hidden') + '>');
      if (open) rowsHtml(e.path, depth + 1, out);
      out.push('</div>');
    } else {
      out.push('<div class="ide-row file" data-path="' + p + '" data-k="' + k + '" data-d="' + depth + '" style="--d:' + depth + '"><span class="ide-chev"></span>' + fileIcon(e.name) + '<span class="ide-name">' + esc(e.name) + '</span><span class="ide-gs"></span></div>');
    }
  }
  if (dir.truncated) out.push('<div class="ide-note" style="--d:' + depth + '">Showing the first 5000 entries only.</div>');
}

function rowByKey(key) {
  if (!key || !treeEl) return null;
  return treeEl.querySelector('.ide-row[data-k="' + CSS.escape(key) + '"]');
}

function setMark(cls, key) {
  const old = treeEl.querySelector('.ide-row.' + cls);
  if (old) old.classList.remove(cls);
  const el = rowByKey(key);
  if (el) el.classList.add(cls);
}

function markActive() {
  setMark('active', activeKey);
  markDirty();
}
let dirtyKeys = new Set();
let dirtyPaths = [];

function markDirty() {
  if (!treeEl) return;
  treeEl.querySelectorAll('.ide-row.dirty, .ide-row.has-dirty').forEach((r) => {
    r.classList.remove('dirty');
    r.classList.remove('has-dirty');
  });
  for (const k of dirtyKeys) {
    const el = rowByKey(k);
    if (el) el.classList.add('dirty');
  }
  for (const p of dirtyPaths) {
    for (const a of ancestorsOf(p)) {
      const el = rowByKey(pathKey(a));
      if (el) el.classList.add('has-dirty');
    }
  }
}


function markSelected() {
  setMark('selected', selected ? pathKey(selected.path) : null);
}

function scrollReveal() {
  const el = rowByKey(revealKey);
  revealKey = null;
  if (!el || !treeEl) return;
  const tr = treeEl.getBoundingClientRect();
  const rr = el.getBoundingClientRect();
  const delta = rr.top - tr.top - (tr.height / 2 - rr.height / 2);
  if (Math.abs(delta) < 2) return;
  const max = Math.max(0, treeEl.scrollHeight - treeEl.clientHeight);
  const top = Math.max(0, Math.min(max, treeEl.scrollTop + delta));
  treeEl.scrollTo({ top, behavior: 'smooth' });
}

async function doRender() {
  renderRaf = 0;
  if (!treeEl) return;
  const seq = ++renderSeq;
  const repo = state.selectedRepoPath;
  if (repo !== loadedRepo) {
    loadedRepo = repo;
    cache = new Map();
    pending = new Map();
    expanded = repo ? loadExpanded(repo) : new Set();
    selected = null;
    resetGit();
  }
  repoEl.textContent = repo ? baseName(repo) : 'No folder opened';
  if (!repo) {
    treeEl.innerHTML = '<div class="ide-empty">No folder opened. Use Select Repo in the top bar.</div>';
    return;
  }
  await ensureLoaded(repo);
  if (seq !== renderSeq || !document.body.classList.contains('ide-mode')) return;
  const root = cache.get(repo);
  const out = [];
  rowsHtml(repo, 0, out);
  const scroll = treeEl.scrollTop;
  treeEl.innerHTML = out.length ? out.join('') : '<div class="ide-empty">This folder is empty.</div>';
  if (root && root.error && !out.length) treeEl.innerHTML = '<div class="ide-empty">' + esc(root.error) + '</div>';
  treeEl.scrollTop = scroll;
  markActive();
  markSelected();
  applyDecor();
  if (revealKey) scrollReveal();
  if (lastPollRepo !== repo) {
    lastPollRepo = repo;
    pollOnce();
  }
}

export function renderTree() {
  if (!treeEl || !document.body.classList.contains('ide-mode')) return;
  if (!renderRaf) renderRaf = requestAnimationFrame(doRender);
}

export function refresh() {
  cache = new Map();
  pending = new Map();
  renderTree();
  setTimeout(pollOnce, 600);
}

async function toggleFolder(row) {
  const path = row.dataset.path;
  const box = row.nextElementSibling;
  if (!box || !box.classList.contains('ide-children')) return;
  const icon = row.querySelector('.ide-ficon');
  if (expanded.has(path)) {
    expanded.delete(path);
    box.innerHTML = '';
    box.hidden = true;
    row.classList.remove('open');
    icon.innerHTML = FOLDER_CLOSED;
    saveExpanded();
    return;
  }
  expanded.add(path);
  row.classList.add('open');
  icon.innerHTML = FOLDER_OPEN;
  box.hidden = false;
  const depth = Number(row.dataset.d) + 1;
  if (!cache.has(path)) box.innerHTML = '<div class="ide-note" style="--d:' + depth + '">Loading...</div>';
  await ensureLoaded(path);
  if (!expanded.has(path) || !box.isConnected) return;
  const out = [];
  rowsHtml(path, depth, out);
  box.innerHTML = out.join('');
  markActive();
  markSelected();
  applyDecor();
  saveExpanded();
}

function onTreeClick(e) {
  const row = e.target.closest('.ide-row');
  if (!row) return;
  const isFolder = row.classList.contains('folder');
  selected = { path: row.dataset.path, type: isFolder ? 'folder' : 'file' };
  markSelected();
  if (isFolder) {
    toggleFolder(row);
    return;
  }
  revealKey = pathKey(row.dataset.path);
  scrollReveal();
  if (handlers.onOpenFile) handlers.onOpenFile(row.dataset.path);
}

async function onTreeContext(e) {
  const row = e.target.closest('.ide-row');
  if (!row) return;
  e.preventDefault();
  const path = row.dataset.path;
  const isFolder = row.classList.contains('folder');
  const mod = await import('../codebaseManager.js');
  mod.openRenameModal(path, baseName(path), () => {
    cache.delete(dirName(path));
    if (isFolder) cache.delete(path);
    renderTree();
  }, isFolder);
}

function onOeClick(e) {
  const item = e.target.closest('.ide-oe-item');
  if (!item) return;
  const path = item.dataset.path;
  if (e.target.closest('.ide-oe-x')) {
    if (handlers.onCloseTab) handlers.onCloseTab(path);
    return;
  }
  if (handlers.onActivateTab) handlers.onActivateTab(path);
}

function ancestorsOf(filePath) {
  const repo = state.selectedRepoPath;
  if (!repo) return [];
  const rn = repo.replace(/\\/g, '/').replace(/\/+$/, '');
  const fn = filePath.replace(/\\/g, '/');
  if (fn.toLowerCase().indexOf(rn.toLowerCase() + '/') !== 0) return [];
  const segs = fn.slice(rn.length + 1).split('/');
  segs.pop();
  const sep = repo.indexOf('\\') !== -1 ? '\\' : '/';
  const out = [];
  let cur = repo.replace(/[\\/]+$/, '');
  for (let i = 0; i < segs.length; i++) {
    cur += sep + segs[i];
    out.push(cur);
  }
  return out;
}

function revealPath(filePath) {
  revealKey = pathKey(filePath);
  let need = false;
  const anc = ancestorsOf(filePath);
  for (let i = 0; i < anc.length; i++) {
    if (!expanded.has(anc[i])) {
      expanded.add(anc[i]);
      need = true;
    }
  }
  if (need) {
    saveExpanded();
    renderTree();
  } else {
    markActive();
    scrollReveal();
  }
}

export function setOpenEditors(list, act) {
  const prevKey = activeKey;
  activeKey = act ? pathKey(act) : null;
  oeEmptyEl.hidden = list.length > 0;
  oeListEl.innerHTML = list.map((t) =>
    '<div class="ide-oe-item' + (pathKey(t.path) === activeKey ? ' active' : '') + (t.dirty ? ' dirty' : '') + '" data-path="' + attr(t.path) + '" title="' + attr(t.path) + '">' +
      '<span class="ide-oe-x' + (t.dirty ? ' dirty' : '') + '"></span>' +
      fileIcon(t.name) +
      '<span class="ide-name">' + esc(t.name) + '</span>' +
      '<span class="ide-gs"></span>' +
    '</div>'
  ).join('');
  const unsaved = list.filter((t) => t.dirty).length;
  let html = '';
  if (list.length) html += '<span class="ide-open-n">' + list.length + ' open</span>';
  if (unsaved) html += '<button type="button" class="ide-unsaved" title="Review unsaved changes">' + unsaved + ' unsaved</button>';
  oeCountEl.innerHTML = html;
  applyDecor();
  if (activeKey && activeKey !== prevKey) revealPath(act);
  else markActive();
}

function targetFolder() {
  if (selected) return selected.type === 'folder' ? selected.path : dirName(selected.path);
  return state.selectedRepoPath;
}

async function runAction(act) {
  if (act === 'search') {
    if (handlers.onSearch) handlers.onSearch();
    return;
  }
  if (act === 'clearall') {
    if (handlers.onClearAll) handlers.onClearAll();
    return;
  }
  if (act === 'collapse') {
    expanded.clear();
    saveExpanded();
    renderTree();
    return;
  }
  if (act === 'refresh') {
    refresh();
    return;
  }
  if (!state.selectedRepoPath) return;
  const mod = await import('../codebaseManager.js');
  const target = targetFolder();
  const before = cache.get(target);
  const known = new Set(before ? before.entries.map((x) => x.name) : []);
  const isFile = act === 'newfile';
  const done = () => {
    expanded.add(target);
    saveExpanded();
    cache.delete(target);
    renderTree();
    if (!before || !isFile) return;
    loadDir(target).then((dir) => {
      const names = dir.entries.filter((x) => x.type === 'file' && !known.has(x.name)).map((x) => x.name);
      document.dispatchEvent(new CustomEvent('ide:files-created', { detail: { names } }));
    });
  };
  if (act === 'newfile') mod.openCreateFilesModal(target, done);
  else if (act === 'newfolder') mod.openCreateFolderModal(target, done);
}

function onRootClick(e) {
  const unsaved = e.target.closest('.ide-unsaved');
  if (unsaved) {
    e.stopPropagation();
    import('./unsavedModal.js')
      .then((m) => m.openUnsavedModal())
      .catch((err) => console.error('[IDE] unsaved modal failed to open:', err));
    return;
  }
  const chip = e.target.closest('.ide-ch-n');
  if (chip) {
    e.stopPropagation();
    openChangesFilter(chip.dataset.ch || 'mod');
    return;
  }
  const btn = e.target.closest('.ide-sec-btn');
  if (btn) {
    e.stopPropagation();
    if (btn.dataset.act === 'gitrefresh') {
      pollOnce();
      return;
    }
    runAction(btn.dataset.act);
    return;
  }
  const head = e.target.closest('.ide-section-head');
  if (head) head.parentElement.classList.toggle('collapsed');
}

export function mount(rootEl, h) {
  handlers = h || {};
  rootEl.innerHTML = TEMPLATE;
  treeEl = rootEl.querySelector('.ide-tree');
  oeEmptyEl = rootEl.querySelector('.ide-oe-empty');
  oeListEl = rootEl.querySelector('.ide-oe-list');
  oeCountEl = rootEl.querySelector('.ide-sec-count');
  repoEl = rootEl.querySelector('.ide-repo-name');
  changesEl = rootEl.querySelector('.ide-changes');
  changesBody = rootEl.querySelector('.ide-ch-body');
  changesCount = changesEl.querySelector('.ide-sec-count');
  treeEl.addEventListener('click', onTreeClick);
  treeEl.addEventListener('contextmenu', onTreeContext);
  oeListEl.addEventListener('click', onOeClick);
  changesBody.addEventListener('click', onChangesClick);
  rootEl.addEventListener('click', onRootClick);
  document.addEventListener('repo:switched', renderTree);
  document.addEventListener('ide:tree-changed', renderTree);
  document.addEventListener('ide:files-created', () => setTimeout(pollOnce, 400));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollOnce();
  });
  window.addEventListener('focus', () => pollOnce());
  if (!pollTimer) pollTimer = setInterval(pollOnce, POLL_MS);
}