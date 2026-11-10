import { highlightRange, langFor, langLabel, esc, pathKey } from './highlight.js';
import { fileIcon } from './fileIcons.js';
import { confirmDialog } from '../utils/confirmDialog.js';
import { getLookupRepo, promoteLookup } from '../app_manager/repoTabs.js';

const LH = 20;
const PAD = 8;
const BUF = 25;
const MAX_CHARS = 2000000;
const SESS_KEY = 'helpertool-ide-lookup:';
const EXP_KEY = 'helpertool-ide-lookup-exp:';
const DRAFT_MAX = 1000000;
const DRAFT_TOTAL = 3000000;
const SAVE_GAP = 600;
const BINARY_EXT = new Set('png jpg jpeg gif webp bmp ico icns pdf zip gz tgz rar 7z exe dll so dylib node wasm mp3 mp4 mov avi mkv webm woff woff2 ttf otf eot db sqlite bin class jar'.split(' '));
const DIM_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.cache', '__pycache__', '.swc']);

const SV = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
const I_REFRESH = SV + '<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2.5v3h-3"/></svg>';
const I_COLLAPSE = SV + '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M5.5 8h5"/></svg>';
const I_SAVE = SV + '<path d="M3 2.5h8l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5z"/><path d="M5 2.5v3.5h5V2.5"/><path d="M5 13.5v-4h6v4"/></svg>';
const I_SWAP = SV + '<path d="M3 5.5h9.5"/><path d="M10 3l2.5 2.5L10 8"/><path d="M13 10.5H3.5"/><path d="M6 8l-2.5 2.5L6 13"/></svg>';
const FOLDER_CLOSED = '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1.5 3.5a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg>';
const FOLDER_OPEN = '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" opacity="0.6" d="M1.5 3.5a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1V6h-12z"/><path fill="currentColor" d="M2.2 7h12.6a.7.7 0 0 1 .67.9l-1.3 4.8a1 1 0 0 1-.97.8H2.5a1 1 0 0 1-1-1V8a1 1 0 0 1 .7-1z"/></svg>';

const TEMPLATE =
'<div class="lk-tree-col">' +
  '<div class="lk-head">' +
    '<span class="lk-badge">LOOKUP</span>' +
    '<span class="lk-repo-name"></span>' +
    '<span class="lk-actions">' +
      '<button type="button" class="lk-btn" data-act="promote" title="Make this repo the master (swap with the current master)">' + I_SWAP + '</button>' +
      '<button type="button" class="lk-btn" data-act="saveall" title="Save all open files in this pane">' + I_SAVE + '</button>' +
      '<button type="button" class="lk-btn" data-act="refresh" title="Refresh">' + I_REFRESH + '</button>' +
      '<button type="button" class="lk-btn" data-act="collapse" title="Collapse folders">' + I_COLLAPSE + '</button>' +
    '</span>' +
  '</div>' +
  '<div class="lk-tree"></div>' +
'</div>' +
'<div class="lk-main">' +
  '<div class="lk-tabs"></div>' +
  '<div class="lk-crumbs"></div>' +
  '<div class="lk-editor">' +
    '<div class="lk-empty"></div>' +
    '<div class="lk-codewrap" hidden>' +
      '<div class="lk-gutter"><pre class="lk-gutter-inner"></pre></div>' +
      '<div class="lk-code">' +
        '<div class="lk-hl"><pre class="lk-hl-inner"></pre></div>' +
        '<textarea class="lk-ta" wrap="off" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off"></textarea>' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div class="lk-status">' +
    '<span class="lk-msg"></span>' +
    '<span class="lk-spacer"></span>' +
    '<span class="lk-st-item lk-pos"></span>' +
    '<span class="lk-st-item">UTF-8</span>' +
    '<span class="lk-st-item lk-lang"></span>' +
  '</div>' +
'</div>';

