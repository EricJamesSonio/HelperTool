/**
 * filterManager.js
 * Handles extension filter chips, suggestions, tree filtering,
 * folder ignore/focus filtering, and ignore-list detection.
 */

const filterInput = document.getElementById('filterInput');
const activeFiltersEl = document.getElementById('activeFilters');
const extSuggestionsEl = document.getElementById('extSuggestions');

// ── Extension ignore panel elements ────────────────────────
const availableExtsEl = document.getElementById('availableExts');
const ignoredExtsEl = document.getElementById('ignoredExts');
const ignoreToggleBtn = document.getElementById('ignoreToggleBtn');
const ignorePanel = document.getElementById('ignorePanel');

// ── Folder filter panel elements ────────────────────────────
const folderToggleBtn = document.getElementById('folderToggleBtn');
const folderPanel = document.getElementById('folderPanel');
const availableFoldersEl = document.getElementById('availableFolders');
const ignoredFoldersEl = document.getElementById('ignoredFolders');
const focusedFoldersEl = document.getElementById('focusedFolders');

export const activeExtensions = new Set();   // empty = show all
export const ignoredExtensions = new Set();  // extensions hidden from tree
export const ignoredFolders = new Set();     // folders hidden from tree
export const focusedFolders = new Set();     // when non-empty, show ONLY these folders

let _displayTree = null;
let _getCachedTree = null;

// ── Panel visibility ────────────────────────────────────────
let ignorePanelOpen = false;
let folderPanelOpen = false;

if (ignoreToggleBtn && ignorePanel) {
    ignoreToggleBtn.addEventListener('click', () => {
        ignorePanelOpen = !ignorePanelOpen;
        if (ignorePanelOpen && folderPanelOpen) {
            folderPanelOpen = false;
            folderPanel?.classList.remove('open');
            folderToggleBtn?.classList.remove('active');
        }
        ignorePanel.classList.toggle('open', ignorePanelOpen);
        ignoreToggleBtn.classList.toggle('active', ignorePanelOpen);
        if (ignorePanelOpen) {
            const tree = _getCachedTree?.();
            if (tree) renderIgnorePanel(tree);
        }
    });
}

if (folderToggleBtn && folderPanel) {
    folderToggleBtn.addEventListener('click', () => {
        folderPanelOpen = !folderPanelOpen;
        if (folderPanelOpen && ignorePanelOpen) {
            ignorePanelOpen = false;
            ignorePanel?.classList.remove('open');
            ignoreToggleBtn?.classList.remove('active');
        }
        folderPanel.classList.toggle('open', folderPanelOpen);
        folderToggleBtn.classList.toggle('active', folderPanelOpen);
        if (folderPanelOpen) {
            const tree = _getCachedTree?.();
            if (tree) renderFolderPanel(tree);
        }
    });
}

/* ============================================================
   EXTENSION HELPERS
   ============================================================ */

function getPrimaryExtension(filename) {
    const dotIndex = filename.indexOf('.');
    if (dotIndex === -1) return '';
    return filename.slice(dotIndex + 1).toLowerCase();
}

export function collectExtensions(tree, exts = new Set()) {
    for (const node of tree) {
        if (node.type === 'file') {
            const ext = getPrimaryExtension(node.name);
            if (ext) exts.add(ext);
        }
        if (node.children?.length) collectExtensions(node.children, exts);
    }
    return exts;
}

/* ============================================================
   FOLDER HELPERS
   ============================================================ */

export function collectFolders(tree, folders = []) {
    for (const node of tree) {
        if (node.type === 'folder') {
            folders.push({ name: node.name, path: node.path });
            if (node.children?.length) collectFolders(node.children, folders);
        }
    }
    return folders;
}

function isInsideFolder(nodePath, folderPathSet) {
    for (const fp of folderPathSet) {
        if (nodePath === fp || nodePath.startsWith(fp + '\\') || nodePath.startsWith(fp + '/')) {
            return true;
        }
    }
    return false;
}

/* ============================================================
   TREE FILTERING
   ============================================================ */

