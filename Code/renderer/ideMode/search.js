import { state } from '../app_manager/appState.js';
import { esc } from './highlight.js';
import { fileIcon } from './fileIcons.js';

const SHOW = 300;
const MIN_CHARS = 2;
const REQ_MAX = 1500;
const CACHE_MAX = 24;
const DEBOUNCE = 110;
const WIN_BEFORE = 40;
const WIN_AFTER = 80;
const EDIT_MAX_LEN = 2000;
const LS_STATE = 'helpertool-ide-search-state';
const PHASE_LABEL = { files: 'file names', content: 'contents', similar: 'similar words' };

const SVG_SEARCH = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>';
const fx = { bar: null, chips: null, clear: null, list: [], sel: new Set(), req: 0 };

function extLabel(e) {
  return e ? '.' + e : 'no ext';
}

function renderExts() {
  if (!fx.bar) return;
  if (!fx.list.length) {
    fx.bar.hidden = true;
    return;
  }
  fx.bar.hidden = false;
  let html = '<button type="button" class="ide-sm-ext-chip all' + (fx.sel.size ? '' : ' on') + '" data-ext="*">All types</button>';
  for (const item of fx.list) {
    const e = item[0];
    html += '<button type="button" class="ide-sm-ext-chip' + (fx.sel.has(e) ? ' on' : '') + '" data-ext="' + attr(e) + '" title="' + item[1] + ' files">' +
      esc(extLabel(e)) + '<span class="ide-sm-ext-n">' + item[1] + '</span></button>';
  }
  fx.chips.innerHTML = html;
  fx.clear.hidden = !fx.sel.size;
}

function setExts(list) {
  fx.list = list;
  const have = new Set(list.map((x) => x[0]));
  for (const e of Array.from(fx.sel)) {
    if (!have.has(e)) fx.sel.delete(e);
  }
  renderExts();
}

function loadExts(root) {
  const api = streamApi();
  if (!api) return;
  const my = ++fx.req;
  api.warm(root).then((res) => {
    if (my !== fx.req || root !== state.selectedRepoPath) return;
    if (res && Array.isArray(res.exts)) setExts(res.exts);
  }).catch(() => {});
}

function onExtClick(e) {
  const b = e.target.closest('.ide-sm-ext-chip, .ide-sm-ext-clear');
  if (!b) return;
  if (b.classList.contains('ide-sm-ext-clear') || b.dataset.ext === '*') {
    fx.sel.clear();
  } else if (fx.sel.has(b.dataset.ext)) {
    fx.sel.delete(b.dataset.ext);
  } else {
    fx.sel.add(b.dataset.ext);
  }
  renderExts();
  disarm();
  schedule();
}


const TEMPLATE =
'<div class="ide-sm ide-root">' +
  '<div class="ide-sm-head">' +
    '<span class="ide-sm-icon">' + SVG_SEARCH + '</span>' +
    '<input class="ide-sm-input" type="text" spellcheck="false" autocomplete="off" placeholder="Search words in the codebase..." />' +
    '<span class="ide-sm-status"></span>' +
  '</div>' +
  '<div class="ide-sm-ext" hidden>' +
    '<span class="ide-sm-ext-lbl">File types</span>' +
    '<div class="ide-sm-ext-chips"></div>' +
    '<button type="button" class="ide-sm-ext-clear" hidden title="Search all file types">Clear</button>' +
  '</div>' +
  '<div class="ide-sm-bar"><span></span></div>' +
  '<div class="ide-sm-body">' +
    '<div class="ide-sm-list"></div>' +
    '<div class="ide-sm-preview">' +
      '<div class="ide-sm-pv-title"></div>' +
      '<div class="ide-sm-pv-code"></div>' +
    '</div>' +
  '</div>' +
  '<div class="ide-sm-rep">' +
    '<span class="ide-sm-rep-lbl">Replace</span>' +
    '<span class="ide-sm-rep-target" title="Searched text"></span>' +
    '<span class="ide-sm-rep-arrow">&rarr;</span>' +
    '<input class="ide-sm-rep-in" type="text" spellcheck="false" autocomplete="off" placeholder="Replace with..." />' +
    '<button type="button" class="ide-sm-rbtn" data-r="case" title="Match case when replacing">Aa</button>' +
    '<button type="button" class="ide-sm-rbtn" data-r="one" title="Replace on the selected line (Enter)">Replace selected</button>' +
    '<button type="button" class="ide-sm-rbtn primary" data-r="all" title="Replace in every listed file (Ctrl+Alt+Enter)">Replace all</button>' +
    '<button type="button" class="ide-sm-rbtn" data-r="revert" title="Undo the last replace">Revert</button>' +
    '<span class="ide-sm-rep-msg"></span>' +
  '</div>' +
  '<div class="ide-sm-foot">' +
    '<span><kbd>Up</kbd><kbd>Down</kbd> navigate</span>' +
    '<span><kbd>Click</kbd> preview / expand</span>' +
    '<span><kbd>Double-click</kbd> or <kbd>Enter</kbd> open</span>' +
    '<span><kbd>Esc</kbd> close</span>' +
    '<span class="ide-sm-foot-note">Preview lines are editable. Results stream in: exact matches first, then similar words</span>' +
  '</div>' +
