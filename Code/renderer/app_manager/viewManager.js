/**
 * viewManager.js
 * Owns: view mode (list/tree), root jumper rendering, displayTree.
 */

import { renderTree }  from '../../utils/treeView.js';
import { filterTree }  from '../filterManager.js';
import { selectSearchItem } from '../searchManager.js';
import { state }       from './appState.js';

const viewModeBtn = document.getElementById('viewModeBtn');
const rootJumper  = document.getElementById('rootJumper');
const treeContainer = document.getElementById('treeContainer');

export function displayTree() {
    if (!state.cachedTree) {
        treeContainer.textContent = 'No data available';
        return;
    }
    const visibleTree = filterTree(state.cachedTree);
    renderTree(
        visibleTree,
        treeContainer,
        state.selectedItems,
        state.actionType,
        onTreeSelectionChange,
        state.viewMode
    );
    treeContainer.scrollTo(0, 0);
}

// Callback wired by app.js after generateManager is ready
let _onSelectionChange = null;
export function setSelectionChangeHandler(fn) { _onSelectionChange = fn; }

function onTreeSelectionChange() {
    _onSelectionChange?.();
}

export function renderRootJumper(tree) {
    if (!rootJumper) return;
    rootJumper.innerHTML = '';

    if (!tree?.length) {
        rootJumper.style.display = 'none';
        return;
    }

    const roots = tree.filter(n => n.type === 'folder' || n.children);
    if (!roots.length) {
        rootJumper.style.display = 'none';
        return;
    }

    rootJumper.style.display = 'flex';

    const label = document.createElement('span');
    label.className   = 'root-jumper-label';
    label.textContent = 'Jump to:';
    rootJumper.appendChild(label);

    roots.forEach(node => {
        const btn = document.createElement('button');
        btn.className   = 'root-jumper-pill';
        btn.textContent = `📁 ${node.name}`;
        btn.title       = `Jump to ${node.name}`;
        btn.addEventListener('click', () => selectSearchItem(node.path));
        rootJumper.appendChild(btn);
    });
}

export function applyViewMode(mode) {
    state.viewMode = mode;
    localStorage.setItem('helpertool-viewmode', mode);
    if (mode === 'tree') {
        viewModeBtn.textContent = '🌳 Tree Mode';
        viewModeBtn.className   = 'view-mode-btn active-tree';
        viewModeBtn.title       = 'Switch to List mode';
    } else {
        viewModeBtn.textContent = '☰ Roof Mode';
        viewModeBtn.className   = 'view-mode-btn active-list';
        viewModeBtn.title       = 'Switch to Tree mode';
    }
    if (state.cachedTree) displayTree();
}

export function initViewMode() {
    viewModeBtn.addEventListener('click', () =>
        applyViewMode(state.viewMode === 'list' ? 'tree' : 'list')
    );
}