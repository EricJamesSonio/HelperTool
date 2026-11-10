import { state } from './appState.js';
import { loadRepo, preloadRepo, isRepoCached } from './repoManager.js';
import { confirmDialog } from '../utils/confirmDialog.js';

const LS_KEY = 'helpertool-open-repos';
const MAX_TABS = 12;
const DQ = String.fromCharCode(34);

const ICON_SPLIT = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M8 3v10"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M3 8h10"/></svg>';

let tabs = [];
let lookup = null;
let prevMaster = null;
let bar = null;
let listEl = null;
let lookupMod = null;
let inited = false;
const loading = new Set();

function norm(p) {
  return String(p || '').split('\\').join('/').replace(/\/+$/, '').toLowerCase();
}

function same(a, b) {
  return !!a && !!b && norm(a) === norm(b);
}

function esc(s) {
  return String(s)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split(DQ).join('&quot;');
}

function partsOf(p) {
  return norm(p).split('/').filter(Boolean);
}

function baseName(p) {
  const parts = String(p || '').split('\\').join('/').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(p || '');
}

function parentName(p) {
  const parts = String(p || '').split('\\').join('/').split('/').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : '';
}

function labelOf(p) {
  const name = baseName(p);
  const dup = tabs.filter((t) => baseName(t).toLowerCase() === name.toLowerCase()).length > 1;
  const parent = parentName(p);
  return dup && parent ? parent + '/' + name : name;
}

function readSaved() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (!data || typeof data !== 'object') return { tabs: [], lookup: null };
    const list = Array.isArray(data.tabs) ? data.tabs.filter((t) => typeof t === 'string' && t) : [];
    const look = typeof data.lookup === 'string' && list.some((t) => same(t, data.lookup)) ? data.lookup : null;
    return { tabs: list.slice(0, MAX_TABS), lookup: look };
  } catch (_) {
    return { tabs: [], lookup: null };
  }
}

function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ tabs: tabs, lookup: lookup }));
  } catch (_) {
    return;
  }
}

function injectCss() {
  if (document.getElementById('repoTabsCss')) return;
  const link = document.createElement('link');
  link.id = 'repoTabsCss';
  link.rel = 'stylesheet';
  link.href = './styles/repo-tabs.css';
  document.head.appendChild(link);
}

function emitLookup() {
  document.dispatchEvent(new CustomEvent('repo:lookup-changed', { detail: { repoPath: lookup } }));
}

function tabHtml(p, master) {
  const isM = same(p, master);
  const isL = same(p, lookup);
  const busy = loading.has(norm(p));
  let role = '';
  if (isM) role = 'MASTER';
  else if (isL) role = 'LOOKUP';
  let tip = 'Click to make this the master repo';
  if (isM) tip = 'Master repo: used by Global Seeder, Flow Tool, Git and the other tools';
  else if (isL) tip = 'Lookup repo: shown beside the master in IDE mode (view and edit only)';
  let cls = 'rt-tab';
  if (isM) cls += ' master';
  if (isL) cls += ' lookup';
  if (busy) cls += ' loading';
  let html = '<div class=' + DQ + cls + DQ + ' data-p=' + DQ + esc(p) + DQ + ' title=' + DQ + esc(p + ' - ' + tip) + DQ + '>';
  html += '<span class="rt-dot"></span><span class="rt-name">' + esc(labelOf(p)) + '</span>';
  if (role) html += '<span class="rt-role">' + role + '</span>';
  if (!isM) {
    const splitTitle = isL ? 'Close the split view for this repo' : 'Open beside the master in IDE mode (view and edit only)';
    html += '<button type="button" class=' + DQ + 'rt-btn rt-split' + (isL ? ' on' : '') + DQ + ' data-act="split" title=' + DQ + splitTitle + DQ + '>' + ICON_SPLIT + '</button>';
  }
  if (tabs.length > 1) {
    html += '<button type="button" class="rt-btn rt-close" data-act="close" title="Close tab">&times;</button>';
  }
  html += '</div>';
  return html;
}

function render() {
  if (!listEl) return;
  const master = state.selectedRepoPath;
  listEl.innerHTML = tabs.map((p) => tabHtml(p, master)).join('');
}

function addTab(p) {
  if (!p || tabs.some((t) => same(t, p))) return;
  tabs.push(p);
  while (tabs.length > MAX_TABS) {
    const idx = tabs.findIndex((t) => !same(t, state.selectedRepoPath) && !same(t, lookup));
    if (idx < 0) break;
    const gone = tabs.splice(idx, 1)[0];
    document.dispatchEvent(new CustomEvent('repo:closed', { detail: { repoPath: gone } }));
  }
}

async function preload(p) {
  const key = norm(p);
  if (!p || loading.has(key) || same(p, state.selectedRepoPath)) return;
  loading.add(key);
  render();
  try {
    if (!isRepoCached(p)) await preloadRepo(p);
  } catch (_) {
    // ignore, the tab will load normally when clicked
  }
  try {
    const ex = await import('../ideMode/explorer.js');
    await ex.primeRepo(p);
  } catch (_) {
    // ignore, explorer loads on demand
  }
  loading.delete(key);
  render();
}

