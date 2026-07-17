import { confirmDialog } from '../utils/confirmDialog.js';

const ICON_SEARCH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5"/><path d="M13 13l4 4"/></svg>';
const ICON_GEAR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v3"/><path d="M10 16v3"/><path d="M3.5 3.5l2 2"/><path d="M14.5 14.5l2 2"/><path d="M1 10h3"/><path d="M16 10h3"/><path d="M3.5 16.5l2-2"/><path d="M14.5 5.5l2-2"/></svg>';
const ICON_LIGHTBULB = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2"/><path d="M10 3a5 5 0 0 0-3 8.9V13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1.1A5 5 0 0 0 10 3z"/></svg>';
const ICON_LIGHTNING = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 11h5l-2 7 9-9h-5l2-7z"/></svg>';
const ICON_RADAR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="1.5"/><path d="M14 6a6 6 0 0 1 0 8"/><path d="M6 6a6 6 0 0 0 0 8"/><path d="M17 3a10 10 0 0 1 0 14"/><path d="M3 3a10 10 0 0 0 0 14"/></svg>';
const ICON_REFRESH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 0 1 11.7-4.7"/><path d="M17 10a7 7 0 0 1-11.7 4.7"/><path d="M14.5 2v4h-4"/><path d="M5.5 18v-4h4"/></svg>';
const ICON_CHEVRON_RIGHT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>';
const ICON_CHEVRON_DOWN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg>';
const ICON_REMOVE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14"/><path d="M7 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M5 5v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5"/></svg>';

class SymbolIndexUI {
  constructor(manager, handler) {
    this.manager = manager;
    this.handler = handler;
    this.container = null;
    this.setupComplete = false;
    this._searchTimeout = null;
    this._activeRepoPath = null;
    this._indexingInProgress = false;
    this._lastStatus = null;
    this._dirtyFiles = [];
    this._browseAllFiles = null;
    this._browseTotal = 0;
    this._renderedCount = 0;
    this._dirtyDebounceTimer = null;
    this._lastDirtyCount = null;
    this._searchFetchLimit = 200;
  }

  async render(containerElement, repoPath) {
    this.container = containerElement;
    this._activeRepoPath = repoPath;
    this.container.innerHTML = this.getTemplate();
    this.setupEventListeners();
    // Defer data-heavy refresh so the opening animation isn't blocked
    await this.refreshUI({ force: true });
    this.setupComplete = true;
  }

