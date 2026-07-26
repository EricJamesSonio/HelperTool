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

function showRepoLoading(repoPath) {
    const existing = document.getElementById('repoLoadingOverlay');
    if (existing) existing.remove();

    const name = repoPath.split(/[/\\]/).pop() || 'Repository';
    const el = document.createElement('div');
    el.className = 'app-loading-overlay';
    el.id = 'repoLoadingOverlay';
    el.innerHTML = `
        <div class="app-loading-inner">
            <div class="app-loading-orb">
                <div class="app-loading-ring"></div>
                <div class="app-loading-icon">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
                        <path d="M2 7v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9L7 4H4a2 2 0 0 0-2 2v1z"/>
                    </svg>
                </div>
            </div>
            <div class="app-loading-text">${name}</div>
            <div class="app-loading-sub">Loading repository...</div>
            <div class="app-loading-dots"><span></span><span></span><span></span></div>
        </div>
    `;
    document.body.appendChild(el);
}

function hideRepoLoading() {
    const el = document.getElementById('repoLoadingOverlay');
    if (!el) return;
    el.classList.add('app-loading-hidden');
    setTimeout(() => el.remove(), 400);
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
    const [gStatus, csStatus, termStatus, ecStatus, ecosStatus] = await Promise.all([
        window.electronAPI.graphifyIsRunning?.() || { running: false },
        window.electronAPI.opencode?.isRunning?.() || { running: false },
        window.electronAPI.terminalHasRunningInRepo?.(repoPath) || { running: false, count: 0 },
        window.electronAPI.getServerStatus?.() || { running: false },
        window.electronAPI.eco?.status() || { running: false },
    ]);
    const items = [];
    if (gStatus.running) items.push({ name: 'Graphify', stop: () => window.electronAPI.graphifyStop?.() });
    if (csStatus.running) items.push({ name: 'CodeSwamp', stop: () => window.electronAPI.opencode?.stop?.() });
    if (termStatus.running) items.push({ name: 'Terminal', count: termStatus.count, stop: null });
    if (ecStatus.running) items.push({ name: 'Error Cop', stop: () => window.electronAPI.stopServer?.() });
    if (ecosStatus.running) items.push({ name: 'Ecosystem Tool', stop: () => window.electronAPI.eco?.stop() });
    if (items.length === 0) return true;

    const listHtml = items.map((s) => {
        const suffix = s.count ? ` (${s.count} session${s.count > 1 ? 's' : ''})` : '';
        return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;">
            <span style="width:6px;height:6px;border-radius:50%;background:#22d3ee;flex-shrink:0;"></span>
            <span style="font-size:13px;color:#eef2ff;">
                <span style="font-weight:600;">${s.name}</span>
                <span style="color:#94a3c4;"> is running${suffix} ...</span>
            </span>
        </div>`;
    }).join('');

    const ok = await confirmDialog(`
        <div style="margin-bottom:12px;font-size:13px;color:#94a3c4;">The following services are active in the current repository:</div>
        ${listHtml}
        <div style="margin-top:14px;font-size:13px;color:#eef2ff;">Switching repositories will stop them. Continue?</div>
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
    await _onRepoChange?.(repoPath);
    // Fire-and-forget — config writes that don't affect visible UI
    window.electronAPI.setActiveProject(repoPath);

    if (resetSel) {
        state.selectedItems.length = 0;
        window.electronAPI.setLastSelected([]);
    }

    updateActiveRepo(repoPath.split(/[/\\]/).pop());

    if (!skipGuard) showRepoLoading(repoPath);
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

    hideRepoLoading();
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