'</div>';

let overlay = null;
let input = null;
let listEl = null;
let statusEl = null;
let barEl = null;
let barFill = null;
let pvTitle = null;
let pvCode = null;
let repIn = null;
let repTarget = null;
let repMsg = null;
let btnOne = null;
let btnAll = null;
let btnRevert = null;
let btnCase = null;
let onOpen = null;
let isDirtyCb = null;
let onFileChanged = null;

let results = [];
let nav = [];
let navGroup = [];
let groupItems = new Map();
let collapsed = new Set();
let sel = null;
let userMoved = false;
let curId = 0;
let curQuery = '';
let finished = true;
let pendingReset = false;
let pendingOpen = false;
let phase = 'files';
let progress = 0;
let doneInfo = null;
let renderRaf = 0;
let timer = 0;
let pvTimer = 0;
let msgTimer = 0;
let armed = 0;
let busy = false;
let repCase = false;
let previewFor = null;
let pvFile = null;
let edit = null;
let prevFocus = null;
let fileCache = new Map();
let undoStack = [];
let pendingInvalidate = new Set();

function baseName(p) {
  return String(p || '').split('/').pop();
}

function dirName(p) {
  const s = String(p || '');
  const i = s.lastIndexOf('/');
  return i < 0 ? '' : s.slice(0, i);
}

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function cmp(a, b) {
  return (b.score - a.score) || a.rel.localeCompare(b.rel) || (a.line - b.line);
}

function lineCmp(a, b) {
  return (a.line - b.line) || (a.col - b.col);
}

function streamApi() {
  return window.ideSearchStream || null;
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_STATE) || 'null') || {};
  } catch (_) {
    return {};
  }
}

function saveState() {
  if (!input || !repIn) return;
  try {
    localStorage.setItem(LS_STATE, JSON.stringify({ cs: repCase }));
  } catch (_) {}
}

function snippetOf(line, col, len) {
  const start = Math.max(0, col - 50);
  const raw = line.slice(start, start + 200);
  const trimmed = raw.replace(/^\s+/, '');
  const lead = raw.length - trimmed.length;
  const text = trimmed.replace(/\s+$/, '');
  return { text, hs: Math.max(0, col - start - lead), hl: len, more: start > 0 };
}

function build() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'ide-sm-overlay ide-root';
  overlay.hidden = true;
  overlay.innerHTML = TEMPLATE;
  document.body.appendChild(overlay);
  input = overlay.querySelector('.ide-sm-input');
  listEl = overlay.querySelector('.ide-sm-list');
  statusEl = overlay.querySelector('.ide-sm-status');
  barEl = overlay.querySelector('.ide-sm-bar');
  barFill = barEl.firstElementChild;
  pvTitle = overlay.querySelector('.ide-sm-pv-title');
  pvCode = overlay.querySelector('.ide-sm-pv-code');
  repIn = overlay.querySelector('.ide-sm-rep-in');
  repTarget = overlay.querySelector('.ide-sm-rep-target');
  repMsg = overlay.querySelector('.ide-sm-rep-msg');
  btnOne = overlay.querySelector('[data-r="one"]');
  btnAll = overlay.querySelector('[data-r="all"]');
  btnRevert = overlay.querySelector('[data-r="revert"]');
  btnCase = overlay.querySelector('[data-r="case"]');
  fx.bar = overlay.querySelector('.ide-sm-ext');
  fx.chips = overlay.querySelector('.ide-sm-ext-chips');
  fx.clear = overlay.querySelector('.ide-sm-ext-clear');
  const st = loadState();
  input.value = '';
  repIn.value = '';
  repCase = !!st.cs;
  btnCase.classList.toggle('on', repCase);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  input.addEventListener('input', () => {
    saveState();
    updateRepUi();
    schedule();
  });
  input.addEventListener('keydown', onKey);
  repIn.addEventListener('input', () => {
    saveState();
    disarm();
    updateRepUi();
  });
  repIn.addEventListener('keydown', onRepKey);
  overlay.querySelector('.ide-sm-rep').addEventListener('click', onRepClick);
  fx.bar.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
  fx.bar.addEventListener('click', onExtClick);
  document.addEventListener('ide:close-search', () => {
    close(true);
  });
  listEl.addEventListener('mousedown', (e) => e.preventDefault());
  listEl.addEventListener('click', (e) => {
    const grp = e.target.closest('.ide-sm-grp');
    if (grp) {
      toggleGroup(grp.dataset.rel);
      return;
    }
    const row = e.target.closest('.ide-sm-row');
    if (!row) return;
    setSelIndex(Number(row.dataset.i));
  });
  listEl.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.ide-sm-row, .ide-sm-grp');
    if (!row) return;
    openResult(Number(row.dataset.i));
  });
  pvCode.addEventListener('input', onPvInput);
  pvCode.addEventListener('focusout', () => {
    commitEdit();
  });
  pvCode.addEventListener('keydown', onPvKey);
  const api = streamApi();
  if (api) api.onBatch(onBatch);
  showEmpty('Type at least ' + MIN_CHARS + ' characters to search the codebase.');
  updateRepUi();
  renderExts();
}

