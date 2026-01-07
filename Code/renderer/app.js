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
const treeSearchInput = document.getElementById('treeSearchInput');
const searchSuggestions = document.getElementById('searchSuggestions');

let selectedRepoPath = null;
let selectedItems = [];        
let actionType = 'code';
let cachedTree = null;

/* ----------------------------------------
 * UI setup
 * -------------------------------------- */
console.log('[Init] Setting up UI...');
treeContainer.style.overflowY = 'auto';
treeContainer.style.maxHeight = '80vh';
generateBtn.disabled = true;

/* ----------------------------------------
 * Progress listener
 * -------------------------------------- */
window.electronAPI.onProgressUpdate(percent => {
    console.log(`[Progress] ${percent}%`);
    progressBar.value = percent;
    progressText.textContent = `${percent}%`;
});

/* ----------------------------------------
 * Helpers
 * -------------------------------------- */
function updateActiveRepo(name) {
    console.log(`[UI] Active repo updated: ${name || 'No repo selected'}`);
    activeRepoName.textContent = name || 'No repo selected';
}

function updateGenerateState() {
    console.log(`[UI] Generate button ${selectedItems.length === 0 ? 'disabled' : 'enabled'}`);
    generateBtn.disabled = selectedItems.length === 0;
}

/* ----------------------------------------
 * Tree selection callback
 * -------------------------------------- */
function onTreeSelectionChange() {
    console.log('[Tree] Selection changed:', selectedItems);
    updateGenerateState();
    window.electronAPI.setLastSelected(selectedItems);
}

/* ----------------------------------------
 * Open storage
 * -------------------------------------- */
openStorageBtn.addEventListener('click', async () => {
    console.log('[UI] Open storage clicked');
    try {
        await window.electronAPI.openStorage();
        console.log('[UI] Storage opened');
    } catch (err) {
        console.error('[UI] Failed to open storage:', err);
        alert('Failed to open storage.');
    }
});

/* ----------------------------------------
 * Load last active repo
 * -------------------------------------- */
async function loadLastActiveRepo() {
    console.log('[Init] Loading last active repo...');
    try {
        const project = await window.electronAPI.getActiveProject();
        console.log('[Init] Last project data:', project);

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
    console.log('[UI] Select repo clicked');
    try {
        const repoPath = await window.electronAPI.selectRepo();
        console.log('[UI] Repo selected:', repoPath);
        if (repoPath) await loadRepo(repoPath);
    } catch (err) {
        console.error('[UI] Repo selection failed:', err);
    }
});

/* ----------------------------------------
 * Load repo
 * -------------------------------------- */
async function loadRepo(repoPath, resetSelection = true) {
    console.log('[Repo] Loading repo:', repoPath);
    selectedRepoPath = repoPath;

    if (resetSelection) {
        selectedItems.length = 0;
        await window.electronAPI.setLastSelected([]);
        console.log('[Repo] Selection reset');
    }

    updateActiveRepo(repoPath.split(/[/\\]/).pop());

    cachedTree = await window.electronAPI.getFolderTree(repoPath);
    console.log('[Repo] Tree data loaded:', cachedTree);
    displayTree();
    updateGenerateState();
}

/* ----------------------------------------
 * Display tree
 * -------------------------------------- */
function displayTree() {
    console.log('[Tree] Displaying tree...');
    if (!cachedTree) {
        treeContainer.textContent = 'No data available';
        console.log('[Tree] No tree data');
        return;
    }

    renderTree(
        cachedTree,
        treeContainer,
        selectedItems,
        actionType,
        onTreeSelectionChange
    );
    console.log('[Tree] Tree rendered');
}

/* ----------------------------------------
 * Mode switching
 * -------------------------------------- */
function resetSelection() {
    selectedItems.length = 0;
    window.electronAPI.setLastSelected([]);
    console.log('[UI] Selection reset');
    updateGenerateState();
}

structureBtn.addEventListener('click', () => {
    actionType = 'structure';
    console.log('[UI] Switched to structure mode');
    resetSelection();
    displayTree();
});

codeBtn.addEventListener('click', () => {
    actionType = 'code';
    console.log('[UI] Switched to code mode');
    resetSelection();
    displayTree();
});

