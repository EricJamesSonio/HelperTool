/**
 * filterManager.js
 * Handles extension filter chips, tree filtering,
 * folder ignore/focus filtering, and ignore-list detection.
 *
 * CHANGES:
 *  - Folders sorted alphabetically in the panel
 *  - When a folder is focused/ignored, all its subfolders are also added
 */

// ── Filter Ext panel ─────────────────────────────────────
const filterToggleBtn       = document.getElementById('filterToggleBtn');
const filterPanel           = document.getElementById('filterPanel');
const availableFilterExtsEl = document.getElementById('availableFilterExts');
const activeFilterExtsEl    = document.getElementById('activeFilterExts');
const extFilterCount        = document.getElementById('extFilterCount');

// ── Ignore Ext panel ─────────────────────────────────────
const availableExtsEl  = document.getElementById('availableExts');
const ignoredExtsEl    = document.getElementById('ignoredExts');
const extIgnoredCount  = document.getElementById('extIgnoredCount');
const ignoreToggleBtn  = document.getElementById('ignoreToggleBtn');
const ignorePanel      = document.getElementById('ignorePanel');

// ── Folder panel ─────────────────────────────────────────
const folderToggleBtn    = document.getElementById('folderToggleBtn');
const folderPanel        = document.getElementById('folderPanel');
const availableFoldersEl = document.getElementById('availableFolders');
const ignoredFoldersEl   = document.getElementById('ignoredFolders');
const focusedFoldersEl   = document.getElementById('focusedFolders');
const folderIgnoredCount = document.getElementById('folderIgnoredCount');
const folderFocusedCount = document.getElementById('folderFocusedCount');

// ── State ─────────────────────────────────────────────────
export const activeExtensions  = new Set(); // filter-by exts
export const ignoredExtensions = new Set(); // hidden exts
export const ignoredFolders    = new Set();
export const focusedFolders    = new Set();

let _displayTree   = null;
let _getCachedTree = null;

let filterPanelOpen = false;
let ignorePanelOpen = false;
let folderPanelOpen = false;

/* ============================================================
   PANEL TOGGLE HELPERS
   ============================================================ */

function closeAllPanels(except) {
    if (except !== 'filter' && filterPanelOpen) {
        filterPanelOpen = false;
        filterPanel?.classList.remove('open');
        filterToggleBtn?.classList.remove('active');
    }
    if (except !== 'ignore' && ignorePanelOpen) {
        ignorePanelOpen = false;
        ignorePanel?.classList.remove('open');
        ignoreToggleBtn?.classList.remove('active');
    }
    if (except !== 'folder' && folderPanelOpen) {
        folderPanelOpen = false;
        folderPanel?.classList.remove('open');
        folderToggleBtn?.classList.remove('active');
    }
}

/* ── Filter Ext toggle ───────────────────────────────────── */
if (filterToggleBtn && filterPanel) {
    filterToggleBtn.addEventListener('click', () => {
        filterPanelOpen = !filterPanelOpen;
        if (filterPanelOpen) closeAllPanels('filter');
        filterPanel.classList.toggle('open', filterPanelOpen);
        filterToggleBtn.classList.toggle('active', filterPanelOpen);
        if (filterPanelOpen) {
            const tree = _getCachedTree?.();
            if (tree) renderFilterPanel(tree);
        }
    });
}

/* ── Ignore Ext toggle ───────────────────────────────────── */
if (ignoreToggleBtn && ignorePanel) {
    ignoreToggleBtn.addEventListener('click', () => {
        ignorePanelOpen = !ignorePanelOpen;
        if (ignorePanelOpen) closeAllPanels('ignore');
        ignorePanel.classList.toggle('open', ignorePanelOpen);
        ignoreToggleBtn.classList.toggle('active', ignorePanelOpen);
        if (ignorePanelOpen) {
            const tree = _getCachedTree?.();
            if (tree) renderIgnorePanel(tree);
        }
    });
}

