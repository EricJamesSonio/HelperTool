class LocDetector {
  constructor() {
    this.results = [];
    this.settings = {
      threshold: 200,
      mode: 'above',
      ignorePatterns: []
    };
    this.scanning = false;
  }

  init() {
    this._bindUI();
    this._loadSettings();
    this._renderEmpty();
  }

  _bindUI() {
    document.getElementById('loc-scan-btn').addEventListener('click', () => this.startScan());
    document.getElementById('loc-threshold').addEventListener('input', (e) => {
      document.getElementById('loc-threshold-display').textContent = e.target.value;
    });
    document.getElementById('loc-mode').addEventListener('change', () => this._updateModeLabel());
    document.getElementById('loc-sort').addEventListener('change', () => this._renderResults(this.results));
    document.getElementById('loc-ext-filter').addEventListener('change', () => this._renderResults(this.results));
  }

  _loadSettings() {
    try {
      const saved = localStorage.getItem('loc-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...this.settings, ...parsed };
        document.getElementById('loc-threshold').value = this.settings.threshold;
        document.getElementById('loc-threshold-display').textContent = this.settings.threshold;
        document.getElementById('loc-mode').value = this.settings.mode;
      }
    } catch {}
    this._updateModeLabel();
  }

  _saveSettings() {
    this.settings.threshold = parseInt(document.getElementById('loc-threshold').value, 10);
    this.settings.mode = document.getElementById('loc-mode').value;
    try {
      localStorage.setItem('loc-settings', JSON.stringify(this.settings));
    } catch {}
  }

  _updateModeLabel() {
    const mode = document.getElementById('loc-mode').value;
    const threshold = document.getElementById('loc-threshold').value;
    const label = document.getElementById('loc-mode-label');
    if (label) {
      label.textContent = mode === 'above'
        ? `Show files with ${threshold}+ lines`
        : `Show files with fewer than ${threshold} lines`;
    }
  }

  async startScan() {
    if (this.scanning) return;

    const rootPath = document.getElementById('loc-path').value.trim();
    if (!rootPath) {
      this._showError('Please enter a directory path to scan.');
      return;
    }

    this._saveSettings();
    this.scanning = true;
    this._setLoadingState(true);
    this._clearError();

    try {
      const response = await window.locBridge.scan({
        rootPath,
        threshold: this.settings.threshold,
        mode: this.settings.mode,
        ignorePatterns: this.settings.ignorePatterns
      });

      if (!response.success) {
        this._showError(response.error || 'Scan failed.');
        return;
      }

      this.results = response.files;
      this._updateStats(response);
      this._populateExtFilter(response.files);
      this._renderResults(response.files);
    } catch (err) {
      this._showError('Unexpected error: ' + err.message);
    } finally {
      this.scanning = false;
      this._setLoadingState(false);
    }
  }

  _setLoadingState(loading) {
    const btn = document.getElementById('loc-scan-btn');
    const spinner = document.getElementById('loc-spinner');
    btn.disabled = loading;
    btn.textContent = loading ? 'Scanning…' : 'Scan';
    if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
  }

  _updateStats(response) {
    const statsEl = document.getElementById('loc-stats');
    if (!statsEl) return;
    statsEl.innerHTML = `
      <span class="loc-stat">Total files scanned: <strong>${response.total}</strong></span>
      <span class="loc-stat-sep">·</span>
      <span class="loc-stat">Matched: <strong>${response.matched}</strong></span>
      <span class="loc-stat-sep">·</span>
      <span class="loc-stat loc-stat-time">Last scan: ${new Date(response.scannedAt).toLocaleTimeString()}</span>
    `;
  }

  _populateExtFilter(files) {
    const extSet = new Set(files.map(f => f.ext));
    const select = document.getElementById('loc-ext-filter');
    const current = select.value;
    select.innerHTML = '<option value="">All types</option>';
    [...extSet].sort().forEach(ext => {
      const opt = document.createElement('option');
      opt.value = ext;
      opt.textContent = ext;
      select.appendChild(opt);
    });
    if (current && extSet.has(current)) select.value = current;
  }

  _getFilteredAndSorted(files) {
    const ext = document.getElementById('loc-ext-filter').value;
    const sort = document.getElementById('loc-sort').value;

    let list = ext ? files.filter(f => f.ext === ext) : [...files];

    if (sort === 'lines-desc') list.sort((a, b) => b.lines - a.lines);
    else if (sort === 'lines-asc') list.sort((a, b) => a.lines - b.lines);
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'path') list.sort((a, b) => a.path.localeCompare(b.path));

    return list;
  }

  _renderResults(files) {
    const container = document.getElementById('loc-results');
    if (!container) return;

    const list = this._getFilteredAndSorted(files);

    if (list.length === 0) {
      container.innerHTML = `<div class="loc-empty-results">No files matched your criteria.</div>`;
      return;
    }

    const maxLines = Math.max(...list.map(f => f.lines), 1);

    container.innerHTML = list.map(file => {
      const barWidth = Math.round((file.lines / maxLines) * 100);
      const severity = this._getSeverity(file.lines);
      return `
        <div class="loc-file-row" data-severity="${severity}">
          <div class="loc-file-info">
            <span class="loc-file-name">${this._escHtml(file.name)}</span>
            <span class="loc-file-path">${this._escHtml(file.path)}</span>
          </div>
          <div class="loc-bar-area">
            <div class="loc-bar-track">
              <div class="loc-bar-fill loc-bar-${severity}" style="width: ${barWidth}%"></div>
            </div>
            <span class="loc-line-count loc-count-${severity}">${file.lines.toLocaleString()}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  _getSeverity(lines) {
    if (lines >= 500) return 'critical';
    if (lines >= 200) return 'warning';
    return 'ok';
  }

  _renderEmpty() {
    const container = document.getElementById('loc-results');
    if (container) {
      container.innerHTML = `<div class="loc-empty-state">Enter a path and hit Scan to detect file sizes.</div>`;
    }
  }

  _showError(msg) {
    const el = document.getElementById('loc-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  _clearError() {
    const el = document.getElementById('loc-error');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  _escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

const locDetector = new LocDetector();
document.addEventListener('DOMContentLoaded', () => locDetector.init());