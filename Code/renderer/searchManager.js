import { levenshteinDistance } from './shortcutMode/levenshtein.js';

const treeSearchInput   = document.getElementById('treeSearchInput');
const searchSuggestions = document.getElementById('searchSuggestions');

let _getCachedTree   = null;
let _getFilteredTree = null;
let _treeContainer   = null;
let _flatCache        = null;
let _flatCacheTreeRef = null;

export function invalidateFlatCache() {
  _flatCache        = null;
  _flatCacheTreeRef = null;
}

export function getFlatList() {
  const tree = _getCachedTree?.();
  if (!tree) return [];
  if (tree === _flatCacheTreeRef && _flatCache) return _flatCache;

  const result = [];
  function flatten(nodes, parentPath = '') {
    for (const node of nodes) {
      const displayPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      result.push({ ...node, displayPath });
      if (node.children?.length) flatten(node.children, displayPath);
    }
  }
  flatten(tree);
  _flatCache        = result;
  _flatCacheTreeRef = tree;
  return result;
}

const normPath = (p) => (p || '').replace(/\\/g, '/');

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function expandPathParents(nodePath) {
  const np      = normPath(nodePath);
  const wrapper = document.querySelector(`[data-node-path='${CSS.escape(np)}']`);
  if (!wrapper) return;

  let current = wrapper.parentElement;
  while (current && current !== _treeContainer) {
    if (current.classList.contains('node-wrapper')) {
      const childrenContainer = current.querySelector(':scope > .children');
      const folderNode        = current.querySelector(':scope > .tree-node.folder');
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

export function selectSearchItem(path) {
  const np = normPath(path);
  expandPathParents(path);
  setTimeout(() => {
    const wrapper  = document.querySelector(`[data-node-path='${CSS.escape(np)}']`);
    if (!wrapper) return;
    const treeNode = wrapper.querySelector(':scope > .tree-node');
    if (!treeNode) return;

    treeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const orig = {
      bg:        treeNode.style.background,
      shadow:    treeNode.style.boxShadow,
      border:    treeNode.style.borderColor,
      color:     treeNode.style.color,
      transform: treeNode.style.transform,
      transition:treeNode.style.transition,
    };

    treeNode.style.transition  = 'all 0.3s ease';
    treeNode.style.background  = 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)';
    treeNode.style.boxShadow   = '0 0 0 6px rgba(156,39,176,0.8), 0 0 35px rgba(106,27,154,1)';
    treeNode.style.borderColor = '#9c27b0';
    treeNode.style.color       = '#fff';
    treeNode.style.transform   = 'scale(1.2)';
    treeNode.style.zIndex      = '1000';

    setTimeout(() => {
      treeNode.style.transition = 'all 1s ease';
      treeNode.style.background = 'linear-gradient(135deg, #ba68c8 0%, #9c27b0 100%)';
      treeNode.style.boxShadow  = '0 0 0 4px rgba(156,39,176,0.6), 0 0 25px rgba(106,27,154,0.7)';
      treeNode.style.transform  = 'scale(1.15)';
    }, 800);

    setTimeout(() => {
      treeNode.style.background = 'linear-gradient(135deg, #ce93d8 0%, #ba68c8 100%)';
      treeNode.style.boxShadow  = '0 0 0 2px rgba(156,39,176,0.4), 0 0 15px rgba(106,27,154,0.5)';
      treeNode.style.transform  = 'scale(1.08)';
    }, 1600);

    setTimeout(() => {
      treeNode.style.transition = 'all 0.5s ease';
      Object.assign(treeNode.style, {
        background:  orig.bg,
        boxShadow:   orig.shadow,
        borderColor: orig.border,
        color:       orig.color,
        transform:   orig.transform,
        zIndex:      '',
      });
      setTimeout(() => {
        treeNode.style.transition = orig.transition;
      }, 500);
    }, 2500);
  }, 150);
}

function scoreMatch(query, name, displayPath) {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  const p = displayPath.toLowerCase();

  if (n === q) return 100;
  if (p === q) return 95;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 60;
  if (p.endsWith('/' + q)) return 70;

  const pathSegments = query.split(/[\\/]/);
  const lastSegment = pathSegments[pathSegments.length - 1];
  if (lastSegment && lastSegment.length > 1) {
    if (n === lastSegment) return 85;
    if (n.startsWith(lastSegment)) return 65;
    if (n.includes(lastSegment)) return 45;
    if (p.includes(q)) return 40;
  }

  if (p.includes(q)) return 30;

  // Fuzzy fallback — Levenshtein similarity against name and displayPath
  const nameSim  = 1 - (levenshteinDistance(q, n) / Math.max(q.length, n.length));
  const pathSim  = 1 - (levenshteinDistance(q, p) / Math.max(q.length, p.length));
  const bestSim  = Math.max(nameSim, pathSim);
  if (bestSim >= 0.5) return Math.round(bestSim * 30);
  return 0;
}

function searchTree(query) {
  if (!query) {
    searchSuggestions.style.display = 'none';
    return;
  }

  const flatList = getFlatList();
  const scored = flatList
    .map(node => ({
      node,
      score: scoreMatch(query, node.name, node.displayPath),
    }))
    .filter(m => m.score > 0);

  scored.sort((a, b) => b.score - a.score);

  searchSuggestions.innerHTML = '';

  scored.forEach(m => {
    const node = m.node;
    const li = document.createElement('li');
    li.className = 'search-result-item';

    const nameSpan = document.createElement('span');
    nameSpan.className   = 'result-name';
    nameSpan.textContent = node.name;

    const pathSpan   = document.createElement('span');
    pathSpan.className   = 'result-path';

    // Show full displayPath with the filename as the last segment
    const dp = node.displayPath;
    const lastSlash = dp.lastIndexOf('/');
    if (lastSlash !== -1) {
      const dir = dp.substring(0, lastSlash);
      const file = dp.substring(lastSlash + 1);
      pathSpan.innerHTML = `📁 ${dir}/<strong>${file}</strong>`;
    } else {
      pathSpan.innerHTML = `📁 <strong>${dp}</strong>`;
    }

    // Small score badge for transparency
    const scoreBadge = document.createElement('span');
    scoreBadge.className = 'result-score';
    scoreBadge.textContent = m.score + '%';
    scoreBadge.style.cssText = 'font-size:0.65rem;color:var(--text-muted);margin-left:auto;flex-shrink:0';

    li.appendChild(nameSpan);
    li.appendChild(pathSpan);
    li.appendChild(scoreBadge);
    li.addEventListener('click', () => {
      selectSearchItem(node.path);
      searchSuggestions.style.display = 'none';
      treeSearchInput.value = '';
    });
    searchSuggestions.appendChild(li);
  });

  searchSuggestions.style.display = scored.length ? 'block' : 'none';
  if (scored.length) positionSuggestions();
}

function positionSuggestions() {
  const rect = treeSearchInput.getBoundingClientRect();
  searchSuggestions.style.top   = (rect.bottom + 6) + 'px';
  searchSuggestions.style.left  = rect.left + 'px';
  searchSuggestions.style.width = Math.max(rect.width, 360) + 'px';
}

export function setupSearch(getCachedTree, getFilteredTree, treeContainer) {
  _getCachedTree   = getCachedTree;
  _getFilteredTree = getFilteredTree;
  _treeContainer   = treeContainer;

  const debouncedSearch = debounce((val) => searchTree(val), 80);

  treeSearchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    debouncedSearch(val);
  });

  treeSearchInput.addEventListener('blur', () => {
    setTimeout(() => {
      searchSuggestions.style.display = 'none';
    }, 200);
  });
}

export { searchTree as _searchTree };
