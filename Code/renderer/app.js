/**
 * app.js — entry point
 * Imports all feature modules and wires them together.
 * Contains no business logic of its own.
 */

import {
    setupFilterInput,
    loadIgnoredExtensions,
    loadFolderFilters,
    filterTree,
    renderFilterChips,
    renderIgnorePanel,
    renderFolderPanel
} from './filterManager.js';

import { setupSearch } from './searchManager.js';

import {
    initShortcutMode
} from './shortcutMode.js';

import {
    initFeatures,
    getFeatures
} from './featureManager.js';

import {
    applyFallbackTheme,
    wireFallbackThemeToggle
} from './app_manager/themeManager.js';

import { openLightSettings } from './app_manager/lightSettingsModal.js';

import { init as initDragScroll } from './app_manager/dragScroll.js';

import { state } from './app_manager/appState.js';

import {
    applyViewMode,
    initViewMode,
    setSelectionChangeHandler,
    renderRootJumper,
    displayTree
} from './app_manager/viewManager.js';

import {
    loadRepo,
    loadLastActiveRepo,
    setRepoChangeHandler
} from './app_manager/repoManager.js';

import {
    initProgress,
    initActionButtons,
    initSplitModeButton,
    initModeItems,
    initGenerateButton,
    initClearSelectionButton,
    onSelectionChange
} from './app_manager/generateManager.js';

import {
    initTools,
    handleRepoChange,
    closeAllPanels,
    getTerminalUI,
    ensureTerminalUI
} from './app_manager/toolsManager.js';

import * as sessionNotes from './sessionNotes.js';

import { initZoomManager } from './app_manager/zoomManager.js';
import { getPrefetchCache } from './app_manager/prefetchManager.js';
import { init as initServiceTracker } from './serviceTracker.js';

import { openDocignoreManager, isDocignoreManagerOpen, closeDocignoreManager } from './docignoreManagerUI.js';
import * as essentialsGlossary from './essentialsGlossary.js';
import { openShortcutSetup, onShortcutSave, showConfirmDialog } from './shortcut-setup.js';

// ── DOM refs only used in app.js ──────────────────────────────────────────────

const selectRepoBtn  = document.getElementById('selectRepoBtn');
const notesBtn       = document.getElementById('notesBtn');
const refreshBtn     = document.getElementById('refreshBtn');
const editDocignoreBtn = document.getElementById('editDocignoreBtn');
const treeContainer  = document.getElementById('treeContainer');
const serverBtn      = document.getElementById('serverBtn');
const clientBtn      = document.getElementById('clientBtn');
const globalSeederNavbarBtn = document.getElementById('globalSeederNavbarBtn');

// ── Shortcut state ────────────────────────────────────────────────────────────

const shortcutState = { server: null, client: null };
const _shortcutBusy = { server: false, client: false };
let _shortcutConfigPromise = Promise.resolve();

async function loadShortcutConfig() {
  _shortcutConfigPromise = (async () => {
    if (!state.selectedRepoPath) {
      shortcutState.server = null;
      shortcutState.client = null;
      updateShortcutButtons();
      return;
    }
    try {
      const cfg = await window.electronAPI.shortcutGetConfig(state.selectedRepoPath);
      shortcutState.server = cfg?.server ? { ...cfg.server, running: false } : null;
      shortcutState.client = cfg?.client ? { ...cfg.client, running: false } : null;
    } catch {
      shortcutState.server = null;
      shortcutState.client = null;
    }
    updateShortcutButtons();
  })();
  return _shortcutConfigPromise;
}

function _shortcutLabel(type) {
  return `${type === 'server' ? 'Server' : 'Client'} — ${(state.selectedRepoPath || '').split(/[/\\]/).pop()}`;
}

function updateShortcutButtons() {
  [['server', serverBtn], ['client', clientBtn]].forEach(([type, btn]) => {
    if (!btn) return;
    const cfg = shortcutState[type];
    btn.classList.remove('shortcut-configured', 'shortcut-unconfigured', 'shortcut-running');
    if (cfg) {
      btn.classList.add('shortcut-configured');
      if (cfg.running) btn.classList.add('shortcut-running');
      btn.title = cfg.running
        ? `${type === 'server' ? 'Server' : 'Client'} is running — ${cfg.command}`
        : `Run ${type === 'server' ? 'Server' : 'Client'}: ${cfg.command}`;
    } else {
      btn.classList.add('shortcut-unconfigured');
      btn.title = `Right-click to set up ${type === 'server' ? 'Server' : 'Client'} shortcut`;
    }
  });
}

