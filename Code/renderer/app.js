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
    console.log('[Search] Expanding parents for:', path);
    
    // Find the wrapper element by data attribute
    const wrapper = document.querySelector(`[data-node-path='${CSS.escape(path)}']`);
    if (!wrapper) {
        console.log('[Search] Wrapper not found for path:', path);
        return;
    }
    
    // Traverse up and expand all parent folders
    let current = wrapper.parentElement;
    while (current && current !== treeContainer) {
        if (current.classList.contains('node-wrapper')) {
            const childrenContainer = current.querySelector(':scope > .children');
            const folderNode = current.querySelector(':scope > .tree-node.folder');
            
            if (childrenContainer) {
                childrenContainer.style.display = 'flex';
                console.log('[Search] Expanded children container');
            }
            if (folderNode) {
                folderNode.classList.add('folder-open');
                // Update expansion state
                const folderPath = current.dataset.nodePath;
                if (folderPath && window._expandedFolders) {
                    window._expandedFolders.set(folderPath, true);
                }
                console.log('[Search] Opened folder node');
            }
        }
        current = current.parentElement;
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
    console.log('[Search] Showing item:', path);
    
    // First expand all parent folders
    expandPathParents(path);
    
    // Small delay to ensure DOM updates are complete
    setTimeout(() => {
        // Find the wrapper with the matching path
        const wrapper = document.querySelector(`[data-node-path='${CSS.escape(path)}']`);
        if (!wrapper) {
            console.log('[Search] Could not find wrapper for path:', path);
            return;
        }
        
        console.log('[Search] Wrapper found:', wrapper);
        
        // Get the actual tree-node element inside the wrapper
        const treeNode = wrapper.querySelector(':scope > .tree-node');
        if (!treeNode) {
            console.log('[Search] Could not find tree-node element');
            return;
        }

        console.log('[Search] Tree node found:', treeNode);
        console.log('[Search] Tree node classes before:', treeNode.className);

        // Scroll the tree node into view
        treeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('[Search] Scrolled to node');

        // Store original styles
        const originalBackground = treeNode.style.background;
        const originalBoxShadow = treeNode.style.boxShadow;
        const originalBorderColor = treeNode.style.borderColor;
        const originalColor = treeNode.style.color;
        const originalTransform = treeNode.style.transform;
        const originalTransition = treeNode.style.transition;

        // Apply PURPLE highlight directly via inline styles
        treeNode.style.transition = 'all 0.3s ease';
        treeNode.style.background = 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)';
        treeNode.style.boxShadow = '0 0 0 6px rgba(156, 39, 176, 0.8), 0 0 35px rgba(106, 27, 154, 1)';
        treeNode.style.borderColor = '#9c27b0';
        treeNode.style.color = '#fff';
        treeNode.style.transform = 'scale(1.2)';
        treeNode.style.zIndex = '1000';
        
        console.log('[Search] Applied PURPLE highlight via inline styles');

        // Fade effect: gradually reduce intensity
        setTimeout(() => {
            treeNode.style.transition = 'all 1s ease';
            treeNode.style.background = 'linear-gradient(135deg, #ba68c8 0%, #9c27b0 100%)';
            treeNode.style.boxShadow = '0 0 0 4px rgba(156, 39, 176, 0.6), 0 0 25px rgba(106, 27, 154, 0.7)';
            treeNode.style.transform = 'scale(1.15)';
        }, 800);

        setTimeout(() => {
            treeNode.style.background = 'linear-gradient(135deg, #ce93d8 0%, #ba68c8 100%)';
            treeNode.style.boxShadow = '0 0 0 2px rgba(156, 39, 176, 0.4), 0 0 15px rgba(106, 27, 154, 0.5)';
            treeNode.style.transform = 'scale(1.08)';
        }, 1600);

        // Remove highlight and restore original styles
        setTimeout(() => {
            treeNode.style.transition = 'all 0.5s ease';
            treeNode.style.background = originalBackground;
            treeNode.style.boxShadow = originalBoxShadow;
            treeNode.style.borderColor = originalBorderColor;
            treeNode.style.color = originalColor;
            treeNode.style.transform = originalTransform;
            treeNode.style.zIndex = '';
            
            setTimeout(() => {
                treeNode.style.transition = originalTransition;
                console.log('[Search] Removed highlight and restored original styles');
            }, 500);
        }, 2500);
    }, 150);
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