let repo = null;
let els = {};
let tabs = [];
let activePath = null;
let cache = new Map();
let pending = new Map();
let expanded = new Set();
let lines = [''];
let lang = 'plain';
let rendered = { from: -1, to: -1 };
let textChanged = true;
let rafId = 0;
let cursorRaf = 0;
let saveTimer = 0;
let flashTimer = 0;
let treeSeq = 0;
let suspend = false;
let inited = false;

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function normRepo(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function baseName(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
}

function relOf(p) {
  const root = String(repo || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const n = String(p || '').replace(/\\/g, '/');
  return root && n.toLowerCase().indexOf(root.toLowerCase() + '/') === 0 ? n.slice(root.length + 1) : n;
}

function activeTab() {
  return tabs.find((t) => t.path === activePath) || null;
}

function isText(tab) {
  return !!tab && !tab.loading && !tab.notice;
}

function makeTab(path) {
  return {
    path,
    key: pathKey(path),
    name: baseName(path),
    content: '',
    saved: '',
    eol: '\n',
    dirty: false,
    loading: true,
    notice: null,
    scrollTop: 0,
    scrollLeft: 0,
    selStart: 0,
    selEnd: 0,
    draft: null,
  };
}

function flash(msg, ms) {
  if (!els.msg) return;
  els.msg.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    els.msg.textContent = '';
  }, ms || 2000);
}

function injectCss() {
  if (document.getElementById('ideLookupCss')) return;
  const link = document.createElement('link');
  link.id = 'ideLookupCss';
  link.rel = 'stylesheet';
  link.href = './styles/ide-lookup.css';
  document.head.appendChild(link);
}

