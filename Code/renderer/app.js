import { renderTree } from '../utils/treeView.js';

const selectRepoBtn = document.getElementById('selectRepoBtn');
const activeRepoName = document.getElementById('activeRepoName');
const treeContainer = document.getElementById('treeContainer');
const structureBtn = document.getElementById('structureBtn');
const codeBtn = document.getElementById('codeBtn');
const generateBtn = document.getElementById('generateBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const openStorageBtn = document.getElementById('openStorageBtn'); // new

let selectedRepoPath = null;
let selectedItems = [];
let actionType = 'code';
let cachedTree = null;

// UI setup
treeContainer.style.overflowY = 'auto';
treeContainer.style.maxHeight = '80vh';
generateBtn.disabled = true;

// ----------------------------
// Progress listener
// ----------------------------
window.electronAPI.onProgressUpdate((percent) => {
    progressBar.value = percent;
    progressText.textContent = `${percent}%`;
    console.log(`[Progress] ${percent}%`);
});

// ----------------------------
// Helpers
// ----------------------------
function updateActiveRepo(name) {
    activeRepoName.textContent = name || 'No repo selected';
    console.log(`[UI] Active repo set to: ${name}`);
}

openStorageBtn.addEventListener('click', async () => {
    try {
        console.log('[UI] Open Storage clicked');
        await window.electronAPI.openStorage();
    } catch (err) {
        console.error('[UI] Failed to open storage:', err);
        alert('Failed to open storage. Check console for details.');
    }
});

function updateGenerateState() {
    generateBtn.disabled = selectedItems.length === 0;
    console.log(`[UI] Generate button ${generateBtn.disabled ? 'disabled' : 'enabled'}`);
}

// ----------------------------
// Load last active repo
// ----------------------------
async function loadLastActiveRepo() {
    try {
        console.log('[Init] Loading last active project...');
        const project = await window.electronAPI.getActiveProject();
        console.log('[Init] Last active project data:', project);

        if (project?.repoPath) {
            await loadRepo(project.repoPath);
            selectedItems = project.lastSelectedItems || [];
            console.log('[Init] Loaded last selected items:', selectedItems);
        } else {
            console.log('[Init] No last active project found.');
        }
    } catch (err) {
        console.error('[Error] Failed to load last active project:', err);
    }
}

// ----------------------------
// Select repo button
// ----------------------------
selectRepoBtn.addEventListener('click', async () => {
    try {
        console.log('[Action] Select repo clicked');
        const repoPath = await window.electronAPI.selectRepo();
        if (repoPath) {
            console.log('[Action] Repo selected:', repoPath);
            await loadRepo(repoPath);
        } else {
            console.log('[Action] Repo selection cancelled or invalid');
        }
    } catch (err) {
        console.error('[Error] Selecting repo failed:', err);
        alert('Error selecting repo. Check console for details.');
    }
});

// ----------------------------
// Load a repo
// ----------------------------
async function loadRepo(repoPath) {
    try {
        console.log('[LoadRepo] Loading repo:', repoPath);

        selectedRepoPath = repoPath;
        selectedItems = [];
        await window.electronAPI.setLastSelected([]);
        console.log('[LoadRepo] Cleared previous selections');

        const repoName = repoPath.split(/[/\\]/).pop();
        updateActiveRepo(repoName);

        cachedTree = await window.electronAPI.getFolderTree(repoPath);
        console.log('[LoadRepo] Folder tree loaded:', cachedTree);

        updateGenerateState();
        displayTree();
    } catch (err) {
        console.error('[Error] Loading repo failed:', err);
        alert('Failed to load repo. See console.');
    }
}

// ----------------------------
// Display tree
// ----------------------------
function displayTree() {
    try {
        if (!cachedTree) {
            console.log('[DisplayTree] No tree data to display');
            treeContainer.textContent = 'No data available';
            return;
        }
        console.log('[DisplayTree] Rendering tree...');
        renderTree(cachedTree, treeContainer, selectedItems, actionType, toggleSelect);
    } catch (err) {
        console.error('[Error] Displaying tree failed:', err);
    }
}

// ----------------------------
// Selection logic
// ----------------------------
function toggleSelect(node) {
    try {
        if (!selectedRepoPath || !cachedTree) return;

        const isSelected = selectedItems.includes(node.path);

        if (isSelected) {
            selectedItems = selectedItems.filter(p => p !== node.path);
            console.log('[Select] Deselected:', node.path);
        } else {
            selectedItems.push(node.path);
            console.log('[Select] Selected:', node.path);
        }

        window.electronAPI.setLastSelected(selectedItems);
        updateGenerateState();

        if (node.type === 'folder' && actionType === 'code') displayTree();
    } catch (err) {
        console.error('[Error] toggleSelect failed:', err);
    }
}

// ----------------------------
// Mode switching
// ----------------------------
function resetSelection() {
    try {
        selectedItems = [];
        window.electronAPI.setLastSelected([]);
        updateGenerateState();
        console.log('[UI] Selection reset');
    } catch (err) {
        console.error('[Error] resetSelection failed:', err);
    }
}

structureBtn.addEventListener('click', () => {
    try {
        console.log('[Action] Switch to structure mode');
        actionType = 'structure';
        resetSelection();
        displayTree();
    } catch (err) {
        console.error('[Error] Switching to structure mode failed:', err);
    }
});

const editDocignoreBtn = document.getElementById('editDocignoreBtn');

// ----------------------------
// Edit .docignore button
// ----------------------------
// ----------------------------
// Edit .docignore button (updated)
// ----------------------------
editDocignoreBtn.addEventListener('click', async () => {
    try {
        console.log('[UI] Edit Global .docignore clicked');

        const result = await window.electronAPI.openGlobalDocignore();

        if (result) {
            console.log('[UI] Global .docignore opened successfully');
        } else {
            console.warn('[UI] Failed to open global .docignore');
            alert('Failed to open global ignore file. Check console.');
        }
    } catch (err) {
        console.error('[UI] Error opening global .docignore:', err);
        alert('Error opening global ignore file. Check console.');
    }
});




codeBtn.addEventListener('click', () => {
    try {
        console.log('[Action] Switch to code mode');
        actionType = 'code';
        resetSelection();
        displayTree();
    } catch (err) {
        console.error('[Error] Switching to code mode failed:', err);
    }
});

// ----------------------------
// Generate
// ----------------------------
generateBtn.addEventListener('click', async () => {
    try {
        if (!selectedRepoPath || !selectedItems.length) {
            console.log('[Generate] No repo or items selected');
            return alert('Select repo and items first!');
        }

        // Step 1: Show save file dialog
        const { filePath } = await window.electronAPI.saveFileDialog(actionType);
        if (!filePath) {
            console.log('[Generate] User cancelled file save dialog');
            return;
        }

        // Step 2: Reset progress
        progressBar.value = 0;
        progressText.textContent = '0%';

        // Step 3: Generate
        console.log(`[Generate] Generating ${actionType} for ${selectedItems.length} items to "${filePath}"`);
        const result = await window.electronAPI.generate(actionType, selectedRepoPath, selectedItems, filePath);

        console.log('[Generate] Generation result:', result);

        alert('Done!');
        resetSelection();
        displayTree();
    } catch (err) {
        console.error('[Error] Generation failed:', err);
        alert('Generation failed. Check console for details.');
    }
});


// ----------------------------
// Init
// ----------------------------
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Init] DOM loaded');
    loadLastActiveRepo();
});