async function runShortcut(type, repoPath) {
  const cfg = shortcutState[type];
  if (!cfg) return;
  try {
    const label = _shortcutLabel(type);
    const termUI = await ensureTerminalUI();
    const id = await termUI.openShortcutTerminal(cfg.cwd, label, cfg.command);
    cfg.termId = id;
    cfg.running = true;
    updateShortcutButtons();
  } catch (err) {
    console.error(`[Shortcut] Failed to run ${type}:`, err);
  }
}

function _shortcutTermExited(id) {
  for (const type of ['server', 'client']) {
    const cfg = shortcutState[type];
    if (cfg && cfg.termId === id) {
      cfg.termId = null;
      cfg.running = false;
      updateShortcutButtons();
      break;
    }
  }
}

window.electronAPI?.onTerminalExit?.(payload => {
  _shortcutTermExited(payload.id);
});

function setupShortcutButton(type, btn) {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!state.selectedRepoPath) return;
    await _shortcutConfigPromise;
    if (_shortcutBusy[type]) return;
    _shortcutBusy[type] = true;
    try {
      const cfg = shortcutState[type];
      if (!cfg) {
        openShortcutSetup(type, state.selectedRepoPath, null);
        return;
      }
      if (cfg.running) {
        const label = _shortcutLabel(type);
        const termUI = await ensureTerminalUI();
        if (!termUI.hasTabWithLabel(label)) {
          cfg.running = false;
          updateShortcutButtons();
          return;
        }
        const confirmed = await showConfirmDialog(`Stop the ${type === 'server' ? 'Server' : 'Client'}?`);
        if (confirmed) {
          termUI.killTerminalByLabel(label);
          cfg.running = false;
          updateShortcutButtons();
        }
        return;
      }
      await runShortcut(type, state.selectedRepoPath);
    } finally {
      _shortcutBusy[type] = false;
    }
  });
  btn.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    if (!state.selectedRepoPath) return;
    openShortcutSetup(type, state.selectedRepoPath, shortcutState[type]);
  });
}

// ── Title bar controls ─────────────────────────────────────────────────────────

function initTitlebar() {
  const wc = window.electronAPI.windowControls;
  if (!wc) return;
  document.querySelector('.titlebar-minimize')?.addEventListener('click', () => wc.minimize());
  document.querySelector('.titlebar-maximize')?.addEventListener('click', () => wc.maximize());
  document.querySelector('.titlebar-close')?.addEventListener('click', () => wc.close());

  wc.onMaximizeChanged((maximized) => {
    const bar = document.getElementById('appTitlebar');
    if (bar) bar.classList.toggle('maximized', maximized);
    const btn = document.getElementById('titlebarMaxBtn');
    if (btn) btn.textContent = maximized ? '❐' : '□';
  });
}

// ── Cross-module wiring ───────────────────────────────────────────────────────

// viewManager needs to call generateManager when selection changes
setSelectionChangeHandler(onSelectionChange);

// repoManager notifies toolsManager (git tool) on every repo change
setRepoChangeHandler(handleRepoChange);

// Reload shortcut config on every repo switch
document.addEventListener('repo:switched', () => {
  loadShortcutConfig();
  const termUI = getTerminalUI();
  if (termUI) termUI.updateLastCwd(state.selectedRepoPath);
});

// ── Navbar listeners ──────────────────────────────────────────────────────────

selectRepoBtn.addEventListener('click', async () => {
    try {
        const repoPath = await window.electronAPI.selectRepo();
        if (repoPath) await loadRepo(repoPath);
    } catch (err) {
        console.error('[UI] Repo selection failed:', err);
    }
});

selectRepoBtn.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    document.getElementById('repoDropdown')?.remove();

    const repos = await window.electronAPI.getRecentRepos?.() || [];

    const dropdown = document.createElement('div');
    dropdown.id = 'repoDropdown';
    dropdown.className = 'repo-dropdown';

    const rect = selectRepoBtn.getBoundingClientRect();
    dropdown.style.top = rect.bottom + 4 + 'px';
    dropdown.style.left = rect.left + 'px';

    if (repos.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'repo-dropdown-item repo-dropdown-empty';
        empty.textContent = 'No recent repos';
        dropdown.appendChild(empty);
    } else {
        repos.forEach(r => {
            const item = document.createElement('div');
            item.className = 'repo-dropdown-item';
            if (r.repoPath === state.selectedRepoPath) {
                item.classList.add('repo-dropdown-item--active');
            }
            item.innerHTML = `
                <div class="repo-dropdown-item-name">${r.repoPath.split(/[/\\]/).pop()}</div>
                <div class="repo-dropdown-item-path">${r.repoPath}</div>
            `;
            item.addEventListener('click', () => {
                dropdown.remove();
                if (r.repoPath !== state.selectedRepoPath) {
                    loadRepo(r.repoPath);
                }
            });
            dropdown.appendChild(item);
        });
    }

    const divider = document.createElement('div');
    divider.className = 'repo-dropdown-divider';
    dropdown.appendChild(divider);

    const browse = document.createElement('div');
    browse.className = 'repo-dropdown-item';
    browse.innerHTML = '<span style="margin-right:6px"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align:middle"><path d="M2 7v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9L7 4H4a2 2 0 0 0-2 2v1z"/></svg></span> Browse for another folder...';
    browse.addEventListener('click', async () => {
        dropdown.remove();
        const repoPath = await window.electronAPI.selectRepo();
        if (repoPath) await loadRepo(repoPath);
    });
    dropdown.appendChild(browse);

    document.body.appendChild(dropdown);

    const closeDropdown = (ev) => {
        if (!dropdown.contains(ev.target) && ev.target !== selectRepoBtn) {
            dropdown.remove();
            document.removeEventListener('click', closeDropdown);
            document.removeEventListener('keydown', closeOnEscape);
        }
    };
    const closeOnEscape = (ev) => {
        if (ev.key === 'Escape') {
            dropdown.remove();
            document.removeEventListener('click', closeDropdown);
            document.removeEventListener('keydown', closeOnEscape);
        }
    };

    setTimeout(() => {
        document.addEventListener('click', closeDropdown);
        document.addEventListener('keydown', closeOnEscape);
    }, 0);
});

