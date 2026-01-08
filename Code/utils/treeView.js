/**
 * Tree Diagram Renderer (Fixed)
 * ---------------------------------
 * - Pure render: selection comes ONLY from selectedItems
 * - Folders NEVER collapse - always stay open
 * - Green highlighting for folders in code mode works correctly
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
        // Remove all selection classes first
        el.classList.remove('selected', 'folder-selected', 'file-selected');

        if (!isSelected(node.path)) return;

        // Apply correct selection class based on type and mode
        if (node.type === 'folder') {
            if (actionType === 'code') {
                el.classList.add('folder-selected'); // GREEN in code mode
            } else {
                el.classList.add('selected'); // PURPLE in structure mode
            }
        } else {
            el.classList.add('file-selected'); // YELLOW for files
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

        /* Expansion state - ALWAYS EXPANDED */
        let expanded = true;
        expandedFolders.set(node.path, true);

        if (node.type === 'folder' && node.children?.length) {
            el.classList.add('expandable', 'folder-open');
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

        /* Children - ALWAYS VISIBLE */
        let childrenContainer = null;

        if (node.type === 'folder' && node.children?.length) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'children';
            // ALWAYS display children - never hide
            childrenContainer.style.display = 'flex';

            node.children.forEach(child => {
                const childEl = createNode(child, depth + 1);
                if (childEl) {
                    childrenContainer.appendChild(childEl);
                }
            });

            wrapper.appendChild(childrenContainer);
        }

        /* ----------------------------------------
         * Click handling - NO EXPANSION TOGGLE
         * -------------------------------------- */
        el.addEventListener('click', (e) => {
            e.stopPropagation();

            if (node.type === 'file') {
                // File click: toggle selection
                togglePath(node.path);
            } else {
                // Folder click: select/deselect ALL files inside
                if (actionType === 'code') {
                    const files = getAllFiles(node);
                    const allSelected = files.every(f => isSelected(f.path));

                    files.forEach(f => {
                        if (allSelected) removePath(f.path);
                        else addPath(f.path);
                    });
                } else {
                    // Structure mode: toggle folder itself
                    togglePath(node.path);
                }

                // DO NOT toggle expansion - folders stay open permanently
            }

            // Update visual highlights
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