export function filterTree(tree) {
    function filterNode(node) {
        if (node.type === 'file') {
            const ext = getPrimaryExtension(node.name);
            if (ignoredExtensions.has(ext)) return null;
            if (activeExtensions.size > 0 && !activeExtensions.has(ext)) return null;
            if (focusedFolders.size > 0 && !isInsideFolder(node.path, focusedFolders)) return null;
            return node;
        }

        if (node.type === 'folder') {
            if (ignoredFolders.has(node.path)) return null;

            if (focusedFolders.size > 0) {
                const isTarget = focusedFolders.has(node.path);
                const isAncestor = [...focusedFolders].some(fp =>
                    fp.startsWith(node.path + '\\') || fp.startsWith(node.path + '/')
                );
                if (!isTarget && !isAncestor) return null;
            }

            const filteredChildren = (node.children || []).map(filterNode).filter(Boolean);
            // Keep focused folders even if empty after filtering
            if (filteredChildren.length === 0 && focusedFolders.size === 0) return null;
            return { ...node, children: filteredChildren };
        }

        return node;
    }

    return tree.map(filterNode).filter(Boolean);
}

/* ============================================================
   FILTER BAR CHIPS
   ============================================================ */

export function renderFilterChips() {
    activeFiltersEl.innerHTML = '';

    activeExtensions.forEach(ext => {
        const chip = document.createElement('div');
        chip.className = 'filter-chip active';
        chip.innerHTML = `<span>.${ext}</span><button class="chip-remove" data-ext="${ext}">✕</button>`;
        chip.querySelector('.chip-remove').addEventListener('click', () => {
            activeExtensions.delete(ext);
            renderFilterChips();
            _displayTree();
        });
        activeFiltersEl.appendChild(chip);
    });

    ignoredFolders.forEach(fp => {
        const name = fp.split(/[/\\]/).pop();
        const chip = document.createElement('div');
        chip.className = 'filter-chip folder-ignored-chip';
        chip.title = fp;
        chip.innerHTML = `<span>🚫 ${name}</span><button class="chip-remove">✕</button>`;
        chip.querySelector('.chip-remove').addEventListener('click', () => {
            ignoredFolders.delete(fp);
            renderFilterChips();
            _displayTree();
            saveFolderFilters();
            const tree = _getCachedTree?.();
            if (tree && folderPanelOpen) renderFolderPanel(tree);
            updateFolderBadge();
        });
        activeFiltersEl.appendChild(chip);
    });

    focusedFolders.forEach(fp => {
        const name = fp.split(/[/\\]/).pop();
        const chip = document.createElement('div');
        chip.className = 'filter-chip folder-focused-chip';
        chip.title = fp;
        chip.innerHTML = `<span>🎯 ${name}</span><button class="chip-remove">✕</button>`;
        chip.querySelector('.chip-remove').addEventListener('click', () => {
            focusedFolders.delete(fp);
            renderFilterChips();
            _displayTree();
            saveFolderFilters();
            const tree = _getCachedTree?.();
            if (tree && folderPanelOpen) renderFolderPanel(tree);
            updateFolderBadge();
        });
        activeFiltersEl.appendChild(chip);
    });

    if (activeExtensions.size > 0) {
        const c = document.createElement('div');
        c.className = 'filter-chip clear-all';
        c.textContent = 'Clear ext';
        c.addEventListener('click', () => { activeExtensions.clear(); renderFilterChips(); _displayTree(); });
        activeFiltersEl.appendChild(c);
    }

    if (ignoredFolders.size > 0 || focusedFolders.size > 0) {
        const c = document.createElement('div');
        c.className = 'filter-chip clear-all';
        c.textContent = 'Clear folders';
        c.addEventListener('click', () => {
            ignoredFolders.clear();
            focusedFolders.clear();
            renderFilterChips();
            _displayTree();
            saveFolderFilters();
            const tree = _getCachedTree?.();
            if (tree && folderPanelOpen) renderFolderPanel(tree);
            updateFolderBadge();
        });
        activeFiltersEl.appendChild(c);
    }
}

/* ============================================================
   EXTENSION IGNORE PANEL
   ============================================================ */

