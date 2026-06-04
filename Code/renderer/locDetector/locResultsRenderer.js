/**
 * locResultsRenderer.js
 * Responsible for rendering scan results into the DOM.
 * Single responsibility: display logic only.
 */

export default class LocResultsRenderer {
  constructor(container) {
    this.container = container;
  }

  renderEmpty() {
    this.container.innerHTML =
      `<div class="loc-empty-state">Enter a path and hit Scan to detect file sizes.</div>`;
  }

  renderNoMatch() {
    this.container.innerHTML =
      `<div class="loc-empty-results">No files matched your criteria.</div>`;
  }

  renderStats(response) {
    const el = this.container.closest('.loc-panel').querySelector('#locStats');
    if (!el) return;
    el.innerHTML =
      `<span class="loc-stat">Scanned: <strong>${response.total}</strong></span>` +
      `<span class="loc-stat-sep">·</span>` +
      `<span class="loc-stat">Matched: <strong>${response.matched}</strong></span>` +
      `<span class="loc-stat-sep">·</span>` +
      `<span class="loc-stat loc-stat-time">Last scan: ${new Date(response.scannedAt).toLocaleTimeString()}</span>`;
  }

  renderResults(files, sortBy, extFilter) {
    const list = this._filterAndSort(files, sortBy, extFilter);

    if (!list.length) {
      this.renderNoMatch();
      return;
    }

    const maxLines = Math.max(...list.map(f => f.lines), 1);

    this.container.innerHTML = list.map(file => {
      const barWidth = Math.round((file.lines / maxLines) * 100);
      const sev = this._severity(file.lines);
      return `
        <div class="loc-file-row">
          <div class="loc-file-info">
            <span class="loc-file-name">${this._esc(file.name)}</span>
            <span class="loc-file-path">${this._esc(file.path)}</span>
          </div>
          <div class="loc-bar-area">
            <div class="loc-bar-track">
              <div class="loc-bar-fill loc-bar-${sev}" style="width:${barWidth}%"></div>
            </div>
            <span class="loc-line-count loc-count-${sev}">${file.lines.toLocaleString()}</span>
          </div>
        </div>`;
    }).join('');
  }

  populateExtFilter(files, selectEl) {
    const extSet = new Set(files.map(f => f.ext));
    const current = selectEl.value;
    selectEl.innerHTML = '<option value="">All types</option>';
    [...extSet].sort().forEach(ext => {
      const opt = document.createElement('option');
      opt.value = ext;
      opt.textContent = ext;
      selectEl.appendChild(opt);
    });
    if (current && extSet.has(current)) selectEl.value = current;
  }

  _filterAndSort(files, sortBy, extFilter) {
    let list = extFilter ? files.filter(f => f.ext === extFilter) : [...files];

    if (sortBy === 'lines-desc') list.sort((a, b) => b.lines - a.lines);
    else if (sortBy === 'lines-asc') list.sort((a, b) => a.lines - b.lines);
    else if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'path') list.sort((a, b) => a.path.localeCompare(b.path));

    return list;
  }

  _severity(lines) {
    if (lines >= 500) return 'critical';
    if (lines >= 200) return 'warning';
    return 'ok';
  }

  _esc(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}