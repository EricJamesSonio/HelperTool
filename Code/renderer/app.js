/**
 * app.js — Core app logic
 * PERF FIXES:
 *  – setLastSelected is debounced (500ms) to avoid a disk write on every tree click
 *  – invalidateFlatCache() called after tree reload so search stays accurate
 *  – theme applied synchronously before async work (unchanged, already good)
 */

import { renderTree } from '../utils/treeView.js';
import {
    activeExtensions,
    ignoredExtensions,
    filterTree,
    renderFilterChips,
    renderIgnorePanel,
    renderFolderPanel,
    loadIgnoredExtensions,
    loadFolderFilters,
    setupFilterInput,
} from './filterManager.js';
import { setupSearch, invalidateFlatCache } from './searchManager.js';
import { initSecretHolder, openSecretHolder, closeSecretHolder, isSecretHolderOpen } from './secretHolder.js';
import { initSettings, openSettings, hookLegacyThemeToggle } from './settingsManager.js';
import { openApiToolPanel, closeApiToolPanel, isApiToolPanelOpen, initApiToolUI } from './apiToolUI.js';
/* ── DOM refs ────────────────────────────────────────────────────────────── */
const selectRepoBtn  = document.getElementById('selectRepoBtn');
const activeRepoName = document.getElementById('activeRepoName');
const treeContainer  = document.getElementById('treeContainer');
const structureBtn   = document.getElementById('structureBtn');
const codeBtn        = document.getElementById('codeBtn');
const generateBtn    = document.getElementById('generateBtn');
const progressBar    = document.getElementById('progressBar');
const progressText   = document.getElementById('progressText');
const editDocignoreBtn  = document.getElementById('editDocignoreBtn');
const selectionCount    = document.getElementById('selectionCount');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const refreshBtn        = document.getElementById('refreshBtn');
const secretHolderBtn   = document.getElementById('secretHolderBtn');
const viewModeBtn       = document.getElementById('viewModeBtn');
const themeToggleBtn    = document.getElementById('themeToggleBtn');
const themeIcon         = document.getElementById('themeIcon');
const themeLabel        = document.getElementById('themeLabel');
const settingsBtn       = document.getElementById('settingsBtn');
const apiToolBtn = document.getElementById('apiToolBtn');

/* ── State ───────────────────────────────────────────────────────────────── */
let selectedRepoPath = null;
let selectedItems    = [];
let actionType       = 'code';
let cachedTree       = null;
let viewMode         = localStorage.getItem('helpertool-viewmode') || 'list';

generateBtn.disabled = true;

/* ── Debounce helper ─────────────────────────────────────────────────────── */
function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Debounced disk write — prevents a write on every single tree node click
const debouncedSetLastSelected = debounce(
    (items) => window.electronAPI.setLastSelected(items),
    500
);

/* ── Progress listener ───────────────────────────────────────────────────── */
window.electronAPI.onProgressUpdate(percent => {
    progressBar.value        = percent;
    progressText.textContent = `${percent}%`;
});

/* ── Theme (legacy toggle — settingsManager now owns the real theme) ─────── */
function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        themeIcon.textContent  = '🌙';
        themeLabel.textContent = 'Dark';
    } else {
        document.documentElement.removeAttribute('data-theme');
        themeIcon.textContent  = '☀️';
        themeLabel.textContent = 'Light';
    }
    localStorage.setItem('helpertool-theme', theme);
}

themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'light' ? 'dark' : 'light');
});
applyTheme(localStorage.getItem('helpertool-theme') || 'dark');

/* ── View mode ───────────────────────────────────────────────────────────── */
function applyViewMode(mode) {
    viewMode = mode;
    localStorage.setItem('helpertool-viewmode', mode);
    if (mode === 'tree') {
        viewModeBtn.textContent = '🌳 Tree Mode';
        viewModeBtn.className   = 'view-mode-btn active-tree';
        viewModeBtn.title       = 'Switch to List (roof) mode';
    } else {
        viewModeBtn.textContent = '☰ Roof Mode';
        viewModeBtn.className   = 'view-mode-btn active-list';
        viewModeBtn.title       = 'Switch to Tree mode';
    }
    if (cachedTree) displayTree();
}

viewModeBtn.addEventListener('click', () => applyViewMode(viewMode === 'list' ? 'tree' : 'list'));
applyViewMode(viewMode);

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function updateActiveRepo(name) {
    activeRepoName.textContent = name || 'No repo selected';
}

function updateSelectionCounter() {
    const count = selectedItems.length;
    selectionCount.textContent = count;
    selectionCount.parentElement.classList.toggle('has-selections', count > 0);
}

function updateGenerateState() {
    generateBtn.disabled = selectedItems.length === 0;
    updateSelectionCounter();
}

