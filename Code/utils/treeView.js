const ITEM_HEIGHT = 28;
const OVERSCAN = 20;

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

export function renderTree(treeData, container, selectedItems, actionType, onToggle, viewMode = 'list', onDoubleClick, onMoveRequest, onAddFile) {
    container.innerHTML = '';
    container._treeNodeMap = null;
    container.classList.remove('mode-list', 'mode-tree', 'mode-virtual');

    if (container._treeClickHandler) {
        container.removeEventListener('click', container._treeClickHandler);
    }
    if (container._treeScrollHandler) {
        container.removeEventListener('scroll', container._treeScrollHandler);
    }

    if (viewMode === 'virtual') {
        container.classList.add('mode-virtual');
        _renderVirtualMode(treeData, container, selectedItems, actionType, onToggle, onDoubleClick, onMoveRequest, onAddFile);
        return;
    }

    container.classList.add(viewMode === 'tree' ? 'mode-tree' : 'mode-list');

    if (viewMode === 'tree') {
        _renderTreeMode(treeData, container, selectedItems, actionType, onToggle, onMoveRequest, onAddFile);
    } else {
        _renderListMode(treeData, container, selectedItems, actionType, onToggle, onMoveRequest, onAddFile);
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

        const now = Date.now();
        const samePath = container._lastClickPath === nodePath;
        const fastClick = samePath && (now - (container._lastClickTime || 0)) < 1000;
        container._lastClickPath = nodePath;
        container._lastClickTime = now;
        if (fastClick) {
            e.preventDefault();
            onDoubleClick?.(nodePath, wrapper.dataset.nodeName, nodeType === 'folder');
            return;
        }

        if (nodeType === 'file') {
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
    const nodeMap = container._treeNodeMap;
    if (nodeMap) {
        for (const [path, wrapper] of nodeMap) {
            const el = wrapper.querySelector('.tree-node');
            if (!el) continue;
            const isFolder = el.classList.contains('folder');
            el.classList.remove('selected', 'folder-selected', 'file-selected');
            if (normSel.has(path)) {
                if (isFolder) {
                    el.classList.add(actionType === 'code' ? 'folder-selected' : 'selected');
                } else {
                    el.classList.add('file-selected');
                }
            }
        }
    } else {
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
    }
    _updateGenerateState(selectedItems);
}

function _buildNodeMap(container, treeData) {
    const map = new Map();
    function walk(nodes) {
        for (const node of nodes) {
            const p = normPath(node.path);
            const wrapper = container.querySelector(`[data-node-path="${CSS.escape(p)}"]`);
            if (wrapper) map.set(p, wrapper);
            if (node.children) walk(node.children);
        }
    }
    walk(treeData);
    container._treeNodeMap = map;
}

/* ============================================================
   VIRTUAL MODE
   ============================================================ */

function _flattenTree(nodes, expandedFolders, depth, out) {
    const result = out || [];
    const currentDepth = depth || 0;
    for (const node of nodes) {
        const p = normPath(node.path);
        const expandable = node.type === 'folder' && node.children?.length > 0;
        const expanded = !expandable || expandedFolders.has(p);
        const fc = node.type === 'folder' && node.children?.length ? countFiles(node) : 0;
        result.push({ path: p, name: node.name, type: node.type, depth: currentDepth, expandable, expanded, fileCount: fc, children: node.children || [] });
        if (node.type === 'folder' && expanded && node.children) {
            _flattenTree(node.children, expandedFolders, currentDepth + 1, result);
        }
    }
    return result;
}

function _setVirtualExpanded(container, path, expanded) {
    if (!container._virtualExpanded) container._virtualExpanded = new Map();
    if (expanded) container._virtualExpanded.set(path, true);
    else container._virtualExpanded.delete(path);
}

function _renderVirtualMode(treeData, container, selectedItems, actionType, onToggle, onDoubleClick, onMoveRequest, onAddFile) {
    _presortTree(treeData);

    if (!container._virtualExpanded) container._virtualExpanded = new Map();
    const expandedFolders = container._virtualExpanded;

    const flatItems = _flattenTree(treeData, expandedFolders);
    const totalHeight = flatItems.length * ITEM_HEIGHT;

    const scrollEl = document.createElement('div');
    scrollEl.className = 'virtual-scroll-container';
    scrollEl.style.cssText = 'position:relative;overflow-y:auto;flex:1;height:100%;';

    const spacerEl = document.createElement('div');
    spacerEl.className = 'virtual-spacer';
    spacerEl.style.cssText = `height:${totalHeight}px;pointer-events:none;`;
    scrollEl.appendChild(spacerEl);

    const visibleEl = document.createElement('div');
    visibleEl.className = 'virtual-visible';
    visibleEl.style.cssText = 'position:absolute;top:0;left:0;right:0;pointer-events:none;';
    scrollEl.appendChild(visibleEl);

    container.appendChild(scrollEl);

    function renderVisible() {
        const scrollTop = scrollEl.scrollTop;
        const viewportHeight = scrollEl.clientHeight || 600;
        const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
        const endIdx = Math.min(flatItems.length, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN);

        const normSel = new Set(selectedItems.map(normPath));
        let html = '';
        for (let i = startIdx; i < endIdx; i++) {
            const item = flatItems[i];
            const isFolder = item.type === 'folder';
            const selClass = normSel.has(item.path)
                ? (isFolder ? (actionType === 'code' ? 'folder-selected' : 'selected') : 'file-selected')
                : '';
            const expandClass = item.expandable ? (item.expanded ? 'folder-open' : 'folder-closed') : '';
            const label = item.name + (isFolder && item.fileCount > 0 && actionType !== 'structure' ? ` (${item.fileCount})` : '')
                + (isFolder && actionType === 'code' && normSel.has(item.path) ? ' [ALL]' : '');
            const depthPadding = item.depth * 20;

            html += `<div class="node-wrapper" data-index="${i}" data-node-path="${item.path}" data-node-name="${item.name}" style="position:absolute;top:${i * ITEM_HEIGHT}px;left:0;right:0;height:${ITEM_HEIGHT}px;padding-left:${depthPadding}px;pointer-events:auto;display:flex;align-items:center;">
                <div class="tree-node ${item.type} ${selClass} ${expandClass}" data-index="${i}">${label}`;
            if (item.type === 'file' || item.type === 'folder') {
                html += `<button class="cm-move-btn" data-index="${i}" title="Move ${item.type}">↗</button>`;
            }
            if (item.type === 'folder') {
                html += `<button class="cm-add-file-btn" data-index="${i}" title="Create files">+</button>`;
            }
            html += `</div></div>`;
        }
        visibleEl.innerHTML = html;
        container._treeNodeMap = _buildVirtualMap(visibleEl, flatItems, startIdx, endIdx);
    }

    function _buildVirtualMap(parentEl, items, start, end) {
        const map = new Map();
        for (let i = start; i < end; i++) {
            const wrapper = parentEl.querySelector(`[data-index="${i}"]`);
            if (wrapper) map.set(items[i].path, wrapper);
        }
        return map;
    }

    renderVisible();

    container._treeScrollHandler = () => {
        renderVisible();
    };
    scrollEl.addEventListener('scroll', container._treeScrollHandler);

    scrollEl.addEventListener('click', (e) => {
        const el = e.target.closest('.tree-node');
        if (!el) return;
        const wrapper = el.closest('.node-wrapper');
        if (!wrapper) return;
        const idx = parseInt(wrapper.dataset.index, 10);
        const item = flatItems[idx];
        if (!item) return;

        const moveBtn = e.target.closest('.cm-move-btn');
        if (moveBtn) {
            e.stopPropagation();
            e.preventDefault();
            onMoveRequest?.(item.path, wrapper);
            return;
        }

        const addBtn = e.target.closest('.cm-add-file-btn');
        if (addBtn) {
            e.stopPropagation();
            e.preventDefault();
            onAddFile?.(item.path);
            return;
        }

        e.stopPropagation();
        const nodePath = item.path;
        const nodeType = item.type;

        const now = Date.now();
        const samePath = container._lastClickPath === nodePath;
        const fastClick = samePath && (now - (container._lastClickTime || 0)) < 1000;
        container._lastClickPath = nodePath;
        container._lastClickTime = now;

        if (fastClick && nodeType === 'folder' && item.expandable) {
            e.preventDefault();
            onDoubleClick?.(nodePath, item.name, true);
            return;
        }
        if (fastClick && nodeType === 'file') {
            e.preventDefault();
            onDoubleClick?.(nodePath, item.name, false);
            return;
        }

        if (nodeType === 'folder') {
            if (item.expandable) {
                const newExpanded = !item.expanded;
                _setVirtualExpanded(container, nodePath, newExpanded);
                const newFlat = _flattenTree(treeData, expandedFolders);
                flatItems.length = 0;
                flatItems.push(...newFlat);
                spacerEl.style.height = (flatItems.length * ITEM_HEIGHT) + 'px';
                renderVisible();
            }
            if (actionType === 'code') {
                const selPaths = flatItems.filter(fi => fi.type === 'file' && fi.path.startsWith(nodePath + '/')).map(fi => fi.path);
                const normSel = selectedItems.map(normPath);
                const allSel = selPaths.every(fp => normSel.includes(fp));
                selPaths.forEach(fp => allSel ? _removePath(selectedItems, fp) : _addPath(selectedItems, fp));
            } else {
                _togglePath(selectedItems, nodePath);
            }
        } else {
            _togglePath(selectedItems, nodePath);
        }

        _updateHighlightsForPaths(container, selectedItems, actionType);
        onToggle?.({ path: nodePath, type: nodeType, name: item.name });
    });
}

/* ============================================================
   LIST MODE
   ============================================================ */

function _renderListMode(treeData, container, selectedItems, actionType, onToggle, onMoveRequest, onAddFile) {
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
        wrapper.dataset.depthLevel = depth % 10;
        if (node.type === 'file' && depth > 0) {
            wrapper.dataset.parentDepth = (depth - 1) % 10;
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
        if (node.type === 'file' || node.type === 'folder') {
            const moveBtn = document.createElement('button');
            moveBtn.className = 'cm-move-btn';
            moveBtn.title = node.type === 'folder' ? 'Move folder' : 'Move file';
            moveBtn.textContent = '↗';
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                onMoveRequest?.(normPath(node.path), wrapper);
            });
            el.appendChild(moveBtn);
        }
        if (node.type === 'folder') {
            const addBtn = document.createElement('button');
            addBtn.className = 'cm-add-file-btn';
            addBtn.title = 'Create files';
            addBtn.textContent = '+';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                onAddFile?.(normPath(node.path));
            });
            el.appendChild(addBtn);
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
    _buildNodeMap(container, treeData);
}

