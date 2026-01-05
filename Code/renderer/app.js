const selectRepoBtn = document.getElementById('selectRepoBtn');
const activeRepoName = document.getElementById('activeRepoName');
const treeContainer = document.getElementById('treeContainer');
const structureBtn = document.getElementById('structureBtn');
const codeBtn = document.getElementById('codeBtn');
const generateBtn = document.getElementById('generateBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

let selectedRepoPath = null;
let selectedItems = [];
let actionType = 'code'; // Default view: show everything
let ignoreRules = [];  // Store rules after loading repo

// Make tree container scrollable
treeContainer.style.overflowY = 'auto';
treeContainer.style.maxHeight = '80vh';

// Listen to progress updates from main process
window.electronAPI.onProgressUpdate((percent) => {
    progressBar.value = percent;
    progressText.textContent = `${percent}%`;
});

// Update active repo label
function updateActiveRepo(name) {
    activeRepoName.textContent = name || 'No repo selected';
}

// Handle repo selection
selectRepoBtn.addEventListener('click', async () => {
    const repoPath = await window.electronAPI.selectRepo();
    if (!repoPath) return;
    await loadRepo(repoPath);
});

async function loadRepo(repoPath) {
    selectedRepoPath = repoPath;
    const repoName = repoPath.split(/[/\\]/).pop();
    updateActiveRepo(repoName);

    // Get ignore rules & tree
    ignoreRules = await window.electronAPI.getDocignore(repoPath);
    const treeData = await window.electronAPI.getFolderTree(repoPath);

    // Restore last selected items
    selectedItems = await window.electronAPI.getLastSelected();

    displayTree(treeData, treeContainer, actionType);
}

// Recursive tree rendering with multi-target selection & mode
function displayTree(tree, container, mode) {
    container.innerHTML = '';

    function createNode(node) {
        // If structure mode and node is a file → skip
        if (mode === 'structure' && node.type === 'file') return null;

        const el = document.createElement('div');
        el.classList.add('tree-node');
        el.style.cursor = 'pointer';
        el.style.paddingLeft = '16px';
        el.style.userSelect = 'none';
        el.style.fontSize = '14px';

        if (node.type === 'file') el.classList.add('file');
        if (selectedItems.includes(node.path)) el.classList.add('selected');

        // Folder/file label
        let label = node.name;
        if (node.type === 'folder' && node.children && node.children.length > 0) {
            if (mode !== 'structure') {
                const fileCount = countFiles(node);
                if (fileCount > 0) label += ` (${fileCount} files)`;
            }
        }
        el.textContent = label;

        // Click to select
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSelect(el, node);
        });

        // Recursively render children
        if (node.type === 'folder' && node.children && node.children.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.classList.add('children');
            childrenContainer.style.marginLeft = '16px';
            node.children.forEach(child => {
                const childNode = createNode(child);
                if (childNode) childrenContainer.appendChild(childNode);
            });
            el.appendChild(childrenContainer);
        }

        return el;
    }

    tree.forEach(node => {
        const n = createNode(node);
        if (n) container.appendChild(n);
    });
}

// Count all files under a folder recursively
function countFiles(node) {
    if (node.type === 'file') return 1;
    if (!node.children || node.children.length === 0) return 0;
    return node.children.reduce((acc, child) => acc + countFiles(child), 0);
}

// Toggle selection and persist per project
function toggleSelect(el, node) {
    const isSelected = selectedItems.includes(node.path);

    if (isSelected) {
        selectedItems = selectedItems.filter(p => p !== node.path);
        el.style.backgroundColor = '';
        if (node.type === 'folder' && actionType === 'code') el.style.fontWeight = 'normal';
    } else {
        selectedItems.push(node.path);
        el.style.backgroundColor = '#d0f0d0';
        if (node.type === 'folder' && actionType === 'code') el.style.fontWeight = 'bold';
    }

    window.electronAPI.setLastSelected(selectedItems);
}

// Auto-load last active repo
async function loadLastActiveRepo() {
    try {
        const lastRepo = await window.electronAPI.getActiveProject?.();
        if (!lastRepo) return;

        await loadRepo(lastRepo.repoPath || lastRepo.path || lastRepo.storagePath); 
    } catch (err) {
        console.error("Failed to load last active repo:", err);
    }
}

// Action buttons
structureBtn.addEventListener('click', () => {
    actionType = 'structure';
    if (selectedRepoPath) {
        window.electronAPI.getFolderTree(selectedRepoPath).then(treeData => {
            displayTree(treeData, treeContainer, actionType);
        });
    }
});

codeBtn.addEventListener('click', () => {
    actionType = 'code';
    if (selectedRepoPath) {
        window.electronAPI.getFolderTree(selectedRepoPath).then(treeData => {
            displayTree(treeData, treeContainer, actionType);
        });
    }
});

// Generate combined output
generateBtn.addEventListener('click', async () => {
    if (!selectedRepoPath || selectedItems.length === 0) {
        alert('Select repo and items first!');
        return;
    }

    const fileName = prompt('Enter output file name (e.g., UserModule.txt):');
    if (!fileName) return;

    progressBar.value = 0;
    progressText.textContent = '0%';

    await window.electronAPI.generate(actionType, selectedRepoPath, selectedItems, fileName);

    alert('Done!');
    selectedItems = [];
    const treeData = await window.electronAPI.getFolderTree(selectedRepoPath);
    displayTree(treeData, treeContainer, actionType);
});

// Load last repo on startup
window.addEventListener('DOMContentLoaded', loadLastActiveRepo);
