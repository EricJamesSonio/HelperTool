/**
 * searchManager.js
 * Handles tree search input, suggestions, path expansion, and highlight animation.
 * Mirrors the original closure-based structure exactly — only extracted into a module.
 */

const treeSearchInput = document.getElementById('treeSearchInput');
const searchSuggestions = document.getElementById('searchSuggestions');

// Injected once via setupSearch — stored as module-level vars so all
// inner functions share them just like the original's closures did.
let _getCachedTree = null;
let _treeContainer = null;

/* ----------------------------------------
 * Helpers
 * -------------------------------------- */

function flattenTree(tree, result = [], parentPath = '') {
    for (const node of tree) {
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
    while (current && current !== _treeContainer) {
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

// NEW
function searchTree(query) {
    const cachedTree = (_getFilteredTree?.() ?? _getCachedTree?.()) ;
    if (!cachedTree || !query) {
        searchSuggestions.style.display = 'none';
        return;
    }

    const flatList = flattenTree(cachedTree);
    const q = query.toLowerCase();

    const matches = flatList.filter(node =>
        node.name.toLowerCase().includes(q) ||
        node.displayPath.toLowerCase().includes(q)
    );

    searchSuggestions.innerHTML = '';
    matches.slice(0, 12).forEach(node => {
        const li = document.createElement('li');
        li.className = 'search-result-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'result-name';
        nameSpan.textContent = node.name;

        const pathSpan = document.createElement('span');
        pathSpan.className = 'result-path';
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

/* ----------------------------------------
 * Setup — call once from app.js
 * -------------------------------------- */

// NEW
let _getFilteredTree = null;

export function setupSearch(getCachedTree, getFilteredTree, treeContainer) {
    _getCachedTree = getCachedTree;
    _getFilteredTree = getFilteredTree;
    _treeContainer = treeContainer;

    treeSearchInput.addEventListener('input', (e) => {
        searchTree(e.target.value.trim());
    });

    treeSearchInput.addEventListener('blur', () => {
        setTimeout(() => searchSuggestions.style.display = 'none', 200);
    });
}