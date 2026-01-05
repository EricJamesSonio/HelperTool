/**
 * Tree View Renderer
 * -----------------
 * - Shows folders always
 * - Files shown in code mode
 * - Click to select folders/files
 * - Folder selection in code mode = all files inside selected recursively
 * - Highlights selected items
 * - Displays children in horizontal rows (flex)
 */
export function renderTree(treeData, container, selectedItems, actionType, onToggle) {
    container.innerHTML = '';

    // Store expanded/collapsed folder state
    const expandedFolders = new WeakMap();

    // Recursively get all files under a folder
    function getAllFiles(node) {
        if (node.type === 'file') return [node];
        if (!node.children?.length) return [];
        return node.children.flatMap(getAllFiles);
    }

    function createNode(node) {
        // In structure mode, skip files
        if (actionType === 'structure' && node.type === 'file') return null;

        const el = document.createElement('div');
        el.classList.add('tree-node');
        if (node.type === 'file') el.classList.add('file');
        else el.classList.add('folder');

        // Determine if node is selected
        const isSelected = selectedItems.includes(node.path);

        // Apply highlight
        if (node.type === 'folder' && actionType === 'code' && isSelected) el.classList.add('folder-selected');
        else if (node.type === 'file' && isSelected) el.classList.add('file-selected');
        else if (node.type === 'folder' && isSelected) el.classList.add('selected');

        // Label
        let label = node.name;
        if (node.type === 'folder' && node.children?.length && actionType !== 'structure') {
            const fileCount = countFiles(node);
            if (fileCount > 0) label += ` (${fileCount} files)`;
        }
        if (node.type === 'folder' && actionType === 'code' && isSelected) label += ' [ALL FILES]';
        el.textContent = label;

        // Children container
        let childrenContainer;
        if (node.type === 'folder' && node.children?.length) {
            childrenContainer = document.createElement('div');
            childrenContainer.classList.add('children');
            // Use flex + wrap for horizontal layout
            childrenContainer.style.display = expandedFolders.get(node) ? 'flex' : 'none';
            childrenContainer.style.flexWrap = 'wrap';
            childrenContainer.style.gap = '8px';
            childrenContainer.style.marginLeft = '20px';

            node.children.forEach(child => {
                const childNode = createNode(child);
                if (childNode) childrenContainer.appendChild(childNode);
            });

            el.appendChild(childrenContainer);
        }

        // Click logic
        el.addEventListener('click', e => {
            e.stopPropagation();

            // Toggle selection
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
                    // Structure mode: toggle folder only
                    const idx = selectedItems.indexOf(node.path);
                    if (idx === -1) selectedItems.push(node.path);
                    else selectedItems.splice(idx, 1);
                }
            }

            // Folder expand/collapse
            if (node.type === 'folder') {
                const isExpanded = expandedFolders.get(node) || false;
                expandedFolders.set(node, !isExpanded);
                if (childrenContainer) childrenContainer.style.display = !isExpanded ? 'flex' : 'none';
                el.classList.toggle('folder-open', !isExpanded);
            }

            // Force re-render to update highlights
            renderTree(treeData, container, selectedItems, actionType, onToggle);

            // Trigger callback
            if (onToggle) onToggle(node);
        });

        return el;
    }

    treeData.forEach(node => {
        const n = createNode(node);
        if (n) container.appendChild(n);
    });
}

// Count files recursively
function countFiles(node) {
    if (node.type === 'file') return 1;
    if (!node.children?.length) return 0;
    return node.children.reduce((acc, child) => acc + countFiles(child), 0);
}
