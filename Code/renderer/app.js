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

import {
    invalidateFlatCache,
    setupSearch
} from './searchManager.js';

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
    initGenerateButton,
    initClearSelectionButton,
    onSelectionChange
} from './app_manager/generateManager.js';

import {
    initTools,
    handleRepoChange
} from './app_manager/toolsManager.js';

import { initZoomManager } from './app_manager/zoomManager.js';

// ── DOM refs only used in app.js ──────────────────────────────────────────────

const selectRepoBtn  = document.getElementById('selectRepoBtn');
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
    browse.innerHTML = '<span style="margin-right:6px">📁</span> Browse for another folder...';
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
        state.cachedTree = await window.electronAPI.getFolderTree(state.selectedRepoPath);
        invalidateFlatCache();
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
    try {
        const ok = await window.electronAPI.openGlobalDocignore();
        if (!ok) alert('Failed to open global ignore file.');
    } catch (err) {
        console.error('[UI] Error opening .docignore:', err);
    }
});

// ── Feature visibility ────────────────────────────────────────────────────────

function applyFeatureVisibility(feats) {
    const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
    if (!feats.folderFilters) { hide('folderToggleBtn'); hide('folderPanel'); }
}

// ── DOMContentLoaded init ─────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    // Title bar
    initTitlebar();
    // Drag scroll
    initDragScroll();

    // Features
    const feats = await initFeatures();
    console.log('[Init] Features:', feats);
    applyFeatureVisibility(feats);

    // Theme
    let settingsManager = null;
    if (feats.themeEngine) {
        settingsManager = await import('./settingsManager.js');
        settingsManager.initSettings();
        settingsManager.hookLegacyThemeToggle();
    } else {
        applyFallbackTheme();
        wireFallbackThemeToggle();
        settingsManager = { openSettings: openLightSettings };
    }

    // Generate controls
    initProgress();
    initActionButtons();
    initSplitModeButton();
    initGenerateButton();
    initClearSelectionButton();

    // View mode
    initViewMode();

    // Zoom controls
    initZoomManager();

    // Tools (apiTool, secretHolder, workspaceTool, gitTool)
    await initTools(feats, settingsManager);


    setupFilterInput(() => state.cachedTree, displayTree);
    setupSearch(() => state.cachedTree, () => filterTree(state.cachedTree), treeContainer);

    // Shortcut mode
    initShortcutMode();

    // Filters
    await loadIgnoredExtensions();
    if (feats.folderFilters) await loadFolderFilters();

    // View mode apply
    applyViewMode(state.viewMode);

    // Restore last repo
    await loadLastActiveRepo();
});