function resetSelection() {
    selectedItems.length = 0;
    window.electronAPI.setLastSelected([]);   // immediate write on explicit reset
    updateGenerateState();
}

/* ── Tree display ────────────────────────────────────────────────────────── */
function displayTree() {
    if (!cachedTree) { treeContainer.textContent = 'No data available'; return; }
    const visibleTree = filterTree(cachedTree);
    renderTree(visibleTree, treeContainer, selectedItems, actionType, onTreeSelectionChange, viewMode);
}

function onTreeSelectionChange() {
    updateGenerateState();
    debouncedSetLastSelected(selectedItems);  // debounced — no disk hit per click
}

/* ── Repo loading ────────────────────────────────────────────────────────── */
async function loadRepo(repoPath, resetSel = true) {
    selectedRepoPath = repoPath;
    if (resetSel) {
        selectedItems.length = 0;
        await window.electronAPI.setLastSelected([]);
    }
    updateActiveRepo(repoPath.split(/[/\\]/).pop());
    cachedTree = await window.electronAPI.getFolderTree(repoPath);
    activeExtensions.clear();
    renderFilterChips();

    // Invalidate search flat-cache so it rebuilds with new tree data
    invalidateFlatCache();

    if (cachedTree) {
        renderIgnorePanel(cachedTree);
        renderFolderPanel(cachedTree);
    }
    displayTree();
    updateGenerateState();
}

async function loadLastActiveRepo() {
    try {
        const project = await window.electronAPI.getActiveProject();
        if (project?.repoPath) {
            selectedItems.length = 0;
            project.lastSelectedItems?.forEach(p => selectedItems.push(p));
            await loadRepo(project.repoPath, false);
        }
    } catch (err) {
        console.error('[Init] Failed to load last project:', err);
    }
}

/* ── Button events ───────────────────────────────────────────────────────── */
selectRepoBtn.addEventListener('click', async () => {
    try {
        const repoPath = await window.electronAPI.selectRepo();
        if (repoPath) await loadRepo(repoPath);
    } catch (err) {
        console.error('[UI] Repo selection failed:', err);
    }
});
apiToolBtn.addEventListener('click', async () => {
    if (isApiToolPanelOpen()) closeApiToolPanel();
    else openApiToolPanel();
});

settingsBtn.addEventListener('click', () => openSettings());

refreshBtn.addEventListener('click', async () => {
    if (!selectedRepoPath) return;
    refreshBtn.classList.add('spinning');
    refreshBtn.disabled = true;
    try {
        cachedTree = await window.electronAPI.getFolderTree(selectedRepoPath);
        invalidateFlatCache();
        renderFilterChips();
        if (cachedTree) {
            renderIgnorePanel(cachedTree);
            renderFolderPanel(cachedTree);
        }
        displayTree();
    } catch (err) {
        console.error('[UI] Refresh failed:', err);
    } finally {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
    }
});

clearSelectionBtn.addEventListener('click', () => {
    selectedItems.length = 0;
    window.electronAPI.setLastSelected([]);
    updateGenerateState();
    displayTree();
});

secretHolderBtn.addEventListener('click', async () => {
    if (isSecretHolderOpen()) closeSecretHolder();
    else await openSecretHolder();
});

editDocignoreBtn.addEventListener('click', async () => {
    try {
        const ok = await window.electronAPI.openGlobalDocignore();
        if (!ok) alert('Failed to open global ignore file.');
    } catch (err) {
        console.error('[UI] Error opening .docignore:', err);
    }
});

structureBtn.addEventListener('click', () => {
    actionType = 'structure';
    resetSelection();
    displayTree();
});

codeBtn.addEventListener('click', () => {
    actionType = 'code';
    resetSelection();
    displayTree();
});

generateBtn.addEventListener('click', async () => {
    try {
        if (!selectedRepoPath || !selectedItems.length) return alert('Select repo and items first!');
        const { filePath } = await window.electronAPI.saveFileDialog(actionType);
        if (!filePath) return;

        progressBar.value        = 0;
        progressText.textContent = '0%';

        const success = await window.electronAPI.generate(actionType, selectedRepoPath, selectedItems, filePath);
        if (!success) alert('Generation failed.');
        resetSelection();
        displayTree();
    } catch (err) {
        console.error('[Generate] Failed:', err);
        alert('Generation failed.');
    }
});

/* ── Init ────────────────────────────────────────────────────────────────── */
setupFilterInput(() => cachedTree, displayTree);
setupSearch(() => cachedTree, () => filterTree(cachedTree), treeContainer);

window.addEventListener('DOMContentLoaded', async () => {
    initSettings();
    hookLegacyThemeToggle();
    await loadIgnoredExtensions();
    await loadFolderFilters();
    await loadLastActiveRepo();
    initSecretHolder();
    try {
        await initApiToolUI();
    } catch (err) {
        console.error('[Init] Failed to init API Tool:', err);
    }
});