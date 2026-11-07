import { state } from '../app_manager/appState.js';
import { displayTree } from '../app_manager/viewManager.js';

const LS_ON = 'helpertool-ide-mode';
const LS_W = 'helpertool-ide-sidebar-w';

const BTN_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="vertical-align:middle;margin-right:4px"><path d="M7 6l-4 4 4 4"/><path d="M13 6l4 4-4 4"/><path d="M11 4l-2 12"/></svg>';

let active = false;
let seq = 0;
let btn = null;
let mods = null;
let buildPromise = null;
let lastRepo = null;

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function writeLS(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}

function normRepo(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function injectCss() {
  const sheets = [
    ['ideModeCss', './styles/ide-mode.css'],
    ['ideViewerCss', './styles/ide-viewer.css'],
    ['idePolishCss', './styles/ide-polish.css'],
    ['ideSearchCss', './styles/ide-search.css'],
    ['ideSearchV2Css', './styles/ide-search-v2.css'],
    ['ideDiffCss', './styles/ide-diff.css'],
    ['chromeFlatCss', './styles/chrome-flat.css'],
    ['ideAccentCss', './styles/ide-accent.css'],
    ['ideMirrorCss', './styles/ide-mirror.css'],
  ];
  for (const [id, href] of sheets) {
    if (document.getElementById(id)) continue;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

function applyWidth() {
  const w = parseInt(readLS(LS_W, ''), 10);
  if (w >= 180 && w <= 600) document.documentElement.style.setProperty('--ide-sb-w', w + 'px');
  document.body.classList.toggle('ide-sb-right', readLS('helpertool-ide-sidebar-side', 'left') === 'right');
}

function makeDiv(id, cls) {
  const el = document.createElement('div');
  el.id = id;
  el.className = cls;
  return el;
}

function openRelative(p) {
  const repo = state.selectedRepoPath;
  if (!p || !repo || !mods) return;
  if (p.indexOf('.') === -1 && p.indexOf('/') === -1 && p.indexOf('\\') === -1) return;
  const isAbs = /^([a-zA-Z]:[\\/]|[\\/])/.test(p);
  const sep = repo.indexOf('\\') !== -1 ? '\\' : '/';
  const full = isAbs ? p : repo.replace(/[\\/]+$/, '') + sep + p.replace(/[\\/]/g, sep);
  mods.editor.openFile(full);
}

function isSideRight() {
  return document.body.classList.contains('ide-sb-right');
}

function setSideRight(right) {
  document.body.classList.toggle('ide-sb-right', right);
  writeLS('helpertool-ide-sidebar-side', right ? 'right' : 'left');
}
function initResizer(sidebar, resizer) {
  let dragging = false;
  let raf = 0;
  let nextW = 0;
  let startW = 0;
  let wantSwap = false;
  resizer.addEventListener('pointerdown', (e) => {
    dragging = true;
    wantSwap = false;
    nextW = 0;
    startW = sidebar.getBoundingClientRect().width;
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('dragging');
    document.body.style.userSelect = 'none';
  });
  resizer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = sidebar.getBoundingClientRect();
    const right = isSideRight();
    const raw = right ? rect.right - e.clientX : e.clientX - rect.left;
    nextW = Math.min(600, Math.max(180, raw));
    const ratio = e.clientX / Math.max(1, window.innerWidth);
    wantSwap = right ? ratio < 0.35 : ratio > 0.65;
    document.body.classList.toggle('ide-swap-hint', wantSwap);
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        document.documentElement.style.setProperty('--ide-sb-w', nextW + 'px');
      });
    }
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.classList.remove('ide-swap-hint');
    document.body.style.userSelect = '';
    try { resizer.releasePointerCapture(e.pointerId); } catch (_) {}
    if (wantSwap) {
      wantSwap = false;
      if (startW) document.documentElement.style.setProperty('--ide-sb-w', Math.round(startW) + 'px');
      setSideRight(!isSideRight());
      return;
    }
    if (nextW) writeLS(LS_W, String(Math.round(nextW)));
  };
  resizer.addEventListener('pointerup', end);
  resizer.addEventListener('pointercancel', end);
}

async function openSearch(toggle) {
  if (!active) return;
  try {
    const m = await ensureBuilt();
    if (toggle && m.search.isOpen()) {
      m.search.close();
      return;
    }
    m.search.open(m.editor.getSelectedText());
  } catch (err) {
    console.error('[IDE] search failed to open:', err);
  }
}

