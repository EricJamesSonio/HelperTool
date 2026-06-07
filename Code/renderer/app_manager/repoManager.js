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
} from '../filterManager.js';
import { getFeatures } from '../featureManager.js';
import { state }               from './appState.js';
import { renderRootJumper, displayTree } from './viewManager.js';

const activeRepoName = document.getElementById('activeRepoName');

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
    await window.electronAPI.setActiveProject(repoPath);

    if (resetSel) {
        state.selectedItems.length = 0;
        await window.electronAPI.setLastSelected([]);
    }

    updateActiveRepo(repoPath.split(/[/\\]/).pop());

    state.cachedTree = await window.electronAPI.getFolderTree(repoPath);

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