function loadExpanded(r) {
  try {
    const raw = localStorage.getItem(EXP_KEY + normRepo(r));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (_) {
    return new Set();
  }
}

function saveExpanded() {
  try {
    if (repo) localStorage.setItem(EXP_KEY + normRepo(repo), JSON.stringify(Array.from(expanded)));
  } catch (_) {}
}

async function loadDir(dirPath) {
  if (cache.has(dirPath)) return cache.get(dirPath);
  if (pending.has(dirPath)) return pending.get(dirPath);
  const mine = repo;
  const job = (async () => {
    let val;
    try {
      const res = await window.ideAPI.readDir(dirPath);
      if (res && res.success) val = { entries: res.entries || [], truncated: !!res.truncated, error: null };
      else val = { entries: [], truncated: false, error: (res && res.error) || 'Cannot read folder' };
    } catch (err) {
      val = { entries: [], truncated: false, error: err && err.message ? err.message : 'Cannot read folder' };
    }
    if (mine === repo) cache.set(dirPath, val);
    pending.delete(dirPath);
    return val;
  })();
  pending.set(dirPath, job);
  return job;
}

async function ensureLoaded(dirPath) {
  const dir = await loadDir(dirPath);
  const subs = dir.entries.filter((e) => e.type === 'folder' && expanded.has(e.path));
  if (subs.length) await Promise.all(subs.map((e) => ensureLoaded(e.path)));
}

function rowsHtml(dirPath, depth, out) {
  const dir = cache.get(dirPath);
  if (!dir) return;
  if (dir.error) out.push('<div class="lk-note" style="--d:' + depth + '">' + esc(dir.error) + '</div>');
  for (const e of dir.entries) {
    const p = attr(e.path);
    const k = attr(pathKey(e.path));
    if (e.type === 'folder') {
      const open = expanded.has(e.path);
      out.push('<div class="lk-row folder' + (open ? ' open' : '') + (DIM_DIRS.has(e.name) ? ' dim' : '') + '" data-path="' + p + '" data-k="' + k + '" style="--d:' + depth + '"><span class="lk-chev"></span><span class="ide-ficon">' + (open ? FOLDER_OPEN : FOLDER_CLOSED) + '</span><span class="lk-name">' + esc(e.name) + '</span></div>');
      if (open) rowsHtml(e.path, depth + 1, out);
    } else {
      out.push('<div class="lk-row file" data-path="' + p + '" data-k="' + k + '" style="--d:' + depth + '"><span class="lk-chev"></span>' + fileIcon(e.name) + '<span class="lk-name">' + esc(e.name) + '</span></div>');
    }
  }
  if (dir.truncated) out.push('<div class="lk-note" style="--d:' + depth + '">Showing the first 5000 entries only.</div>');
}

function markActive() {
  if (!els.tree) return;
  const old = els.tree.querySelector('.lk-row.active');
  if (old) old.classList.remove('active');
  if (!activePath) return;
  const el = els.tree.querySelector('.lk-row[data-k="' + CSS.escape(pathKey(activePath)) + '"]');
  if (el) el.classList.add('active');
}

async function renderTree() {
  if (!els.tree) return;
  if (!repo) {
    els.tree.innerHTML = '';
    return;
  }
  const seq = ++treeSeq;
  const mine = repo;
  await ensureLoaded(mine);
  if (seq !== treeSeq || mine !== repo) return;
  const out = [];
  rowsHtml(mine, 0, out);
  const sc = els.tree.scrollTop;
  els.tree.innerHTML = out.length ? out.join('') : '<div class="lk-note">This folder is empty.</div>';
  els.tree.scrollTop = sc;
  markActive();
}

function toggleFolder(path) {
  if (expanded.has(path)) expanded.delete(path);
  else expanded.add(path);
  saveExpanded();
  renderTree();
}

function onTreeClick(e) {
  const row = e.target.closest('.lk-row');
  if (!row) return;
  const path = row.dataset.path;
  if (row.classList.contains('folder')) toggleFolder(path);
  else openFile(path);
}

function renderTabs() {
  if (!els.tabs) return;
  const counts = new Map();
  for (const t of tabs) counts.set(t.name, (counts.get(t.name) || 0) + 1);
  els.tabs.innerHTML = tabs.map((t) => {
    let dir = '';
    if (counts.get(t.name) > 1) {
      const parts = relOf(t.path).split('/').filter(Boolean);
      if (parts.length > 1) dir = '<span class="lk-tab-dir">' + esc(parts[parts.length - 2]) + '</span>';
    }
    return '<div class="lk-tab' + (t.path === activePath ? ' active' : '') + '" data-path="' + attr(t.path) + '" title="' + attr(t.path) + '">' +
      fileIcon(t.name) +
      '<span class="lk-tab-name">' + esc(t.name) + '</span>' +
      dir +
      '<span class="lk-tab-x' + (t.dirty ? ' dirty' : '') + '"></span>' +
    '</div>';
  }).join('');
  const a = els.tabs.querySelector('.lk-tab.active');
  if (a) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderCrumbs(tab) {
  if (!els.crumbs) return;
  if (!tab) {
    els.crumbs.innerHTML = '';
    return;
  }
  const parts = relOf(tab.path).split('/').filter(Boolean);
  els.crumbs.innerHTML = parts
    .map((part, i, arr) => '<span class="lk-crumb' + (i === arr.length - 1 ? ' last' : '') + '">' + esc(part) + '</span>')
    .join('<span class="lk-crumb-sep"></span>');
}

function schedule() {
  if (!rafId) rafId = requestAnimationFrame(render);
}

function scheduleCursor() {
  if (!cursorRaf) cursorRaf = requestAnimationFrame(updateCursor);
}

function scheduleSave() {
  if (suspend || !repo) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, SAVE_GAP);
}

function syncTransform() {
  const ta = els.ta;
  const y = Math.max(0, rendered.from) * LH + PAD - ta.scrollTop;
  els.hlInner.style.transform = 'translate(' + (-ta.scrollLeft) + 'px,' + y + 'px)';
  els.gutterInner.style.transform = 'translateY(' + y + 'px)';
}

function render() {
  rafId = 0;
  const tab = activeTab();
  if (!isText(tab) || !els.codewrap || els.codewrap.hidden) return;
  const ta = els.ta;
  let forced = false;
  if (textChanged) {
    textChanged = false;
    forced = true;
    const text = ta.value;
    tab.content = text;
    const d = text !== tab.saved;
    if (d !== tab.dirty) {
      tab.dirty = d;
      renderTabs();
    }
    lines = text.split('\n');
    els.codewrap.style.setProperty('--digits', String(Math.max(3, String(lines.length).length)));
  }
  const top = ta.scrollTop;
  const h = ta.clientHeight || 600;
  const last = lines.length - 1;
  const vFrom = Math.max(0, Math.floor((top - PAD) / LH));
  const vTo = Math.min(last, Math.ceil((top + h - PAD) / LH));
  if (forced || vFrom < rendered.from || vTo > rendered.to) {
    const from = Math.max(0, vFrom - BUF);
    const to = Math.min(last, vTo + BUF);
    els.hlInner.innerHTML = highlightRange(lines, from, to, lang);
    let nums = '';
    for (let i = from; i <= to; i++) {
      nums += String(i + 1);
      if (i < to) nums += '\n';
    }
    els.gutterInner.innerHTML = nums;
    rendered = { from, to };
  }
  syncTransform();
}

function updateCursor() {
  cursorRaf = 0;
  scheduleSave();
  const tab = activeTab();
  if (!isText(tab)) {
    els.pos.textContent = '';
    return;
  }
  const ta = els.ta;
  const v = ta.value;
  const pos = ta.selectionStart;
  let line = 1;
  let idx = -1;
  for (;;) {
    idx = v.indexOf('\n', idx + 1);
    if (idx === -1 || idx >= pos) break;
    line++;
  }
  const ls = pos === 0 ? 0 : v.lastIndexOf('\n', pos - 1) + 1;
  const sel = ta.selectionEnd - pos;
  els.pos.textContent = 'Ln ' + line + ', Col ' + (pos - ls + 1) + (sel > 0 ? ' (' + sel + ' selected)' : '');
}

function saveViewState() {
  const cur = activeTab();
  if (!isText(cur) || !els.ta) return;
  cur.content = els.ta.value;
  cur.dirty = cur.content !== cur.saved;
  cur.scrollTop = els.ta.scrollTop;
  cur.scrollLeft = els.ta.scrollLeft;
  cur.selStart = els.ta.selectionStart;
  cur.selEnd = els.ta.selectionEnd;
}

function showTab(tab, focus) {
  const code = isText(tab);
  els.codewrap.hidden = !code;
  els.empty.hidden = code;
  if (!tab) els.empty.textContent = 'Open a file from the lookup explorer. This repo is view and edit only.';
  else if (tab.loading) els.empty.textContent = 'Loading...';
  else if (tab.notice) els.empty.textContent = tab.notice;
  renderCrumbs(tab);
  if (!code) {
    els.lang.textContent = '';
    els.pos.textContent = '';
    return;
  }
  lang = langFor(tab.name);
  els.hlInner.dataset.lang = lang;
  els.ta.value = tab.content;
  textChanged = true;
  rendered = { from: -1, to: -1 };
  els.ta.scrollTop = tab.scrollTop;
  els.ta.scrollLeft = tab.scrollLeft;
  try {
    els.ta.setSelectionRange(tab.selStart, tab.selEnd);
  } catch (_) {}
  render();
  if (focus) els.ta.focus({ preventScroll: true });
  els.lang.textContent = langLabel(tab.name);
  scheduleCursor();
}

function activate(path, focus) {
  const tab = tabs.find((t) => t.path === path);
  if (!tab) return;
  if (path === activePath) {
    if (focus !== false && isText(tab)) els.ta.focus({ preventScroll: true });
    return;
  }
  saveViewState();
  activePath = path;
  showTab(tab, focus !== false);
  renderTabs();
  markActive();
  scheduleSave();
}

async function loadTab(tab) {
  const ext = tab.name.split('.').pop().toLowerCase();
  if (BINARY_EXT.has(ext)) {
    tab.notice = 'Binary or media file - preview is not available in the lookup pane.';
  } else {
    try {
      const res = await window.electronAPI.readFile(tab.path);
      if (!res || !res.success) {
        tab.notice = 'Cannot open file: ' + ((res && res.error) || 'unknown error');
      } else if (res.content.length > MAX_CHARS) {
        tab.notice = 'File is too large for the built-in editor (' + Math.round(res.content.length / 1024) + ' KB).';
      } else if (res.content.indexOf('\u0000') !== -1) {
        tab.notice = 'Binary file - preview is not available.';
      } else {
        tab.eol = res.content.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
        tab.content = tab.eol === '\r\n' ? res.content.replace(/\r\n/g, '\n') : res.content;
        tab.saved = tab.content;
        if (typeof tab.draft === 'string' && tab.draft !== tab.saved) {
          tab.content = tab.draft;
          tab.dirty = true;
        }
      }
    } catch (err) {
      tab.notice = 'Cannot open file: ' + (err && err.message ? err.message : String(err));
    }
  }
  tab.draft = null;
  tab.loading = false;
  if (tabs.includes(tab) && activePath === tab.path) showTab(tab, tab.wantFocus === true);
  tab.wantFocus = false;
  renderTabs();
}

async function openFile(path) {
  if (!els.ta || !path) return;
  const key = pathKey(path);
  let tab = tabs.find((t) => t.key === key);
  if (tab) {
    activate(tab.path);
    return;
  }
  tab = makeTab(path);
  tab.wantFocus = true;
  tabs.push(tab);
  activate(tab.path);
  await loadTab(tab);
}

async function closeTab(path) {
  const tab = tabs.find((t) => t.path === path);
  if (!tab) return;
  if (tab.path === activePath) saveViewState();
  if (tab.dirty) {
    const ok = await confirmDialog('Discard unsaved changes to <b>' + esc(tab.name) + '</b>?');
    if (!ok) return;
  }
  const idx = tabs.indexOf(tab);
  if (idx < 0) return;
  tabs.splice(idx, 1);
  if (activePath === tab.path) {
    const next = tabs[idx] || tabs[idx - 1] || null;
    activePath = null;
    if (next) {
      activate(next.path);
    } else {
      showTab(null);
      renderTabs();
      markActive();
    }
  } else {
    renderTabs();
  }
  scheduleSave();
}

async function save(tab) {
  const target = tab || activeTab();
  if (!isText(target)) return false;
  const text = target.path === activePath ? els.ta.value : target.content;
  const out = target.eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
  let res;
  try {
    res = await window.electronAPI.writeFile(target.path, out);
  } catch (err) {
    res = { success: false, error: err && err.message ? err.message : String(err) };
  }
  if (res && res.success) {
    target.content = text;
    target.saved = text;
    target.dirty = false;
    textChanged = true;
    renderTabs();
    schedule();
    scheduleSave();
    flash('Saved ' + target.name);
    return true;
  }
  flash('Save failed: ' + ((res && res.error) || 'unknown error'), 3500);
  return false;
}

export function hasDirty() {
  saveViewState();
  return tabs.some((t) => t.dirty);
}

export async function saveAll() {
  saveViewState();
  for (const t of tabs.filter((x) => x.dirty)) {
    await save(t);
  }
}

export function discardSession() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    if (repo) localStorage.removeItem(SESS_KEY + normRepo(repo));
  } catch (_) {}
  suspend = true;
  tabs = [];
  activePath = null;
  if (els.root) {
    showTab(null);
    renderTabs();
  }
  suspend = false;
}

function persistNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (suspend || !repo || !els.root) return;
  saveViewState();
  let budget = DRAFT_TOTAL;
  const list = tabs.map((t) => {
    const item = {
      path: t.path,
      scrollTop: t.scrollTop || 0,
      scrollLeft: t.scrollLeft || 0,
      selStart: t.selStart || 0,
      selEnd: t.selEnd || 0,
    };
    if (isText(t) && t.dirty && typeof t.content === 'string' && t.content.length <= DRAFT_MAX && t.content.length <= budget) {
      budget -= t.content.length;
      item.draft = t.content;
    }
    return item;
  });
  const payload = { v: 1, active: activePath, tabs: list };
  try {
    localStorage.setItem(SESS_KEY + normRepo(repo), JSON.stringify(payload));
  } catch (_) {
    try {
      payload.tabs = list.map((it) => ({ path: it.path, scrollTop: it.scrollTop, scrollLeft: it.scrollLeft, selStart: it.selStart, selEnd: it.selEnd }));
      localStorage.setItem(SESS_KEY + normRepo(repo), JSON.stringify(payload));
    } catch (_) {}
  }
}

async function restoreSession(forRepo) {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SESS_KEY + normRepo(forRepo)) || 'null');
  } catch (_) {
    data = null;
  }
  if (!data || !Array.isArray(data.tabs) || !data.tabs.length) return;
  suspend = true;
  try {
    const created = [];
    for (const st of data.tabs.slice(0, 30)) {
      if (!st || typeof st.path !== 'string') continue;
      const key = pathKey(st.path);
      if (created.some((t) => t.key === key)) continue;
      const tab = makeTab(st.path);
      tab.scrollTop = Number(st.scrollTop) || 0;
      tab.scrollLeft = Number(st.scrollLeft) || 0;
      tab.selStart = Number(st.selStart) || 0;
      tab.selEnd = Number(st.selEnd) || 0;
      if (typeof st.draft === 'string') tab.draft = st.draft;
      created.push(tab);
    }
    if (!created.length || normRepo(repo) !== normRepo(forRepo)) return;
    tabs = created;
    const want = data.active ? pathKey(data.active) : '';
    const first = created.find((t) => t.key === want) || created[created.length - 1];
    activePath = first.path;
    showTab(first, false);
    renderTabs();
    markActive();
    await Promise.all(created.map(loadTab));
    if (normRepo(repo) !== normRepo(forRepo)) return;
    const dead = created.filter((t) => t.notice && t.notice.indexOf('Cannot open file') === 0);
    if (dead.length) {
      tabs = tabs.filter((t) => !dead.includes(t));
      if (!tabs.some((t) => t.path === activePath)) {
        activePath = null;
        const next = tabs[tabs.length - 1];
        if (next) activate(next.path, false);
        else showTab(null);
      }
      renderTabs();
    }
  } finally {
    suspend = false;
    scheduleSave();
  }
}

