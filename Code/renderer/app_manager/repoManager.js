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
    const repoPath = state.selectedRepoPath;
    const [gStatus, csStatus, termStatus] = await Promise.all([
        window.electronAPI.graphifyIsRunning?.() || { running: false },
        window.electronAPI.opencode?.isRunning?.() || { running: false },
        window.electronAPI.terminalHasRunningInRepo?.(repoPath) || { running: false, count: 0 },
    ]);
    const items = [];
    if (gStatus.running) items.push({ name: 'Graphify', stop: () => window.electronAPI.graphifyStop?.() });
    if (csStatus.running) items.push({ name: 'CodeSwamp', stop: () => window.electronAPI.opencode?.stop?.() });
    if (termStatus.running) items.push({ name: 'Terminal', count: termStatus.count, stop: null });
    if (items.length === 0) return true;

    const listHtml = items.map((s, i) => {
        const suffix = s.count ? ` (${s.count} session${s.count > 1 ? 's' : ''})` : '';
        const bg = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:${bg};border-radius:6px;font-size:13px;color:var(--text-primary,#eef2ff);">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--accent,#22d3ee);flex-shrink:0;"></span>
            <span style="font-weight:600;min-width:80px;">${s.name}</span>
            <span style="color:var(--text-secondary,#94a3c4);">is running${suffix}</span>
        </div>`;
    }).join('');

    const ok = await confirmDialog(`
        <div style="margin-bottom:14px;font-size:13px;color:var(--text-secondary,#94a3c4);">The following services are active in the current repository:</div>
        ${listHtml}
        <div style="margin-top:14px;font-size:13px;font-weight:600;color:var(--text-primary,#eef2ff);">Switching repositories will stop them. Continue?</div>
    `);
    if (!ok) return false;
    for (const s of items) { if (s.stop) await s.stop(); }
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