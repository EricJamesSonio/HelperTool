let _activeMenu   = null;
let _onFileDeps   = null;
let _onFolderSeed = null;
let _onFolderLoc  = null;
let _onFileDiff   = null;

export function initContextMenu(onFileDeps, onFolderSeed, onFolderLoc, onFileDiff) {
  _onFileDeps   = onFileDeps;
  _onFolderSeed = onFolderSeed;
  _onFolderLoc  = onFolderLoc;
  _onFileDiff   = onFileDiff;

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
    <div class="context-menu-item" data-action="file-diff">
      <span class="context-menu-icon">📊</span>
      <span class="context-menu-label">View Diff</span>
      <span class="context-menu-hint">File</span>
    </div>
    <div class="context-menu-item" data-action="file-deps">
      <span class="context-menu-icon">🔗</span>
      <span class="context-menu-label">Find Dependencies</span>
      <span class="context-menu-hint">File</span>
    </div>
    <div class="context-menu-item context-menu-item-disabled" data-action="func-deps" title="Coming soon">
      <span class="context-menu-icon">🔧</span>
      <span class="context-menu-label">Find Dependencies</span>
      <span class="context-menu-hint">Function</span>
    </div>
  `;

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item || item.classList.contains('context-menu-item-disabled')) return;
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
      <span class="context-menu-icon">🌱</span>
      <span class="context-menu-label">File Seeder</span>
      <span class="context-menu-hint">Folder</span>
    </div>
    <div class="context-menu-item" data-action="folder-loc">
      <span class="context-menu-icon">📏</span>
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