function setStatus(text) {
  statusEl.textContent = text || '';
}

function setRepMsg(text, warn) {
  if (!repMsg) return;
  repMsg.textContent = text || '';
  repMsg.classList.toggle('warn', !!warn);
  clearTimeout(msgTimer);
  if (text) {
    msgTimer = setTimeout(() => {
      repMsg.textContent = '';
      repMsg.classList.remove('warn');
    }, 9000);
  }
}

function showEmpty(msg) {
  nav = [];
  navGroup = [];
  groupItems = new Map();
  listEl.innerHTML = '<div class="ide-sm-empty">' + esc(msg) + '</div>';
  clearPreview();
}

function clearPreview() {
  previewFor = null;
  pvFile = null;
  pvTitle.textContent = '';
  pvCode.innerHTML = '';
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = 0;
    run();
  }, DEBOUNCE);
}

function cancelRemote() {
  const api = streamApi();
  if (api) api.cancel(curId).catch(() => {});
}

function tagFor(kind) {
  if (kind === 'near') return '<span class="ide-sm-tag">similar</span>';
  if (kind === 'fuzzy') return '<span class="ide-sm-tag">fuzzy</span>';
  if (kind === 'all') return '<span class="ide-sm-tag">words</span>';
  if (kind === 'file') return '<span class="ide-sm-tag">file</span>';
  return '';
}

function codeHtml(r) {
  const t = r.text || '';
  const hs = Math.min(t.length, Math.max(0, r.hs || 0));
  const he = Math.min(t.length, hs + (r.hl || 0));
  return (r.more ? '<span class="ide-sm-dim">...</span>' : '') +
    esc(t.slice(0, hs)) +
    '<span class="ide-sm-hit">' + esc(t.slice(hs, he)) + '</span>' +
    esc(t.slice(he));
}

function rowHtml(r, i, isSel, nested) {
  const cls = 'ide-sm-row' + (nested ? ' nested' : '') + (isSel ? ' sel' : '');
  if (nested) {
    const label = r.kind === 'file' ? 'name' : String(r.line);
    return '<div class="' + cls + '" data-i="' + i + '">' +
      '<span class="ide-sm-nl">' + esc(label) + '</span>' +
      '<div class="ide-sm-code">' + codeHtml(r) + '</div>' +
      (r.kind === 'file' ? '' : tagFor(r.kind)) +
    '</div>';
  }
  return '<div class="' + cls + '" data-i="' + i + '">' +
    '<div class="ide-sm-code">' + codeHtml(r) + '</div>' +
    '<div class="ide-sm-meta">' + fileIcon(baseName(r.rel)) +
      '<span class="ide-sm-path">' + esc(r.rel) + '</span>' +
      '<span class="ide-sm-ln">:' + r.line + '</span>' +
      tagFor(r.kind) +
    '</div>' +
  '</div>';
}

function grpHtml(v, hasSel) {
  const dir = dirName(v.rel);
  return '<div class="ide-sm-grp' + (hasSel ? ' has-sel' : '') + (v.col ? ' collapsed' : '') + '" data-rel="' + attr(v.rel) + '" data-i="' + v.first + '">' +
    '<span class="ide-sm-chev' + (v.col ? '' : ' open') + '"></span>' +
    fileIcon(baseName(v.rel)) +
    '<span class="ide-sm-gname">' + esc(baseName(v.rel)) + '</span>' +
    '<span class="ide-sm-gdir">' + esc(dir) + '</span>' +
    '<span class="ide-sm-gcount">' + v.count + ' matches</span>' +
  '</div>';
}

function buildView(items) {
  const groups = new Map();
  for (const r of items) {
    let g = groups.get(r.rel);
    if (!g) {
      g = { rel: r.rel, items: [] };
      groups.set(r.rel, g);
    }
    g.items.push(r);
  }
  const view = [];
  const navOut = [];
  const navG = [];
  const gmap = new Map();
  let gi = 0;
  for (const g of groups.values()) {
    if (g.items.length === 1) {
      const r = g.items[0];
      view.push({ t: 'flat', r, i: navOut.length });
      navOut.push(r);
      navG.push(-1);
      continue;
    }
    g.items.sort(lineCmp);
    gmap.set(g.rel, g.items);
    const isCol = collapsed.has(g.rel);
    view.push({ t: 'grp', rel: g.rel, gi, first: navOut.length, count: g.items.length, col: isCol });
    if (isCol) {
      navOut.push(g.items[0]);
      navG.push(gi);
      gi++;
      continue;
    }
    for (const r of g.items) {
      view.push({ t: 'nest', r, i: navOut.length });
      navOut.push(r);
      navG.push(gi);
    }
    gi++;
  }
  return { view, nav: navOut, navGroup: navG, groups: gmap };
}

