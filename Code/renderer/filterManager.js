/**
 * filterManager.js
 * Handles extension filter chips, suggestions, tree filtering,
 * and ignore-list detection (new).
 */

const filterInput = document.getElementById('filterInput');
const activeFiltersEl = document.getElementById('activeFilters');
const extSuggestionsEl = document.getElementById('extSuggestions');

// ── NEW: ignore panel elements ──────────────────────────────
const availableExtsEl = document.getElementById('availableExts');
const ignoredExtsEl = document.getElementById('ignoredExts');
const ignoreToggleBtn = document.getElementById('ignoreToggleBtn');
const ignorePanel = document.getElementById('ignorePanel');

export const activeExtensions = new Set(); // empty = show all
export const ignoredExtensions = new Set(); // extensions hidden from tree

let _displayTree = null;
let _getCachedTree = null;

// ── Ignore panel visibility ─────────────────────────────────
let ignorePanelOpen = false;

if (ignoreToggleBtn && ignorePanel) {
    ignoreToggleBtn.addEventListener('click', () => {
        ignorePanelOpen = !ignorePanelOpen;
        ignorePanel.classList.toggle('open', ignorePanelOpen);
        ignoreToggleBtn.classList.toggle('active', ignorePanelOpen);

        if (ignorePanelOpen) {
            const tree = _getCachedTree?.();
            if (tree) renderIgnorePanel(tree);
        }
    });
}

/**
 * Collect all unique file extensions from a tree
 */
export function collectExtensions(tree, exts = new Set()) {
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
 * Filter tree nodes by active extensions AND remove ignored extensions
 * Returns filtered copy
 */
export function filterTree(tree) {
    function filterNode(node) {
        if (node.type === 'file') {
            const ext = node.name.includes('.') ? node.name.split('.').pop().toLowerCase() : '';
            // Drop ignored extensions first
            if (ignoredExtensions.has(ext)) return null;
            // Then apply active filter (if any)
            if (activeExtensions.size > 0 && !activeExtensions.has(ext)) return null;
            return node;
        }
        if (node.type === 'folder') {
            const filteredChildren = (node.children || []).map(filterNode).filter(Boolean);
            if (filteredChildren.length === 0) return null;
            return { ...node, children: filteredChildren };
        }
        return node;
    }

    return tree.map(filterNode).filter(Boolean);
}

// ── Active filter chips (existing) ─────────────────────────
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

    if (activeExtensions.size > 0) {
        const clearChip = document.createElement('div');
        clearChip.className = 'filter-chip clear-all';
        clearChip.textContent = 'Clear filters';
        clearChip.addEventListener('click', () => {
            activeExtensions.clear();
            renderFilterChips();
            _displayTree();
        });
        activeFiltersEl.appendChild(clearChip);
    }
}

// ── NEW: Ignore panel renderer ─────────────────────────────
export function renderIgnorePanel(tree) {
    if (!availableExtsEl || !ignoredExtsEl) return;

    const allExts = [...collectExtensions(tree)].sort();

    // ── Available extensions (not yet ignored) ──
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
                // Also remove from active filter if present
                activeExtensions.delete(ext);
                renderFilterChips();
                renderIgnorePanel(tree);
                _displayTree();
                saveIgnoredExtensions();
            });
            availableExtsEl.appendChild(chip);
        });
    }

    // ── Ignored extensions ──
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

        // Clear all ignored
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

    // Update badge count on toggle button
    if (ignoreToggleBtn) {
        const badge = ignoreToggleBtn.querySelector('.ignore-badge');
        if (badge) {
            badge.textContent = ignoredExtensions.size || '';
            badge.style.display = ignoredExtensions.size > 0 ? 'inline-flex' : 'none';
        }
    }
}

// ── Persist ignored extensions via electronAPI ─────────────
async function saveIgnoredExtensions() {
    try {
        await window.electronAPI?.setIgnoredExtensions?.([...ignoredExtensions]);
    } catch (e) {
        // silently fail if API not wired yet
    }
}

export async function loadIgnoredExtensions() {
    try {
        const saved = await window.electronAPI?.getIgnoredExtensions?.();
        if (Array.isArray(saved)) {
            saved.forEach(e => ignoredExtensions.add(e));
        }
    } catch (e) {
        // silently fail
    }
}

// ── Ext suggestions (existing) ─────────────────────────────
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