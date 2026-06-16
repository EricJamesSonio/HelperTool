import state from './githubState.js';

const ICON_FOLDER = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h5l2 2h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>';
const ICON_FILE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h5l3 3v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><polyline points="9,2 9,5 12,5"/></svg>';
const ICON_CHECKED = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor"/><path d="M5 8l2 2 4-4" stroke="#010409"/></svg>';
const ICON_UNCHECKED = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 3l3 3-3 3"/></svg>';

function createFileRow(file, depth) {
  const selected = state.selectedPaths.has(file.path);
  const row = document.createElement('div');
  row.className = 'ge-tree-row' + (selected ? ' ge-tree-row--selected' : '');
  row.style.paddingLeft = (depth * 18 + 8) + 'px';

  const checkbox = document.createElement('span');
  checkbox.className = 'ge-tree-checkbox';
  checkbox.innerHTML = selected ? ICON_CHECKED : ICON_UNCHECKED;
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFile(file.path);
  });
  row.appendChild(checkbox);

  const icon = document.createElement('span');
  icon.className = 'ge-tree-icon';
  icon.innerHTML = ICON_FILE;
  row.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'ge-tree-label';
  label.textContent = file.name;
  row.appendChild(label);

  row.addEventListener('click', () => toggleFile(file.path));
  return row;
}

function toggleFile(path) {
  if (state.selectedPaths.has(path)) {
    state.selectedPaths.delete(path);
  } else {
    state.selectedPaths.add(path);
  }
  const container = document.querySelector('#geTreeContainer');
  if (container) renderTree(container);
  updateFooter();
}

function updateFooter() {
  const count = state.selectedPaths.size;
  const btn = document.querySelector('#geGenerateBtn');
  const label = document.querySelector('#geSelectedCount');
  if (btn) btn.disabled = count === 0;
  if (label) label.textContent = `${count} selected`;
}

export function renderTree(container) {
  const root = state.builtTree;
  if (!root) {
    container.innerHTML = '<div class="ge-empty">No files loaded.</div>';
    return;
  }

  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  renderNode(root, 0, frag);

  if (!frag.childNodes.length) {
    container.innerHTML = '<div class="ge-empty">Empty repository — no files found.</div>';
    return;
  }

  container.appendChild(frag);
  updateFooter();
}

function renderNode(node, depth, parentEl) {
  const dirNames = Object.keys(node.__dirs).sort();
  for (const dirName of dirNames) {
    const dir = node.__dirs[dirName];
    const fullPath = findDirPath(node, dirName);
    const expanded = state.expandedPaths.has(fullPath);

    const row = document.createElement('div');
    row.className = 'ge-tree-row ge-tree-row--dir';
    row.style.paddingLeft = (depth * 18 + 8) + 'px';

    const chevron = document.createElement('span');
    chevron.className = 'ge-tree-chevron' + (expanded ? ' ge-tree-chevron--open' : '');
    chevron.innerHTML = ICON_CHEVRON;
    row.appendChild(chevron);

    const icon = document.createElement('span');
    icon.className = 'ge-tree-icon ge-tree-icon--dir';
    icon.innerHTML = ICON_FOLDER;
    row.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'ge-tree-label ge-tree-label--dir';
    label.textContent = dirName;
    row.appendChild(label);

    row.addEventListener('click', () => {
      if (state.expandedPaths.has(fullPath)) {
        state.expandedPaths.delete(fullPath);
      } else {
        state.expandedPaths.add(fullPath);
      }
      const treeEl = document.querySelector('#geTreeContainer');
      if (treeEl) renderTree(treeEl);
    });

    parentEl.appendChild(row);

    if (expanded) {
      const childContainer = document.createElement('div');
      renderNode(dir, depth + 1, childContainer);
      parentEl.appendChild(childContainer);
    }
  }

  const files = (node.__files || []).sort((a, b) => a.name.localeCompare(b.name));
  for (const file of files) {
    parentEl.appendChild(createFileRow(file, depth));
  }
}

function findDirPath(parentNode, dirName) {
  function search(node, path) {
    if (node.__dirs && node.__dirs[dirName]) {
      if (path === '') return dirName;
      return path + '/' + dirName;
    }
    for (const [name, child] of Object.entries(node.__dirs || {})) {
      const found = search(child, path ? path + '/' + name : name);
      if (found) return found;
    }
    return null;
  }
  return search(parentNode, '');
}