/* ── Folder toggle ───────────────────────────────────────── */
if (folderToggleBtn && folderPanel) {
    folderToggleBtn.addEventListener('click', () => {
        folderPanelOpen = !folderPanelOpen;
        if (folderPanelOpen) closeAllPanels('folder');
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
    // Sort alphabetically by name (case-insensitive)
    folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return folders;
}

/**
 * Collect all descendant folder paths under a given folder path.
 * Flattens entire tree first, then filters by path prefix.
 */
function collectSubfolderPaths(tree, targetPath, result) {
    if (!result) result = [];
    const allFolders = [];
    function flatten(nodes) {
        for (const node of nodes) {
            if (node.type === 'folder') {
                allFolders.push(node);
                if (node.children && node.children.length) flatten(node.children);
            }
        }
    }
    flatten(tree);
    for (const node of allFolders) {
        if (node.path !== targetPath && (
            node.path.startsWith(targetPath + '\\') ||
            node.path.startsWith(targetPath + '/')
        )) {
            result.push(node.path);
        }
    }
    return result;
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
            // File is hidden if it lives inside an ignored folder (ignore always wins)
            if (isInsideFolder(node.path, ignoredFolders)) return null;
            // File visible only if it lives inside a focused folder
            if (focusedFolders.size > 0 && !isInsideFolder(node.path, focusedFolders)) return null;
            return node;
        }
        if (node.type === 'folder') {
            // Ignore always wins — even if parent is focused
            if (ignoredFolders.has(node.path)) return null;
            if (focusedFolders.size > 0) {
                const isFocused    = focusedFolders.has(node.path);
                const isAncestor   = [...focusedFolders].some(fp =>
                    fp.startsWith(node.path + '\\') || fp.startsWith(node.path + '/')
                );
                const isDescendant = isInsideFolder(node.path, focusedFolders);
                if (!isFocused && !isAncestor && !isDescendant) return null;
            }
            const filteredChildren = (node.children || []).map(filterNode).filter(Boolean);
            if (filteredChildren.length === 0 && focusedFolders.size === 0) return null;
            return { ...node, children: filteredChildren };
        }
        return node;
    }
    return tree.map(filterNode).filter(Boolean);
}

/* ============================================================
   FILTER EXT PANEL
   ============================================================ */

export function renderFilterChips() {
    updateFilterBadge();
    const tree = _getCachedTree?.();
    if (tree && filterPanelOpen) renderFilterPanel(tree);
}

function renderFilterPanel(tree) {
    if (!availableFilterExtsEl || !activeFilterExtsEl) return;

    const allExts   = [...collectExtensions(tree)].sort();
    const available = allExts.filter(e => !activeExtensions.has(e) && !ignoredExtensions.has(e));

    // ── Available column ──
    availableFilterExtsEl.innerHTML = '';
    if (available.length === 0) {
        availableFilterExtsEl.innerHTML = '<div class="chip-empty">No extensions to filter</div>';
    } else {
        available.forEach(ext => {
            const chip = document.createElement('div');
            chip.className = 'ext-filter-chip';
            chip.innerHTML = `<span>.${ext}</span><span class="chip-arrow">→ filter</span>`;
            chip.addEventListener('click', () => {
                activeExtensions.add(ext);
                renderFilterPanel(tree);
                updateFilterBadge();
                _displayTree?.();
            });
            availableFilterExtsEl.appendChild(chip);
        });
    }

    // ── Active filters column ──
    activeFilterExtsEl.innerHTML = '';
    if (extFilterCount) extFilterCount.textContent = activeExtensions.size || '';

    if (activeExtensions.size === 0) {
        activeFilterExtsEl.innerHTML = '<div class="chip-empty">None — all shown</div>';
    } else {
        [...activeExtensions].sort().forEach(ext => {
            const chip = document.createElement('div');
            chip.className = 'ext-filter-chip-active';
            chip.innerHTML = `<span>.${ext}</span>`;

            const btn = document.createElement('button');
            btn.className = 'chip-remove-btn';
            btn.textContent = '✕';
            btn.addEventListener('click', () => {
                activeExtensions.delete(ext);
                renderFilterPanel(tree);
                updateFilterBadge();
                _displayTree?.();
            });
            chip.appendChild(btn);
            activeFilterExtsEl.appendChild(chip);
        });

        const clear = document.createElement('div');
        clear.className = 'chip-restore-all';
        clear.textContent = 'Clear all filters';
        clear.addEventListener('click', () => {
            activeExtensions.clear();
            renderFilterPanel(tree);
            updateFilterBadge();
            _displayTree?.();
        });
        activeFilterExtsEl.appendChild(clear);
    }

    updateFilterBadge();
}

