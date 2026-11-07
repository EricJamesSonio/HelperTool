import { state } from '../app_manager/appState.js';
import { esc } from './highlight.js';
import { fileIcon } from './fileIcons.js';

const SHOW = 300;
const MIN_CHARS = 2;
const REQ_MAX = 1500;
const CACHE_MAX = 24;
const DEBOUNCE = 110;
const PHASE_LABEL = { files: 'file names', content: 'contents', similar: 'similar words' };

const SVG_SEARCH = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>';

const TEMPLATE =
  '<div class="ide-sm ide-root">' +
    '<div class="ide-sm-head">' +
      '<span class="ide-sm-icon">' + SVG_SEARCH + '</span>' +
      '<input class="ide-sm-input" type="text" spellcheck="false" autocomplete="off" placeholder="Search words in the codebase..." />' +
      '<span class="ide-sm-status"></span>' +
    '</div>' +
    '<div class="ide-sm-bar"><span></span></div>' +
    '<div class="ide-sm-body">' +
      '<div class="ide-sm-list"></div>' +
      '<div class="ide-sm-preview">' +
        '<div class="ide-sm-pv-title"></div>' +
        '<div class="ide-sm-pv-code"></div>' +
      '</div>' +
    '</div>' +
    '<div class="ide-sm-foot">' +
      '<span><kbd>Up</kbd><kbd>Down</kbd> navigate</span>' +
      '<span><kbd>Enter</kbd> open</span>' +
      '<span><kbd>Esc</kbd> close</span>' +
      '<span class="ide-sm-foot-note">Results stream in: exact matches first, then similar words</span>' +
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
let onOpen = null;

let results = [];
let sel = null;
let userMoved = false;
let curId = 0;
let finished = true;
let pendingReset = false;
let pendingOpen = false;
let phase = 'files';
let progress = 0;
let doneInfo = null;
let renderRaf = 0;
let timer = 0;
let pvTimer = 0;
let previewFor = null;
let prevFocus = null;
let fileCache = new Map();

function baseName(p) {
  return String(p || '').split('/').pop();
}

function cmp(a, b) {
  return (b.score - a.score) || a.rel.localeCompare(b.rel) || (a.line - b.line);
}

function streamApi() {
  return window.ideSearchStream || null;
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
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  input.addEventListener('input', schedule);
  input.addEventListener('keydown', onKey);
  listEl.addEventListener('mousedown', (e) => e.preventDefault());
  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.ide-sm-row');
    if (!row) return;
    openResult(Number(row.dataset.i));
  });
  const api = streamApi();
  if (api) api.onBatch(onBatch);
  showEmpty('Type at least ' + MIN_CHARS + ' characters to search the codebase.');
}

function setStatus(text) {
  statusEl.textContent = text || '';
}

function showEmpty(msg) {
  listEl.innerHTML = '<div class="ide-sm-empty">' + esc(msg) + '</div>';
  clearPreview();
}