function updateStatus() {
  const count = results.length;
  const files = new Set();
  for (const r of results) files.add(r.rel);
  const filt = fx.sel.size ? ' (' + fx.sel.size + ' file type' + (fx.sel.size === 1 ? '' : 's') + ')' : '';
  if (!finished) {
    setStatus('Searching ' + (PHASE_LABEL[phase] || '') + '... ' + count + ' found' + filt);
    barEl.classList.add('on');
    barFill.style.width = Math.max(4, Math.round(progress * 100)) + '%';
    return;
  }
  barEl.classList.remove('on');
  barFill.style.width = '0%';
  const extra = doneInfo && typeof doneInfo.ms === 'number' ? ' in ' + (doneInfo.ms / 1000).toFixed(2) + 's' : '';
  const part = doneInfo && doneInfo.truncated ? ' (partial)' : '';
  setStatus(count + ' results in ' + files.size + ' files' + extra + part + filt);
}

function isReady() {
  return finished && !pendingReset && !timer && !busy && curQuery.length >= MIN_CHARS && input.value.trim() === curQuery;
}

function updateRepUi() {
  if (!overlay) return;
  repTarget.textContent = input.value.trim();
  const ready = isReady();
  const hasExact = results.some((r) => r.kind === 'exact');
  btnOne.disabled = !(ready && sel && sel.kind === 'exact');
  btnAll.disabled = !(ready && hasExact);
  btnRevert.disabled = !(undoStack.length && !busy);
  btnRevert.textContent = undoStack.length > 1 ? 'Revert (' + undoStack.length + ')' : 'Revert';
  btnAll.textContent = armed ? 'Click again to confirm' : 'Replace all';
  btnAll.classList.toggle('armed', !!armed);
}

function scheduleRender() {
  if (!renderRaf) renderRaf = requestAnimationFrame(render);
}

function renderNow() {
  if (renderRaf) {
    cancelAnimationFrame(renderRaf);
    renderRaf = 0;
  }
  render();
}

function render() {
  renderRaf = 0;
  if (!overlay || overlay.hidden) return;
  results.sort(cmp);
  const n = Math.min(results.length, SHOW);
  if (!n) {
    sel = null;
    showEmpty(finished ? 'No matches found.' : 'Searching...');
    updateStatus();
    updateRepUi();
    return;
  }
  const built = buildView(results.slice(0, n));
  nav = built.nav;
  navGroup = built.navGroup;
  groupItems = built.groups;
  if (!sel || nav.indexOf(sel) < 0) {
    sel = nav[0] || null;
    userMoved = false;
  } else if (!userMoved) {
    sel = nav[0] || null;
  }
  const st = listEl.scrollTop;
  let html = '';
  for (const v of built.view) {
    if (v.t === 'grp') html += grpHtml(v, !!sel && sel.rel === v.rel);
    else html += rowHtml(v.r, v.i, v.r === sel, v.t === 'nest');
  }
  listEl.innerHTML = html;
  listEl.scrollTop = st;
  updateStatus();
  updateRepUi();
  if (sel !== previewFor) {
    previewFor = sel;
    schedulePreview();
  }
}

function toggleGroup(rel) {
  if (!rel) return;
  if (collapsed.has(rel)) collapsed.delete(rel);
  else collapsed.add(rel);
  const items = groupItems.get(rel);
  if (items && items.length) {
    sel = items[0];
    userMoved = true;
  }
  renderNow();
}

function run() {
  const q = input.value.trim();
  const root = state.selectedRepoPath;
  const api = streamApi();
  cancelRemote();
  curId++;
  const my = curId;
  pendingOpen = false;
  disarm();
  if (!root) {
    results = [];
    sel = null;
    finished = true;
    showEmpty('No folder opened. Select a repo first.');
    setStatus('');
    barEl.classList.remove('on');
    updateRepUi();
    return;
  }
  if (q.length < MIN_CHARS) {
    results = [];
    sel = null;
    curQuery = '';
    finished = true;
    pendingReset = false;
    listEl.classList.remove('stale');
    showEmpty('Type at least ' + MIN_CHARS + ' characters to search the codebase.');
    setStatus('');
    barEl.classList.remove('on');
    updateRepUi();
    return;
  }
  if (!api) {
    finished = true;
    showEmpty('Search is not available yet. Fully restart the app to enable it.');
    setStatus('');
    return;
  }
  curQuery = q;
  pendingReset = true;
  finished = false;
  phase = 'files';
  progress = 0;
  doneInfo = null;
  userMoved = false;
  listEl.classList.add('stale');
  setStatus('Searching...');
  barEl.classList.add('on');
  barFill.style.width = '4%';
  updateRepUi();
  const inv = Array.from(pendingInvalidate);
  pendingInvalidate.clear();
  api.start({ id: my, root, query: q, max: REQ_MAX, invalidate: inv, exts: Array.from(fx.sel) }).then((res) => {
    if (my !== curId) return;
    if (res && res.success === false) {
      finished = true;
      pendingReset = false;
      results = [];
      listEl.classList.remove('stale');
      showEmpty(res.error || 'Search failed');
      setStatus('');
      barEl.classList.remove('on');
      updateRepUi();
    }
  }).catch((err) => {
    if (my !== curId) return;
    finished = true;
    pendingReset = false;
    listEl.classList.remove('stale');
    showEmpty(err && err.message ? err.message : 'Search failed');
    setStatus('');
    barEl.classList.remove('on');
    updateRepUi();
  });
}

