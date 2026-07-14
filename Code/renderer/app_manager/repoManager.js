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
import { confirmDialog } from '../utils/confirmDialog.js';

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

async function _guardActiveServices() {
    const gStatus = await window.electronAPI.graphifyIsRunning?.() || { running: false };
    const csStatus = await window.electronAPI.opencode?.isRunning?.() || { running: false };
    const services = [];
    if (gStatus.running) services.push('Graphify');
    if (csStatus.running) services.push('CodeSwamp');
    if (services.length === 0) return true;
    const label = services.join(' and ');
    const verb = services.length > 1 ? 'are' : 'is';
    const them = services.length > 1 ? 'them' : 'it';
    const ok = await confirmDialog(
        `${label} ${verb} currently running. Switching repositories will stop ${them}. Continue?`
    );
    if (!ok) return false;
    if (gStatus.running) await window.electronAPI.graphifyStop?.();
    if (csStatus.running) await window.electronAPI.opencode?.stop?.();
    return true;
}

export async function loadRepo(repoPath, resetSel = true, skipGuard = false) {
    if (!skipGuard) {
        const ok = await _guardActiveServices();
        if (!ok) return;
    }
    state.selectedRepoPath = repoPath;
    window.__activeRepoPath = repoPath;
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

    document.dispatchEvent(new CustomEvent('repo:switched', { detail: { repoPath } }));
}

export async function loadLastActiveRepo() {
    try {
        const project = await window.electronAPI.getActiveProject();
        if (project?.repoPath) {
            state.selectedItems.length = 0;
            project.lastSelectedItems?.forEach(p => state.selectedItems.push(p));
            await loadRepo(project.repoPath, false, true);
        }
    } catch (err) {
        console.error('[Init] Failed to load last project:', err);
    }
}