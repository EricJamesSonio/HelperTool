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
    closeAllPanels
} from './app_manager/toolsManager.js';

import * as sessionNotes from './sessionNotes.js';

import { initZoomManager } from './app_manager/zoomManager.js';
import { getPrefetchCache } from './app_manager/prefetchManager.js';
import { init as initServiceTracker } from './serviceTracker.js';

import { openDocignoreManager, isDocignoreManagerOpen, closeDocignoreManager } from './docignoreManagerUI.js';
import * as essentialsGlossary from './essentialsGlossary.js';

// ── DOM refs only used in app.js ──────────────────────────────────────────────

const selectRepoBtn  = document.getElementById('selectRepoBtn');
const notesBtn       = document.getElementById('notesBtn');
const refreshBtn     = document.getElementById('refreshBtn');
const editDocignoreBtn = document.getElementById('editDocignoreBtn');
const treeContainer  = document.getElementById('treeContainer');

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

    performance.mark('init:start');

    // Load features first — lightweight IPC call
    const feats = await initFeatures();
    performance.mark('init:features');
    performance.measure('init:features', 'init:start', 'init:features');

    // Fire repo load in background — don't block UI startup on tree walk
    const repoLoadPromise = loadLastActiveRepo()
      .then(() => performance.mark('init:repo-loaded'))
      .catch(err => console.error('[Init] loadLastActiveRepo:', err));

    applyFeatureVisibility(feats);

    // Generate controls
    initProgress();
    initActionButtons();
    initSplitModeButton();
    initModeItems();
    initGenerateButton();
    initClearSelectionButton();

    // View mode
    initViewMode();

    // Zoom controls
    initZoomManager();
    performance.mark('init:controls');

    // Theme + Tools run in parallel — theme module is ~50KB with 20 themes
    const settingsRef = { current: null };
    if (feats.themeEngine) {
        await Promise.all([
            import('./settingsManager.js').then(sm => {
                sm.initSettings();
                sm.hookLegacyThemeToggle();
                settingsRef.current = sm;
            }),
            initTools(feats, {
                openSettings: () => settingsRef.current?.openSettings?.() ?? openLightSettings(),
            }),
        ]);
    } else {
        applyFallbackTheme();
        wireFallbackThemeToggle();
        await initTools(feats, { openSettings: openLightSettings });
    }
    performance.mark('init:theme-tools');
    performance.measure('init:theme+tools', 'init:controls', 'init:theme-tools');

    setupFilterInput(() => state.cachedTree, displayTree);
    setupSearch(() => state.cachedTree, () => state.cachedTree ? filterTree(state.cachedTree) : [], treeContainer);

    // Shortcut mode
    initShortcutMode();

    // View mode apply
    applyViewMode(state.viewMode);

    // Load filters in background — don't block the tree render
    const filterPromises = [loadIgnoredExtensions()];
    if (feats.folderFilters) filterPromises.push(loadFolderFilters());
    Promise.all(filterPromises).catch(err => console.error('[Init] Filter load error:', err));

    performance.mark('init:done');
    performance.measure('init:total', 'init:start', 'init:done');

    const entries = ['init:features', 'init:theme+tools', 'init:total']
      .map(n => performance.getEntriesByName(n).pop())
      .filter(Boolean);
    if (entries.length) console.table(entries.map(e => ({ phase: e.name, duration: `${e.duration.toFixed(1)}ms` })));

    // Measure background repo load separately (doesn't block UI)
    repoLoadPromise.then(() => {
      const repoEntry = performance.getEntriesByName('init:repo-loaded').pop();
      if (repoEntry) console.log(`[Init] Background repo load: ${(repoEntry.startTime - performance.getEntriesByName('init:start').pop()?.startTime || 0).toFixed(0)}ms`);
    });

    // Service tracker is non-critical — defer after layout
    requestAnimationFrame(() => {
        initServiceTracker().catch(err => console.error('[ServiceTracker] init error:', err));
    });
});