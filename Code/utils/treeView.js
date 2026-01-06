/**
 * Tree Diagram Renderer
 * -----------------
 * - Shows folders always
 * - Files shown in code mode
 * - Click to select folders/files
 * - Folder selection in code mode = all files inside selected recursively
 * - Highlights selected items
 * - Displays as visual tree with connecting lines
 */
export function renderTree(treeData, container, selectedItems, actionType, onToggle) {
    container.innerHTML = '';
    
    // Store expanded/collapsed folder state persistently
    if (!window._expandedFolders) {
        window._expandedFolders = new Map();
    }
    const expandedFolders = window._expandedFolders;

    // Recursively get all files under a folder (ignores folders with no files)
    function getAllFiles(node) {
        if (node.type === 'file') return [node];
        if (!node.children?.length) return [];
        return node.children.flatMap(getAllFiles);
    }

    // Count only visible files recursively
    function countFiles(node) {
        if (node.type === 'file') return 1;
        if (!node.children?.length) return 0;
        return node.children.reduce((acc, child) => acc + countFiles(child), 0);
    }

    function createNode(node, depth = 0) {
        // Skip files in structure mode
        if (actionType === 'structure' && node.type === 'file') return null;

        const nodeWrapper = document.createElement('div');
        nodeWrapper.classList.add('node-wrapper');
        nodeWrapper.style.setProperty('--depth', depth);

        const el = document.createElement('div');
        el.classList.add('tree-node');
        if (node.type === 'file') el.classList.add('file');
        else el.classList.add('folder');

        const isSelected = selectedItems.includes(node.path);
        
        // Auto-expand first level folders (depth 0) if not explicitly set
        let isExpanded = expandedFolders.get(node.path);
        if (isExpanded === undefined && depth === 0 && node.type === 'folder') {
            isExpanded = true;
            expandedFolders.set(node.path, true);
        }
        isExpanded = isExpanded || false;

        // Highlight selection
        if (node.type === 'folder' && actionType === 'code' && isSelected) el.classList.add('folder-selected');
        else if (node.type === 'file' && isSelected) el.classList.add('file-selected');
        else if (node.type === 'folder' && isSelected) el.classList.add('selected');

        // Add expand indicator for folders with children
        if (node.type === 'folder' && node.children?.length) {
            el.classList.add('expandable');
            if (isExpanded) el.classList.add('folder-open');
        }

        // Label
        let label = node.name;
        if (node.type === 'folder' && node.children?.length && actionType !== 'structure') {
            const fileCount = countFiles(node);
            if (fileCount > 0) label += ` (${fileCount} files)`;
        }
        if (node.type === 'folder' && actionType === 'code' && isSelected) label += ' [ALL FILES]';
        el.textContent = label;

        nodeWrapper.appendChild(el);

        // Children container
        if (node.type === 'folder' && node.children?.length && isExpanded) {
            const childrenContainer = document.createElement('div');
            childrenContainer.classList.add('children');

            node.children.forEach(child => {
                const childNode = createNode(child, depth + 1);
                if (childNode) childrenContainer.appendChild(childNode);
            });

            nodeWrapper.appendChild(childrenContainer);
        }

        // Click logic
        el.addEventListener('click', e => {
            e.stopPropagation();

            if (node.type === 'file') {
                const index = selectedItems.indexOf(node.path);
                if (index === -1) selectedItems.push(node.path);
                else selectedItems.splice(index, 1);
            } else if (node.type === 'folder') {
                if (actionType === 'code') {
                    const allFiles = getAllFiles(node);
                    const allSelected = allFiles.every(f => selectedItems.includes(f.path));
                    if (allSelected) {
                        allFiles.forEach(f => {
                            const idx = selectedItems.indexOf(f.path);
                            if (idx !== -1) selectedItems.splice(idx, 1);
                        });
                    } else {
                        allFiles.forEach(f => {
                            if (!selectedItems.includes(f.path)) selectedItems.push(f.path);
                        });
                    }
                } else {
                    const idx = selectedItems.indexOf(node.path);
                    if (idx === -1) selectedItems.push(node.path);
                    else selectedItems.splice(idx, 1);
                }

                // Toggle expand/collapse
                if (node.children?.length) {
                    expandedFolders.set(node.path, !isExpanded);
                }
            }

            // Re-render entire tree
            renderTree(treeData, container, selectedItems, actionType, onToggle);

            if (onToggle) onToggle(node);
        });

        return nodeWrapper;
    }

    // Create tree container with root level
    const treeRoot = document.createElement('div');
    treeRoot.classList.add('tree-root');

    treeData.forEach(node => {
        const n = createNode(node, 0);
        if (n) treeRoot.appendChild(n);
    });

    container.appendChild(treeRoot);
}