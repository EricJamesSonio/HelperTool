import DependenciesHandler from './dependenciesHandler.js';

class DependenciesUI {
  constructor() {
    this.handler = new DependenciesHandler();
    this.container = null;
    this._activeRepoPath = null;
    this._activeFilePath = null;
    this._currentMode = 'file';
  }

  getTemplate() {
    return `
      <div class="deps-wrapper">
        <div class="deps-header">
          <h2 class="deps-title">
            <span class="deps-icon">🔗</span> Dependencies
          </h2>
          <div class="deps-file-path" id="depsFilePath"></div>
        </div>

        <div class="deps-tabs">
          <button class="deps-tab deps-tab-active" data-mode="file">
            <span>📄</span> File
          </button>
          <button class="deps-tab" data-mode="function">
            <span>🔧</span> Function
          </button>
        </div>

        <div class="deps-body" id="depsBody">
          <div class="deps-empty">Select a file to see its dependencies</div>
        </div>
      </div>
    `;
  }

  async render(containerElement, repoPath) {
    this.container = containerElement;
    this._activeRepoPath = repoPath;
    this.container.innerHTML = this.getTemplate();
    this.setupEventListeners();
    this.showEmpty();
  }

  setupEventListeners() {
    this.container.querySelectorAll('.deps-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.disabled) return;
        this.container.querySelectorAll('.deps-tab').forEach(t => t.classList.remove('deps-tab-active'));
        tab.classList.add('deps-tab-active');
        this._currentMode = tab.dataset.mode;
        if (this._activeFilePath) this.showDeps();
      });
    });
  }

  async showForFile(filePath) {
    this._activeFilePath = filePath;
    const pathEl = this.container.querySelector('#depsFilePath');
    if (pathEl) pathEl.textContent = filePath;

    await this.showDeps();
  }

  async showDeps() {
    if (!this._activeRepoPath || !this._activeFilePath) return;

    const body = this.container.querySelector('#depsBody');
    if (!body) return;

    body.innerHTML = '<div class="deps-loading">Loading dependencies…</div>';

    try {
      const mode = this._currentMode;
      const result = await this.handler.getFileDeps(this._activeRepoPath, this._activeFilePath, mode);
      if (!result.exists) {
        body.innerHTML = '<div class="deps-empty">File not found in index</div>';
        return;
      }

      if (mode === 'function') {
        this._renderFuncDeps(body, result);
      } else {
        this._renderFileDeps(body, result);
      }

      body.querySelectorAll('.deps-item').forEach(el => {
        el.addEventListener('click', () => {
          const path = el.dataset.path;
          if (path) this.selectFileInTree(path);
        });
      });

    } catch (err) {
      body.innerHTML = `<div class="deps-empty error">Error: ${this._escape(err.message)}</div>`;
    }
  }

  selectFileInTree(filePath) {
    const treeContainer = document.getElementById('treeContainer');
    if (!treeContainer) return;

    const allItems = treeContainer.querySelectorAll('[data-node-path]');
    for (const item of allItems) {
      const nodePath = item.dataset.nodePath;
      if (nodePath === filePath || nodePath?.endsWith('/' + filePath)) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.style.outline = '2px solid var(--accent, #f0b429)';
        item.style.outlineOffset = '-1px';
        setTimeout(() => { item.style.outline = ''; }, 2000);
        return;
      }
    }

    // Try searching
    const searchInput = document.getElementById('treeSearchInput');
    if (searchInput) {
      searchInput.value = filePath;
      searchInput.dispatchEvent(new Event('input'));
      setTimeout(() => {
        for (const item of treeContainer.querySelectorAll('[data-node-path]')) {
          if (item.dataset.nodePath?.endsWith(filePath.split('/').pop()) || item.dataset.nodePath === filePath) {
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            item.style.outline = '2px solid var(--accent, #f0b429)';
            item.style.outlineOffset = '-1px';
            setTimeout(() => { item.style.outline = ''; }, 2000);
            break;
          }
        }
      }, 200);
    }
  }

  showEmpty() {
    const body = this.container.querySelector('#depsBody');
    if (body) body.innerHTML = '<div class="deps-empty">Right-click a file in the tree → Find Dependencies</div>';
  }

  _renderFileDeps(body, result) {
    const imports = result.imports || [];
    const importedBy = result.imported_by || [];

    let html = '';

    html += `<div class="deps-section">
      <div class="deps-section-header">
        <span class="deps-section-title">📥 Imports</span>
        <span class="deps-section-count">${imports.length}</span>
      </div>
      <div class="deps-section-body">`;

    if (imports.length === 0) {
      html += '<div class="deps-empty-sm">No imports found</div>';
    } else {
      html += imports.map(imp => {
        const resolvedClass = imp.resolved ? 'deps-item-resolved' : 'deps-item-unresolved';
        return `<div class="deps-item ${resolvedClass}" data-path="${this._escape(imp.resolved_path || imp.import_path)}">
          <span class="deps-item-path">${this._escape(imp.resolved_path || imp.import_path)}</span>
          <span class="deps-item-type">${imp.import_type}</span>
          <span class="deps-item-line">:${imp.line || '?'}</span>
        </div>`;
      }).join('');
    }

    html += '</div></div>';

    html += `<div class="deps-section">
      <div class="deps-section-header">
        <span class="deps-section-title">📤 Used by</span>
        <span class="deps-section-count">${importedBy.length}</span>
      </div>
      <div class="deps-section-body">`;

    if (importedBy.length === 0) {
      html += '<div class="deps-empty-sm">No files import this file</div>';
    } else {
      html += importedBy.map(rd => {
        return `<div class="deps-item deps-item-resolved" data-path="${this._escape(rd.source_path)}">
          <span class="deps-item-path">${this._escape(rd.source_path)}</span>
          <span class="deps-item-type">${rd.import_type}</span>
        </div>`;
      }).join('');
    }

    html += '</div></div>';
    body.innerHTML = html;
  }

  _renderFuncDeps(body, result) {
    const funcImports = result.funcImports || [];
    const funcReverse = result.funcReverse || [];

    let html = '';

    // Symbols used from imports
    html += `<div class="deps-section">
      <div class="deps-section-header">
        <span class="deps-section-title">🔧 Used symbols</span>
        <span class="deps-section-count">${funcImports.length}</span>
      </div>
      <div class="deps-section-body">`;

    if (funcImports.length === 0) {
      html += '<div class="deps-empty-sm">No imported symbols used</div>';
    } else {
      html += funcImports.map(fi => {
        return `<div class="deps-func-group" data-path="${this._escape(fi.resolved_path)}">
          <div class="deps-func-source">${this._escape(fi.resolved_path)} <span class="deps-item-type">${fi.import_type}</span></div>
          <div class="deps-func-symbols">${fi.symbols.map(s =>
            `<span class="deps-func-symbol deps-func-${s.type}">${this._escape(s.name)}${s.line ? ' :' + s.line : ''}</span>`
          ).join(', ')}</div>
        </div>`;
      }).join('');
    }

    html += '</div></div>';

    // Our symbols used by other files
    html += `<div class="deps-section">
      <div class="deps-section-header">
        <span class="deps-section-title">📤 Used by others</span>
        <span class="deps-section-count">${funcReverse.length}</span>
      </div>
      <div class="deps-section-body">`;

    if (funcReverse.length === 0) {
      html += '<div class="deps-empty-sm">No files use this file symbols</div>';
    } else {
      html += funcReverse.map(fr => {
        return `<div class="deps-func-group" data-path="${this._escape(fr.source_path)}">
          <div class="deps-func-source">${this._escape(fr.source_path)} <span class="deps-item-type">${fr.import_type}</span></div>
          <div class="deps-func-symbols">${fr.symbols.map(s =>
            `<span class="deps-func-symbol deps-func-${s.type}">${this._escape(s.name)}${s.line ? ' :' + s.line : ''}</span>`
          ).join(', ')}</div>
        </div>`;
      }).join('');
    }

    html += '</div></div>';
    body.innerHTML = html;

    // Click handlers for func groups
    body.querySelectorAll('.deps-func-group').forEach(el => {
      el.addEventListener('click', () => {
        const path = el.dataset.path;
        if (path) this.selectFileInTree(path);
      });
    });
  }

  _escape(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

export default DependenciesUI;
