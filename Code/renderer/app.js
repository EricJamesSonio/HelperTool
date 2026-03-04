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
const selectionCount = document.getElementById('selectionCount');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const refreshBtn = document.getElementById('refreshBtn');
const filterContainer = document.getElementById('filterContainer');
const filterInput = document.getElementById('filterInput');
const activeFiltersEl = document.getElementById('activeFilters');

let selectedRepoPath = null;
let selectedItems = [];
let actionType = 'code';
let cachedTree = null;

// Extension filter state
let activeExtensions = new Set(); // empty = show all

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
    activeRepoName.textContent = name || 'No repo selected';
}

function updateSelectionCounter() {
    const count = selectedItems.length;
    selectionCount.textContent = count;
    if (count > 0) {
        selectionCount.parentElement.classList.add('has-selections');
    } else {
        selectionCount.parentElement.classList.remove('has-selections');
    }
}

function updateGenerateState() {
    generateBtn.disabled = selectedItems.length === 0;
    updateSelectionCounter();
}

/* ----------------------------------------
 * Extension Filter Logic
 * -------------------------------------- */

/**
 * Collect all unique extensions from a tree
 */
function collectExtensions(tree, exts = new Set()) {
    for (const node of tree) {
        if (node.type === 'file') {
            const ext = node.name.includes('.') ? node.name.split('.').pop().toLowerCase() : '';
            if (ext) exts.add(ext);
        }
        if (node.children?.length) collectExtensions(node.children, exts);
    }
    return exts;
}

/**
 * Filter tree by active extensions (deep clone with filtering)
 */
function filterTree(tree) {
    if (activeExtensions.size === 0) return tree; // no filter = show all

    function filterNode(node) {
        if (node.type === 'file') {
            const ext = node.name.includes('.') ? node.name.split('.').pop().toLowerCase() : '';
            return activeExtensions.has(ext) ? node : null;
        }
        if (node.type === 'folder') {
            const filteredChildren = (node.children || [])
                .map(filterNode)
                .filter(Boolean);
            // Only include folder if it has visible children
            if (filteredChildren.length === 0) return null;
            return { ...node, children: filteredChildren };
        }
        return node;
    }

    return tree.map(filterNode).filter(Boolean);
}

function renderFilterChips() {
    activeFiltersEl.innerHTML = '';

    activeExtensions.forEach(ext => {
        const chip = document.createElement('div');
        chip.className = 'filter-chip active';
        chip.innerHTML = `<span>.${ext}</span><button class="chip-remove" data-ext="${ext}">✕</button>`;
        chip.querySelector('.chip-remove').addEventListener('click', () => {
            activeExtensions.delete(ext);
            renderFilterChips();
            displayTree();
        });
        activeFiltersEl.appendChild(chip);
    });

    // Show/hide clear-all chip
    if (activeExtensions.size > 0) {
        const clearChip = document.createElement('div');
        clearChip.className = 'filter-chip clear-all';
        clearChip.textContent = 'Clear filters';
        clearChip.addEventListener('click', () => {
            activeExtensions.clear();
            renderFilterChips();
            displayTree();
        });
        activeFiltersEl.appendChild(clearChip);
    }
}

function setupFilterInput() {
    // Populate extension suggestions on focus
    filterInput.addEventListener('focus', () => {
        if (!cachedTree) return;
        const allExts = [...collectExtensions(cachedTree)].sort();
        showExtSuggestions(allExts, filterInput.value.trim());
    });

    filterInput.addEventListener('input', () => {
        if (!cachedTree) return;
        const allExts = [...collectExtensions(cachedTree)].sort();
        showExtSuggestions(allExts, filterInput.value.trim().toLowerCase());
    });

    filterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = filterInput.value.trim().replace(/^\./, '').toLowerCase();
            if (val) {
                activeExtensions.add(val);
                filterInput.value = '';
                hideExtSuggestions();
                renderFilterChips();
                displayTree();
            }
        }
        if (e.key === 'Escape') {
            hideExtSuggestions();
        }
    });

    filterInput.addEventListener('blur', () => {
        setTimeout(hideExtSuggestions, 200);
    });
}

