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

const REVALIDATE_GAP_MS = 20000;
const repoCache = new Map();

function keyOf(p) {
    return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function treeSig(tree) {
    let h = 5381;
    let n = 0;
    const stack = Array.isArray(tree) ? tree.slice() : [];
    while (stack.length) {
        const node = stack.pop();
        if (!node) continue;
        n++;
        const s = node.path || node.name || '';
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        if (Array.isArray(node.children)) {
            for (const c of node.children) stack.push(c);
        }
    }
    return n + ':' + h;
}

function snapshotCurrent() {
    if (!state.selectedRepoPath || !state.cachedTree) return;
    const key = keyOf(state.selectedRepoPath);
    const prev = repoCache.get(key);
    repoCache.set(key, {
        tree: state.cachedTree,
        selected: state.selectedItems.slice(),
        checkedAt: prev ? prev.checkedAt : Date.now(),
    });
}

export function isRepoCached(repoPath) {
    const hit = repoCache.get(keyOf(repoPath));
    return !!(hit && hit.tree);
}

export async function preloadRepo(repoPath) {
    const key = keyOf(repoPath);
    if (!repoPath || repoCache.has(key) || key === keyOf(state.selectedRepoPath)) return false;
    let tree = null;
    try {
        tree = await window.electronAPI.getFolderTree(repoPath);
    } catch (_) {
        tree = null;
    }
    if (!tree || repoCache.has(key)) return false;
    repoCache.set(key, { tree, selected: [], checkedAt: Date.now() });
    return true;
}

document.addEventListener('repo:closed', (e) => {
    const p = e && e.detail && e.detail.repoPath;
    if (p) repoCache.delete(keyOf(p));
});

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

// Injected by app.js - called after every repo load so toolsManager
// can reinitialise the git tool without a circular import.
let _onRepoChange = null;
export function setRepoChangeHandler(fn) { _onRepoChange = fn; }

export function updateActiveRepo(name) {
    activeRepoName.textContent = name || 'No repo selected';
}

async function _guardActiveServices() {
    const feats = getFeatures();
    const api = window.electronAPI;
    const idle = { running: false };

    const safeCall = async (fn, fallback) => {
        try {
            const result = await fn();
            return result || fallback;
        } catch (_) {
            return fallback;
        }
    };

    const safeStop = async (fn) => {
        try {
            await fn?.();
        } catch (_) {}
    };

    // CodeSwamp chats and terminals are intentionally not guarded here:
    // they keep running across repo switches.
    const [gStatus, ecStatus, ecosStatus] = await Promise.all([
        feats.graphify !== false
            ? safeCall(() => api.graphifyIsRunning?.(), idle)
            : idle,
        safeCall(() => api.getServerStatus?.(), idle),
        feats.ecosystemWatcher !== false
            ? safeCall(() => api.eco?.status(), idle)
            : idle,
    ]);

    const items = [];
    if (gStatus.running) items.push({ name: 'Graphify', stop: () => safeStop(() => api.graphifyStop?.()) });
    if (ecStatus.running) items.push({ name: 'Error Cop', stop: () => safeStop(() => api.stopServer?.()) });
    if (ecosStatus.running) items.push({ name: 'Ecosystem Tool', stop: () => safeStop(() => api.eco?.stop()) });

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
    for (const s of items) {
        if (s.stop) await s.stop();
    }
    return true;
}

function repaintTree() {
    const feats = getFeatures();
    if (state.cachedTree) {
        renderIgnorePanel(state.cachedTree);
        if (feats.folderFilters) renderFolderPanel(state.cachedTree);
    }
    renderRootJumper(state.cachedTree);
    displayTree(false);
}

function revalidate(repoPath) {
    const key = keyOf(repoPath);
    setTimeout(async () => {
        let fresh = null;
        try {
            await window.electronAPI.clearFolderTreeCache(repoPath);
            fresh = await window.electronAPI.getFolderTree(repoPath);
        } catch (_) {
            fresh = null;
        }
        if (!fresh) return;
        if (keyOf(state.selectedRepoPath) !== key) {
            const e = repoCache.get(key);
            if (e) {
                e.tree = fresh;
                e.checkedAt = Date.now();
            }
            return;
        }
        const e = repoCache.get(key);
        if (e) e.checkedAt = Date.now();
        if (treeSig(fresh) === treeSig(state.cachedTree)) return;
        state.cachedTree = fresh;
        if (e) e.tree = fresh;
        invalidateFilterCache();
        repaintTree();
    }, 250);
}

export async function loadRepo(repoPath, resetSel = true, skipGuard = false) {
    if (!skipGuard) {
        const ok = await _guardActiveServices();
        if (!ok) return;
    }

    snapshotCurrent();
    const hit = repoCache.get(keyOf(repoPath));
    const fast = !!(hit && hit.tree);

    state.selectedRepoPath = repoPath;
    window.__activeRepoPath = repoPath;
    // Notify tools BEFORE updating activeProject so they save to the old repo
    await _onRepoChange?.(repoPath);
    // Fire-and-forget - config writes that don't affect visible UI
    window.electronAPI.setActiveProject(repoPath);

    if (fast) {
        state.selectedItems.length = 0;
        for (const p of hit.selected || []) state.selectedItems.push(p);
        window.electronAPI.setLastSelected(state.selectedItems.slice());
    } else if (resetSel) {
        state.selectedItems.length = 0;
        window.electronAPI.setLastSelected([]);
    }

    updateActiveRepo(repoPath.split(/[/\\]/).pop());

    if (fast) {
        state.cachedTree = hit.tree;
    } else {
        if (!skipGuard) showRepoLoading(repoPath);
        showTreeSkeleton();
        state.cachedTree = await window.electronAPI.getFolderTree(repoPath);
        hideTreeSkeleton();
    }
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

    if (!fast && state.cachedTree) {
        repoCache.set(keyOf(repoPath), {
            tree: state.cachedTree,
            selected: state.selectedItems.slice(),
            checkedAt: Date.now(),
        });
    }

    document.dispatchEvent(new CustomEvent('repo:switched', { detail: { repoPath } }));

    if (fast && Date.now() - (hit.checkedAt || 0) > REVALIDATE_GAP_MS) revalidate(repoPath);
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