async function activate(p) {
  if (!p || same(p, state.selectedRepoPath)) return;
  if (same(p, lookup) && lookupMod && lookupMod.hasDirty()) {
    const ok = await confirmDialog('Unsaved changes in <b>' + esc(baseName(p)) + '</b> will be saved before it becomes the master repo. Continue?');
    if (!ok) return;
    await lookupMod.saveAll();
    if (lookupMod.hasDirty()) return;
  }
  const key = norm(p);
  if (!isRepoCached(p)) {
    loading.add(key);
    render();
  }
  try {
    await loadRepo(p);
  } catch (err) {
    console.error('[RepoTabs] switch failed:', err);
  }
  loading.delete(key);
  render();
}

function ensureIde() {
  if (document.body.classList.contains('ide-mode')) return;
  const btn = document.getElementById('ideModeBtn');
  if (btn) btn.click();
}

function toggleLookup(p) {
  if (!p || same(p, state.selectedRepoPath)) return;
  if (same(p, lookup)) {
    lookup = null;
  } else {
    lookup = p;
    preload(p);
    ensureIde();
  }
  emitLookup();
  save();
  render();
}

async function closeTab(p) {
  if (tabs.length <= 1) return;
  const isMaster = same(p, state.selectedRepoPath);
  const isLookup = same(p, lookup);
  if (isLookup && lookupMod && lookupMod.hasDirty()) {
    const ok = await confirmDialog('Discard unsaved changes in <b>' + esc(baseName(p)) + '</b> and close this tab?');
    if (!ok) return;
    lookupMod.discardSession();
  }
  if (isMaster) {
    const idx = tabs.findIndex((t) => same(t, p));
    const next = tabs[idx + 1] || tabs[idx - 1];
    if (!next) return;
    await activate(next);
    if (same(state.selectedRepoPath, p)) return;
  }
  tabs = tabs.filter((t) => !same(t, p));
  if (same(lookup, p)) {
    lookup = null;
    emitLookup();
  }
  document.dispatchEvent(new CustomEvent('repo:closed', { detail: { repoPath: p } }));
  save();
  render();
}

async function addNew() {
  try {
    const p = await window.electronAPI.selectRepo();
    if (p) await loadRepo(p);
  } catch (err) {
    console.error('[RepoTabs] open repo failed:', err);
  }
}

function onSwitched(e) {
  const p = (e && e.detail && e.detail.repoPath) || state.selectedRepoPath;
  if (!p) return;
  const old = prevMaster;
  prevMaster = p;
  addTab(p);
  if (same(lookup, p)) {
    lookup = old && !same(old, p) ? old : null;
    emitLookup();
  }
  save();
  render();
}

export function getLookupRepo() {
  return lookup;
}

export function getOpenRepos() {
  return tabs.slice();
}

export function promoteLookup() {
  if (lookup) activate(lookup);
}

function onListClick(e) {
  const tab = e.target.closest('.rt-tab');
  if (!tab) return;
  const p = tab.dataset.p;
  const b = e.target.closest('.rt-btn');
  if (b) {
    e.stopPropagation();
    if (b.dataset.act === 'split') toggleLookup(p);
    else closeTab(p);
    return;
  }
  activate(p);
}

function onListAux(e) {
  if (e.button !== 1) return;
  const tab = e.target.closest('.rt-tab');
  if (!tab) return;
  e.preventDefault();
  closeTab(tab.dataset.p);
}

function onListWheel(e) {
  if (listEl.scrollWidth <= listEl.clientWidth) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!d) return;
  e.preventDefault();
  listEl.scrollLeft += d;
}

function build() {
  const titlebar = document.getElementById('appTitlebar');
  if (!titlebar) return false;
  bar = document.createElement('div');
  bar.id = 'repoTabsBar';
  bar.className = 'repo-tabs-row';
  bar.innerHTML =
    '<div class="rt-list" id="repoTabsList"></div>' +
    '<button type="button" class="rt-add" id="repoTabsAdd" title="Open another repo in a new tab">' + ICON_PLUS + '</button>';
  const controls = titlebar.querySelector('.titlebar-controls');
  if (controls) titlebar.insertBefore(bar, controls);
  else titlebar.appendChild(bar);
  listEl = bar.querySelector('#repoTabsList');
  listEl.addEventListener('click', onListClick);
  listEl.addEventListener('auxclick', onListAux);
  listEl.addEventListener('wheel', onListWheel, { passive: false });
  bar.querySelector('#repoTabsAdd').addEventListener('click', addNew);
  return true;
}

async function preloadOthers() {
  for (const p of tabs.slice()) {
    if (!same(p, state.selectedRepoPath)) await preload(p);
  }
}

function init() {
  if (inited) return;
  inited = true;
  injectCss();
  if (!build()) return;
  const saved = readSaved();
  tabs = saved.tabs;
  lookup = saved.lookup;
  prevMaster = state.selectedRepoPath || null;
  if (state.selectedRepoPath) addTab(state.selectedRepoPath);
  document.addEventListener('repo:switched', onSwitched);
  render();
  import('../ideMode/lookupPane.js')
    .then((m) => {
      lookupMod = m;
      m.init();
    })
    .catch((err) => console.error('[RepoTabs] lookup pane failed to load:', err));
  setTimeout(preloadOthers, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}