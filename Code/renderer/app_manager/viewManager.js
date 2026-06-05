/**
 * viewManager.js
 * Owns: view mode (list/tree), root jumper rendering, displayTree.
 */

import { renderTree }  from '../../utils/treeView.js';
import { filterTree }  from '../filterManager.js';
import { selectSearchItem } from '../searchManager.js';
import { state }       from './appState.js';
import * as fileSeederTool from '../fileSeederTool.js';
import * as locDetector from '../locDetector.js';

const viewModeBtn = document.getElementById('viewModeBtn');
const rootJumper  = document.getElementById('rootJumper');
const treeContainer = document.getElementById('treeContainer');

let _activeRootDropdown = null;

function _normPath(p) {
  return (p || '').replace(/\\/g, '/');
}

function _escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let _subMenuStack = [];
let _treeLeaveTimer = null;

function _closeRootDropdown() {
  _closeAllSubMenus();
  if (_activeRootDropdown) { _activeRootDropdown.remove(); _activeRootDropdown = null; }
}

function _closeAllSubMenus() {
  _subMenuStack.forEach(s => s.remove());
  _subMenuStack = [];
}

function _getChildFoldersFromDOM(nodePath) {
  const np = _normPath(nodePath);
  const wrapper = document.querySelector(`[data-node-path='${CSS.escape(np)}']`);
  if (!wrapper) return [];
  const childrenContainer = wrapper.querySelector(':scope > .children');
  if (!childrenContainer) return [];
  return [...childrenContainer.querySelectorAll(':scope > .node-wrapper')]
    .filter(w => w.querySelector(':scope > .tree-node.folder'))
    .map(w => ({
      path: w.dataset.nodePath,
      name: w.dataset.nodeName || '',
    }));
}

function _appendFolderItems(container, folders) {
  folders.forEach(f => {
    const hasChildren = _getChildFoldersFromDOM(f.path).length > 0;
    const item = document.createElement('div');
    item.className = 'rf-folder-item';
    item.dataset.path = f.path;
    item.innerHTML = `
      <span class="rf-folder-icon">📁</span>
      <span class="rf-folder-name">${_escapeHtml(f.name)}</span>
      ${hasChildren ? '<span class="rf-arrow">▸</span>' : ''}`;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      selectSearchItem(f.path);
      _closeRootDropdown();
    });

    if (hasChildren) {
      let showTimer = null;
      item.addEventListener('mouseenter', () => {
        clearTimeout(showTimer);
        showTimer = setTimeout(() => _showSubMenu(container, item, f.path), 200);
      });
      item.addEventListener('mouseleave', () => {
        clearTimeout(showTimer);
      });
    }

    container.appendChild(item);
  });
}

function _showSubMenu(parentMenu, parentItem, folderPath) {
  if (!document.body.contains(parentItem)) return; // stale hover timer
  // close all sub-menus, then remove those deeper than parentMenu
  const parentIdx = _subMenuStack.indexOf(parentMenu);
  for (let i = _subMenuStack.length - 1; i >= 0; i--) {
    if (i > parentIdx) { _subMenuStack[i].remove(); _subMenuStack.splice(i, 1); }
  }

  const children = _getChildFoldersFromDOM(folderPath);
  if (children.length === 0) return;

  const sub = document.createElement('div');
  sub.className = 'custom-context-menu root-folder-dropdown rf-submenu';
  document.body.appendChild(sub);
  _subMenuStack.push(sub);
  _addMenuTreeHandlers(sub);

  _appendFolderItems(sub, children);

  const itemRect = parentItem.getBoundingClientRect();
  sub.style.left = itemRect.right + 'px';
  sub.style.top = itemRect.top + 'px';

  requestAnimationFrame(() => {
    const subRect = sub.getBoundingClientRect();
    if (subRect.right > window.innerWidth) {
      sub.style.left = (itemRect.left - subRect.width) + 'px';
    }
    if (subRect.bottom > window.innerHeight) {
      sub.style.top = (window.innerHeight - subRect.height - 10) + 'px';
    }
  });
}

function _addMenuTreeHandlers(el) {
  el.addEventListener('mouseenter', () => {
    clearTimeout(_treeLeaveTimer);
  });
  el.addEventListener('mouseleave', () => {
    clearTimeout(_treeLeaveTimer);
    _treeLeaveTimer = setTimeout(_closeAllSubMenus, 400);
  });
}