function onBatch(d) {
  if (!d || d.id !== curId || !overlay) return;
  if (pendingReset) {
    pendingReset = false;
    results = [];
    sel = null;
    previewFor = null;
    listEl.classList.remove('stale');
  }
  if (d.error) {
    finished = true;
    results = [];
    showEmpty(d.error);
    setStatus('');
    barEl.classList.remove('on');
    pendingOpen = false;
    updateRepUi();
    return;
  }
  if (d.results && d.results.length) {
    for (const r of d.results) results.push(r);
  }
  if (d.phase) phase = d.phase;
  if (typeof d.progress === 'number') progress = d.progress;
  if (d.done) {
    finished = true;
    doneInfo = d;
  }
  if (pendingOpen && (d.done || (results.length && d.phase && d.phase !== 'files'))) {
    pendingOpen = false;
    if (results.length) {
      results.sort(cmp);
      sel = results[0];
      openItem(results[0]);
      return;
    }
  }
  scheduleRender();
}

function selIndex() {
  const i = sel ? nav.indexOf(sel) : -1;
  return i < 0 ? 0 : i;
}

function setSelIndex(i) {
  const n = nav.length;
  if (!n) return;
  const next = Math.max(0, Math.min(n - 1, i));
  userMoved = true;
  sel = nav[next];
  const old = listEl.querySelector('.ide-sm-row.sel');
  if (old) old.classList.remove('sel');
  const oldG = listEl.querySelector('.ide-sm-grp.has-sel');
  if (oldG) oldG.classList.remove('has-sel');
  const gEl = sel ? listEl.querySelector('.ide-sm-grp[data-rel="' + CSS.escape(sel.rel) + '"]') : null;
  if (gEl) gEl.classList.add('has-sel');
  const el = listEl.querySelector('.ide-sm-row[data-i="' + next + '"]');
  if (el) {
    el.classList.add('sel');
    const prevEl = el.previousElementSibling;
    const target = prevEl && prevEl.classList.contains('ide-sm-grp') ? prevEl : el;
    target.scrollIntoView({ block: 'nearest' });
  } else if (gEl) {
    gEl.scrollIntoView({ block: 'nearest' });
  }
  if (sel !== previewFor) {
    previewFor = sel;
    schedulePreview();
  }
  updateRepUi();
}

function move(step) {
  const n = nav.length;
  if (!n) return;
  const cur = selIndex();
  if (step === 1 && cur === n - 1) {
    setSelIndex(0);
    return;
  }
  if (step === -1 && cur === 0) {
    setSelIndex(n - 1);
    return;
  }
  setSelIndex(cur + step);
}

function schedulePreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(loadPreview, 50);
}

function cachePut(file, arr) {
  if (fileCache.has(file)) fileCache.delete(file);
  fileCache.set(file, arr);
  if (fileCache.size > CACHE_MAX) fileCache.delete(fileCache.keys().next().value);
}

async function readText(file) {
  let res = null;
  try {
    res = await window.electronAPI.readFile(file);
  } catch (_) {
    res = null;
  }
  if (!res || !res.success || typeof res.content !== 'string') return null;
  return res.content;
}

async function writeText(file, text) {
  let res = null;
  try {
    res = await window.electronAPI.writeFile(file, text);
  } catch (_) {
    res = null;
  }
  return !!(res && res.success);
}

function hlHtml(text, q) {
  if (!q) return esc(text);
  const lt = text.toLowerCase();
  const lq = q.toLowerCase();
  let i = lt.indexOf(lq);
  if (i < 0) return esc(text);
  let out = '';
  let pos = 0;
  while (i !== -1) {
    out += esc(text.slice(pos, i)) + '<span class="ide-sm-hit">' + esc(text.slice(i, i + lq.length)) + '</span>';
    pos = i + lq.length;
    i = lt.indexOf(lq, pos);
  }
  return out + esc(text.slice(pos));
}

function previewLineHtml(text, r, isHit) {
  const long = text.length > EDIT_MAX_LEN;
  const shown = long ? text.slice(0, 400) + ' ...' : text;
  let body;
  if (isHit && r.kind !== 'exact') {
    const col = r.col || 0;
    const len = r.len || 0;
    if (!long && col < shown.length && len > 0) {
      body = esc(shown.slice(0, col)) + '<span class="ide-sm-hit">' + esc(shown.slice(col, col + len)) + '</span>' + esc(shown.slice(col + len));
    } else {
      body = esc(shown);
    }
  } else if (long) {
    body = esc(shown);
  } else {
    body = hlHtml(shown, r.kind === 'exact' ? curQuery : '');
  }
  return { body, editable: !long };
}