/* ============================================================
   TREE MODE
   ============================================================ */

function _renderTreeMode(treeData, container, selectedItems, actionType, onToggle, onMoveRequest, onAddFile) {
    _presortTree(treeData);

    function createNode(node, depth = 0) {
        if (actionType === 'structure' && node.type === 'file') return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'node-wrapper';
        wrapper.dataset.nodePath = normPath(node.path);
        wrapper.dataset.nodeName = node.name;
        wrapper.dataset.depthLevel = depth % 10;
        if (node.type === 'file' && depth > 0) {
            wrapper.dataset.parentDepth = (depth - 1) % 10;
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
        if (node.type === 'file' || node.type === 'folder') {
            const moveBtn = document.createElement('button');
            moveBtn.className = 'cm-move-btn';
            moveBtn.title = node.type === 'folder' ? 'Move folder' : 'Move file';
            moveBtn.textContent = '↗';
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                onMoveRequest?.(normPath(node.path), wrapper);
            });
            el.appendChild(moveBtn);
        }
        if (node.type === 'folder') {
            const addBtn = document.createElement('button');
            addBtn.className = 'cm-add-file-btn';
            addBtn.title = 'Create files';
            addBtn.textContent = '+';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                onAddFile?.(normPath(node.path));
            });
            el.appendChild(addBtn);
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
    _buildNodeMap(container, treeData);
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