function _showRootFolderDropdown(event, rootPath, rootName) {
  event.preventDefault();
  _closeRootDropdown();
  clearTimeout(_treeLeaveTimer);

  const menu = document.createElement('div');
  menu.className = 'custom-context-menu root-folder-dropdown';
  document.body.appendChild(menu);
  _activeRootDropdown = menu;
  _addMenuTreeHandlers(menu);

  let posX = event.clientX;
  let posY = event.clientY;

  // breadcrumb
  let html = '<div class="rf-breadcrumb">';
  html += `<span class="rf-crumb rf-crumb-current">${_escapeHtml(rootName)}</span>`;
  html += '</div>';
  html += '<div class="context-menu-divider"></div>';
  menu.innerHTML = html;

  // child folders
  const children = _getChildFoldersFromDOM(rootPath);
  if (children.length === 0) {
    menu.insertAdjacentHTML('beforeend', '<div class="rf-empty">No sub-folders</div>');
  } else {
    _appendFolderItems(menu, children);
  }

  // tools
  let toolHtml = '<div class="context-menu-divider"></div>';
  toolHtml += `<div class="rf-tool-item" data-action="seed" data-path="${_escapeHtml(rootPath)}">
    <span class="rf-tool-icon">🌱</span>
    <span class="rf-tool-label">File Seeder</span>
  </div>`;
  toolHtml += `<div class="rf-tool-item" data-action="loc" data-path="${_escapeHtml(rootPath)}">
    <span class="rf-tool-icon">📏</span>
    <span class="rf-tool-label">LOC Detector</span>
  </div>`;
  menu.insertAdjacentHTML('beforeend', toolHtml);

  menu.querySelectorAll('.rf-tool-item').forEach(el => {
    el.addEventListener('click', () => {
      const path = el.dataset.path;
      const name = path ? path.split(/[/\\]/).filter(Boolean).pop() : '';
      if (el.dataset.action === 'seed') fileSeederTool.open(path, name);
      else if (el.dataset.action === 'loc') locDetector.open(path, name);
      _closeRootDropdown();
    });
  });

  // position
  menu.style.left = posX + 'px';
  menu.style.top = posY + 'px';
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) posX = window.innerWidth - rect.width - 10;
    if (rect.bottom > window.innerHeight) posY = window.innerHeight - rect.height - 10;
    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';
  });
}

export function displayTree(resetScroll = true) {
    if (!state.cachedTree) {
        treeContainer.textContent = 'No data available';
        return;
    }
    const scrollPos = treeContainer.scrollTop;
    const visibleTree = filterTree(state.cachedTree);
    renderTree(
        visibleTree,
        treeContainer,
        state.selectedItems,
        state.actionType,
        onTreeSelectionChange,
        state.viewMode
    );
    if (resetScroll) {
        treeContainer.scrollTo(0, 0);
    } else {
        treeContainer.scrollTop = scrollPos;
    }
}

// Callback wired by app.js after generateManager is ready
let _onSelectionChange = null;
export function setSelectionChangeHandler(fn) { _onSelectionChange = fn; }

function onTreeSelectionChange() {
    _onSelectionChange?.();
}

export function renderRootJumper(tree) {
    if (!rootJumper) return;
    rootJumper.innerHTML = '';

    if (!tree?.length) {
        rootJumper.style.display = 'none';
        return;
    }

    const roots = tree.filter(n => n.type === 'folder' || n.children);
    if (!roots.length) {
        rootJumper.style.display = 'none';
        return;
    }

    rootJumper.style.display = 'flex';

    const label = document.createElement('span');
    label.className   = 'root-jumper-label';
    label.textContent = 'Jump to:';
    rootJumper.appendChild(label);

    roots.forEach(node => {
        const btn = document.createElement('button');
        btn.className   = 'root-jumper-pill';
        btn.textContent = `📁 ${node.name}`;
        btn.title       = `Jump to ${node.name}`;
        btn.addEventListener('click', () => selectSearchItem(node.path));
        btn.addEventListener('contextmenu', (e) => _showRootFolderDropdown(e, node.path, node.name));
        rootJumper.appendChild(btn);
    });
}

export function applyViewMode(mode) {
    state.viewMode = mode;
    localStorage.setItem('helpertool-viewmode', mode);
    if (mode === 'tree') {
        viewModeBtn.textContent = '🌳 Tree Mode';
        viewModeBtn.className   = 'view-mode-btn active-tree';
        viewModeBtn.title       = 'Switch to List mode';
    } else {
        viewModeBtn.textContent = '☰ Roof Mode';
        viewModeBtn.className   = 'view-mode-btn active-list';
        viewModeBtn.title       = 'Switch to Tree mode';
    }
    if (state.cachedTree) displayTree();
}

export function initViewMode() {
    viewModeBtn.addEventListener('click', () =>
        applyViewMode(state.viewMode === 'list' ? 'tree' : 'list')
    );
}

// Global close handlers for root folder cascading dropdown
document.addEventListener('click', (e) => {
  if (_activeRootDropdown && !_activeRootDropdown.contains(e.target)) {
    _closeAllSubMenus();
    _closeRootDropdown();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { _closeAllSubMenus(); _closeRootDropdown(); }
});