function exec(text) {
  els.ta.focus();
  document.execCommand('insertText', false, text);
}

function indent(outdent) {
  const ta = els.ta;
  const v = ta.value;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  if (s === e && !outdent) {
    exec('  ');
    return;
  }
  const bs = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
  const eEff = e > s && v[e - 1] === '\n' ? e - 1 : e;
  let be = v.indexOf('\n', eEff);
  if (be === -1) be = v.length;
  const block = v.slice(bs, be);
  const out = block.split('\n').map((l) => (outdent ? l.replace(/^ {1,2}|^\t/, '') : '  ' + l)).join('\n');
  ta.setSelectionRange(bs, be);
  exec(out);
  ta.setSelectionRange(bs, bs + out.length);
}

function onKeyDown(e) {
  if (e.isComposing) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && !e.shiftKey && !e.altKey && key === 's') {
    e.preventDefault();
    e.stopPropagation();
    save();
    return;
  }
  if (mod && !e.shiftKey && !e.altKey && key === 'w') {
    e.preventDefault();
    e.stopPropagation();
    if (activePath) closeTab(activePath);
    return;
  }
  if (mod || e.altKey) return;
  e.stopPropagation();
  if (e.key === 'Tab') {
    e.preventDefault();
    indent(e.shiftKey);
    return;
  }
  if (e.key === 'Enter') {
    const ta = els.ta;
    const v = ta.value;
    const s = ta.selectionStart;
    const ls = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
    const lead = /^[ \t]*/.exec(v.slice(ls, s))[0];
    e.preventDefault();
    exec('\n' + lead);
  }
}