const extSuggestionsEl = document.getElementById('extSuggestions');

function showExtSuggestions(allExts, query) {
    const filtered = allExts.filter(e => e.includes(query) && !activeExtensions.has(e));
    extSuggestionsEl.innerHTML = '';
    if (!filtered.length) { extSuggestionsEl.style.display = 'none'; return; }

    filtered.slice(0, 8).forEach(ext => {
        const li = document.createElement('li');
        li.textContent = `.${ext}`;
        li.addEventListener('click', () => {
            activeExtensions.add(ext);
            filterInput.value = '';
            hideExtSuggestions();
            renderFilterChips();
            displayTree();
        });
        extSuggestionsEl.appendChild(li);
    });
    extSuggestionsEl.style.display = 'block';
}

function hideExtSuggestions() {
    extSuggestionsEl.style.display = 'none';
}

/* ----------------------------------------
 * Tree selection callback
 * -------------------------------------- */
function onTreeSelectionChange() {
    updateGenerateState();
    window.electronAPI.setLastSelected(selectedItems);
}

/* ----------------------------------------
 * Clear Selection Button
 * -------------------------------------- */
clearSelectionBtn.addEventListener('click', () => {
    selectedItems.length = 0;
    window.electronAPI.setLastSelected([]);
    updateGenerateState();
    displayTree();
});

/* ----------------------------------------
 * Refresh Button — reload folder tree
 * -------------------------------------- */
refreshBtn.addEventListener('click', async () => {
    if (!selectedRepoPath) return;
    console.log('[UI] Refresh clicked');
    refreshBtn.classList.add('spinning');
    refreshBtn.disabled = true;

    try {
        cachedTree = await window.electronAPI.getFolderTree(selectedRepoPath);
        renderFilterChips(); // refresh available extensions
        displayTree();
        console.log('[UI] Tree refreshed');
    } catch (err) {
        console.error('[UI] Refresh failed:', err);
    } finally {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
    }
});

/* ----------------------------------------
 * Open storage
 * -------------------------------------- */