export function renderIgnorePanel(tree) {
    if (!availableExtsEl || !ignoredExtsEl) return;

    const allExts = [...collectExtensions(tree)].sort();
    availableExtsEl.innerHTML = '';
    const available = allExts.filter(e => !ignoredExtensions.has(e));

    if (available.length === 0) {
        availableExtsEl.innerHTML = '<span class="ignore-empty">All extensions ignored</span>';
    } else {
        available.forEach(ext => {
            const chip = document.createElement('div');
            chip.className = 'ignore-chip available';
            chip.title = `Click to ignore .${ext} files`;
            chip.innerHTML = `<span>.${ext}</span><span class="ignore-chip-action">→ ignore</span>`;
            chip.addEventListener('click', () => {
                ignoredExtensions.add(ext);
                activeExtensions.delete(ext);
                renderFilterChips();
                renderIgnorePanel(tree);
                _displayTree();
                saveIgnoredExtensions();
            });
            availableExtsEl.appendChild(chip);
        });
    }

    ignoredExtsEl.innerHTML = '';
    if (ignoredExtensions.size === 0) {
        ignoredExtsEl.innerHTML = '<span class="ignore-empty">No extensions ignored</span>';
    } else {
        [...ignoredExtensions].sort().forEach(ext => {
            const chip = document.createElement('div');
            chip.className = 'ignore-chip ignored';
            chip.title = `Click to restore .${ext} files`;
            chip.innerHTML = `<span>.${ext}</span><button class="ignore-chip-remove">✕</button>`;
            chip.querySelector('.ignore-chip-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                ignoredExtensions.delete(ext);
                renderIgnorePanel(tree);
                _displayTree();
                saveIgnoredExtensions();
            });
            ignoredExtsEl.appendChild(chip);
        });
        const clearAll = document.createElement('div');
        clearAll.className = 'ignore-chip ignore-clear-all';
        clearAll.textContent = 'Restore all';
        clearAll.addEventListener('click', () => {
            ignoredExtensions.clear();
            renderIgnorePanel(tree);
            _displayTree();
            saveIgnoredExtensions();
        });
        ignoredExtsEl.appendChild(clearAll);
    }

    if (ignoreToggleBtn) {
        const badge = ignoreToggleBtn.querySelector('.ignore-badge');
        if (badge) {
            badge.textContent = ignoredExtensions.size || '';
            badge.style.display = ignoredExtensions.size > 0 ? 'inline-flex' : 'none';
        }
    }
}

/* ============================================================
   FOLDER FILTER PANEL
   ============================================================ */

export function renderFolderPanel(tree) {
    if (!availableFoldersEl) return;

    const allFolders = collectFolders(tree);
    const usedPaths = new Set([...ignoredFolders, ...focusedFolders]);
    const available = allFolders.filter(f => !usedPaths.has(f.path));

    // ── Available ──────────────────────────────────────────────
    availableFoldersEl.innerHTML = '';
    if (available.length === 0) {
        availableFoldersEl.innerHTML = '<span class="ignore-empty">No folders available</span>';
    } else {
        available.forEach(folder => {
            const chip = document.createElement('div');
            chip.className = 'ignore-chip available folder-chip';
            chip.title = folder.path;

            const nameEl = document.createElement('span');
            nameEl.className = 'folder-chip-name';
            nameEl.textContent = '📁 ' + folder.name;

            const actions = document.createElement('span');
            actions.className = 'folder-chip-actions';

            const ignoreBtn = document.createElement('button');
            ignoreBtn.className = 'folder-action-btn ignore-action-btn';
            ignoreBtn.textContent = '🚫 Ignore';
            ignoreBtn.title = 'Hide this folder from tree';

            const focusBtn = document.createElement('button');
            focusBtn.className = 'folder-action-btn focus-action-btn';
            focusBtn.textContent = '🎯 Focus';
            focusBtn.title = 'Show ONLY this folder in tree';

            actions.appendChild(ignoreBtn);
            actions.appendChild(focusBtn);
            chip.appendChild(nameEl);
            chip.appendChild(actions);

            ignoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                ignoredFolders.add(folder.path);
                focusedFolders.delete(folder.path);
                renderFilterChips();
                renderFolderPanel(tree);
                _displayTree();
                saveFolderFilters();
                updateFolderBadge();
            });

            focusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                focusedFolders.add(folder.path);
                ignoredFolders.delete(folder.path);
                renderFilterChips();
                renderFolderPanel(tree);
                _displayTree();
                saveFolderFilters();
                updateFolderBadge();
            });

            availableFoldersEl.appendChild(chip);
        });
    }

    // ── Ignored ────────────────────────────────────────────────
    if (ignoredFoldersEl) {
        ignoredFoldersEl.innerHTML = '';
        if (ignoredFolders.size === 0) {
            ignoredFoldersEl.innerHTML = '<span class="ignore-empty">None ignored</span>';
        } else {
            [...ignoredFolders].forEach(fp => {
                const name = fp.split(/[/\\]/).pop();
                const chip = document.createElement('div');
                chip.className = 'ignore-chip ignored folder-chip';
                chip.title = fp;
                chip.innerHTML = `<span>🚫 ${name}</span><button class="ignore-chip-remove">✕</button>`;
                chip.querySelector('.ignore-chip-remove').addEventListener('click', (e) => {
                    e.stopPropagation();
                    ignoredFolders.delete(fp);
                    renderFilterChips();
                    renderFolderPanel(tree);
                    _displayTree();
                    saveFolderFilters();
                    updateFolderBadge();
                });
                ignoredFoldersEl.appendChild(chip);
            });
            const clearAll = document.createElement('div');
            clearAll.className = 'ignore-chip ignore-clear-all';
            clearAll.textContent = 'Restore all';
            clearAll.addEventListener('click', () => {
                ignoredFolders.clear();
                renderFilterChips();
                renderFolderPanel(tree);
                _displayTree();
                saveFolderFilters();
                updateFolderBadge();
            });
            ignoredFoldersEl.appendChild(clearAll);
        }
    }

    // ── Focused ────────────────────────────────────────────────
    if (focusedFoldersEl) {
        focusedFoldersEl.innerHTML = '';
        if (focusedFolders.size === 0) {
            focusedFoldersEl.innerHTML = '<span class="ignore-empty">None focused — all visible</span>';
        } else {
            [...focusedFolders].forEach(fp => {
                const name = fp.split(/[/\\]/).pop();
                const chip = document.createElement('div');
                chip.className = 'ignore-chip focused folder-chip';
                chip.title = fp;
                chip.innerHTML = `<span>🎯 ${name}</span><button class="ignore-chip-remove">✕</button>`;
                chip.querySelector('.ignore-chip-remove').addEventListener('click', (e) => {
                    e.stopPropagation();
                    focusedFolders.delete(fp);
                    renderFilterChips();
                    renderFolderPanel(tree);
                    _displayTree();
                    saveFolderFilters();
                    updateFolderBadge();
                });
                focusedFoldersEl.appendChild(chip);
            });
            const clearAll = document.createElement('div');
            clearAll.className = 'ignore-chip ignore-clear-all';
            clearAll.textContent = 'Clear focus';
            clearAll.addEventListener('click', () => {
                focusedFolders.clear();
                renderFilterChips();
                renderFolderPanel(tree);
                _displayTree();
                saveFolderFilters();
                updateFolderBadge();
            });
            focusedFoldersEl.appendChild(clearAll);
        }
    }

    updateFolderBadge();
}