/* ----------------------------------------
 * Edit .docignore
 * -------------------------------------- */
editDocignoreBtn.addEventListener('click', async () => {
    console.log('[UI] Edit .docignore clicked');
    try {
        const ok = await window.electronAPI.openGlobalDocignore();
        console.log('[UI] .docignore opened:', ok);
        if (!ok) alert('Failed to open global ignore file.');
    } catch (err) {
        console.error('[UI] Error opening .docignore:', err);
    }
});

/* ----------------------------------------
 * Generate
 * -------------------------------------- */
generateBtn.addEventListener('click', async () => {
    console.log('[UI] Generate clicked');
    try {
        if (!selectedRepoPath || !selectedItems.length) {
            return alert('Select repo and items first!');
        }

        const { filePath } = await window.electronAPI.saveFileDialog(actionType);
        console.log('[UI] Save file dialog result:', filePath);
        if (!filePath) return;

        progressBar.value = 0;
        progressText.textContent = '0%';

        const success = await window.electronAPI.generate(
            actionType,
            selectedRepoPath,
            selectedItems,
            filePath
        );

        if (success) {
            console.log(`[UI] Generation complete. File should open in VS Code or default editor: ${filePath}`);
        } else {
            alert('Generation failed.');
        }

        resetSelection();
        displayTree();
    } catch (err) {
        console.error('[Generate] Failed:', err);
        alert('Generation failed.');
    }
});

/* ----------------------------------------
 * Tree search
 * -------------------------------------- */
function flattenTree(tree, result = []) {
    for (const node of tree) {
        result.push(node);
        if (node.children?.length) flattenTree(node.children, result);
    }
    return result;
}

function expandPathParents(path) {
    let target = document.querySelector(`[data-node-path='${path}']`);
    while (target) {
        const wrapper = target.closest('.node-wrapper');
        if (!wrapper) break;
        const childrenContainer = wrapper.querySelector('.children');
        if (childrenContainer) childrenContainer.style.display = 'flex';
        const folderNode = wrapper.querySelector('.tree-node.folder');
        if (folderNode) folderNode.classList.add('folder-open');
        target = wrapper.parentElement.closest('.tree-node');
    }
}

function searchTree(query) {
    console.log('[Search] Query:', query);
    if (!cachedTree || !query) {
        searchSuggestions.style.display = 'none';
        console.log('[Search] No results, tree empty or query empty');
        return;
    }

    const flatList = flattenTree(cachedTree);
    const matches = flatList.filter(node => 
        node.name.toLowerCase().includes(query.toLowerCase())
    );

    console.log('[Search] Matches:', matches.map(m => m.name));

    searchSuggestions.innerHTML = '';
    matches.slice(0, 10).forEach(node => {
        const li = document.createElement('li');
        li.textContent = node.name;
        li.dataset.path = node.path;
        li.addEventListener('click', () => {
            selectSearchItem(node.path);
            searchSuggestions.style.display = 'none';
            treeSearchInput.value = '';
        });
        searchSuggestions.appendChild(li);
    });

    searchSuggestions.style.display = matches.length ? 'block' : 'none';
}

function selectSearchItem(path) {
    console.log('[Search] Selecting item:', path);
    expandPathParents(path); // ensure parent folders are open

    const target = document.querySelector(`[data-node-path='${path}']`);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Force animation replay (even if already highlighted)
    target.classList.remove('highlighted');
    void target.offsetWidth; // Force reflow to restart animation
    target.classList.add('highlighted');

    // Remove highlight after animation completes
    setTimeout(() => {
        target.classList.remove('highlighted');
    }, 1600);

    if (!selectedItems.includes(path)) {
        selectedItems.push(path);
        console.log('[Search] Item added to selection:', selectedItems);
        onTreeSelectionChange();
    }
}

treeSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    searchTree(query);
});

treeSearchInput.addEventListener('blur', () => {
    setTimeout(() => searchSuggestions.style.display = 'none', 200);
});

/* ----------------------------------------
 * Init
 * -------------------------------------- */
console.log('[Init] DOM content loaded, initializing...');
window.addEventListener('DOMContentLoaded', loadLastActiveRepo);