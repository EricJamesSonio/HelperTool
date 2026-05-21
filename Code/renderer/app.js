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

// ── DOM refs only used in app.js ──────────────────────────────────────────────

const selectRepoBtn  = document.getElementById('selectRepoBtn');
const refreshBtn     = document.getElementById('refreshBtn');
const editDocignoreBtn = document.getElementById('editDocignoreBtn');
const settingsBtn    = document.getElementById('settingsBtn');
const treeContainer  = document.getElementById('treeContainer');

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
        displayTree();
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
    if (!feats.secretHolder)  { hide('secretHolderBtn'); }
    if (!feats.workspaceTool) { hide('workspaceTool'); }
    if (!feats.folderFilters) { hide('folderToggleBtn'); hide('folderPanel'); }
}

// ── DOMContentLoaded init ─────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
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

    settingsBtn.addEventListener('click', () => {
        settingsManager
            ? settingsManager.openSettings()
            : console.warn('[UI] Settings not loaded');
    });

    // Generate controls
    initProgress();
    initActionButtons();
    initSplitModeButton();
    initGenerateButton();
    initClearSelectionButton();

    // View mode
    initViewMode();

    // Tools (apiTool, secretHolder, workspaceTool, gitTool)
    await initTools(feats);


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