/**
 * Tree View Renderer (updated)
 * -----------------
 * Features:
 * - Single-click select + expand/collapse folders
 * - Selected files/folders highlighted
 * - Folder ALL FILES display in code mode
 * - Folder icons via CSS classes
 * - Maintains expand/collapse state
 */

export function renderTree(treeData, container, selectedItems, actionType, onToggle) {
    container.innerHTML = '';

    // Map to store expanded folder states
    const expandedFolders = new WeakMap();

    function createNode(node, depth = 0) {
        if (actionType === 'structure' && node.type === 'file') return null;

        const el = document.createElement('div');
        el.classList.add('tree-node');
        el.style.paddingLeft = `${16 * depth}px`;
        el.style.userSelect = 'none';
        el.style.fontSize = '14px';
        el.style.cursor = 'pointer';

        if (node.type === 'file') el.classList.add('file');
        else el.classList.add('folder');

        const isSelected = selectedItems.includes(node.path);
        if (isSelected) el.classList.add('selected');
        if (node.type === 'folder' && actionType === 'code' && isSelected) {
            el.classList.add('folder-selected');
        }

        // Label + file count
        let label = node.name;
        if (node.type === 'folder' && node.children?.length && actionType !== 'structure') {
            const fileCount = countFiles(node);
            if (fileCount > 0) label += ` (${fileCount} files)`;
        }
        if (node.type === 'folder' && actionType === 'code' && isSelected) {
            label += ' [ALL FILES]';
        }

        el.textContent = label;

        // Children container
        let childrenContainer;
        if (node.type === 'folder' && node.children?.length) {
            childrenContainer = document.createElement('div');
            childrenContainer.classList.add('children');
            childrenContainer.style.display = expandedFolders.get(node) ? 'block' : 'none';

            node.children.forEach(child => {
                const childNode = createNode(child, depth + 1);
                if (childNode) childrenContainer.appendChild(childNode);
            });

            el.appendChild(childrenContainer);
        }

        // Click logic
        el.addEventListener('click', (e) => {
            e.stopPropagation();

            // Toggle selection
            onToggle(node);

            // If folder, toggle expand/collapse only if not selected in code mode
            if (node.type === 'folder') {
                const isExpanded = expandedFolders.get(node) || false;
                expandedFolders.set(node, !isExpanded);
                if (childrenContainer) childrenContainer.style.display = !isExpanded ? 'block' : 'none';
                el.classList.toggle('folder-open', !isExpanded);
            }
        });

        return el;
    }

    treeData.forEach(node => {
        const n = createNode(node);
        if (n) container.appendChild(n);
    });
}

/**
 * Count all files in a folder node recursively
 * @param {Object} node
 * @returns {number}
 */
function countFiles(node) {
    if (node.type === 'file') return 1;
    if (!node.children?.length) return 0;
    return node.children.reduce((acc, child) => acc + countFiles(child), 0);
}
