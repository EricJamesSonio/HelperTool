/**
 * Tree Diagram Renderer
 * -----------------
 * - Shows folders always
 * - Files shown in code mode
 * - ALL folders expanded by default
 * - Click to select folders/files
 * - Folder selection in code mode = all files inside selected recursively
 * - Highlights selected items
 * - Displays as visual tree with connecting lines
 * - Compact design for easier viewing of large trees
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
        nodeWrapper.dataset.nodePath = node.path; // Store path for later reference

        const el = document.createElement('div');
        el.classList.add('tree-node');
        if (node.type === 'file') el.classList.add('file');
        else el.classList.add('folder');

        const isSelected = selectedItems.includes(node.path);
        
        // Check if folder should be expanded - DEFAULT TO TRUE for all folders
        let isExpanded = expandedFolders.get(node.path);
        if (isExpanded === undefined && node.type === 'folder' && node.children?.length) {
            isExpanded = true; // Expand all folders by default
            expandedFolders.set(node.path, true);
        }
        isExpanded = isExpanded !== false; // Default to expanded unless explicitly collapsed

        // Highlight selection
        if (node.type === 'folder' && actionType === 'code' && isSelected) el.classList.add('folder-selected');
        else if (node.type === 'file' && isSelected) el.classList.add('file-selected');
        else if (node.type === 'folder' && isSelected) el.classList.add('selected');

        // Add expand indicator for folders with children
        if (node.type === 'folder' && node.children?.length) {
            el.classList.add('expandable');
            if (isExpanded) el.classList.add('folder-open');
        }

        // Label (more compact)
        let label = node.name;
        if (node.type === 'folder' && node.children?.length && actionType !== 'structure') {
            const fileCount = countFiles(node);
            if (fileCount > 0) label += ` (${fileCount})`;
        }
        if (node.type === 'folder' && actionType === 'code' && isSelected) label += ' [ALL]';
        el.textContent = label;

        nodeWrapper.appendChild(el);

        // Children container - ALWAYS render if folder has children
        if (node.type === 'folder' && node.children?.length) {
            const childrenContainer = document.createElement('div');
            childrenContainer.classList.add('children');
            
            // Show/hide based on expanded state (but default is shown)
            if (!isExpanded) {
                childrenContainer.style.display = 'none';
            }

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

                // Toggle expand/collapse for folders with children
                if (node.children?.length) {
                    const newExpandedState = !isExpanded;
                    expandedFolders.set(node.path, newExpandedState);
                    
                    // Find the children container and toggle its display
                    const childrenContainer = nodeWrapper.querySelector('.children');
                    if (childrenContainer) {
                        childrenContainer.style.display = newExpandedState ? 'flex' : 'none';
                    }
                    
                    // Update folder icon
                    if (newExpandedState) {
                        el.classList.add('folder-open');
                    } else {
                        el.classList.remove('folder-open');
                    }
                }
            }

            // Update selection highlights without re-rendering
            updateSelectionHighlights();

            if (onToggle) onToggle(node);
        });

        return nodeWrapper;
    }

    // Helper to update selection highlights without full re-render
    function updateSelectionHighlights() {
        const allNodes = container.querySelectorAll('.tree-node');
        allNodes.forEach(nodeEl => {
            const wrapper = nodeEl.parentElement;
            const nodePath = wrapper.dataset.nodePath;
            
            if (!nodePath) return;
            
            const isSelected = selectedItems.includes(nodePath);
            
            // Remove all selection classes
            nodeEl.classList.remove('selected', 'folder-selected', 'file-selected');
            
            // Re-apply based on current state
            if (nodeEl.classList.contains('folder')) {
                if (actionType === 'code' && isSelected) {
                    nodeEl.classList.add('folder-selected');
                } else if (isSelected) {
                    nodeEl.classList.add('selected');
                }
            } else if (nodeEl.classList.contains('file') && isSelected) {
                nodeEl.classList.add('file-selected');
            }
        });
        
        updateGenerateState();
    }

    function updateGenerateState() {
        const generateBtn = document.getElementById('generateBtn');
        if (generateBtn) {
            generateBtn.disabled = selectedItems.length === 0;
        }
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