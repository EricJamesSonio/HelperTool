import { confirmDialog } from '../utils/confirmDialog.js';

class SymbolIndexUI {
  constructor(manager, handler) {
    this.manager = manager;
    this.handler = handler;
    this.container = null;
    this.setupComplete = false;
    this._searchTimeout = null;
    this._activeRepoPath = null;
    this._indexingInProgress = false;
    this._cachedBrowseHtml = null;
    this._lastStatus = null;
    this._dirtyFiles = [];
  }

  async render(containerElement, repoPath) {
    this.container = containerElement;
    this._activeRepoPath = repoPath;
    this.container.innerHTML = this.getTemplate();
    this.setupEventListeners();
    await this.refreshUI({ force: true });
    this.setupComplete = true;
  }

  getTemplate() {
    return `
      <div class="symbol-index-wrapper">
        <div class="si-header">
          <h2 class="si-title">
            <span class="si-icon">🔍</span> Symbol Index
          </h2>
          <div class="si-stats">
            <span class="stat-item">
              <span class="stat-label">Files:</span>
              <span class="stat-value" id="siStatFiles">-</span>
            </span>
            <span class="stat-item">
              <span class="stat-label">Symbols:</span>
              <span class="stat-value" id="siStatSymbols">-</span>
            </span>
            <span class="stat-item">
              <span class="stat-label">Last indexed:</span>
              <span class="stat-value" id="siStatLast">-</span>
            </span>
          </div>
        </div>

        <div class="si-content">
          <div class="si-panel si-panel-search">
            <div class="panel-header">
              <h3 class="panel-title">
                <span class="panel-icon">🔎</span> Search Symbols
              </h3>
            </div>
            <div class="panel-body">
              <div class="si-search-box">
                <input type="text" id="siSearchInput" class="si-search-input" placeholder="Type to search functions, classes, symbols…" autocomplete="off" />
                <span class="si-search-icon">⌕</span>
              </div>
              <div id="siSearchResults" class="si-search-results">
                <div class="empty-state">Start typing to search symbols</div>
              </div>
            </div>
          </div>

          <div class="si-panel si-panel-config">
            <div class="panel-header">
              <h3 class="panel-title">
                <span class="panel-icon">⚙️</span> Management
              </h3>
            </div>
            <div class="panel-body">
              <!-- Unindexed state -->
              <div id="siUnindexedState" class="si-state-block" style="display:none">
                <div class="si-info-icon">💡</div>
                <p class="si-info-text">This repository hasn't been indexed yet.</p>
                <p class="si-info-desc">Ignores follow <code>.docignore</code> patterns at repo root.</p>
                <button id="siStartIndexingBtn" class="btn btn-primary si-action-btn">
                  <span class="btn-icon">⚡</span> Start Indexing
                </button>
              </div>

              <!-- Indexed state -->
              <div id="siIndexedState" class="si-state-block" style="display:none">
                <p class="si-info-desc" style="margin-bottom:12px">
                  Files filtered by <code>.docignore</code> —
                  <button class="btn-link" id="siEditDocignoreBtn">edit</button>
                </p>

                <div class="si-watcher-box">
                  <div class="si-watcher-box-header">
                    <span class="si-watcher-box-title">📡 File Watcher</span>
                    <span class="si-watcher-dot" id="siWatcherDot"></span>
                  </div>
                  <div class="si-watcher-box-body">
                    <span id="siWatcherStatus" class="si-watcher-status">Watching for changes…</span>
                    <div class="si-watcher-dirty-row" id="siDirtyRow" style="display:none">
                      <span id="siDirtyCount" class="si-dirty-badge">0</span>
                      <span class="si-dirty-label">modified files</span>
                      <span class="si-watcher-spacer"></span>
                      <button id="siReindexDirtyBtn" class="btn btn-small si-reindex-btn">↻ Reindex All</button>
                    </div>
                  </div>
                </div>

                <div id="siDirtyFilesContainer" class="si-dirty-files" style="display:none">
                  <div class="si-dirty-files-header">
                    <span class="si-dirty-files-title">Modified Files</span>
                    <label class="si-dirty-select-all">
                      <input type="checkbox" id="siDirtySelectAll" />
                      Select all
                    </label>
                    <button id="siReindexSelectedBtn" class="btn btn-small si-reindex-btn">
                      <span>↻</span> Reindex Selected
                    </button>
                  </div>
                  <div id="siDirtyFilesList" class="si-dirty-files-list"></div>
                </div>

                <div class="si-actions">
                  <button id="siFullReindexBtn" class="btn btn-small">
                    <span>↻</span> Full Reindex
                  </button>
                  <button id="siResetBtn" class="btn btn-small si-danger-btn">
                    <span>✖</span> Reset
                  </button>
                  <button id="siDeleteBtn" class="btn btn-small si-danger-btn">
                    <span>🗑️</span> Delete Index
                  </button>
                </div>
              </div>

              <!-- Progress bar -->
              <div id="siProgressBlock" class="si-progress-block" style="display:none">
                <div class="si-progress-info">
                  <span id="siProgressLabel">Indexing…</span>
                  <span id="siProgressPercent" class="si-progress-pct">0%</span>
                </div>
                <div class="si-progress-bar-bg">
                  <div id="siProgressBar" class="si-progress-bar-fill" style="width:0%"></div>
                </div>
                <span id="siProgressDetail" class="si-progress-detail"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    const searchInput = this.container.querySelector('#siSearchInput');
    searchInput?.addEventListener('input', () => {
      clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(() => this.handleSearch(), 200);
    });

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(this._searchTimeout);
        this.handleSearch();
      }
    });

    this.container.querySelector('#siStartIndexingBtn')?.addEventListener('click', () => this.startIndexing());
    this.container.querySelector('#siReindexDirtyBtn')?.addEventListener('click', () => this.reindexDirty());
    this.container.querySelector('#siFullReindexBtn')?.addEventListener('click', () => this.confirmFullReindex());
    this.container.querySelector('#siResetBtn')?.addEventListener('click', () => this.confirmReset());
    this.container.querySelector('#siDeleteBtn')?.addEventListener('click', () => this.confirmDelete());
    this.container.querySelector('#siEditDocignoreBtn')?.addEventListener('click', () => this.openDocignore());
    this.container.querySelector('#siDirtySelectAll')?.addEventListener('change', (e) => this.handleSelectAll(e));
    this.container.querySelector('#siReindexSelectedBtn')?.addEventListener('click', () => this.handleReindexSelected());
    this.container.querySelector('#siDirtyFilesList')?.addEventListener('click', (e) => this.handleDirtyFileClick(e));

    this.handler.onProgress((data) => this.handleProgress(data));
    this.handler.onDirtyChanged((count) => this.handleDirtyChanged(count));
    this.handler.onError((msg) => this.showToast(msg, 'error'));
  }

  async refreshUI(opts) {
    if (!this._activeRepoPath) return;

    const status = await this.handler.getStatus(this._activeRepoPath);
    this.manager.status = status;

    if (status.exists && status.indexed) {
      this.manager.isIndexed = true;
      this.manager.dirtyCount = status.dirty_count || 0;
      this.showIndexedState(status);

      // Cache browse view — only re-fetch if dirty count changed or forced
      const dirtyChanged = opts?.force || !this._lastStatus || this._lastStatus.dirty_count !== status.dirty_count;
      this._lastStatus = status;
      if (dirtyChanged) {
        this._cachedBrowseHtml = null;
        this._cachedBrowseData = null;
        await this.showBrowseView();
      } else if (this._cachedBrowseHtml) {
        const resultsEl = this.container.querySelector('#siSearchResults');
        if (resultsEl) {
          this._browseData = this._cachedBrowseData || new Map();
          resultsEl.innerHTML = this._cachedBrowseHtml;
          this.attachBrowseEvents(resultsEl);
        }
      } else {
        await this.showBrowseView();
      }
    } else if (status.exists && !status.indexed) {
      this.manager.isIndexed = false;
      this.showUnindexedState();
    } else {
      this.manager.isIndexed = false;
      this.showUnindexedState();
    }
  }

  showUnindexedState() {
    this.hideAllStates();
    const el = this.container.querySelector('#siUnindexedState');
    if (el) el.style.display = 'block';
    this.updateStats({ total_files: 0, total_symbols: 0, last_indexed: null });
  }

  showIndexedState(status) {
    this.hideAllStates();
    const el = this.container.querySelector('#siIndexedState');
    if (el) el.style.display = 'block';

    this.updateStats(status);

    const dirtyRow = this.container.querySelector('#siDirtyRow');
    const dirtyCount = this.container.querySelector('#siDirtyCount');
    const watcherStatus = this.container.querySelector('#siWatcherStatus');
    if (status.dirty_count > 0) {
      dirtyRow.style.display = 'flex';
      dirtyCount.textContent = status.dirty_count;
      watcherStatus.textContent = status.dirty_count + ' file' + (status.dirty_count !== 1 ? 's' : '') + ' changed';
      this.renderDirtyFiles();
    } else {
      dirtyRow.style.display = 'none';
      watcherStatus.textContent = 'Watching for changes…';
      this.container.querySelector('#siDirtyFilesContainer').style.display = 'none';
    }
  }

  hideAllStates() {
    ['siUnindexedState', 'siIndexedState', 'siProgressBlock'].forEach(id => {
      const el = this.container.querySelector('#' + id);
      if (el) el.style.display = 'none';
    });
  }

  updateStats(status) {
    this.container.querySelector('#siStatFiles').textContent = status?.total_files ?? '-';
    this.container.querySelector('#siStatSymbols').textContent = status?.total_symbols ?? '-';
    const last = status?.last_indexed;
    this.container.querySelector('#siStatLast').textContent = last ? this.formatTime(last) : '-';
  }

  formatTime(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async handleSearch() {
    const input = this.container.querySelector('#siSearchInput');
    const query = input?.value.trim();
    const resultsEl = this.container.querySelector('#siSearchResults');
    if (!resultsEl) return;

    if (!query || query.length < 1) {
      this.showBrowseView();
      return;
    }

    if (!this._activeRepoPath || !this.manager.isIndexed) {
      resultsEl.innerHTML = '<div class="empty-state">Repository not indexed</div>';
      return;
    }

    try {
      const { results } = await this.handler.search(this._activeRepoPath, query, 30);
      this.manager.searchResults = results;

      if (results.length === 0) {
        resultsEl.innerHTML = '<div class="empty-state">No symbols found</div>';
        return;
      }

      resultsEl.innerHTML = results.map(r => `
        <div class="si-result-item" data-file="${r.file_path}" data-line="${r.line}">
          <div class="si-result-header">
            <span class="si-result-name">${this.escapeHtml(r.name)}</span>
            <span class="si-result-type-badge si-type-${r.type}">${r.type}</span>
            <span class="si-result-line">:${r.line}</span>
          </div>
          <div class="si-result-path">${this.escapeHtml(r.file_path)}</div>
          ${r.signature ? `<div class="si-result-signature">${this.escapeHtml(r.signature)}</div>` : ''}
          ${r.class_name ? `<div class="si-result-class">in ${this.escapeHtml(r.class_name)}</div>` : ''}
        </div>
      `).join('');

      resultsEl.querySelectorAll('.si-result-item').forEach(el => {
        el.addEventListener('click', () => this.handleResultClick(el));
      });
    } catch (err) {
      resultsEl.innerHTML = `<div class="empty-state error">Search failed: ${this.escapeHtml(err.message)}</div>`;
    }
  }

  async showBrowseView() {
    const resultsEl = this.container.querySelector('#siSearchResults');
    if (!resultsEl) return;

    if (!this._activeRepoPath || !this.manager.isIndexed) {
      resultsEl.innerHTML = '<div class="empty-state">Repository not indexed</div>';
      return;
    }

    try {
      const { files } = await this.handler.getIndexedFiles(this._activeRepoPath);
      if (!files || files.length === 0) {
        resultsEl.innerHTML = '<div class="empty-state">No indexed files found</div>';
        return;
      }

      this._browseData = new Map();

      let html = files.map(f => {
        const symbolCount = f.symbols?.length || 0;
        const filePath = this.escapeHtml(f.path);
        const lang = f.language ? `<span class="si-browse-lang">${f.language}</span>` : '';

        this._browseData.set(f.path, f.symbols || []);

        return `
          <div class="si-browse-file" data-file="${filePath}">
            <div class="si-browse-file-header">
              <span class="si-browse-toggle">▶</span>
              <span class="si-browse-file-path">${filePath}</span>
              ${lang}
              <span class="si-browse-file-count">${symbolCount} symbol${symbolCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="si-browse-symbols"></div>
          </div>
        `;
      }).join('');

      this._cachedBrowseHtml = html;
      this._cachedBrowseData = this._browseData;
      resultsEl.innerHTML = html;
      this.attachBrowseEvents(resultsEl);
    } catch (err) {
      resultsEl.innerHTML = `<div class="empty-state error">Failed to load index: ${this.escapeHtml(err.message)}</div>`;
    }
  }

  attachBrowseEvents(container) {
    container.querySelectorAll('.si-browse-file').forEach(el => {
      el.addEventListener('click', (e) => {
        const filePath = el.dataset.file;
        if (!filePath) return;

        // Ignore clicks on already-rendered symbols (they have their own handler)
        if (e.target.closest('.si-browse-symbol')) return;

        const symContainer = el.querySelector('.si-browse-symbols');
        const toggle = el.querySelector('.si-browse-toggle');

        if (symContainer.dataset.rendered) {
          const isOpen = el.classList.contains('si-browse-file-open');
          el.classList.toggle('si-browse-file-open', !isOpen);
          symContainer.style.display = isOpen ? 'none' : 'block';
          if (toggle) toggle.textContent = isOpen ? '▶' : '▼';
        } else {
          const symbols = this._browseData.get(filePath) || [];
          if (symbols.length === 0) {
            symContainer.innerHTML = '<div class="si-browse-empty">No symbols</div>';
          } else {
            symContainer.innerHTML = symbols.map(s => `
              <div class="si-browse-symbol" data-file="${this.escapeHtml(filePath)}" data-line="${s.line}">
                <span class="si-result-type-badge si-type-${s.type}">${s.type}</span>
                <span class="si-browse-sym-name">${this.escapeHtml(s.name)}</span>
                <span class="si-browse-sym-line">:${s.line}</span>
              </div>
            `).join('');

            symContainer.querySelectorAll('.si-browse-symbol').forEach(sym => {
              sym.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleResultClick(sym);
              });
            });
          }
          el.classList.add('si-browse-file-open');
          symContainer.style.display = 'block';
          if (toggle) toggle.textContent = '▼';
          symContainer.dataset.rendered = 'true';
        }
      });
    });
  }

  handleResultClick(el) {
    const filePath = el.dataset.file;
    const line = parseInt(el.dataset.line, 10);
    if (!filePath) return;

    this.selectFileInTree(filePath, line);
  }

  selectFileInTree(filePath, line) {
    const treeContainer = document.getElementById('treeContainer');
    if (!treeContainer) return;

    const fileName = filePath.split('/').pop();

    const allItems = treeContainer.querySelectorAll('[data-filepath]');
    for (const item of allItems) {
      if (item.dataset.filepath === filePath || item.dataset.filepath?.endsWith('/' + filePath)) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.style.outline = '2px solid var(--accent, #f0b429)';
        item.style.outlineOffset = '-1px';
        setTimeout(() => { item.style.outline = ''; }, 2000);
        return;
      }
    }

    const searchInput = document.getElementById('treeSearchInput');
    const suggestions = document.getElementById('searchSuggestions');
    if (searchInput) {
      searchInput.value = filePath;
      searchInput.dispatchEvent(new Event('input'));
      if (suggestions) {
        suggestions.style.display = 'block';
      }
      setTimeout(() => {
        for (const item of treeContainer.querySelectorAll('[data-filepath]')) {
          if (item.dataset.filepath?.endsWith(fileName) || item.dataset.filepath === filePath) {
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

  async openDocignore() {
    if (!this._activeRepoPath || !window.electronAPI?.openDocignore) return;
    await window.electronAPI.openDocignore(this._activeRepoPath);
  }

  async startIndexing() {
    if (this._indexingInProgress || !this._activeRepoPath) return;

    this._indexingInProgress = true;
    this.hideAllStates();

    const progressBlock = this.container.querySelector('#siProgressBlock');
    progressBlock.style.display = 'block';
    this.container.querySelector('#siProgressLabel').textContent = 'Indexing repository…';

    try {
      const result = await this.handler.startIndexing(this._activeRepoPath);
      if (result.success) {
        this.showToast(`Indexed ${result.totalFiles} files, ${result.symbolCount} symbols`, 'success');
        await this.refreshUI();
      } else {
        this.showToast(result.error || 'Indexing failed', 'error');
        this.showUnindexedState();
      }
    } catch (err) {
      this.showToast(err.message, 'error');
      this.showUnindexedState();
    } finally {
      this._indexingInProgress = false;
      progressBlock.style.display = 'none';
    }
  }

  async reindexDirty() {
    if (!this._activeRepoPath) return;

    const progressBlock = this.container.querySelector('#siProgressBlock');
    progressBlock.style.display = 'block';
    this.container.querySelector('#siProgressLabel').textContent = 'Reindexing dirty files…';

    try {
      const result = await this.handler.reindexDirty(this._activeRepoPath);
      if (result.success) {
        this.showToast(`Reindexed ${result.totalFiles} files`, 'success');
        await this.refreshUI();
      } else {
        this.showToast(result.error || 'Reindexing failed', 'error');
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      progressBlock.style.display = 'none';
    }
  }

  async confirmFullReindex() {
    const ok = await confirmDialog('Full reindex will re-parse all files.');
    if (!ok) return;
    if (this._activeRepoPath) {
      await this.handler.reset(this._activeRepoPath);
      await this.startIndexing();
    }
  }

  async confirmReset() {
    const ok = await confirmDialog('Reset will clear all indexed data. You will need to re-index.');
    if (!ok) return;
    if (!this._activeRepoPath) return;

    await this.handler.reset(this._activeRepoPath);
    this.manager.reset();
    this.hideAllStates();
    this.showUnindexedState();
    this.showToast('Index reset', 'success');
  }

  async confirmDelete() {
    const ok = await confirmDialog('Delete will remove all indexing data for this repository.');
    if (!ok) return;
    if (!this._activeRepoPath) return;

    const result = await this.handler.delete(this._activeRepoPath);
    if (!result.success) {
      this.showToast(result.error || 'Failed to delete index. Try restarting the app.', 'error');
      return;
    }
    this.manager.reset();
    this.hideAllStates();
    this.showUnindexedState();
    this.showToast('Index deleted', 'success');
  }

  handleProgress(data) {
    const block = this.container.querySelector('#siProgressBlock');
    if (block) block.style.display = 'block';

    const pct = data.percent || Math.round((data.current / data.total) * 100);
    this.container.querySelector('#siProgressPercent').textContent = pct + '%';
    this.container.querySelector('#siProgressBar').style.width = pct + '%';
    this.container.querySelector('#siProgressDetail').textContent = `${data.current} / ${data.total} files`;
  }

  handleDirtyChanged(count) {
    this._cachedBrowseHtml = null;
    this._cachedBrowseData = null;
    this.manager.dirtyCount = count;
    const row = this.container.querySelector('#siDirtyRow');
    const countEl = this.container.querySelector('#siDirtyCount');
    const watcherStatus = this.container.querySelector('#siWatcherStatus');
    if (count > 0) {
      row.style.display = 'flex';
      countEl.textContent = count;
      watcherStatus.textContent = count + ' file' + (count !== 1 ? 's' : '') + ' changed';
      this.renderDirtyFiles();
    } else {
      row.style.display = 'none';
      watcherStatus.textContent = 'Watching for changes…';
      this.container.querySelector('#siDirtyFilesContainer').style.display = 'none';
    }
  }

  async renderDirtyFiles() {
    if (!this._activeRepoPath) return;
    const container = this.container.querySelector('#siDirtyFilesContainer');
    const list = this.container.querySelector('#siDirtyFilesList');
    if (!list || !container) return;

    try {
      const { files } = await this.handler.getDirtyFiles(this._activeRepoPath);
      this._dirtyFiles = files || [];

      if (this._dirtyFiles.length === 0) {
        container.style.display = 'none';
        return;
      }

      container.style.display = 'block';
      const selectAll = this.container.querySelector('#siDirtySelectAll');
      if (selectAll) selectAll.checked = false;

      list.innerHTML = this._dirtyFiles.map(f => `
        <div class="si-dirty-file-item" data-path="${this.escapeHtml(f.path)}">
          <input type="checkbox" class="si-dirty-file-cb" data-path="${this.escapeHtml(f.path)}" />
          <span class="si-dirty-file-path">${this.escapeHtml(f.path)}</span>
          <span class="si-dirty-file-info">${f.symbol_count || 0} symbols</span>
        </div>
      `).join('');
    } catch (err) {
      console.error('[SymbolIndex] Failed to load dirty files:', err);
    }
  }

  handleSelectAll(e) {
    const checked = e.target.checked;
    this.container.querySelectorAll('.si-dirty-file-cb').forEach(cb => {
      cb.checked = checked;
    });
  }

  handleDirtyFileClick(e) {
    const item = e.target.closest('.si-dirty-file-item');
    if (!item) return;

    const cb = item.querySelector('.si-dirty-file-cb');
    const pathSpan = item.querySelector('.si-dirty-file-path');

    if (e.target === pathSpan) {
      const filePath = item.dataset.path;
      if (filePath) this.selectFileInTree(filePath);
      return;
    }

    if (e.target === item || e.target === cb) {
      if (cb) cb.checked = !cb.checked;
    }
  }

  async handleReindexSelected() {
    const selected = [];
    this.container.querySelectorAll('.si-dirty-file-cb:checked').forEach(cb => {
      selected.push(cb.dataset.path);
    });

    if (selected.length === 0) {
      this.showToast('No files selected', 'info');
      return;
    }

    this.container.querySelector('#siReindexSelectedBtn').disabled = true;
    let reindexed = 0;
    for (const filePath of selected) {
      try {
        const result = await this.handler.reindexFile(this._activeRepoPath, filePath);
        if (result.success) reindexed++;
      } catch (err) {
        console.error('[SymbolIndex] Failed to reindex:', filePath, err);
      }
    }
    this.container.querySelector('#siReindexSelectedBtn').disabled = false;

    if (reindexed > 0) {
      this.showToast(`Reindexed ${reindexed} file${reindexed !== 1 ? 's' : ''}`, 'success');
    }
    await this.renderDirtyFiles();
  }

  showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = 'si-toast si-toast-' + (type || 'info');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }
}

export default SymbolIndexUI;