function ensureBuilt() {
  if (buildPromise) return buildPromise;
  buildPromise = Promise.all([import('./explorer.js'), import('./editor.js'), import('./sidePanels.js'), import('./search.js')])
    .then(([explorer, editor, sidePanels, search]) => {
      const body = document.querySelector('.app-body');
      const sidebar = makeDiv('ideSidebar', 'ide-root ide-sidebar');
      const resizer = makeDiv('ideResizer', 'ide-resizer');
      const main = makeDiv('ideMain', 'ide-root ide-main');
      body.append(sidebar, resizer, main);
      mods = { explorer, editor, sidePanels, search, tabs: [] };
      editor.mount(main, {
        onTabsChange: (list, act) => {
          mods.tabs = Array.isArray(list) ? list : [];
          explorer.setOpenEditors(list, act);
          sidePanels.setActiveFile(act);
        },
      });
      search.init({
        onOpen: (p, line, col, len) => editor.openAt(p, line, col, len),
        isDirty: (p) => editor.isDirty(p),
        onFileChanged: (p) => editor.reloadFromDisk(p),
      });
      explorer.mount(sidebar, {
        onOpenFile: (p) => editor.openFile(p),
        onActivateTab: (p) => editor.openFile(p),
        onCloseTab: (p) => editor.closeTab(p),
        onSearch: () => openSearch(false),
        onClearAll: () => editor.clearAll(),
      });
      sidePanels.mount(sidebar, {
        onOpenRelative: openRelative,
        onOpenDiff: (spec) => editor.openDiff(spec),
        onViewVersion: (spec) => editor.openView(spec),
      });
      initResizer(sidebar, resizer);
      editor.restoreSession().catch((err) => console.error('[IDE] restore failed:', err));
      return mods;
    })
    .catch((err) => {
      buildPromise = null;
      throw err;
    });
  return buildPromise;
}

async function setActive(on) {
  const my = ++seq;
  active = on;
  writeLS(LS_ON, on ? '1' : '0');
  if (btn) btn.classList.toggle('active-ide', on);
  if (on) {
    document.body.classList.add('ide-mode');
    try {
      const m = await ensureBuilt();
      if (my === seq && active) m.explorer.renderTree();
    } catch (err) {
      console.error('[IDE] failed to load:', err);
      active = false;
      document.body.classList.remove('ide-mode');
      if (btn) btn.classList.remove('active-ide');
      if (state.cachedTree) displayTree(false);
    }
  } else {
    document.body.classList.remove('ide-mode');
    if (mods) mods.search.close(true);
    if (state.cachedTree) displayTree(false);
  }
}

const NAV_SEARCH_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>';

function createNavSearch() {
  const center = document.querySelector('.navbar-row--primary .navbar-section.center');
  if (!center || document.getElementById('ideNavSearch')) return;
  const el = document.createElement('button');
  el.id = 'ideNavSearch';
  el.type = 'button';
  el.className = 'ide-nav-search';
  el.title = 'Search words in the codebase (F2)';
  el.innerHTML = NAV_SEARCH_ICON + '<span class="ide-nav-search-text">Search in codebase</span><kbd class="ide-nav-search-key">F2</kbd>';
  el.addEventListener('click', () => openSearch(false));
  center.insertBefore(el, center.firstChild);
}
function createButton() {
  const right = document.querySelector('.navbar-row--primary .navbar-section.right');
  const anchor = document.getElementById('viewModeBtn');
  const host = right || (anchor && anchor.parentElement);
  if (!host) return;
  btn = document.createElement('button');
  btn.id = 'ideModeBtn';
  btn.type = 'button';
  btn.className = 'view-mode-btn ide-mode-btn';
  btn.title = 'Toggle IDE mode (VS Code style explorer and editor)';
  btn.innerHTML = BTN_ICON + 'IDE Mode';
  btn.addEventListener('click', () => setActive(!active));
  host.insertBefore(btn, host.firstChild);
  createNavSearch();
}

function onRepoSwitched(e) {
  const next = normRepo((e && e.detail && e.detail.repoPath) || state.selectedRepoPath);
  const changed = next !== lastRepo;
  lastRepo = next;
  if (changed && mods) {
    mods.search.reset();
    mods.editor.switchRepo().catch((err) => console.error('[IDE] repo switch failed:', err));
  }
}

function onGlobalKey(e) {
  if (e.key !== 'F2' || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
  if (!active || !mods) return;
  e.preventDefault();
  e.stopPropagation();
  openSearch(true);
}

function reloadIde() {
  if (!active || !mods) return;
  mods.explorer.refresh();
  const tabs = mods.tabs || [];
  for (const t of tabs) {
    if (!t || t.dirty || !t.path) continue;
    try {
      const r = mods.editor.reloadFromDisk(t.path);
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (_) {}
  }
}
function init() {
  injectCss();
  applyWidth();
  createButton();
  lastRepo = state.selectedRepoPath ? normRepo(state.selectedRepoPath) : null;
  document.addEventListener('repo:switched', onRepoSwitched);
  document.addEventListener('keydown', onGlobalKey, true);
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      reloadIde();
    });
  }
  if (readLS(LS_ON, '0') === '1') setActive(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}