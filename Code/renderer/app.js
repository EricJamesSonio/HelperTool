// --------------------
// Renderer: app.js
// --------------------
import { renderTree } from '../utils/treeView.js';

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

// --------------------
// Repo loading
// --------------------
async function loadLastActiveRepo() {
    const lastRepoPath = await window.electronAPI.getActiveProjectPath?.();
    if (lastRepoPath) {
        await loadRepo(lastRepoPath);
    }
}

selectRepoBtn.addEventListener('click', async () => {
    const repoPath = await window.electronAPI.selectRepo();
    if (repoPath) await loadRepo(repoPath);
});

async function loadRepo(repoPath) {
    selectedRepoPath = repoPath;

    // Reset selections
    selectedItems = [];
    await window.electronAPI.setLastSelected([]);

    const repoName = repoPath.split(/[/\\]/).pop();
    updateActiveRepo(repoName);

    cachedTree = await window.electronAPI.getFolderTree(repoPath);

    updateGenerateState();
    displayTree();
}

// --------------------
// Display tree using treeView.js
// --------------------
function displayTree() {
    if (!cachedTree) return;
    renderTree(cachedTree, treeContainer, selectedItems, actionType, toggleSelect);
}

// --------------------
// Selection logic
// --------------------
function toggleSelect(node) {
    if (!selectedRepoPath || !cachedTree) return;

    const isSelected = selectedItems.includes(node.path);

    if (isSelected) selectedItems = selectedItems.filter(p => p !== node.path);
    else selectedItems.push(node.path);

    window.electronAPI.setLastSelected(selectedItems);
    updateGenerateState();

    // Only re-render for folders in code mode (ALL FILES label)
    if (node.type === 'folder' && actionType === 'code') displayTree();
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
    displayTree();
});

codeBtn.addEventListener('click', () => {
    actionType = 'code';
    resetSelection();
    displayTree();
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
    displayTree();
});

// --------------------
// Init
// --------------------
window.addEventListener('DOMContentLoaded', loadLastActiveRepo);
