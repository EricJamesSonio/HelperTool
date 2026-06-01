/**
 * locToolUI.js
 * Responsible for building the UI template and wiring DOM events.
 * Single responsibility: UI structure and event binding only.
 */

import LocResultsRenderer from './locResultsRenderer.js';

export default class LocToolUI {
  constructor(scanner, settings) {
    this.scanner   = scanner;
    this.settings  = settings;
    this.renderer  = null;
    this.container = null;
    this.results   = [];
    this.scanning  = false;
  }

  render(container) {
    this.container = container;
    container.innerHTML = this._template();
    this.renderer = new LocResultsRenderer(this._el('locResults'));
    this._bindEvents();
    this._applySettings();
    this.renderer.renderEmpty();
  }

  _template() {
    return `
      <div class="loc-panel">
        <div class="loc-settings">
          <div class="loc-path-row">
            <input id="locPath" class="loc-path-input" type="text" placeholder="Project root path…" />
            <button id="locScanBtn" class="loc-scan-btn">Scan</button>
          </div>
          <div class="loc-threshold-row">
            <span class="loc-label">Threshold:</span>
            <input id="locThreshold" class="loc-slider" type="range" min="50" max="1000" step="50" value="200" />
            <span id="locThresholdDisplay" class="loc-threshold-display">200</span>
            <select id="locMode" class="loc-mode-select">
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
            <span id="locModeLabel" class="loc-mode-label">Show files with 200+ lines</span>
          </div>
        </div>

        <div id="locError" class="loc-error"></div>

        <div class="loc-stats-bar">
          <span id="locStats" style="display:flex;align-items:center;gap:8px;width:100%;"></span>
        </div>

        <div class="loc-filter-row">
          <span class="loc-label">Sort:</span>
          <select id="locSort" class="loc-sort-select">
            <option value="lines-desc">Most lines first</option>
            <option value="lines-asc">Fewest lines first</option>
            <option value="name">File name A–Z</option>
            <option value="path">Path A–Z</option>
          </select>
          <span class="loc-label">Type:</span>
          <select id="locExtFilter" class="loc-ext-select">
            <option value="">All types</option>
          </select>
        </div>

        <div id="locResults" class="loc-results"></div>
      </div>`;
  }

  _bindEvents() {
    this._el('locScanBtn').addEventListener('click', () => this._startScan());

    this._el('locThreshold').addEventListener('input', (e) => {
      this._el('locThresholdDisplay').textContent = e.target.value;
      this._updateModeLabel();
    });

    this._el('locMode').addEventListener('change', () => this._updateModeLabel());

    this._el('locSort').addEventListener('change', () =>
      this.renderer.renderResults(this.results, this._el('locSort').value, this._el('locExtFilter').value)
    );

    this._el('locExtFilter').addEventListener('change', () =>
      this.renderer.renderResults(this.results, this._el('locSort').value, this._el('locExtFilter').value)
    );
  }

  _applySettings() {
    this._el('locThreshold').value = this.settings.threshold;
    this._el('locThresholdDisplay').textContent = this.settings.threshold;
    this._el('locMode').value = this.settings.mode;
    this._updateModeLabel();
  }

  _updateModeLabel() {
    const mode = this._el('locMode').value;
    const val  = this._el('locThreshold').value;
    this._el('locModeLabel').textContent = mode === 'above'
      ? `Show files with ${val}+ lines`
      : `Show files with fewer than ${val} lines`;
  }

  async _startScan() {
    if (this.scanning) return;

    const rootPath  = this._el('locPath').value.trim();
    const threshold = parseInt(this._el('locThreshold').value, 10);
    const mode      = this._el('locMode').value;

    if (!rootPath) { this._showError('Please enter a directory path to scan.'); return; }

    this.settings.save(threshold, mode);
    this.scanning = true;
    this._setLoadingState(true);
    this._clearError();

    try {
      const response = await this.scanner.scan({ rootPath, threshold, mode });
      this.results = response.files;
      this.renderer.renderStats(response);
      this.renderer.populateExtFilter(response.files, this._el('locExtFilter'));
      this.renderer.renderResults(response.files, this._el('locSort').value, this._el('locExtFilter').value);
    } catch (err) {
      this._showError(err.message);
    } finally {
      this.scanning = false;
      this._setLoadingState(false);
    }
  }

  _setLoadingState(loading) {
    const btn = this._el('locScanBtn');
    btn.disabled = loading;
    btn.textContent = loading ? 'Scanning…' : 'Scan';
  }

  _showError(msg) {
    const el = this._el('locError');
    el.textContent = msg;
    el.style.display = 'block';
  }

  _clearError() {
    const el = this._el('locError');
    el.textContent = '';
    el.style.display = 'none';
  }

  _el(id) {
    return this.container.querySelector('#' + id);
  }
}