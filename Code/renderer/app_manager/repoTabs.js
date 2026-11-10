import { state } from './appState.js';
import { loadRepo } from './repoManager.js';
import { confirmDialog } from '../utils/confirmDialog.js';

const LS_KEY = 'helpertool-open-repos';
const MAX_TABS = 12;

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
const ready = new Set();

function norm(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function same(a, b) {
  return !!a && !!b && norm(a) === norm(b);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function baseName(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || String(p || '');
}

function parentName(p) {
  const parts = String(p || '').split(/[\\/]/).filter(Boolean);
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
    localStorage.setItem(LS_KEY, JSON.stringify({ tabs, lookup }));
  } catch (_) {}
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

function render() {
  if (!listEl) return;
  const master = state.selectedRepoPath;
  listEl.innerHTML = tabs.map((p) => {
    const isM = same(p, master);
    const isL = same(p, lookup);
    const busy = loading.has(norm(p));
    const role = isM ? 'MASTER' : isL ? 'LOOKUP' : '';
    let tip = 'Click to make this the master repo';
    if (isM) tip = 'Master repo: used by Global Seeder, Flow Tool, Git and the other tools';
    else if (isL) tip = 'Lookup repo: shown beside the master in IDE mode (view and edit only)';
    let html = '<div class="rt-tab' + (isM ? ' master' : '') + (isL ? ' lookup' : '') + (busy ? ' loading' : '') + '" data-p="' + esc(p) + '" title="' + esc(p + ' - ' + tip) + '">';
    html += '<span class="rt-dot"></span><span class="rt-name">' + esc(labelOf(p)) + '</span>';
    if (role) html += '<span class="rt-role">' + role + '</span>';
    if (!isM) {
      html += '<button type="button" class="rt-btn rt-split' + (isL ? ' on' : '') + '" data-act="split" title="' + (isL ? 'Close the split view for this repo' : 'Open beside the master in IDE mode (view and edit only)') + '">' + ICON_SPLIT + '</button>';
    }
    if (tabs.length > 1) {
      html += '<button type="button" class="rt-btn rt-close" data-act="close" title="Close tab">&times;</button>';
    }
    return html + '</div>';
  }).join('');
}

function addTab(p) {
  if (!p || tabs.some((t) => same(t, p))) return;
  tabs.push(p);
  while (tabs.length > MAX_TABS) {
    const idx = tabs.findIndex((t) => !same(t, state.selectedRepoPath) && !same(t, lookup));
    if (idx < 0) break;
    tabs.splice(idx, 1);
  }
}

async function preload(p) {
  const key = norm(p);
  if (!p || ready.has(key) || loading.has(key)) return;
  loading.add(key);
  render();
  try {
    await window.electronAPI.getFolderTree(p);
    ready.add(key);
  } catch (_) {
    ready.delete(key);
  } finally {
    loading.delete(key);
    render();
  }
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
  loading.add(key);
  render();
  try {
    await loadRepo(p);
  } catch (err) {
    console.error('[RepoTabs] switch failed:', err);
  } finally {
    loading.delete(key);
    render();
  }
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
  ready.add(norm(p));
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

function build() {
  const nav = document.querySelector('.navbar-row--primary');
  if (!nav || !nav.parentElement) return false;
  bar = document.createElement('div');
  bar.id = 'repoTabsBar';
  bar.className = 'repo-tabs-row';
  bar.innerHTML =
    '<div class="rt-list" id="repoTabsList"></div>' +
    '<button type="button" class="rt-add" id="repoTabsAdd" title="Open another repo in a new tab">' + ICON_PLUS + '</button>';
  nav.parentElement.insertBefore(bar, nav);
  listEl = bar.querySelector('#repoTabsList');
  listEl.addEventListener('click', (e) => {
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
  });
  listEl.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const tab = e.target.closest('.rt-tab');
    if (!tab) return;
    e.preventDefault();
    closeTab(tab.dataset.p);
  });
  bar.querySelector('#repoTabsAdd').addEventListener('click', addNew);
  return true;
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
  setTimeout(async () => {
    for (const p of tabs.slice()) {
      if (!same(p, state.selectedRepoPath)) await preload(p);
    }
  }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}