function clearPreview() {
  previewFor = null;
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

function rowHtml(r, i, isSel) {
  const t = r.text || '';
  const hs = Math.min(t.length, Math.max(0, r.hs || 0));
  const he = Math.min(t.length, hs + (r.hl || 0));
  const code =
    (r.more ? '<span class="ide-sm-dim">...</span>' : '') +
    esc(t.slice(0, hs)) +
    '<span class="ide-sm-hit">' + esc(t.slice(hs, he)) + '</span>' +
    esc(t.slice(he));
  return '<div class="ide-sm-row' + (isSel ? ' sel' : '') + '" data-i="' + i + '">' +
    '<div class="ide-sm-code">' + code + '</div>' +
    '<div class="ide-sm-meta">' + fileIcon(baseName(r.rel)) +
      '<span class="ide-sm-path">' + esc(r.rel) + '</span>' +
      '<span class="ide-sm-ln">:' + r.line + '</span>' +
      tagFor(r.kind) +
    '</div>' +
  '</div>';
}

function updateStatus() {
  const count = results.length;
  const files = new Set();
  for (const r of results) files.add(r.rel);
  if (!finished) {
    setStatus('Searching ' + (PHASE_LABEL[phase] || '') + '... ' + count + ' found');
    barEl.classList.add('on');
    barFill.style.width = Math.max(4, Math.round(progress * 100)) + '%';
    return;
  }
  barEl.classList.remove('on');
  barFill.style.width = '0%';
  const extra = doneInfo && typeof doneInfo.ms === 'number' ? ' in ' + (doneInfo.ms / 1000).toFixed(2) + 's' : '';
  const part = doneInfo && doneInfo.truncated ? ' (partial)' : '';
  setStatus(count + ' results in ' + files.size + ' files' + extra + part);
}

function scheduleRender() {
  if (!renderRaf) renderRaf = requestAnimationFrame(render);
}

function render() {
  renderRaf = 0;
  if (!overlay || overlay.hidden) return;
  results.sort(cmp);
  const n = Math.min(results.length, SHOW);
  const at = sel ? results.indexOf(sel) : -1;
  if (at < 0 || at >= n) {
    sel = results[0] || null;
    userMoved = false;
  } else if (!userMoved) {
    sel = results[0] || null;
  }
  if (!n) {
    showEmpty(finished ? 'No matches found.' : 'Searching...');
    updateStatus();
    return;
  }
  const st = listEl.scrollTop;
  let html = '';
  for (let i = 0; i < n; i++) html += rowHtml(results[i], i, results[i] === sel);
  listEl.innerHTML = html;
  listEl.scrollTop = st;
  updateStatus();
  if (sel !== previewFor) {
    previewFor = sel;
    schedulePreview();
  }
}

function run() {
  const q = input.value.trim();
  const root = state.selectedRepoPath;
  const api = streamApi();
  cancelRemote();
  curId++;
  const my = curId;
  pendingOpen = false;
  if (!root) {
    results = [];
    sel = null;
    finished = true;
    showEmpty('No folder opened. Select a repo first.');
    setStatus('');
    barEl.classList.remove('on');
    return;
  }
  if (q.length < MIN_CHARS) {
    results = [];
    sel = null;
    finished = true;
    pendingReset = false;
    listEl.classList.remove('stale');
    showEmpty('Type at least ' + MIN_CHARS + ' characters to search the codebase.');
    setStatus('');
    barEl.classList.remove('on');
    return;
  }
  if (!api) {
    finished = true;
    showEmpty('Search is not available yet. Fully restart the app to enable it.');
    setStatus('');
    return;
  }
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
  api.start({ id: my, root, query: q, max: REQ_MAX }).then((res) => {
    if (my !== curId) return;
    if (res && res.success === false) {
      finished = true;
      pendingReset = false;
      results = [];
      listEl.classList.remove('stale');
      showEmpty(res.error || 'Search failed');
      setStatus('');
      barEl.classList.remove('on');
    }
  }).catch((err) => {
    if (my !== curId) return;
    finished = true;
    pendingReset = false;
    listEl.classList.remove('stale');
    showEmpty(err && err.message ? err.message : 'Search failed');
    setStatus('');
    barEl.classList.remove('on');
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
      openResult(0);
      return;
    }
  }
  scheduleRender();
}

function selIndex() {
  const i = sel ? results.indexOf(sel) : -1;
  return i < 0 ? 0 : i;
}

function setSelIndex(i) {
  const n = Math.min(results.length, SHOW);
  if (!n) return;
  const next = Math.max(0, Math.min(n - 1, i));
  userMoved = true;
  sel = results[next];
  const old = listEl.querySelector('.ide-sm-row.sel');
  if (old) old.classList.remove('sel');
  const el = listEl.querySelector('.ide-sm-row[data-i="' + next + '"]');
  if (el) {
    el.classList.add('sel');
    el.scrollIntoView({ block: 'nearest' });
  }
  if (sel !== previewFor) {
    previewFor = sel;
    schedulePreview();
  }
}

function move(step) {
  const n = Math.min(results.length, SHOW);
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

function cachePut(file, lines) {
  if (fileCache.has(file)) fileCache.delete(file);
  fileCache.set(file, lines);
  if (fileCache.size > CACHE_MAX) fileCache.delete(fileCache.keys().next().value);
}

async function loadPreview() {
  const r = sel;
  if (!r) {
    clearPreview();
    return;
  }
  pvTitle.textContent = r.rel + ':' + r.line;
  let lines = fileCache.get(r.file);
  if (!lines) {
    pvCode.innerHTML = '<div class="ide-sm-empty">Loading...</div>';
    let res = null;
    try {
      res = await window.electronAPI.readFile(r.file);
    } catch (_) {
      res = null;
    }
    if (sel !== r) return;
    if (!res || !res.success || typeof res.content !== 'string') {
      pvCode.innerHTML = '<div class="ide-sm-empty">Preview not available.</div>';
      return;
    }
    lines = res.content.split(/\r?\n/);
    cachePut(r.file, lines);
  }
  const from = Math.max(0, r.line - 11);
  const to = Math.min(lines.length - 1, r.line + 14);
  let html = '';
  for (let i = from; i <= to; i++) {
    const n = i + 1;
    const hit = n === r.line;
    let text;
    if (hit) {
      const full = lines[i].slice(0, 600);
      const col = r.col || 0;
      const len = r.len || 0;
      if (col < full.length && len > 0) {
        text = esc(full.slice(0, col)) + '<span class="ide-sm-hit">' + esc(full.slice(col, col + len)) + '</span>' + esc(full.slice(col + len));
      } else {
        text = esc(full);
      }
    } else {
      text = esc(lines[i].slice(0, 400));
    }
    html += '<div class="ide-sm-pl' + (hit ? ' hit' : '') + '"><span class="ide-sm-pn">' + n + '</span><span class="ide-sm-pt">' + text + '</span></div>';
  }
  pvCode.innerHTML = html;
  const hitEl = pvCode.querySelector('.ide-sm-pl.hit');
  if (hitEl) hitEl.scrollIntoView({ block: 'center' });
}

function openResult(i) {
  const r = results[i];
  if (!r) return;
  close(true);
  if (onOpen) onOpen(r.file, r.line, r.col, r.len);
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
}

export function isOpen() {
  return !!overlay && !overlay.hidden;
}

export function open(prefill) {
  build();
  prevFocus = document.activeElement;
  overlay.hidden = false;
  const api = streamApi();
  if (api && state.selectedRepoPath) api.warm(state.selectedRepoPath).catch(() => {});
  const text = prefill ? String(prefill) : '';
  const changed = !!text && text !== input.value;
  if (text) input.value = text;
  input.focus();
  input.select();
  if (changed || (!results.length && finished && input.value.trim().length >= MIN_CHARS)) run();
  else scheduleRender();
}

export function close(skipFocus) {
  if (!overlay || overlay.hidden) return;
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
  sel = null;
  userMoved = false;
  finished = true;
  pendingReset = false;
  pendingOpen = false;
  doneInfo = null;
  fileCache = new Map();
  if (!overlay) return;
  close(true);
  input.value = '';
  listEl.classList.remove('stale');
  showEmpty('Type at least ' + MIN_CHARS + ' characters to search the codebase.');
  setStatus('');
  barEl.classList.remove('on');
}