function updateFilterBadge() {
    const badge = filterToggleBtn?.querySelector('.filter-badge');
    if (!badge) return;
    badge.textContent = activeExtensions.size || '';
    badge.style.display = activeExtensions.size > 0 ? 'inline-flex' : 'none';
}

/* ============================================================
   EXTENSION IGNORE PANEL
   ============================================================ */

export function renderIgnorePanel(tree) {
    if (!availableExtsEl || !ignoredExtsEl) return;

    const allExts  = [...collectExtensions(tree)].sort();
    const available = allExts.filter(e => !ignoredExtensions.has(e));

    // ── Available column ──
    availableExtsEl.innerHTML = '';
    if (available.length === 0) {
        availableExtsEl.innerHTML = '<div class="chip-empty">All extensions ignored</div>';
    } else {
        available.forEach(ext => {
            const chip = document.createElement('div');
            chip.className = 'ext-chip';
            chip.innerHTML = `<span>.${ext}</span><span class="chip-arrow">→ ignore</span>`;
            chip.addEventListener('click', () => {
                ignoredExtensions.add(ext);
                activeExtensions.delete(ext);
                renderIgnorePanel(tree);
                if (filterPanelOpen) renderFilterPanel(tree);
                updateFilterBadge();
                _displayTree?.();
                saveIgnoredExtensions();
                updateExtBadge();
            });
            availableExtsEl.appendChild(chip);
        });
    }

    // ── Ignored column ──
    ignoredExtsEl.innerHTML = '';
    if (extIgnoredCount) extIgnoredCount.textContent = ignoredExtensions.size || '';

    if (ignoredExtensions.size === 0) {
        ignoredExtsEl.innerHTML = '<div class="chip-empty">None ignored</div>';
    } else {
        [...ignoredExtensions].sort().forEach(ext => {
            const chip = document.createElement('div');
            chip.className = 'ext-chip-ignored';
            chip.innerHTML = `<span>.${ext}</span>`;

            const btn = document.createElement('button');
            btn.className = 'chip-remove-btn';
            btn.textContent = '✕';
            btn.addEventListener('click', () => {
                ignoredExtensions.delete(ext);
                renderIgnorePanel(tree);
                if (filterPanelOpen) renderFilterPanel(tree);
                _displayTree?.();
                saveIgnoredExtensions();
                updateExtBadge();
            });
            chip.appendChild(btn);
            ignoredExtsEl.appendChild(chip);
        });

        const restore = document.createElement('div');
        restore.className = 'chip-restore-all';
        restore.textContent = 'Restore all';
        restore.addEventListener('click', () => {
            ignoredExtensions.clear();
            renderIgnorePanel(tree);
            if (filterPanelOpen) renderFilterPanel(tree);
            _displayTree?.();
            saveIgnoredExtensions();
            updateExtBadge();
        });
        ignoredExtsEl.appendChild(restore);
    }

    updateExtBadge();
}

function updateExtBadge() {
    const badge = ignoreToggleBtn?.querySelector('.ignore-badge');
    if (!badge) return;
    badge.textContent = ignoredExtensions.size || '';
    badge.style.display = ignoredExtensions.size > 0 ? 'inline-flex' : 'none';
}