async function loadPreview() {
  await commitEdit();
  const r = sel;
  if (!r) {
    clearPreview();
    return;
  }
  pvTitle.textContent = r.rel + ':' + r.line;
  let arr = fileCache.get(r.file);
  if (!arr) {
    pvCode.innerHTML = '<div class="ide-sm-empty">Loading...</div>';
    const content = await readText(r.file);
    if (sel !== r) return;
    if (content === null) {
      pvCode.innerHTML = '<div class="ide-sm-empty">Preview not available.</div>';
      return;
    }
    arr = content.split(/\r?\n/);
    cachePut(r.file, arr);
  }
  pvFile = r.file;
  const from = Math.max(0, r.line - 1 - WIN_BEFORE);
  const to = Math.min(arr.length - 1, r.line - 1 + WIN_AFTER);
  let html = '';
  for (let i = from; i <= to; i++) {
    const n = i + 1;
    const hit = n === r.line;
    const pl = previewLineHtml(arr[i], r, hit);
    html += '<div class="ide-sm-pl' + (hit ? ' hit' : '') + '" data-ln="' + n + '">' +
      '<span class="ide-sm-pn">' + n + '</span>' +
      '<span class="ide-sm-pt"' + (pl.editable ? ' contenteditable="plaintext-only" spellcheck="false"' : '') + '>' + pl.body + '</span>' +
    '</div>';
  }
  pvCode.innerHTML = html;
  const hitEl = pvCode.querySelector('.ide-sm-pl.hit');
  if (hitEl) hitEl.scrollIntoView({ block: 'center' });
}

function onPvInput(e) {
  const pt = e.target.closest('.ide-sm-pt');
  if (!pt || !pvFile) return;
  const pl = pt.parentElement;
  edit = { file: pvFile, ln: Number(pl.dataset.ln), text: pt.textContent };
  pl.classList.add('edited');
}

function onPvKey(e) {
  e.stopPropagation();
  const k = e.key;
  const pt = e.target.closest('.ide-sm-pt');
  if (k === 'Escape') {
    e.preventDefault();
    if (edit) {
      edit = null;
      previewFor = null;
      schedulePreview();
      input.focus();
    } else {
      close();
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 's') {
    e.preventDefault();
    commitEdit();
    return;
  }
  if (k === 'Enter') {
    e.preventDefault();
    commitEdit();
    input.focus();
    return;
  }
  if ((k === 'ArrowUp' || k === 'ArrowDown') && pt) {
    e.preventDefault();
    const pl = pt.parentElement;
    const other = k === 'ArrowUp' ? pl.previousElementSibling : pl.nextElementSibling;
    const next = other ? other.querySelector('.ide-sm-pt[contenteditable]') : null;
    if (next) {
      next.focus();
      const range = document.createRange();
      range.selectNodeContents(next);
      range.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(range);
    }
  }
}

function refreshResultsForLine(file, ln, text) {
  const lq = curQuery.toLowerCase();
  const lt = text.toLowerCase();
  const keep = [];
  for (const x of results) {
    if (x.file === file && x.line === ln && x.kind === 'exact') {
      const idx = lq ? lt.indexOf(lq) : -1;
      if (idx < 0) continue;
      const sn = snippetOf(text, idx, lq.length);
      x.col = idx;
      x.len = lq.length;
      x.text = sn.text;
      x.hs = sn.hs;
      x.hl = sn.hl;
      x.more = sn.more;
    }
    keep.push(x);
  }
  results = keep;
}

async function commitEdit() {
  if (!edit) return;
  const e = edit;
  edit = null;
  const arr = fileCache.get(e.file);
  if (!arr) return;
  const orig = arr[e.ln - 1];
  const text = String(e.text).replace(/[\r\n]+$/, '').replace(/\r?\n/g, ' ');
  if (orig === undefined || orig === text) return;
  if (isDirtyCb && isDirtyCb(e.file)) {
    setRepMsg('Cannot edit: this file has unsaved changes in the editor.', true);
    previewFor = null;
    schedulePreview();
    return;
  }
  const fresh = await readText(e.file);
  if (fresh === null) {
    setRepMsg('Could not read the file.', true);
    return;
  }
  const parts = fresh.split(/(\r?\n)/);
  const i = (e.ln - 1) * 2;
  if (parts[i] !== orig) {
    setRepMsg('File changed on disk, reloaded the preview.', true);
    fileCache.delete(e.file);
    previewFor = null;
    schedulePreview();
    return;
  }
  parts[i] = text;
  const ok = await writeText(e.file, parts.join(''));
  if (!ok) {
    setRepMsg('Could not save the file.', true);
    return;
  }
  arr[e.ln - 1] = text;
  pendingInvalidate.add(e.file);
  refreshResultsForLine(e.file, e.ln, text);
  if (onFileChanged) onFileChanged(e.file);
  setRepMsg('Saved ' + baseName(e.file) + ':' + e.ln);
  scheduleRender();
}

function disarm() {
  if (armed) {
    clearTimeout(armed);
    armed = 0;
    if (repMsg && repMsg.textContent.indexOf('Click again') === 0) setRepMsg('');
  }
  if (btnAll) {
    btnAll.textContent = 'Replace all';
    btnAll.classList.remove('armed');
  }
}

function arm() {
  const files = new Set();
  for (const r of results) {
    if (r.kind === 'exact') files.add(r.file);
  }
  armed = setTimeout(() => {
    armed = 0;
    disarm();
    updateRepUi();
  }, 4000);
  setRepMsg('Click again to replace in ' + files.size + ' file' + (files.size === 1 ? '' : 's') + '.');
  updateRepUi();
}

function regexFor(q) {
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), repCase ? 'g' : 'gi');
}