function updateFolderBadge() {
    if (!folderToggleBtn) return;
    const badge = folderToggleBtn.querySelector('.folder-badge');
    if (!badge) return;
    const total = ignoredFolders.size + focusedFolders.size;
    badge.textContent = total || '';
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
}

/* ============================================================
   PERSISTENCE
   ============================================================ */

async function saveIgnoredExtensions() {
    try { await window.electronAPI?.setIgnoredExtensions?.([...ignoredExtensions]); } catch (e) {}
}

async function saveFolderFilters() {
    try {
        await window.electronAPI?.setFolderFilters?.({
            ignored: [...ignoredFolders],
            focused: [...focusedFolders],
        });
    } catch (e) {}
}

export async function loadIgnoredExtensions() {
    try {
        const saved = await window.electronAPI?.getIgnoredExtensions?.();
        if (Array.isArray(saved)) saved.forEach(e => ignoredExtensions.add(e));
    } catch (e) {}
}

export async function loadFolderFilters() {
    try {
        const saved = await window.electronAPI?.getFolderFilters?.();
        if (saved?.ignored) saved.ignored.forEach(p => ignoredFolders.add(p));
        if (saved?.focused) saved.focused.forEach(p => focusedFolders.add(p));
        updateFolderBadge();
    } catch (e) {}
}

/* ============================================================
   EXT SUGGESTIONS
   ============================================================ */

function showExtSuggestions(allExts, query) {
    const filtered = allExts.filter(e =>
        e.includes(query) && !activeExtensions.has(e) && !ignoredExtensions.has(e)
    );
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
            _displayTree();
        });
        extSuggestionsEl.appendChild(li);
    });
    extSuggestionsEl.style.display = 'block';
}

function hideExtSuggestions() {
    extSuggestionsEl.style.display = 'none';
}

export function setupFilterInput(getCachedTree, displayTree) {
    _displayTree = displayTree;
    _getCachedTree = getCachedTree;

    filterInput.addEventListener('focus', () => {
        if (!getCachedTree()) return;
        const allExts = [...collectExtensions(getCachedTree())].sort();
        showExtSuggestions(allExts, filterInput.value.trim());
    });

    filterInput.addEventListener('input', () => {
        if (!getCachedTree()) return;
        const allExts = [...collectExtensions(getCachedTree())].sort();
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
                _displayTree();
            }
        }
        if (e.key === 'Escape') hideExtSuggestions();
    });

    filterInput.addEventListener('blur', () => {
        setTimeout(hideExtSuggestions, 200);
    });
}