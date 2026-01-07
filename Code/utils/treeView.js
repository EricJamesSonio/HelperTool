/**
 * Tree Diagram Renderer (Refactored)
 * ---------------------------------
 * - Pure render: selection comes ONLY from selectedItems
 * - No re-render on click
 * - Stable selection & expansion behavior
 */

export function renderTree(treeData, container, selectedItems, actionType, onToggle) {
    container.innerHTML = '';

    /* ----------------------------------------
     * Persistent folder expansion state
     * -------------------------------------- */
    if (!window._expandedFolders) {
        window._expandedFolders = new Map();
    }
    const expandedFolders = window._expandedFolders;

    /* ----------------------------------------
     * Helpers (PURE)
     * -------------------------------------- */

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

    const isSelected = (path) => selectedItems.includes(path);

    /* ----------------------------------------
     * DOM helpers
     * -------------------------------------- */

    function applySelectionClass(el, node) {
        el.classList.remove('selected', 'folder-selected', 'file-selected');

        if (!isSelected(node.path)) return;

        if (node.type === 'folder') {
            if (actionType === 'code') el.classList.add('folder-selected');
            else el.classList.add('selected');
        } else {
            el.classList.add('file-selected');
        }
    }

    function updateAllSelectionHighlights() {
        container.querySelectorAll('.tree-node').forEach(el => {
            const wrapper = el.parentElement;
            if (!wrapper?.dataset.nodePath) return;

            const path = wrapper.dataset.nodePath;
            const type = el.classList.contains('folder') ? 'folder' : 'file';

            applySelectionClass(el, { path, type });
        });

        updateGenerateState();
    }

    function updateGenerateState() {
        const btn = document.getElementById('generateBtn');
        if (btn) btn.disabled = selectedItems.length === 0;
    }

    /* ----------------------------------------
     * Node creation
     * -------------------------------------- */

    function createNode(node, depth = 0) {
        if (actionType === 'structure' && node.type === 'file') return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'node-wrapper';
        wrapper.style.setProperty('--depth', depth);
        wrapper.dataset.nodePath = node.path;

        const el = document.createElement('div');
        el.classList.add('tree-node', node.type);

        /* Expansion state (folders only) */
        let expanded = expandedFolders.get(node.path);
        if (expanded === undefined && node.type === 'folder') {
            expanded = true;
            expandedFolders.set(node.path, true);
        }

        if (node.type === 'folder' && node.children?.length) {
            el.classList.add('expandable');
            if (expanded) el.classList.add('folder-open');
        }

        /* Label */
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

        /* Children */
        let childrenContainer = null;

        if (node.type === 'folder' && node.children?.length) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'children';
            if (!expanded) childrenContainer.style.display = 'none';

            node.children.forEach(child => {
                const childEl = createNode(child, depth + 1);
                if (childEl) {
                    childrenContainer.appendChild(childEl);
                }
            });



            wrapper.appendChild(childrenContainer);
        }

        /* ----------------------------------------
         * Click handling (STATE ONLY)
         * -------------------------------------- */
        el.addEventListener('click', (e) => {
            e.stopPropagation();

            if (node.type === 'file') {
                togglePath(node.path);
            } else {
                if (actionType === 'code') {
                    const files = getAllFiles(node);
                    const allSelected = files.every(f => isSelected(f.path));

                    files.forEach(f => {
                        if (allSelected) removePath(f.path);
                        else addPath(f.path);
                    });
                } else {
                    togglePath(node.path);
                }

                if (node.children?.length) {
                    expanded = !expanded;
                    expandedFolders.set(node.path, expanded);

                    if (childrenContainer) {
                        childrenContainer.style.display = expanded ? 'flex' : 'none';
                    }

                    el.classList.toggle('folder-open', expanded);
                }
            }

            updateAllSelectionHighlights();
            onToggle?.(node);
        });

        return wrapper;
    }

    /* ----------------------------------------
     * Selection mutations (CENTRALIZED)
     * -------------------------------------- */

    function addPath(path) {
        if (!selectedItems.includes(path)) selectedItems.push(path);
    }

    function removePath(path) {
        const i = selectedItems.indexOf(path);
        if (i !== -1) selectedItems.splice(i, 1);
    }

    function togglePath(path) {
        if (isSelected(path)) removePath(path);
        else addPath(path);
    }

    /* ----------------------------------------
     * Initial render
     * -------------------------------------- */

    const root = document.createElement('div');
    root.className = 'tree-root';

    treeData.forEach(node => {
        const el = createNode(node, 0);
        if (el) root.appendChild(el);
    });

    container.appendChild(root);
    updateGenerateState();
}
