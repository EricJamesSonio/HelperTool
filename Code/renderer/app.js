/**
 * app.js
 * Core app logic: repo selection, tree display, mode switching, generate.
 * Filter logic → filterManager.js
 * Search logic → searchManager.js
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
import { setupSearch } from './searchManager.js';
import { initSecretHolder, openSecretHolder, closeSecretHolder, isSecretHolderOpen } from './secretHolder.js';


/* ----------------------------------------
 * DOM refs
 * -------------------------------------- */
const selectRepoBtn = document.getElementById('selectRepoBtn');
const activeRepoName = document.getElementById('activeRepoName');
const treeContainer = document.getElementById('treeContainer');
const structureBtn = document.getElementById('structureBtn');
const codeBtn = document.getElementById('codeBtn');
const generateBtn = document.getElementById('generateBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const editDocignoreBtn = document.getElementById('editDocignoreBtn');
const selectionCount = document.getElementById('selectionCount');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const refreshBtn = document.getElementById('refreshBtn');
const secretHolderBtn = document.getElementById('secretHolderBtn');

/* ----------------------------------------
 * State
 * -------------------------------------- */
let selectedRepoPath = null;
let selectedItems = [];
let actionType = 'code';
let cachedTree = null;

/* ----------------------------------------
 * UI setup
 * -------------------------------------- */
console.log('[Init] Setting up UI...');
treeContainer.style.overflowY = 'auto';
treeContainer.style.maxHeight = '80vh';
generateBtn.disabled = true;

/* ----------------------------------------
 * Progress listener
 * -------------------------------------- */
window.electronAPI.onProgressUpdate(percent => {
    console.log(`[Progress] ${percent}%`);
    progressBar.value = percent;
    progressText.textContent = `${percent}%`;
});

/* ----------------------------------------
 * Helpers
 * -------------------------------------- */
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
    window.electronAPI.setLastSelected([]);
    updateGenerateState();
}

/* ----------------------------------------
 * Tree display
 * -------------------------------------- */
function displayTree() {
    if (!cachedTree) {
        treeContainer.textContent = 'No data available';
        return;
    }
    const visibleTree = filterTree(cachedTree);
    renderTree(visibleTree, treeContainer, selectedItems, actionType, onTreeSelectionChange);
}

function onTreeSelectionChange() {
    updateGenerateState();
    window.electronAPI.setLastSelected(selectedItems);
}

/* ----------------------------------------
 * Repo loading
 * -------------------------------------- */
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

    if (cachedTree) {
        renderIgnorePanel(cachedTree);
        renderFolderPanel(cachedTree);
    }

    displayTree();
    updateGenerateState();
}

async function loadLastActiveRepo() {
    console.log('[Init] Loading last active repo...');
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

/* ----------------------------------------
 * Button events
 * -------------------------------------- */
selectRepoBtn.addEventListener('click', async () => {
    try {
        const repoPath = await window.electronAPI.selectRepo();
        if (repoPath) await loadRepo(repoPath);
    } catch (err) {
        console.error('[UI] Repo selection failed:', err);
    }
});

refreshBtn.addEventListener('click', async () => {
    if (!selectedRepoPath) return;
    refreshBtn.classList.add('spinning');
    refreshBtn.disabled = true;
    try {
        cachedTree = await window.electronAPI.getFolderTree(selectedRepoPath);
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
    if (isSecretHolderOpen()) {
        closeSecretHolder();
    } else {
        await openSecretHolder();
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
        if (!selectedRepoPath || !selectedItems.length) {
            return alert('Select repo and items first!');
        }
        const { filePath } = await window.electronAPI.saveFileDialog(actionType);
        if (!filePath) return;

        progressBar.value = 0;
        progressText.textContent = '0%';

        const success = await window.electronAPI.generate(
            actionType, selectedRepoPath, selectedItems, filePath
        );
        if (!success) alert('Generation failed.');
        resetSelection();
        displayTree();
    } catch (err) {
        console.error('[Generate] Failed:', err);
        alert('Generation failed.');
    }
});

/* ----------------------------------------
 * Init managers
 * -------------------------------------- */
setupFilterInput(() => cachedTree, displayTree);
setupSearch(() => cachedTree, () => filterTree(cachedTree), treeContainer);

console.log('[Init] DOM content loaded, initializing...');
window.addEventListener('DOMContentLoaded', async () => {
    await loadIgnoredExtensions();
    await loadFolderFilters();
    loadLastActiveRepo();
    initSecretHolder();
});

/* ----------------------------------------
 * THEME TOGGLE
 * Add this block to app.js after the DOM refs section.
 * -------------------------------------- */

const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon      = document.getElementById('themeIcon');
const themeLabel     = document.getElementById('themeLabel');

// Load saved theme preference (persists across sessions)
const savedTheme = localStorage.getItem('helpertool-theme') || 'dark';
applyTheme(savedTheme);

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