openStorageBtn.addEventListener('click', async () => {
    try {
        await window.electronAPI.openStorage();
    } catch (err) {
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
    activeExtensions.clear();
    renderFilterChips();
    displayTree();
    updateGenerateState();
}

/* ----------------------------------------
 * Display tree (applies extension filter)
 * -------------------------------------- */
function displayTree() {
    if (!cachedTree) {
        treeContainer.textContent = 'No data available';
        return;
    }

    const visibleTree = filterTree(cachedTree);

    renderTree(
        visibleTree,
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
generateBtn.addEventListener('click', async () => {
    try {
        if (!selectedRepoPath || !selectedItems.length) {
            return alert('Select repo and items first!');
        }

        const { filePath } = await window.electronAPI.saveFileDialog(actionType);
        if (!filePath) return;

        progressBar.value = 0;
        progressText.textContent = '0%';

        const success = await window.electronAPI.generate(
            actionType,
            selectedRepoPath,
            selectedItems,
            filePath
        );

        if (!success) alert('Generation failed.');

        resetSelection();
        displayTree();
    } catch (err) {
        console.error('[Generate] Failed:', err);
        alert('Generation failed.');
    }
});

/* ----------------------------------------
 * Tree search — IMPROVED with full paths
 * -------------------------------------- */
function flattenTree(tree, result = [], parentPath = '') {
    for (const node of tree) {
        // Build display path relative to repo root
        const displayPath = parentPath ? `${parentPath}/${node.name}` : node.name;
        result.push({ ...node, displayPath });
        if (node.children?.length) flattenTree(node.children, result, displayPath);
    }
    return result;
}

function expandPathParents(nodePath) {
    const wrapper = document.querySelector(`[data-node-path='${CSS.escape(nodePath)}']`);
    if (!wrapper) return;

    let current = wrapper.parentElement;
    while (current && current !== treeContainer) {
        if (current.classList.contains('node-wrapper')) {
            const childrenContainer = current.querySelector(':scope > .children');
            const folderNode = current.querySelector(':scope > .tree-node.folder');
            if (childrenContainer) childrenContainer.style.display = 'flex';
            if (folderNode) {
                folderNode.classList.add('folder-open');
                const folderPath = current.dataset.nodePath;
                if (folderPath && window._expandedFolders) {
                    window._expandedFolders.set(folderPath, true);
                }
            }
        }
        current = current.parentElement;
    }
}

function searchTree(query) {
    if (!cachedTree || !query) {
        searchSuggestions.style.display = 'none';
        return;
    }

    // Flatten with full display paths
    const flatList = flattenTree(cachedTree);
    const q = query.toLowerCase();

    // Match against both name and full path
    const matches = flatList.filter(node =>
        node.name.toLowerCase().includes(q) ||
        node.displayPath.toLowerCase().includes(q)
    );

    searchSuggestions.innerHTML = '';
    matches.slice(0, 12).forEach(node => {
        const li = document.createElement('li');
        li.className = 'search-result-item';

        // Show full path for disambiguation
        const nameSpan = document.createElement('span');
        nameSpan.className = 'result-name';
        nameSpan.textContent = node.name;

        const pathSpan = document.createElement('span');
        pathSpan.className = 'result-path';
        // Show parent path only (not the name itself) for cleanliness
        const parentPath = node.displayPath.includes('/')
            ? node.displayPath.substring(0, node.displayPath.lastIndexOf('/'))
            : '';
        pathSpan.textContent = parentPath ? `📁 ${parentPath}` : '(root)';

        li.appendChild(nameSpan);
        li.appendChild(pathSpan);

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
    expandPathParents(path);

    setTimeout(() => {
        const wrapper = document.querySelector(`[data-node-path='${CSS.escape(path)}']`);
        if (!wrapper) return;

        const treeNode = wrapper.querySelector(':scope > .tree-node');
        if (!treeNode) return;

        treeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const orig = {
            bg: treeNode.style.background,
            shadow: treeNode.style.boxShadow,
            border: treeNode.style.borderColor,
            color: treeNode.style.color,
            transform: treeNode.style.transform,
            transition: treeNode.style.transition,
        };

        treeNode.style.transition = 'all 0.3s ease';
        treeNode.style.background = 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)';
        treeNode.style.boxShadow = '0 0 0 6px rgba(156, 39, 176, 0.8), 0 0 35px rgba(106, 27, 154, 1)';
        treeNode.style.borderColor = '#9c27b0';
        treeNode.style.color = '#fff';
        treeNode.style.transform = 'scale(1.2)';
        treeNode.style.zIndex = '1000';

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

        setTimeout(() => {
            treeNode.style.transition = 'all 0.5s ease';
            Object.assign(treeNode.style, {
                background: orig.bg,
                boxShadow: orig.shadow,
                borderColor: orig.border,
                color: orig.color,
                transform: orig.transform,
                zIndex: '',
            });
            setTimeout(() => { treeNode.style.transition = orig.transition; }, 500);
        }, 2500);
    }, 150);
}

treeSearchInput.addEventListener('input', (e) => {
    searchTree(e.target.value.trim());
});

treeSearchInput.addEventListener('blur', () => {
    setTimeout(() => searchSuggestions.style.display = 'none', 200);
});

/* ----------------------------------------
 * Init
 * -------------------------------------- */
setupFilterInput();
console.log('[Init] DOM content loaded, initializing...');
window.addEventListener('DOMContentLoaded', loadLastActiveRepo);