refreshBtn.addEventListener('click', async () => {
    if (!state.selectedRepoPath) return;
    refreshBtn.classList.add('spinning');
    refreshBtn.disabled = true;
    try {
        await window.electronAPI.clearDocignoreCache(state.selectedRepoPath);
        await window.electronAPI.clearFolderTreeCache(state.selectedRepoPath);
        state.cachedTree = await window.electronAPI.getFolderTree(state.selectedRepoPath);
        renderFilterChips();
        const feats = getFeatures();
        if (state.cachedTree) {
            renderIgnorePanel(state.cachedTree);
            if (feats.folderFilters) renderFolderPanel(state.cachedTree);
        }
        renderRootJumper(state.cachedTree);
        displayTree(false);
    } catch (err) {
        console.error('[UI] Refresh failed:', err);
    } finally {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
    }
});

editDocignoreBtn.addEventListener('click', async () => {
    if (isDocignoreManagerOpen()) {
        closeDocignoreManager();
        return;
    }
    openDocignoreManager(state.selectedRepoPath || null);
});

notesBtn.addEventListener('click', () => {
    if (sessionNotes.isSessionNotesOpen()) {
        sessionNotes.closeSessionNotes();
    } else {
        closeAllPanels();
        sessionNotes.openSessionNotes();
    }
});

document.getElementById('essentialsBtn')?.addEventListener('click', () => {
    if (essentialsGlossary.isOpen()) {
        essentialsGlossary.close();
    } else {
        closeAllPanels();
        essentialsGlossary.open();
    }
});

// ── Global Seeder navbar button ──────────────────────────────────────────
if (globalSeederNavbarBtn) {
  globalSeederNavbarBtn.addEventListener('click', async () => {
    try {
      const mod = await import('./globalSeeder.js');
      if (mod.isOpen()) { mod.close(); return; }
      closeAllPanels();
      mod.open();
    } catch (err) { console.error('[UI] Global Seeder:', err); }
  });
}

// ── Shortcut buttons ─────────────────────────────────────────────────────────

setupShortcutButton('server', serverBtn);
setupShortcutButton('client', clientBtn);

onShortcutSave(() => {
  loadShortcutConfig();
});

// ── Feature visibility ────────────────────────────────────────────────────────

function applyFeatureVisibility(feats) {
    const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
    if (!feats.folderFilters) { hide('folderToggleBtn'); hide('folderPanel'); }
}

// ── Receive prefetch data from main process ──────────────────────────────────

window.electronAPI.onPrefetchReady(async (key, ttl) => {
    if (key === 'profile') {
        const profileMod = await import('./profile.js').catch(() => null);
        if (profileMod?.isOpen()) {
            const data = await window.electronAPI.getPrefetchData(key);
            if (data) getPrefetchCache().set(key, data, ttl);
        }
        return;
    }
    const data = await window.electronAPI.getPrefetchData(key);
    if (data) getPrefetchCache().set(key, data, ttl);
});