function replaceInText(text, re, rep, onlyLine) {
  let count = 0;
  if (onlyLine == null) {
    const out = text.replace(re, () => {
      count++;
      return rep;
    });
    return { out, count };
  }
  const parts = text.split(/(\r?\n)/);
  const i = (onlyLine - 1) * 2;
  if (i < 0 || i >= parts.length) return { out: text, count: 0 };
  parts[i] = parts[i].replace(re, () => {
    count++;
    return rep;
  });
  return { out: parts.join(''), count };
}

function afterWrite(files) {
  for (const f of files) {
    fileCache.delete(f);
    pendingInvalidate.add(f);
    if (onFileChanged) onFileChanged(f);
  }
  previewFor = null;
}

function removeAndAdvance(removed) {
  const idx = selIndex();
  const set = new Set(removed);
  results = results.filter((x) => !set.has(x));
  renderNow();
  if (nav.length) setSelIndex(Math.min(idx, nav.length - 1));
}

async function replaceSelected() {
  if (!isReady() || !sel || sel.kind !== 'exact') return;
  const r = sel;
  const rep = repIn.value;
  busy = true;
  updateRepUi();
  setRepMsg('Replacing...');
  try {
    if (isDirtyCb && isDirtyCb(r.file)) {
      setRepMsg('Skipped: ' + baseName(r.rel) + ' has unsaved changes in the editor.', true);
      return;
    }
    const before = await readText(r.file);
    if (before === null) {
      setRepMsg('Could not read ' + baseName(r.rel) + '.', true);
      return;
    }
    const res = replaceInText(before, regexFor(curQuery), rep, r.line);
    if (!res.count) {
      setRepMsg('Nothing to replace on that line (check the case setting or reload).', true);
      return;
    }
    const ok = await writeText(r.file, res.out);
    if (!ok) {
      setRepMsg('Could not save ' + baseName(r.rel) + '.', true);
      return;
    }
    const removed = results.filter((x) => x.file === r.file && x.line === r.line && x.kind === 'exact');
    undoStack.push({ query: curQuery, files: [{ file: r.file, rel: r.rel, before, after: res.out }], removed });
    afterWrite([r.file]);
    removeAndAdvance(removed);
    setRepMsg('Replaced ' + res.count + ' on line ' + r.line + ' of ' + baseName(r.rel) + '.');
  } finally {
    busy = false;
    updateRepUi();
  }
}

async function replaceAll() {
  if (!isReady()) return;
  const fileMap = new Map();
  for (const r of results) {
    if (r.kind === 'exact' && !fileMap.has(r.file)) fileMap.set(r.file, r.rel);
  }
  if (!fileMap.size) return;
  const rep = repIn.value;
  const re = regexFor(curQuery);
  busy = true;
  updateRepUi();
  const changed = [];
  let total = 0;
  let skipped = 0;
  let failed = 0;
  let done = 0;
  try {
    for (const entry of fileMap) {
      const file = entry[0];
      const rel = entry[1];
      done++;
      if (done % 4 === 0) setRepMsg('Replacing... ' + done + '/' + fileMap.size);
      if (isDirtyCb && isDirtyCb(file)) {
        skipped++;
        continue;
      }
      const before = await readText(file);
      if (before === null) {
        failed++;
        continue;
      }
      const res = replaceInText(before, re, rep, null);
      if (!res.count) continue;
      const ok = await writeText(file, res.out);
      if (!ok) {
        failed++;
        continue;
      }
      total += res.count;
      changed.push({ file, rel, before, after: res.out });
    }
    if (changed.length) {
      const set = new Set(changed.map((c) => c.file));
      const removed = results.filter((x) => x.kind === 'exact' && set.has(x.file));
      undoStack.push({ query: curQuery, files: changed, removed });
      afterWrite(changed.map((c) => c.file));
      removeAndAdvance(removed);
    }
    let msg = 'Replaced ' + total + ' occurrence' + (total === 1 ? '' : 's') + ' in ' + changed.length + ' file' + (changed.length === 1 ? '' : 's') + '.';
    if (skipped) msg += ' Skipped ' + skipped + ' (unsaved in editor).';
    if (failed) msg += ' ' + failed + ' failed.';
    if (!changed.length && !skipped && !failed) msg = 'Nothing to replace (check the case setting).';
    setRepMsg(msg, !!(skipped || failed || !changed.length));
  } finally {
    busy = false;
    updateRepUi();
  }
}

async function revertLast() {
  const op = undoStack[undoStack.length - 1];
  if (!op || busy) return;
  busy = true;
  updateRepUi();
  setRepMsg('Reverting...');
  let restored = 0;
  let skipped = 0;
  let failed = 0;
  const okFiles = new Set();
  try {
    for (const f of op.files) {
      const cur = await readText(f.file);
      if (cur === null) {
        failed++;
        continue;
      }
      if (cur !== f.after) {
        skipped++;
        continue;
      }
      const ok = await writeText(f.file, f.before);
      if (ok) {
        restored++;
        okFiles.add(f.file);
      } else {
        failed++;
      }
    }
    undoStack.pop();
    if (restored) {
      afterWrite(Array.from(okFiles));
      if (op.query === curQuery) {
        for (const r of op.removed) {
          if (okFiles.has(r.file)) results.push(r);
        }
      }
      renderNow();
    }
    let msg = 'Reverted ' + restored + ' file' + (restored === 1 ? '' : 's') + '.';
    if (skipped) msg += ' Skipped ' + skipped + ' (changed since).';
    if (failed) msg += ' ' + failed + ' failed.';
    setRepMsg(msg, !!(skipped || failed));
  } finally {
    busy = false;
    updateRepUi();
  }
}

