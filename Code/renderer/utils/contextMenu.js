const ICON_FILE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M4 3h8l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="12,3 12,7 16,7"/><line x1="6" y1="10" x2="12" y2="10"/><line x1="6" y1="13" x2="10" y2="13"/></svg>';
const ICON_DIFF = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="3" y1="3" x2="17" y2="17"/><line x1="9" y1="3" x2="9" y2="17"/><line x1="3" y1="9" x2="17" y2="9"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M9 5H6a4 4 0 0 0 0 8h3"/><path d="M11 5h3a4 4 0 0 1 0 8h-3"/><line x1="7" y1="9" x2="13" y2="9"/></svg>';
const ICON_WRENCH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M14 2a4 4 0 0 0-4 4c0 .73.2 1.41.54 2L4 14a1.5 1.5 0 0 0 0 2.12 1.5 1.5 0 0 0 2.12 0l6-6.54c.59.34 1.27.54 2 .54a4 4 0 0 0 4-4l-2 2-2-2 2-2z"/></svg>';
const ICON_SEED = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M10 3c-4 0-6 2-6 6v2c0 4 2 6 6 6s6-2 6-6V9c0-4-2-6-6-6z"/><line x1="10" y1="3" x2="10" y2="17"/></svg>';
const ICON_RULER = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="9" x2="14" y2="9"/><line x1="3" y1="13" x2="17" y2="13"/><line x1="3" y1="17" x2="11" y2="17"/></svg>';

let _activeMenu   = null;
let _onFileDeps   = null;
let _onFolderSeed = null;
let _onFolderLoc  = null;
let _onFileDiff   = null;
let _onFileView   = null;

export function initContextMenu(onFileDeps, onFolderSeed, onFolderLoc, onFileDiff, onFileView) {
  _onFileDeps   = onFileDeps;
  _onFolderSeed = onFolderSeed;
  _onFolderLoc  = onFolderLoc;
  _onFileDiff   = onFileDiff;
  _onFileView   = onFileView;

  document.addEventListener('contextmenu', (e) => {
    const wrapper = e.target.closest('.node-wrapper');
    if (!wrapper) { closeMenu(); return; }
    e.preventDefault();
    closeMenu();

    const nodePath = wrapper.dataset.nodePath;
    const nodeName = wrapper.dataset.nodeName || nodePath?.split('/').pop() || '';
    const isFile   = !!wrapper.querySelector(':scope > .tree-node.file');
    const isFolder = !!wrapper.querySelector(':scope > .tree-node.folder');

    if (!nodePath) return;

    if (isFile)        showFileMenu(e.clientX, e.clientY, nodePath);
    else if (isFolder) showFolderMenu(e.clientX, e.clientY, nodePath, nodeName);
  });

  document.addEventListener('click', (e) => {
    if (_activeMenu && !_activeMenu.contains(e.target)) closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

function showFileMenu(x, y, filePath) {
  const menu = document.createElement('div');
  menu.className = 'custom-context-menu';
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.innerHTML = `
    <div class="context-menu-header">${escapeHtml(filePath.split('/').pop())}</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" data-action="file-view">
      <span class="context-menu-icon">${ICON_FILE}</span>
      <span class="context-menu-label">View File</span>
      <span class="context-menu-hint">File</span>
    </div>
    <div class="context-menu-item" data-action="file-diff">
      <span class="context-menu-icon">${ICON_DIFF}</span>
      <span class="context-menu-label">View Diff</span>
      <span class="context-menu-hint">File</span>
    </div>
    <div class="context-menu-item" data-action="file-deps">
      <span class="context-menu-icon">${ICON_LINK}</span>
      <span class="context-menu-label">Find Dependencies</span>
      <span class="context-menu-hint">File</span>
    </div>
    <div class="context-menu-item context-menu-item-disabled" data-action="func-deps" title="Coming soon">
      <span class="context-menu-icon">${ICON_WRENCH}</span>
      <span class="context-menu-label">Find Dependencies</span>
      <span class="context-menu-hint">Function</span>
    </div>
  `;

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item || item.classList.contains('context-menu-item-disabled')) return;
    if (item.dataset.action === 'file-view' && _onFileView) _onFileView(filePath);
    if (item.dataset.action === 'file-diff' && _onFileDiff) _onFileDiff(filePath);
    if (item.dataset.action === 'file-deps' && _onFileDeps) _onFileDeps(filePath);
    closeMenu();
  });

  mountMenu(menu);
}

function showFolderMenu(x, y, folderPath, folderName) {
  const menu = document.createElement('div');
  menu.className = 'custom-context-menu';
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.innerHTML = `
    <div class="context-menu-header">${escapeHtml(folderName)}/</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" data-action="folder-seed">
      <span class="context-menu-icon">${ICON_SEED}</span>
      <span class="context-menu-label">File Seeder</span>
      <span class="context-menu-hint">Folder</span>
    </div>
    <div class="context-menu-item" data-action="folder-loc">
      <span class="context-menu-icon">${ICON_RULER}</span>
      <span class="context-menu-label">LOC Detector</span>
      <span class="context-menu-hint">Folder</span>
    </div>
  `;

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item || item.classList.contains('context-menu-item-disabled')) return;
    if (item.dataset.action === 'folder-seed' && _onFolderSeed) _onFolderSeed(folderPath, folderName);
    if (item.dataset.action === 'folder-loc'  && _onFolderLoc)  _onFolderLoc(folderPath, folderName);
    closeMenu();
  });

  mountMenu(menu);
}

function mountMenu(menu) {
  document.body.appendChild(menu);
  _activeMenu = menu;

  const rect = menu.getBoundingClientRect();
  if (rect.right  > window.innerWidth)  menu.style.left = (window.innerWidth  - rect.width  - 10) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top  = (window.innerHeight - rect.height - 10) + 'px';
}

function closeMenu() {
  if (_activeMenu) { _activeMenu.remove(); _activeMenu = null; }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}