function onInput() {
  textChanged = true;
  schedule();
  scheduleCursor();
  scheduleSave();
}

function onScroll() {
  syncTransform();
  schedule();
  scheduleSave();
}

function onTabClick(e) {
  const tabEl = e.target.closest('.lk-tab');
  if (!tabEl) return;
  const path = tabEl.dataset.path;
  if (e.target.closest('.lk-tab-x')) {
    closeTab(path);
    return;
  }
  activate(path);
}

function onTabAux(e) {
  if (e.button !== 1) return;
  const tabEl = e.target.closest('.lk-tab');
  if (!tabEl) return;
  e.preventDefault();
  closeTab(tabEl.dataset.path);
}

function refreshAll() {
  cache = new Map();
  pending = new Map();
  renderTree();
}

function onHeadClick(e) {
  const b = e.target.closest('.lk-btn');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'promote') promoteLookup();
  else if (act === 'saveall') saveAll();
  else if (act === 'refresh') refreshAll();
  else if (act === 'collapse') {
    expanded.clear();
    saveExpanded();
    renderTree();
  }
}

async function syncDisk() {
  if (!repo || !els.root || !els.root.isConnected || !document.body.classList.contains('ide-split')) return;
  for (const tab of tabs.slice()) {
    if (!isText(tab) || tab.dirty) continue;
    if (tab.path === activePath && els.ta.value !== tab.saved) continue;
    let res = null;
    try {
      res = await window.electronAPI.readFile(tab.path);
    } catch (_) {
      res = null;
    }
    if (!res || !res.success || typeof res.content !== 'string') continue;
    const eol = res.content.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
    const content = eol === '\r\n' ? res.content.replace(/\r\n/g, '\n') : res.content;
    if (content === tab.saved || tab.dirty || !tabs.includes(tab)) continue;
    if (tab.path === activePath) saveViewState();
    tab.eol = eol;
    tab.content = content;
    tab.saved = content;
    if (tab.path === activePath) showTab(tab, false);
  }
  refreshAll();
}