function onRepClick(e) {
  const b = e.target.closest('.ide-sm-rbtn');
  if (!b || b.disabled) return;
  const a = b.dataset.r;
  if (a === 'case') {
    repCase = !repCase;
    b.classList.toggle('on', repCase);
    saveState();
    return;
  }
  if (a === 'one') {
    disarm();
    replaceSelected();
    return;
  }
  if (a === 'revert') {
    disarm();
    revertLast();
    return;
  }
  if (a === 'all') {
    if (!armed) {
      arm();
      return;
    }
    disarm();
    replaceAll();
  }
}

function onRepKey(e) {
  e.stopPropagation();
  const k = e.key;
  if (k === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  if (k === 'ArrowDown') {
    e.preventDefault();
    move(1);
    return;
  }
  if (k === 'ArrowUp') {
    e.preventDefault();
    move(-1);
    return;
  }
  if (k === 'Enter') {
    e.preventDefault();
    if (e.ctrlKey && e.altKey) {
      if (!btnAll.disabled) {
        if (!armed) arm();
        else {
          disarm();
          replaceAll();
        }
      }
      return;
    }
    disarm();
    replaceSelected();
  }
}

async function openItem(r) {
  if (!r) return;
  await commitEdit();
  close(true);
  if (onOpen) onOpen(r.file, r.line, r.col, r.len);
}

function openResult(i) {
  openItem(nav[i]);
}

function onKey(e) {
  e.stopPropagation();
  const k = e.key;
  const ctrl = e.ctrlKey || e.metaKey;
  if (k === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  if (k === 'ArrowDown' || (ctrl && (k === 'n' || k === 'j'))) {
    e.preventDefault();
    move(1);
    return;
  }
  if (k === 'ArrowUp' || (ctrl && (k === 'p' || k === 'k'))) {
    e.preventDefault();
    move(-1);
    return;
  }
  if (k === 'PageDown') {
    e.preventDefault();
    setSelIndex(selIndex() + 8);
    return;
  }
  if (k === 'PageUp') {
    e.preventDefault();
    setSelIndex(selIndex() - 8);
    return;
  }
  if (k === 'Enter') {
    e.preventDefault();
    if (timer) {
      clearTimeout(timer);
      timer = 0;
      run();
      pendingOpen = !finished;
      return;
    }
    if (pendingReset) {
      pendingOpen = true;
      return;
    }
    openResult(selIndex());
  }
}

export function init(opts) {
  onOpen = (opts && opts.onOpen) || null;
  isDirtyCb = (opts && opts.isDirty) || null;
  onFileChanged = (opts && opts.onFileChanged) || null;
}

export function isOpen() {
  return !!overlay && !overlay.hidden;
}

export function open(prefill) {
  build();
  prevFocus = document.activeElement;
  overlay.hidden = false;
  if (state.selectedRepoPath) loadExts(state.selectedRepoPath);
  const text = prefill ? String(prefill) : '';
  const changed = !!text && text !== input.value;
  if (text) input.value = text;
  input.focus();
  input.select();
  if (changed || (!results.length && finished && input.value.trim().length >= MIN_CHARS)) run();
  else scheduleRender();
  updateRepUi();
}

export function close(skipFocus) {
  if (!overlay || overlay.hidden) return;
  commitEdit();
  saveState();
  disarm();
  overlay.hidden = true;
  clearTimeout(timer);
  timer = 0;
  pendingOpen = false;
  cancelRemote();
  curId++;
  if (!finished) {
    finished = true;
    pendingReset = false;
    listEl.classList.remove('stale');
  }
  if (!skipFocus && prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') {
    prevFocus.focus({ preventScroll: true });
  }
  prevFocus = null;
}

export function reset() {
  cancelRemote();
  curId++;
  results = [];
  nav = [];
  navGroup = [];
  groupItems = new Map();
  collapsed = new Set();
  undoStack = [];
  pendingInvalidate = new Set();
  edit = null;
  curQuery = '';
  sel = null;
  userMoved = false;
  finished = true;
  pendingReset = false;
  pendingOpen = false;
  doneInfo = null;
  fileCache = new Map();
  fx.sel = new Set();
  fx.list = [];
  fx.req++;
  if (!overlay) return;
  close(true);
  input.value = '';
  repIn.value = '';
  listEl.classList.remove('stale');
  showEmpty('Type at least ' + MIN_CHARS + ' characters to search the codebase.');
  setStatus('');
  setRepMsg('');
  barEl.classList.remove('on');
  saveState();
  renderExts();
  updateRepUi();
}