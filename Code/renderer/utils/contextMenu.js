let _activeMenu = null;
let _onFileDeps = null;

export function initContextMenu(onFileDeps) {
  _onFileDeps = onFileDeps;

  document.addEventListener('contextmenu', (e) => {
    const wrapper = e.target.closest('.node-wrapper');
    if (!wrapper) {
      closeMenu();
      return;
    }

    e.preventDefault();
    closeMenu();

    const filePath = wrapper.dataset.nodePath;
    const isFile = wrapper.querySelector('.tree-node.file');
    if (!isFile || !filePath) return;

    showMenu(e.clientX, e.clientY, filePath);
  });

  document.addEventListener('click', (e) => {
    if (_activeMenu && !_activeMenu.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

function showMenu(x, y, filePath) {
  const menu = document.createElement('div');
  menu.className = 'custom-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  menu.innerHTML = `
    <div class="context-menu-header">${escapeHtml(filePath.split('/').pop())}</div>
    <div class="context-menu-divider"></div>
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

    const action = item.dataset.action;
    if (action === 'file-deps' && _onFileDeps) {
      _onFileDeps(filePath);
    }
    closeMenu();
  });

  // Keep menu within viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
  }

  document.body.appendChild(menu);
  _activeMenu = menu;
}

function closeMenu() {
  if (_activeMenu) {
    _activeMenu.remove();
    _activeMenu = null;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
