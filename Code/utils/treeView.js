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

const normPath = (p) => p.replace(/\\/g, '/');

export function renderTree(treeData, container, selectedItems, actionType, onToggle, viewMode = 'list', onDoubleClick, onMoveRequest) {
    container.innerHTML = '';
    container.classList.remove('mode-list', 'mode-tree');
    container.classList.add(viewMode === 'tree' ? 'mode-tree' : 'mode-list');

    if (container._treeClickHandler) {
        container.removeEventListener('click', container._treeClickHandler);
    }

    if (viewMode === 'tree') {
        _renderTreeMode(treeData, container, selectedItems, actionType, onToggle, onMoveRequest);
    } else {
        _renderListMode(treeData, container, selectedItems, actionType, onToggle, onMoveRequest);
    }

    container._treeClickHandler = (e) => {
        const el = e.target.closest('.tree-node');
        if (!el) return;
        e.stopPropagation();
        const wrapper = el.closest('.node-wrapper');
        if (!wrapper) return;
        const nodePath = wrapper.dataset.nodePath;
        const nodeType = el.classList.contains('folder') ? 'folder' : 'file';
        const node = { path: nodePath, type: nodeType, name: wrapper.dataset.nodeName };

        if (nodeType === 'file') {
            const now = Date.now();
            const samePath = container._lastClickPath === nodePath;
            const fastClick = samePath && (now - (container._lastClickTime || 0)) < 2000;
            container._lastClickPath = nodePath;
            container._lastClickTime = now;
            if (fastClick) {
                e.preventDefault();
                onDoubleClick?.(nodePath, wrapper.dataset.nodeName);
                return;
            }
            _togglePath(selectedItems, nodePath);
        } else if (actionType === 'code') {
            const filePaths = [...wrapper.querySelectorAll('.tree-node.file')]
                .map(f => f.closest('.node-wrapper')?.dataset.nodePath)
                .filter(Boolean);
            const normSel = selectedItems.map(normPath);
            const allSel = filePaths.every(fp => normSel.includes(normPath(fp)));
            filePaths.forEach(fp => allSel ? _removePath(selectedItems, fp) : _addPath(selectedItems, fp));
        } else {
            _togglePath(selectedItems, nodePath);
        }

        _updateHighlightsForPaths(container, selectedItems, actionType);
        onToggle?.(node);
    };
    container.addEventListener('click', container._treeClickHandler);

    _updateHighlightsForPaths(container, selectedItems, actionType);
}

function _presortTree(nodes) {
    for (const node of nodes) {
        if (node.children?.length) {
            node.children.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            });
            _presortTree(node.children);
        }
    }
}

function _updateHighlightsForPaths(container, selectedItems, actionType) {
    const normSel = new Set(selectedItems.map(normPath));
    container.querySelectorAll('.tree-node').forEach(el => {
        const wrapper = el.closest('.node-wrapper');
        if (!wrapper) return;
        const p = normPath(wrapper.dataset.nodePath || '');
        const isFolder = el.classList.contains('folder');
        el.classList.remove('selected', 'folder-selected', 'file-selected');
        if (!normSel.has(p)) return;
        if (isFolder) {
            el.classList.add(actionType === 'code' ? 'folder-selected' : 'selected');
        } else {
            el.classList.add('file-selected');
        }
    });
    _updateGenerateState(selectedItems);
}

/* ============================================================
   LIST MODE
   ============================================================ */