/* ============================================================
   FOLDER FILTER PANEL
   ============================================================ */

export function renderFolderPanel(tree) {
    if (!availableFoldersEl) return;

    // collectFolders already returns sorted alphabetically
    const allFolders = collectFolders(tree);
    const usedPaths  = new Set([...ignoredFolders, ...focusedFolders]);
    const available  = allFolders.filter(f => !usedPaths.has(f.path));

    // ── Available column ──
    availableFoldersEl.innerHTML = '';
    if (available.length === 0) {
        availableFoldersEl.innerHTML = '<div class="chip-empty">No folders available</div>';
    } else {
        available.forEach(folder => {
            const row = document.createElement('div');
            row.className = 'folder-row';
            row.title = folder.path;

            const name = document.createElement('span');
            name.className = 'folder-row-name';
            name.textContent = '📁 ' + folder.name;

            const actions = document.createElement('div');
            actions.className = 'folder-row-actions';

            const ignBtn = document.createElement('button');
            ignBtn.className = 'folder-btn folder-btn-ignore';
            ignBtn.textContent = '🚫 Ignore';
            ignBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Add folder + all subfolders
                ignoredFolders.add(folder.path);
                focusedFolders.delete(folder.path);
                const subs = collectSubfolderPaths(tree, folder.path);
                subs.forEach(sp => {
                    ignoredFolders.add(sp);
                    focusedFolders.delete(sp);
                });
                renderFolderPanel(tree);
                _displayTree?.();
                saveFolderFilters();
                updateFolderBadge();
            });

            const focBtn = document.createElement('button');
            focBtn.className = 'folder-btn folder-btn-focus';
            focBtn.textContent = '🎯 Focus';
            focBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                focusedFolders.add(folder.path);
                ignoredFolders.delete(folder.path);
                const subs = collectSubfolderPaths(tree, folder.path);
                subs.forEach(sp => {
                    focusedFolders.add(sp);
                    ignoredFolders.delete(sp);
                });
                renderFolderPanel(tree);
                _displayTree?.();
                saveFolderFilters();
                updateFolderBadge();
            });

            actions.appendChild(ignBtn);
            actions.appendChild(focBtn);
            row.appendChild(name);
            row.appendChild(actions);
            availableFoldersEl.appendChild(row);
        });
    }

    // ── Ignored column — sorted alphabetically ──
    if (ignoredFoldersEl) {
        ignoredFoldersEl.innerHTML = '';
        if (folderIgnoredCount) folderIgnoredCount.textContent = ignoredFolders.size || '';

        const sortedIgnored = [...ignoredFolders].sort((a, b) => {
            const na = a.split(/[/\\]/).pop();
            const nb = b.split(/[/\\]/).pop();
            return na.localeCompare(nb, undefined, { sensitivity: 'base' });
        });

        if (sortedIgnored.length === 0) {
            ignoredFoldersEl.innerHTML = '<div class="chip-empty">None</div>';
        } else {
            sortedIgnored.forEach(fp => {
                const name = fp.split(/[/\\]/).pop();
                const chip = document.createElement('div');
                chip.className = 'folder-chip-active type-ignored';
                chip.title = fp;

                const label = document.createElement('span');
                label.className = 'chip-label';
                label.textContent = '📁 ' + name;

                const btn = document.createElement('button');
                btn.className = 'chip-remove-btn';
                btn.textContent = '✕';
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    ignoredFolders.delete(fp);
                    renderFolderPanel(tree);
                    _displayTree?.();
                    saveFolderFilters();
                    updateFolderBadge();
                });

                chip.appendChild(label);
                chip.appendChild(btn);
                ignoredFoldersEl.appendChild(chip);
            });

            const restore = document.createElement('div');
            restore.className = 'chip-restore-all';
            restore.textContent = 'Restore all';
            restore.addEventListener('click', () => {
                ignoredFolders.clear();
                renderFolderPanel(tree);
                _displayTree?.();
                saveFolderFilters();
                updateFolderBadge();
            });
            ignoredFoldersEl.appendChild(restore);
        }
    }

    // ── Focused column — sorted alphabetically ──
    if (focusedFoldersEl) {
        focusedFoldersEl.innerHTML = '';
        if (folderFocusedCount) folderFocusedCount.textContent = focusedFolders.size || '';

        const sortedFocused = [...focusedFolders].sort((a, b) => {
            const na = a.split(/[/\\]/).pop();
            const nb = b.split(/[/\\]/).pop();
            return na.localeCompare(nb, undefined, { sensitivity: 'base' });
        });

        if (sortedFocused.length === 0) {
            focusedFoldersEl.innerHTML = '<div class="chip-empty">None — all shown</div>';
        } else {
            sortedFocused.forEach(fp => {
                const name = fp.split(/[/\\]/).pop();
                const chip = document.createElement('div');
                chip.className = 'folder-chip-active type-focused';
                chip.title = fp;

                const label = document.createElement('span');
                label.className = 'chip-label';
                label.textContent = '📁 ' + name;

                const btn = document.createElement('button');
                btn.className = 'chip-remove-btn';
                btn.textContent = '✕';
                btn.title = 'Remove from focus (moves to ignored)';
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    focusedFolders.delete(fp);
                    // If this folder has a focused parent, move it to ignored
                    // so the parent's scope doesn't pull it back in
                    const hasActiveFocusedParent = [...focusedFolders].some(other =>
                        fp.startsWith(other + '\\') || fp.startsWith(other + '/')
                    );
                    if (hasActiveFocusedParent) {
                        ignoredFolders.add(fp);
                    }
                    renderFolderPanel(tree);
                    _displayTree?.();
                    saveFolderFilters();
                    updateFolderBadge();
                });

                chip.appendChild(label);
                chip.appendChild(btn);
                focusedFoldersEl.appendChild(chip);
            });

            const clear = document.createElement('div');
            clear.className = 'chip-restore-all';
            clear.textContent = 'Clear focus';
            clear.addEventListener('click', () => {
                focusedFolders.clear();
                renderFolderPanel(tree);
                _displayTree?.();
                saveFolderFilters();
                updateFolderBadge();
            });
            focusedFoldersEl.appendChild(clear);
        }
    }

    updateFolderBadge();
}