// ── DOMContentLoaded init ─────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    // Title bar
    initTitlebar();
    // Drag scroll
    initDragScroll();

    const loadingOverlay = document.getElementById('appLoadingOverlay');
    const loadingSub = document.getElementById('appLoadingSub');
    const loadingTimer = document.getElementById('appLoadingTimer');

    performance.mark('init:start');
    const _t0 = Date.now();

    // Fetch main process start time (offsets timer to reflect total app startup)
    let _mainOffset = 0;
    window.electronAPI.getAppStartTime().then(mainStart => {
      _mainOffset = _t0 - mainStart;
    }).catch(() => {});

    // Live timer — updates loading overlay via requestAnimationFrame
    let _timerFrame;
    if (loadingTimer) {
      loadingTimer.textContent = 'loading... 0.0s';
      const tick = () => {
        const s = (Date.now() - _t0 + _mainOffset) / 1000;
        if (s >= 0) loadingTimer.textContent = `loading... ${s.toFixed(1)}s`;
        _timerFrame = requestAnimationFrame(tick);
      };
      _timerFrame = requestAnimationFrame(tick);
    }

    // Load features first — lightweight IPC call
    const feats = await initFeatures();
    performance.mark('init:features');
    performance.measure('init:features', 'init:start', 'init:features');
    if (loadingSub) loadingSub.textContent = 'Loading workspace...';

    // Fire repo load in background — don't block UI startup on tree walk
    const repoLoadPromise = loadLastActiveRepo()
      .then(() => performance.mark('init:repo-loaded'))
      .catch(err => console.error('[Init] loadLastActiveRepo:', err));

    applyFeatureVisibility(feats);

    // Only initActionButtons is critical (sets label text visible on first paint)
    initActionButtons();
    performance.mark('init:controls');

    // Theme — fast fallback for first paint, full engine (~50KB)
    const settingsRef = { current: null };
    applyFallbackTheme();
    wireFallbackThemeToggle();
    let themePromise = Promise.resolve();
    if (feats.themeEngine) {
        themePromise = import('./settingsManager.js').then(sm => {
            sm.initSettings();
            sm.hookLegacyThemeToggle();
            settingsRef.current = sm;
        }).catch(err => console.error('[Init] settingsManager:', err));
    }

    // Tools — populates sidebar
    await initTools(feats, {
        openSettings: () => { if (settingsRef.current?.openSettings) settingsRef.current.openSettings(); else openLightSettings(); },
    });
    performance.mark('init:theme-tools');
    performance.measure('init:theme+tools', 'init:controls', 'init:theme-tools');

    // View mode apply — critical (sets button icon, may render tree)
    applyViewMode(state.viewMode);

    performance.mark('init:done');
    performance.measure('init:total', 'init:start', 'init:done');

    // Wait for deferred CSS + full theme engine before hiding overlay
    // (RAF keeps the live timer ticking during this wait)
    const deferredCss = document.querySelectorAll('link[rel="stylesheet"][media="print"]');
    await Promise.all([
      themePromise,
      ...Array.from(deferredCss).map(link => {
        if (link.sheet) return;
        return new Promise(r => { link.addEventListener('load', r, { once: true }); link.addEventListener('error', r, { once: true }); });
      })
    ]);

    // UI setup that used to be deferred to RAF — run now while overlay is still visible
    initProgress();
    initSplitModeButton();
    initModeItems();
    initGenerateButton();
    initClearSelectionButton();
    initViewMode();
    initZoomManager();
    initShortcutMode();
    setupFilterInput(() => state.cachedTree, displayTree);
    setupSearch(() => state.cachedTree, () => state.cachedTree ? filterTree(state.cachedTree) : [], treeContainer);
    const filterPromises = [loadIgnoredExtensions()];
    if (feats.folderFilters) filterPromises.push(loadFolderFilters());
    Promise.all(filterPromises).catch(err => console.error('[Init] Filter load error:', err));
    initServiceTracker().catch(err => console.error('[ServiceTracker] init error:', err));

    if (_timerFrame) cancelAnimationFrame(_timerFrame);

    const entries = ['init:features', 'init:theme+tools', 'init:total']
      .map(n => performance.getEntriesByName(n).pop())
      .filter(Boolean);
    if (entries.length) console.table(entries.map(e => ({ phase: e.name, duration: `${e.duration.toFixed(1)}ms` })));

    // Show boot time as toast, then fade overlay
    const bootSeconds = (Date.now() - _t0 + _mainOffset) / 1000;

    if (loadingSub) loadingSub.textContent = 'Ready';
    if (loadingOverlay) {
      loadingOverlay.classList.add('app-loading-hidden');
      setTimeout(() => loadingOverlay.remove(), 400);
    }

    // Toast notification — "Booted in X.Xs"
    const toast = document.createElement('div');
    toast.className = 'boot-toast';
    toast.textContent = `Booted in ${bootSeconds.toFixed(1)}s`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('boot-toast-hide');
      setTimeout(() => toast.remove(), 400);
    }, 3000);

    // Measure background repo load separately (doesn't block UI)
    repoLoadPromise.then(() => {
      const repoEntry = performance.getEntriesByName('init:repo-loaded').pop();
      if (repoEntry) console.log(`[Init] Background repo load: ${(repoEntry.startTime - performance.getEntriesByName('init:start').pop()?.startTime || 0).toFixed(0)}ms`);
      loadShortcutConfig();
    });
});