function _renderListMode(treeData, container, selectedItems, actionType, onToggle, onMoveRequest) {
    _presortTree(treeData);

    if (!window._expandedFolders) window._expandedFolders = new Map();
    const expandedFolders = window._expandedFolders;

    function createNode(node, depth = 0) {
        if (actionType === 'structure' && node.type === 'file') return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'node-wrapper';
        wrapper.style.setProperty('--depth', depth);
        wrapper.dataset.nodePath = normPath(node.path);
        wrapper.dataset.nodeName = node.name;
        wrapper.dataset.depthLevel = depth % 5;
        if (node.type === 'file' && depth > 0) {
            wrapper.dataset.parentDepth = (depth - 1) % 5;
        }

        const el = document.createElement('div');
        el.classList.add('tree-node', node.type);

        expandedFolders.set(normPath(node.path), true);
        if (node.type === 'folder' && node.children?.length) {
            el.classList.add('expandable', 'folder-open');
        }

        let label = node.name;
        if (node.type === 'folder' && node.children?.length && actionType !== 'structure') {
            if (!node._fileCount) node._fileCount = countFiles(node);
            if (node._fileCount > 0) label += ` (${node._fileCount})`;
        }
        if (node.type === 'folder' && actionType === 'code' && selectedItems.map(normPath).includes(normPath(node.path))) {
            label += ' [ALL]';
        }
        el.textContent = label;
        if (node.type === 'file') {
            const moveBtn = document.createElement('button');
            moveBtn.className = 'cm-move-btn';
            moveBtn.title = 'Move file';
            moveBtn.textContent = '↗';
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                onMoveRequest?.(normPath(node.path), wrapper);
            });
            el.appendChild(moveBtn);
        }
        wrapper.appendChild(el);

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

        return wrapper;
    }

    const root = document.createElement('div');
    root.className = 'tree-root';
    treeData.forEach(node => {
        const el = createNode(node, 0);
        if (el) root.appendChild(el);
    });
    container.appendChild(root);
}

/* ============================================================
   TREE MODE
   ============================================================ */

function _renderTreeMode(treeData, container, selectedItems, actionType, onToggle, onMoveRequest) {
    _presortTree(treeData);

    function createNode(node, depth = 0) {
        if (actionType === 'structure' && node.type === 'file') return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'node-wrapper';
        wrapper.dataset.nodePath = normPath(node.path);
        wrapper.dataset.nodeName = node.name;
        wrapper.dataset.depthLevel = depth % 5;
        if (node.type === 'file' && depth > 0) {
            wrapper.dataset.parentDepth = (depth - 1) % 5;
        }

        const el = document.createElement('div');
        el.classList.add('tree-node', node.type);

        if (node.type === 'folder' && node.children?.length) {
            el.classList.add('folder-open');
        }

        let label = node.name;
        if (node.type === 'folder' && node.children?.length && actionType !== 'structure') {
            if (!node._fileCount) node._fileCount = countFiles(node);
            if (node._fileCount > 0) label += ` (${node._fileCount})`;
        }
        if (node.type === 'folder' && actionType === 'code' && selectedItems.map(normPath).includes(normPath(node.path))) {
            label += ' [ALL]';
        }
        el.textContent = label;
        if (node.type === 'file') {
            const moveBtn = document.createElement('button');
            moveBtn.className = 'cm-move-btn';
            moveBtn.title = 'Move file';
            moveBtn.textContent = '↗';
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                onMoveRequest?.(normPath(node.path), wrapper);
            });
            el.appendChild(moveBtn);
        }
        wrapper.appendChild(el);

        if (node.type === 'folder' && node.children?.length) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children';
            node.children.forEach(child => {
                const childEl = createNode(child, depth + 1);
                if (childEl) childrenContainer.appendChild(childEl);
            });
            wrapper.appendChild(childrenContainer);
        }

        return wrapper;
    }

    const root = document.createElement('div');
    root.className = 'tree-root';
    treeData.forEach(node => {
        const el = createNode(node, 0);
        if (el) root.appendChild(el);
    });
    container.appendChild(root);
}

/* ============================================================
   SELECTION MUTATIONS
   ============================================================ */

function _addPath(arr, path) {
    if (!arr.map(normPath).includes(normPath(path))) arr.push(path);
}
function _removePath(arr, path) {
    const i = arr.findIndex(p => normPath(p) === normPath(path));
    if (i !== -1) arr.splice(i, 1);
}
function _togglePath(arr, path) {
    arr.map(normPath).includes(normPath(path))
        ? _removePath(arr, path)
        : _addPath(arr, path);
}

function _updateGenerateState(selectedItems) {
    const btn = document.getElementById('generateBtn');
    if (btn) btn.disabled = selectedItems.length === 0;
}
