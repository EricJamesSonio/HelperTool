
import { renderTree } from '../utils/treeView.js';

const selectRepoBtn = document.getElementById('selectRepoBtn');
const activeRepoName = document.getElementById('activeRepoName');
const treeContainer = document.getElementById('treeContainer');
const structureBtn = document.getElementById('structureBtn');
const codeBtn = document.getElementById('codeBtn');
const generateBtn = document.getElementById('generateBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const openStorageBtn = document.getElementById('openStorageBtn');
const editDocignoreBtn = document.getElementById('editDocignoreBtn');


let selectedRepoPath = null;
let selectedItems = [];        // ⚠️ NEVER reassign this
let actionType = 'code';
let cachedTree = null;

/* ----------------------------------------
 * UI setup
 * -------------------------------------- */
treeContainer.style.overflowY = 'auto';
treeContainer.style.maxHeight = '80vh';
generateBtn.disabled = true;

/* ----------------------------------------
 * Progress listener
 * -------------------------------------- */
window.electronAPI.onProgressUpdate(percent => {
    progressBar.value = percent;
    progressText.textContent = `${percent}%`;
});

/* ----------------------------------------
 * Helpers
 * -------------------------------------- */
function updateActiveRepo(name) {
    activeRepoName.textContent = name || 'No repo selected';
}

function updateGenerateState() {
    generateBtn.disabled = selectedItems.length === 0;
}

/* ----------------------------------------
 * Tree selection callback
 * -------------------------------------- */
function onTreeSelectionChange() {
    updateGenerateState();
    window.electronAPI.setLastSelected(selectedItems);
}

/* ----------------------------------------
 * Open storage
 * -------------------------------------- */
openStorageBtn.addEventListener('click', async () => {
    try {
        await window.electronAPI.openStorage();
    } catch (err) {
        console.error('[UI] Failed to open storage:', err);
        alert('Failed to open storage.');
    }
});

/* ----------------------------------------
 * Load last active repo
 * -------------------------------------- */
async function loadLastActiveRepo() {
    try {
        const project = await window.electronAPI.getActiveProject();

        if (project?.repoPath) {
            selectedItems.length = 0;
            project.lastSelectedItems?.forEach(p => selectedItems.push(p));

            await loadRepo(project.repoPath, false);
        }
    } catch (err) {
        console.error('[Init] Failed to load last project:', err);
    }
}

/* ----------------------------------------
 * Select repo
 * -------------------------------------- */
selectRepoBtn.addEventListener('click', async () => {
    try {
        const repoPath = await window.electronAPI.selectRepo();
        if (repoPath) await loadRepo(repoPath);
    } catch (err) {
        console.error('[UI] Repo selection failed:', err);
    }
});

/* ----------------------------------------
 * Load repo
 * -------------------------------------- */
async function loadRepo(repoPath, resetSelection = true) {
    selectedRepoPath = repoPath;

    if (resetSelection) {
        selectedItems.length = 0;
        await window.electronAPI.setLastSelected([]);
    }

    updateActiveRepo(repoPath.split(/[/\\]/).pop());

    cachedTree = await window.electronAPI.getFolderTree(repoPath);
    displayTree();
    updateGenerateState();
}

/* ----------------------------------------
 * Display tree (PURE)
 * -------------------------------------- */
function displayTree() {
    if (!cachedTree) {
        treeContainer.textContent = 'No data available';
        return;
    }

    renderTree(
        cachedTree,
        treeContainer,
        selectedItems,
        actionType,
        onTreeSelectionChange
    );
}

/* ----------------------------------------
 * Mode switching
 * -------------------------------------- */
function resetSelection() {
    selectedItems.length = 0;
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

/* ----------------------------------------
 * Edit .docignore
 * -------------------------------------- */
editDocignoreBtn.addEventListener('click', async () => {
    try {
        const ok = await window.electronAPI.openGlobalDocignore();
        if (!ok) alert('Failed to open global ignore file.');
    } catch (err) {
        console.error('[UI] Error opening .docignore:', err);
    }
});

/* ----------------------------------------
 * Generate
 * -------------------------------------- */
/* ----------------------------------------
 * Generate
 * -------------------------------------- */
generateBtn.addEventListener('click', async () => {
    try {
        if (!selectedRepoPath || !selectedItems.length) {
            return alert('Select repo and items first!');
        }

        // Ask for file path
        const { filePath } = await window.electronAPI.saveFileDialog(actionType);
        if (!filePath) return;

        // Reset progress UI
        progressBar.value = 0;
        progressText.textContent = '0%';

        // Generate code / structure
        const success = await window.electronAPI.generate(
            actionType,
            selectedRepoPath,
            selectedItems,
            filePath
        );

        if (success) {
            // No alert needed — file will open automatically
            console.log(`[UI] Generation complete. File should open in VS Code or default editor: ${filePath}`);
        } else {
            alert('Generation failed.');
        }

        // Reset selection & tree
        resetSelection();
        displayTree();
    } catch (err) {
        console.error('[Generate] Failed:', err);
        alert('Generation failed.');
    }
});


/* ----------------------------------------
 * Init
 * -------------------------------------- */
window.addEventListener('DOMContentLoaded', loadLastActiveRepo);