function updateFolderBadge() {
    const badge = folderToggleBtn?.querySelector('.folder-badge');
    if (!badge) return;
    const total = ignoredFolders.size + focusedFolders.size;
    badge.textContent = total || '';
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
}

/* ============================================================
   PERSISTENCE
   ============================================================ */

async function saveIgnoredExtensions() {
    try { await window.electronAPI?.setIgnoredExtensions?.([...ignoredExtensions]); } catch {}
}

async function saveFolderFilters() {
    try {
        await window.electronAPI?.setFolderFilters?.({
            ignored: [...ignoredFolders],
            focused: [...focusedFolders],
        });
    } catch {}
}

export async function loadIgnoredExtensions() {
    try {
        const saved = await window.electronAPI?.getIgnoredExtensions?.();
        if (Array.isArray(saved)) saved.forEach(e => ignoredExtensions.add(e));
        updateExtBadge();
    } catch {}
}

export async function loadFolderFilters() {
    try {
        const saved = await window.electronAPI?.getFolderFilters?.();
        if (saved?.ignored) saved.ignored.forEach(p => ignoredFolders.add(p));
        if (saved?.focused) saved.focused.forEach(p => focusedFolders.add(p));
        updateFolderBadge();
    } catch {}
}

/* ============================================================
   SETUP — called from app.js
   ============================================================ */

export function setupFilterInput(getCachedTree, displayTree) {
    _displayTree   = displayTree;
    _getCachedTree = getCachedTree;
}