  getTemplate() {
    return `
      <div class="symbol-index-wrapper">
        <div class="si-header">
          <h2 class="si-title">
            <span class="si-icon">${ICON_SEARCH}</span> Symbol Index
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
                <span class="panel-icon">${ICON_SEARCH}</span> Search Symbols
              </h3>
            </div>
            <div class="panel-body">
              <div class="si-search-box">
                <input type="text" id="siSearchInput" class="si-search-input" placeholder="Type to search functions, classes, symbols…" autocomplete="off" />
                <span class="si-search-icon">${ICON_SEARCH}</span>
              </div>
              <div id="siSearchResults" class="si-search-results">
                <div class="empty-state">Start typing to search symbols</div>
              </div>
            </div>
          </div>

          <div class="si-panel si-panel-config">
            <div class="panel-header">
              <h3 class="panel-title">
                <span class="panel-icon">${ICON_GEAR}</span> Management
              </h3>
            </div>
            <div class="panel-body">
              <!-- Unindexed state -->
              <div id="siUnindexedState" class="si-state-block" style="display:none">
                <div class="si-info-icon">${ICON_LIGHTBULB}</div>
                <p class="si-info-text">This repository hasn't been indexed yet.</p>
                <p class="si-info-desc">Ignores follow <code>global-docignore.json</code> patterns.</p>
                <button id="siStartIndexingBtn" class="si-btn si-btn-primary si-action-btn">
                  <span class="si-btn-icon">${ICON_LIGHTNING}</span> Start Indexing
                </button>
              </div>

              <!-- Indexed state -->
              <div id="siIndexedState" class="si-state-block" style="display:none">
                <p class="si-info-desc" style="margin-bottom:12px">
                  Files filtered by <code>global-docignore.json</code> —
                  <button class="si-btn-link" id="siEditDocignoreBtn">edit</button>
                </p>

                <div class="si-watcher-box">
                  <div class="si-watcher-box-header">
                    <span class="si-watcher-box-title">${ICON_RADAR} File Watcher</span>
                    <span class="si-watcher-dot" id="siWatcherDot"></span>
                  </div>
                  <div class="si-watcher-box-body">
                    <span id="siWatcherStatus" class="si-watcher-status">Watching for changes…</span>
                    <div class="si-watcher-dirty-row" id="siDirtyRow" style="display:none">
                      <span id="siDirtyCount" class="si-dirty-badge">0</span>
                      <span class="si-dirty-label">modified files</span>
                      <span class="si-watcher-spacer"></span>
                      <button id="siReindexDirtyBtn" class="si-btn si-btn-small si-reindex-btn">${ICON_REFRESH} Reindex All</button>
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
                    <button id="siReindexSelectedBtn" class="si-btn si-btn-small si-reindex-btn">
                      ${ICON_REFRESH} Reindex Selected
                    </button>
                  </div>
                  <div id="siDirtyFilesList" class="si-dirty-files-list"></div>
                </div>

                <div class="si-actions">
                  <button id="siFullReindexBtn" class="si-btn si-btn-small">
                    ${ICON_REFRESH} Full Reindex
                  </button>
                  <button id="siResetBtn" class="si-btn si-btn-small si-danger-btn">
                    ${ICON_REMOVE} Reset
                  </button>
                  <button id="siDeleteBtn" class="si-btn si-btn-small si-danger-btn">
                    ${ICON_DELETE} Delete Index
                  </button>
                </div>

                <div class="si-proxy-section" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-default,rgba(255,255,255,0.08))">
                  <p class="si-info-desc" style="margin-bottom:8px;font-weight:600;font-size:0.72rem;letter-spacing:0.3px">INDEXER SERVICE (DEMO)</p>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button id="siProxyIndexBtn" class="si-btn si-btn-small">${ICON_LIGHTNING} Index Active File</button>
                    <button id="siProxySearchBtn" class="si-btn si-btn-small">${ICON_SEARCH} Search via Proxy</button>
                  </div>
                  <div id="siProxyResult" class="si-proxy-result" style="margin-top:8px;font-size:0.75rem;color:var(--text-muted,#556080);white-space:pre-wrap;max-height:200px;overflow-y:auto"></div>
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
      this._searchTimeout = setTimeout(() => this.handleSearch(), 30);
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

    // Event delegation for search result clicks (persistent, no per-item listeners)
    this.container.querySelector('#siSearchResults')?.addEventListener('click', (e) => {
      const item = e.target.closest('.si-result-item');
      if (item) this.handleResultClick(item);
    });

    this.container.querySelector('#siProxyIndexBtn')?.addEventListener('click', () => this.proxyIndexFile());
    this.container.querySelector('#siProxySearchBtn')?.addEventListener('click', () => this.proxySearch());

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

      const dirtyChanged = opts?.force || !this._lastStatus || this._lastStatus.dirty_count !== status.dirty_count;
      this._lastStatus = status;
      if (dirtyChanged) {
        this._browseAllFiles = null;
        this._renderedCount = 0;
      }
      const searchInput = this.container.querySelector('#siSearchInput');
      if (!searchInput || !searchInput.value.trim()) {
        this.showBrowseView();
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

  _renderSearchResults(results) {
    if (results.length === 0) return '<div class="empty-state">No symbols found</div>';
    return results.map(r => `
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
      const { results } = await this.handler.search(this._activeRepoPath, query, this._searchFetchLimit);
      this.manager.searchResults = results || [];
      resultsEl.innerHTML = this._renderSearchResults(results || []);
    } catch (err) {
      resultsEl.innerHTML = `<div class="empty-state error">${this.escapeHtml(err.message)}</div>`;
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
      resultsEl.innerHTML = '<div class="empty-state">Loading files…</div>';
      this._browseAllFiles = [];
      this._browseTotal = 0;
      this._renderedCount = 0;
      await this._loadMoreFiles(resultsEl);
    } catch (err) {
      resultsEl.innerHTML = `<div class="empty-state error">Failed to load index: ${this.escapeHtml(err.message)}</div>`;
    }
  }

  async _loadMoreFiles(container) {
    const PAGE = 15;
    try {
      const { files, total } = await this.handler.getIndexedFileList(this._activeRepoPath, PAGE, this._browseAllFiles.length);
      if (!files || files.length === 0) {
        if (this._browseAllFiles.length === 0) {
          container.innerHTML = '<div class="empty-state">No indexed files found</div>';
        } else {
          const oldMore = container.querySelector('#siBrowseMoreBtn');
          if (oldMore) oldMore.remove();
          const done = document.createElement('div');
          done.className = 'si-browse-more';
          done.textContent = `All ${this._browseAllFiles.length} files loaded`;
          container.appendChild(done);
        }
        return;
      }
      this._browseTotal = total || 0;
      this._browseAllFiles.push(...files);
      this._renderBrowsePage(container, files, this._browseAllFiles.length < this._browseTotal);
    } catch (err) {
      container.innerHTML = `<div class="empty-state error">${this.escapeHtml(err.message)}</div>`;
    }
  }

  _renderBrowsePage(container, newFiles, hasMore) {
    const oldMore = container.querySelector('#siBrowseMoreBtn');
    if (oldMore) oldMore.remove();
    if (container.querySelector('.empty-state')) container.innerHTML = '';

    const frag = document.createDocumentFragment();
    for (const f of newFiles) {
      const escapedPath = this.escapeHtml(f.path);
      const div = document.createElement('div');
      div.className = 'si-browse-file';
      div.dataset.file = f.path;
      div.innerHTML = `
        <div class="si-browse-file-header">
          <span class="si-browse-toggle">${ICON_CHEVRON_RIGHT}</span>
          <span class="si-browse-file-path">${escapedPath}</span>
        </div>
        <div class="si-browse-symbols"></div>
      `;
      frag.appendChild(div);
    }
    container.appendChild(frag);

    if (hasMore) {
      const moreBtn = document.createElement('div');
      moreBtn.className = 'si-browse-more';
      moreBtn.id = 'siBrowseMoreBtn';
      const remaining = this._browseTotal - this._browseAllFiles.length;
      moreBtn.textContent = remaining > 0 ? `Show ${Math.min(remaining, 50)} more… (${this._browseAllFiles.length}/${this._browseTotal})` : 'Loading more…';
      container.appendChild(moreBtn);
    } else if (this._browseAllFiles.length > 50) {
      const done = document.createElement('div');
      done.className = 'si-browse-more';
      done.textContent = `All ${this._browseAllFiles.length} files loaded`;
      container.appendChild(done);
    }

    if (!container._browseEventsAttached) {
      container._browseEventsAttached = true;
      this._attachBrowseEvents(container);
    }
  }

  _attachBrowseEvents(container) {
    container.addEventListener('click', (e) => {
      const fileRow = e.target.closest('.si-browse-file');
      if (fileRow) {
        const filePath = fileRow.dataset.file;
        if (!filePath) return;
        if (e.target.closest('.si-browse-symbol')) return;
        const symContainer = fileRow.querySelector('.si-browse-symbols');
        const toggle = fileRow.querySelector('.si-browse-toggle');
        const isOpen = fileRow.classList.contains('si-browse-file-open');
        if (isOpen) {
          symContainer.innerHTML = '';
          fileRow.classList.remove('si-browse-file-open');
          symContainer.style.display = 'none';
          if (toggle) toggle.innerHTML = ICON_CHEVRON_RIGHT;
        } else {
          this._loadAndRenderFileSymbols(filePath, symContainer, toggle, fileRow);
        }
        return;
      }

      const sym = e.target.closest('.si-browse-symbol');
      if (sym) {
        e.stopPropagation();
        this.handleResultClick(sym);
        return;
      }

      const moreBtn = e.target.closest('#siBrowseMoreBtn');
      if (moreBtn) {
        moreBtn.textContent = 'Loading…';
        this._loadMoreFiles(container);
      }
    });
  }

  async _loadAndRenderFileSymbols(filePath, symContainer, toggle, fileRow) {
    symContainer.innerHTML = '<div class="si-browse-empty">Loading symbols…</div>';
    symContainer.style.display = 'block';
    fileRow.classList.add('si-browse-file-open');
    if (toggle) toggle.innerHTML = ICON_CHEVRON_DOWN;

    try {
      const { symbols } = await this.handler.getFileSymbols(this._activeRepoPath, filePath);
      this._renderSymbols(symContainer, filePath, symbols);
    } catch (err) {
      symContainer.innerHTML = `<div class="si-browse-empty error">${this.escapeHtml(err.message)}</div>`;
    }
  }

  _renderSymbols(container, filePath, symbols) {
    if (symbols.length === 0) {
      container.innerHTML = '<div class="si-browse-empty">No symbols</div>';
    } else {
      const frag = document.createDocumentFragment();
      for (const s of symbols) {
        const div = document.createElement('div');
        div.className = 'si-browse-symbol';
        div.dataset.file = filePath;
        div.dataset.line = s.line;
        div.innerHTML = `
          <span class="si-result-type-badge si-type-${s.type}">${s.type}</span>
          <span class="si-browse-sym-name">${this.escapeHtml(s.name)}</span>
          <span class="si-browse-sym-line">:${s.line}</span>
        `;
        frag.appendChild(div);
      }
      container.appendChild(frag);
    }
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

    const allItems = treeContainer.querySelectorAll('[data-node-path]');
    for (const item of allItems) {
      const nodePath = item.dataset.nodePath || item.dataset.filepath;
      if (nodePath === filePath || nodePath?.endsWith('/' + filePath)) {
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
        for (const item of treeContainer.querySelectorAll('[data-node-path]')) {
          const nodePath = item.dataset.nodePath || item.dataset.filepath;
          if (nodePath?.endsWith(fileName) || nodePath === filePath) {
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
    if (!window.electronAPI?.openGlobalDocignore) return;
    await window.electronAPI.openGlobalDocignore();
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

  async proxyIndexFile() {
    const el = this.container.querySelector('#siProxyResult');
    if (!el) return;
    if (!this._activeRepoPath) { el.textContent = 'No active repo'; return; }
    el.textContent = 'Indexing active file via proxy...';
    try {
      const filePath = this.manager.getCurrentFilePath?.() || this._activeRepoPath;
      const result = await window.electronAPI.symbolIndex.proxyIndexFile(this._activeRepoPath, filePath);
      el.textContent = JSON.stringify(result, null, 2);
    } catch (err) {
      el.textContent = 'Error: ' + err.message;
    }
  }

  async proxySearch() {
    const el = this.container.querySelector('#siProxyResult');
    if (!el) return;
    el.textContent = 'Searching via proxy...';
    try {
      const query = prompt('Enter search query (e.g. "function"):') || 'function';
      const result = await window.symbolIndexBridge.proxySearch(query, 50);
      el.textContent = JSON.stringify(result, null, 2);
    } catch (err) {
      el.textContent = 'Error: ' + err.message;
    }
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
    this._lastDirtyCount = count;
    if (this._dirtyDebounceTimer) clearTimeout(this._dirtyDebounceTimer);
    this._dirtyDebounceTimer = setTimeout(() => {
      this._dirtyDebounceTimer = null;
      this._processDirtyChanged(this._lastDirtyCount);
    }, 300);
  }

  _processDirtyChanged(count) {
    this._browseAllFiles = null;
    this._renderedCount = 0;
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