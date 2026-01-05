/**
 * Tree View Renderer
 * -----------------
 * Handles displaying a repo tree with:
 * - Collapsible folders
 * - Selectable files/folders
 * - Folder ALL FILES display
 */

export function renderTree(treeData, container, selectedItems, actionType, onToggle) {
    container.innerHTML = '';

    function createNode(node, depth = 0) {
        // If structure mode and file → skip
        if (actionType === 'structure' && node.type === 'file') return null;

        const el = document.createElement('div');
        el.classList.add('tree-node');
        el.style.paddingLeft = `${16 * depth}px`;
        el.style.userSelect = 'none';
        el.style.fontSize = '14px';
        el.style.cursor = 'pointer';

        if (node.type === 'file') el.classList.add('file');

        const isSelected = selectedItems.includes(node.path);
        if (isSelected) el.classList.add('selected');
        if (node.type === 'folder' && actionType === 'code' && isSelected) {
            el.classList.add('folder-selected');
        }

        // Label
        let label = node.name;
        if (node.type === 'folder' && node.children?.length && actionType !== 'structure') {
            const fileCount = countFiles(node);
            if (fileCount > 0) label += ` (${fileCount} files)`;
        }
        if (node.type === 'folder' && actionType === 'code' && isSelected) {
            label += ' [ALL FILES]';
        }

        el.textContent = label;

        // Click to toggle select
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            onToggle(node);
        });

        // Folder children
        if (node.type === 'folder' && node.children?.length) {
            const childrenContainer = document.createElement('div');
            childrenContainer.classList.add('children');
            childrenContainer.style.display = 'block';

            node.children.forEach(child => {
                const childNode = createNode(child, depth + 1);
                if (childNode) childrenContainer.appendChild(childNode);
            });

            el.appendChild(childrenContainer);

            // Optional: collapse on click on folder name
            el.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                childrenContainer.style.display = childrenContainer.style.display === 'none' ? 'block' : 'none';
            });
        }

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
