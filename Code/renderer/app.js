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
let actionType = 'code';
let cachedTree = null;

// --------------------
// UI setup
// --------------------
treeContainer.style.overflowY = 'auto';
treeContainer.style.maxHeight = '80vh';
generateBtn.disabled = true;

// --------------------
// Progress listener
// --------------------
window.electronAPI.onProgressUpdate((percent) => {
    progressBar.value = percent;
    progressText.textContent = `${percent}%`;
});

// --------------------
// Helpers
// --------------------
function updateActiveRepo(name) {
    activeRepoName.textContent = name || 'No repo selected';
}

function updateGenerateState() {
    generateBtn.disabled = selectedItems.length === 0;
}

function countFiles(node) {
    if (node.type === 'file') return 1;
    if (!node.children?.length) return 0;
    return node.children.reduce((acc, child) => acc + countFiles(child), 0);
}

// --------------------
// Load last repo
// --------------------
async function loadLastActiveRepo() {
    const lastRepoPath = await window.electronAPI.getActiveProjectPath?.();
    if (lastRepoPath) {
        await loadRepo(lastRepoPath);
    }
}

// --------------------
// Repo selection
// --------------------
selectRepoBtn.addEventListener('click', async () => {
    const repoPath = await window.electronAPI.selectRepo();
    if (repoPath) {
        await loadRepo(repoPath);
    }
});

async function loadRepo(repoPath) {
    selectedRepoPath = repoPath;

    // 🔒 Reset selection when switching repos
    selectedItems = [];
    await window.electronAPI.setLastSelected([]);

    const repoName = repoPath.split(/[/\\]/).pop();
    updateActiveRepo(repoName);

    cachedTree = await window.electronAPI.getFolderTree(repoPath);

    updateGenerateState();
    displayTree(cachedTree, treeContainer, actionType);
}

// --------------------
// Tree rendering
// --------------------
function displayTree(tree, container, mode) {
    container.innerHTML = '';

    function createNode(node) {
        if (mode === 'structure' && node.type === 'file') return null;

        const el = document.createElement('div');
        el.classList.add('tree-node');
        el.style.cursor = 'pointer';
        el.style.paddingLeft = '16px';
        el.style.userSelect = 'none';
        el.style.fontSize = '14px';

        if (node.type === 'file') el.classList.add('file');

        const isSelected = selectedItems.includes(node.path);
        if (isSelected) el.classList.add('selected');

        if (node.type === 'folder' && actionType === 'code' && isSelected) {
            el.classList.add('folder-selected');
        }

        let label = node.name;

        if (node.type === 'folder' && node.children?.length && mode !== 'structure') {
            const fileCount = countFiles(node);
            if (fileCount > 0) label += ` (${fileCount} files)`;
        }

        if (node.type === 'folder' && actionType === 'code' && isSelected) {
            label += ' [ALL FILES]';
        }

        el.textContent = label;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSelect(node);
        });

        if (node.type === 'folder' && node.children?.length) {
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

// --------------------
// Selection logic
// --------------------
function toggleSelect(node) {
    if (!selectedRepoPath || !cachedTree) return;

    const isSelected = selectedItems.includes(node.path);

    if (isSelected) {
        selectedItems = selectedItems.filter(p => p !== node.path);
    } else {
        selectedItems.push(node.path);
    }

    window.electronAPI.setLastSelected(selectedItems);
    updateGenerateState();

    // Re-render only when folder selection affects labels
    if (node.type === 'folder' && actionType === 'code') {
        displayTree(cachedTree, treeContainer, actionType);
    }
}

// --------------------
// Mode switching
// --------------------
function resetSelection() {
    selectedItems = [];
    window.electronAPI.setLastSelected([]);
    updateGenerateState();
}

structureBtn.addEventListener('click', () => {
    actionType = 'structure';
    resetSelection();

    if (!selectedRepoPath || !cachedTree) return;
    displayTree(cachedTree, treeContainer, actionType);
});

codeBtn.addEventListener('click', () => {
    actionType = 'code';
    resetSelection();

    if (!selectedRepoPath || !cachedTree) return;
    displayTree(cachedTree, treeContainer, actionType);
});

// --------------------
// Generate
// --------------------
generateBtn.addEventListener('click', async () => {
    if (!selectedRepoPath || !selectedItems.length) {
        return alert('Select repo and items first!');
    }

    const fileName = prompt('Enter output file name (e.g., UserModule.txt):');
    if (!fileName) return;

    progressBar.value = 0;
    progressText.textContent = '0%';

    await window.electronAPI.generate(
        actionType,
        selectedRepoPath,
        selectedItems,
        fileName
    );

    alert('Done!');
    resetSelection();
    displayTree(cachedTree, treeContainer, actionType);
});

// --------------------
// Init
// --------------------
window.addEventListener('DOMContentLoaded', loadLastActiveRepo);
