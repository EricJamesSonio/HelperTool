/**
 * treeView.js
 * Dual-mode tree renderer.
 *
 * "List Mode"  (a.k.a. roof mode)  — VS-Code-style flat indented list.
 * "Tree Mode"  (a.k.a. tree mode)  — horizontal graph / data-structure spread.
 *
 * Public API:
 *   renderTree(treeData, container, selectedItems, actionType, onToggle, viewMode)
 *     viewMode: 'list' | 'tree'   (defaults to 'list')
 */

/* ============================================================
   SHARED HELPERS
   ============================================================ */

const getAllFiles = (node) => {
    if (node.type === 'file') return [node];
    if (!node.children) return [];
    return node.children.flatMap(getAllFiles);
};

const countFiles = (node) => {
    if (node.type === 'file') return 1;
    if (!node.children) return 0;
    return node.children.reduce((sum, c) => sum + countFiles(c), 0);
};

/* ============================================================
   PUBLIC ENTRY POINT
   ============================================================ */

export function renderTree(treeData, container, selectedItems, actionType, onToggle, viewMode = 'list') {
    container.innerHTML = '';

    // Swap CSS mode class so layout-tree.css scoping kicks in
    container.classList.remove('mode-list', 'mode-tree');
    container.classList.add(viewMode === 'tree' ? 'mode-tree' : 'mode-list');

    if (viewMode === 'tree') {
        _renderTreeMode(treeData, container, selectedItems, actionType, onToggle);
    } else {
        _renderListMode(treeData, container, selectedItems, actionType, onToggle);
    }

    _updateGenerateState(selectedItems);
}

/* ============================================================
   LIST MODE  ("roof mode") — VS-Code-style indented list
   ============================================================ */

function _renderListMode(treeData, container, selectedItems, actionType, onToggle) {
    if (!window._expandedFolders) window._expandedFolders = new Map();
    const expandedFolders = window._expandedFolders;

    const isSelected = (path) => selectedItems.includes(path);

    function applySelectionClass(el, node) {
        el.classList.remove('selected', 'folder-selected', 'file-selected');
        if (!isSelected(node.path)) return;
        if (node.type === 'folder') {
            el.classList.add(actionType === 'code' ? 'folder-selected' : 'selected');
        } else {
            el.classList.add('file-selected');
        }
    }

    function updateAllHighlights() {
        container.querySelectorAll('.tree-node').forEach(el => {
            const wrapper = el.parentElement;
            if (!wrapper?.dataset.nodePath) return;
            applySelectionClass(el, {
                path: wrapper.dataset.nodePath,
                type: el.classList.contains('folder') ? 'folder' : 'file',
            });
        });
        _updateGenerateState(selectedItems);
    }

    function createNode(node, depth = 0) {
        if (actionType === 'structure' && node.type === 'file') return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'node-wrapper';
        wrapper.style.setProperty('--depth', depth);
        wrapper.dataset.nodePath = node.path;

        const el = document.createElement('div');
        el.classList.add('tree-node', node.type);

        // Always expanded
        expandedFolders.set(node.path, true);
        if (node.type === 'folder' && node.children?.length) {
            el.classList.add('expandable', 'folder-open');
        }

        // Label
        let label = node.name;
        if (node.type === 'folder' && node.children?.length && actionType !== 'structure') {
            const count = countFiles(node);
            if (count > 0) label += ` (${count})`;
        }
        if (node.type === 'folder' && actionType === 'code' && isSelected(node.path)) {
            label += ' [ALL]';
        }
        el.textContent = label;
        applySelectionClass(el, node);
        wrapper.appendChild(el);

        // Children (always visible)
        if (node.type === 'folder' && node.children?.length) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children';
            childrenContainer.style.display = 'flex';
            node.children.forEach(child => {
                const childEl = createNode(child, depth + 1);
                if (childEl) childrenContainer.appendChild(childEl);
            });
            wrapper.appendChild(childrenContainer);
        }

        // Click
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (node.type === 'file') {
                _togglePath(selectedItems, node.path);
            } else if (actionType === 'code') {
                const files = getAllFiles(node);
                const allSel = files.every(f => isSelected(f.path));
                files.forEach(f => allSel ? _removePath(selectedItems, f.path) : _addPath(selectedItems, f.path));
            } else {
                _togglePath(selectedItems, node.path);
            }
            updateAllHighlights();
            onToggle?.(node);
        });

        return wrapper;
    }

    const root = document.createElement('div');
    root.className = 'tree-root';
    let rootColorIdx = 0;
    treeData.forEach(node => {
        const el = createNode(node, 0);
        if (el) {
            // Only folders at root depth get a color index; root files stay default
            if (node.type === 'folder') {
                el.dataset.rootColor = rootColorIdx % 12;
                rootColorIdx++;
            }
            root.appendChild(el);
        }
    });
    container.appendChild(root);
}

