/**
 * repoManager.js
 * Owns: repo loading, active repo display, last-active restore.
 * Notifies toolsManager of repo changes via an injected callback
 * to avoid circular imports.
 */

import {
    activeExtensions,
    renderFilterChips,
    renderIgnorePanel,
    renderFolderPanel,
    loadIgnoredExtensions,
    loadFolderFilters,
    invalidateFilterCache,
} from '../filterManager.js';
import { getFeatures } from '../featureManager.js';
import { state }               from './appState.js';
import { renderRootJumper, displayTree } from './viewManager.js';

const activeRepoName = document.getElementById('activeRepoName');
const treeContainer = document.getElementById('treeContainer');

function showTreeSkeleton() {
    if (!treeContainer) return;
    const div = document.createElement('div');
    div.className = 'tree-skeleton';
    div.innerHTML = Array.from({ length: 8 }, (_, i) =>
        `<div class="tree-skeleton-row" style="--sk-w: ${45 + Math.random() * 35}%"></div>`
    ).join('');
    treeContainer.innerHTML = '';
    treeContainer.appendChild(div);
}

function hideTreeSkeleton() {
    const sk = treeContainer?.querySelector('.tree-skeleton');
    if (sk) sk.remove();
}

// Injected by app.js — called after every repo load so toolsManager
// can reinitialise the git tool without a circular import.
let _onRepoChange = null;
export function setRepoChangeHandler(fn) { _onRepoChange = fn; }

export function updateActiveRepo(name) {
    activeRepoName.textContent = name || 'No repo selected';
}

export async function loadRepo(repoPath, resetSel = true) {
    state.selectedRepoPath = repoPath;
    // Notify tools BEFORE updating activeProject so they save to the old repo
    _onRepoChange?.(repoPath);
    // Fire-and-forget — config writes that don't affect visible UI
    window.electronAPI.setActiveProject(repoPath);

    if (resetSel) {
        state.selectedItems.length = 0;
        window.electronAPI.setLastSelected([]);
    }

    updateActiveRepo(repoPath.split(/[/\\]/).pop());

    showTreeSkeleton();
    state.cachedTree = await window.electronAPI.getFolderTree(repoPath);
    hideTreeSkeleton();
    invalidateFilterCache();

    activeExtensions.clear();
    renderFilterChips();

    const feats = getFeatures();
    if (state.cachedTree) {
        renderIgnorePanel(state.cachedTree);
        if (feats.folderFilters) renderFolderPanel(state.cachedTree);
    }

    renderRootJumper(state.cachedTree);
    displayTree();
}

export async function loadLastActiveRepo() {
    try {
        const project = await window.electronAPI.getActiveProject();
        if (project?.repoPath) {
            state.selectedItems.length = 0;
            project.lastSelectedItems?.forEach(p => state.selectedItems.push(p));
            await loadRepo(project.repoPath, false);
        }
    } catch (err) {
        console.error('[Init] Failed to load last project:', err);
    }
}