function build() {
  if (els.root) return;
  const root = document.createElement('div');
  root.id = 'ideLookup';
  root.className = 'ide-root ide-lookup';
  root.innerHTML = TEMPLATE;
  els = {
    root,
    repoName: root.querySelector('.lk-repo-name'),
    tree: root.querySelector('.lk-tree'),
    tabs: root.querySelector('.lk-tabs'),
    crumbs: root.querySelector('.lk-crumbs'),
    empty: root.querySelector('.lk-empty'),
    codewrap: root.querySelector('.lk-codewrap'),
    gutterInner: root.querySelector('.lk-gutter-inner'),
    hlInner: root.querySelector('.lk-hl-inner'),
    ta: root.querySelector('.lk-ta'),
    msg: root.querySelector('.lk-msg'),
    pos: root.querySelector('.lk-pos'),
    lang: root.querySelector('.lk-lang'),
  };
  root.querySelector('.lk-head').addEventListener('click', onHeadClick);
  els.tree.addEventListener('click', onTreeClick);
  els.tabs.addEventListener('click', onTabClick);
  els.tabs.addEventListener('auxclick', onTabAux);
  els.ta.addEventListener('input', onInput);
  els.ta.addEventListener('scroll', onScroll, { passive: true });
  els.ta.addEventListener('keydown', onKeyDown);
  els.ta.addEventListener('keyup', scheduleCursor);
  els.ta.addEventListener('mouseup', scheduleCursor);
  els.ta.addEventListener('focus', scheduleCursor);
  window.addEventListener('beforeunload', persistNow);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      rendered.to = -1;
      schedule();
    }).observe(els.codewrap);
  }
  showTab(null);
}

function place() {
  const ide = document.body.classList.contains('ide-mode');
  const main = document.getElementById('ideMain');
  const want = ide && !!repo && !!els.root && !!main;
  document.body.classList.toggle('ide-split', want);
  if (!want) return;
  if (els.root.previousElementSibling !== main) main.after(els.root);
  rendered.to = -1;
  schedule();
}

function setRepo(next) {
  const want = next || null;
  if (normRepo(want) === normRepo(repo)) {
    place();
    return;
  }
  if (repo && els.root) persistNow();
  suspend = true;
  clearTimeout(saveTimer);
  saveTimer = 0;
  repo = want;
  tabs = [];
  activePath = null;
  cache = new Map();
  pending = new Map();
  expanded = repo ? loadExpanded(repo) : new Set();
  if (repo) build();
  if (els.root) {
    els.repoName.textContent = repo ? baseName(repo) : '';
    els.repoName.title = repo || '';
    showTab(null);
    renderTabs();
    renderTree();
  }
  suspend = false;
  if (repo) restoreSession(repo);
  place();
}

export function init() {
  if (inited) return;
  inited = true;
  injectCss();
  document.addEventListener('repo:lookup-changed', (e) => {
    setRepo(e && e.detail ? e.detail.repoPath : getLookupRepo());
  });
  new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const body = document.querySelector('.app-body');
  if (body) new MutationObserver(place).observe(body, { childList: true });
  window.addEventListener('focus', () => {
    syncDisk();
  });
  setRepo(getLookupRepo());
}