/* ============================================================
   TREE MODE  ("tree mode") — horizontal graph / data-structure
   ============================================================ */

function _renderTreeMode(treeData, container, selectedItems, actionType, onToggle) {
    const isSelected = (path) => selectedItems.includes(path);

    function applySelectionClass(el, node) {
        el.classList.remove('selected', 'folder-selected', 'file-selected');
        if (!isSelected(node.path)) return;
        if (node.type === 'folder') {
            el.classList.add(actionType === 'code' ? 'folder-selected' : 'selected');
        } else {
            el.classList.add('file-selected');
        }
    }

    function updateAllHighlights() {
        container.querySelectorAll('.tree-node').forEach(el => {
            const wrapper = el.closest('.node-wrapper');
            if (!wrapper?.dataset.nodePath) return;
            applySelectionClass(el, {
                path: wrapper.dataset.nodePath,
                type: el.classList.contains('folder') ? 'folder' : 'file',
            });
        });
        _updateGenerateState(selectedItems);
    }

    function createNode(node) {
        if (actionType === 'structure' && node.type === 'file') return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'node-wrapper';
        wrapper.dataset.nodePath = node.path;

        const el = document.createElement('div');
        el.classList.add('tree-node', node.type);

        // Folder open state
        if (node.type === 'folder' && node.children?.length) {
            el.classList.add('folder-open');
        }

        // Label
        let label = node.name;
        if (node.type === 'folder' && node.children?.length && actionType !== 'structure') {
            const count = countFiles(node);
            if (count > 0) label += ` (${count})`;
        }
        if (node.type === 'folder' && actionType === 'code' && isSelected(node.path)) {
            label += ' [ALL]';
        }
        el.textContent = label;
        applySelectionClass(el, node);
        wrapper.appendChild(el);

        // Children
        if (node.type === 'folder' && node.children?.length) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children';

            node.children.forEach(child => {
                const childEl = createNode(child);
                if (childEl) childrenContainer.appendChild(childEl);
            });

            wrapper.appendChild(childrenContainer);
        }

        // Click
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (node.type === 'file') {
                _togglePath(selectedItems, node.path);
            } else if (actionType === 'code') {
                const files = getAllFiles(node);
                const allSel = files.every(f => isSelected(f.path));
                files.forEach(f => allSel ? _removePath(selectedItems, f.path) : _addPath(selectedItems, f.path));
            } else {
                _togglePath(selectedItems, node.path);
            }
            updateAllHighlights();
            onToggle?.(node);
        });

        return wrapper;
    }

    const root = document.createElement('div');
    root.className = 'tree-root';
    let rootColorIdx = 0;
    treeData.forEach(node => {
        const el = createNode(node);
        if (el) {
            if (node.type === 'folder') {
                el.dataset.rootColor = rootColorIdx % 12;
                rootColorIdx++;
            }
            root.appendChild(el);
        }
    });
    container.appendChild(root);
}

/* ============================================================
   SELECTION MUTATIONS
   ============================================================ */

function _addPath(arr, path)    { if (!arr.includes(path)) arr.push(path); }
function _removePath(arr, path) { const i = arr.indexOf(path); if (i !== -1) arr.splice(i, 1); }
function _togglePath(arr, path) { arr.includes(path) ? _removePath(arr, path) : _addPath(arr, path); }

function _updateGenerateState(selectedItems) {
    const btn = document.getElementById('generateBtn');
    if (btn) btn.disabled = selectedItems.length === 0;
}