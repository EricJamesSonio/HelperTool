let _panel = null;
let _open = false;
let _urlTests = [];

export function isOpen() { return _open; }

export function open() {
  if (_open) return;
  if (!_panel) _buildPanel();
  try { performance.setResourceTimingBufferSize(500); } catch {}
  _panel.classList.add('open');
  _open = true;
  _refreshInternal();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
}

function _escHandler(e) {
  if (e.key === 'Escape' && _open) close();
}

const ICON_GOOD = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="m4 8 3 3 5-5"/></svg>';
const ICON_AVG  = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="3" y1="8" x2="13" y2="8"/></svg>';
const ICON_SLOW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="m12 4-3 3 3 3"/><path d="M4 4v8"/></svg>';

function _navStatus(dur) {
  if (dur < 2000) return { cls: 'pt-badge-ok',  label: 'GOOD', icon: ICON_GOOD };
  if (dur < 4000) return { cls: 'pt-badge-avg', label: 'AVG',  icon: ICON_AVG };
  return { cls: 'pt-badge-slow', label: 'SLOW', icon: ICON_SLOW };
}

function _apiStatus(dur) {
  if (dur < 100)  return { cls: 'pt-badge-ok',  label: 'GOOD', icon: ICON_GOOD };
  if (dur < 300)  return { cls: 'pt-badge-avg', label: 'AVG',  icon: ICON_AVG };
  return { cls: 'pt-badge-slow', label: 'SLOW', icon: ICON_SLOW };
}

function _resStatus(dur) {
  if (dur < 100)  return { cls: 'pt-badge-ok',  label: 'GOOD', icon: ICON_GOOD };
  if (dur < 500)  return { cls: 'pt-badge-avg', label: 'AVG',  icon: ICON_AVG };
  return { cls: 'pt-badge-slow', label: 'SLOW', icon: ICON_SLOW };
}

function _fmt(ms) {
  if (ms == null || isNaN(ms)) return '-';
  return ms.toFixed(1) + ' ms';
}

function _fmtBytes(b) {
  if (!b || b < 0) return '-';
  if (b < 1024) return b + ' B';
  return (b / 1024).toFixed(1) + ' KB';
}

function _badge(s) {
  return `<span class="pt-badge ${s.cls}">${s.icon} ${s.label}</span>`;
}

function _gauge(dur, max) {
  const pct = Math.min(100, max > 0 ? (dur / max) * 100 : 0);
  const color = dur < 100 ? '#3fb950' : dur < 300 ? '#d29922' : '#f85149';
  return `<div class="pt-gauge"><div class="pt-gauge-fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.id = 'perfTrackerPanel';
  _panel.className = 'pt-overlay';
  _panel.innerHTML = `
    <div class="pt-modal">
      <div class="pt-navbar">
        <h1 class="pt-title"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M10 2a8 8 0 1 0 8 8"/><path d="M10 6a4 4 0 1 0 4 4"/><circle cx="10" cy="10" r="1.5"/></svg> Performance Tracker</h1>
        <div class="pt-navbar-right">
          <span class="pt-last-updated" id="ptUpdated"></span>
          <button class="pt-refresh-btn" id="ptRefreshBtn"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="1 4 1 10 7 10"/><polyline points="19 16 19 10 13 10"/><path d="M17.78 6.1A8 8 0 0 0 3.74 8.7"/><path d="M2.22 13.9A8 8 0 0 0 16.26 11.3"/></svg> Internal Refresh</button>
          <button class="pt-close-btn" id="ptCloseBtn"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg></button>
        </div>
      </div>
      <div class="pt-body" id="ptBody"></div>
    </div>
  `;

  document.body.appendChild(_panel);

  _panel.querySelector('#ptCloseBtn').addEventListener('click', close);
  _panel.querySelector('#ptRefreshBtn').addEventListener('click', _refreshInternal);
  _panel.addEventListener('click', function (e) { if (e.target === _panel) close(); });
  document.addEventListener('keydown', _escHandler);
}

async function _testUrl(url, method) {
  const testBtn = document.getElementById('ptTestBtn');
  const spinner = document.getElementById('ptTestSpinner');
  if (testBtn) testBtn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';

  try {
    const start = performance.now();
    const res = await fetch(url, { method, mode: 'cors' });
    const duration = performance.now() - start;
    let size = 0;
    try {
      const cloned = res.clone();
      const text = await cloned.text();
      size = new Blob([text]).size;
    } catch {}

    _urlTests.push({
      url, method, status: res.status, duration, size, time: new Date().toLocaleTimeString()
    });
  } catch (err) {
    _urlTests.push({
      url, method, status: 'ERR', duration: 0, size: 0, time: new Date().toLocaleTimeString(), error: err.message
    });
  }

  if (testBtn) testBtn.disabled = false;
  if (spinner) spinner.style.display = 'none';
  _refreshInternal();
}

function _refreshInternal() {
  const body = document.getElementById('ptBody');
  if (!body) return;

  const nav = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource');

  const navMetrics = nav ? [
    { label: 'TTFB', value: nav.responseStart - nav.startTime },
    { label: 'DOM Interactive', value: nav.domInteractive - nav.startTime },
    { label: 'DOM Content Loaded', value: nav.domContentLoadedEventEnd - nav.startTime },
    { label: 'DOM Complete', value: nav.domComplete - nav.startTime },
    { label: 'Load Event End', value: nav.loadEventEnd - nav.startTime },
  ] : [];

  const resMetrics = resources.map(r => ({
    name: r.name.length > 90 ? r.name.slice(0, 87) + '...' : r.name,
    type: r.initiatorType || 'other',
    dur: r.duration,
    size: r.transferSize || r.encodedBodySize || 0,
  })).sort((a, b) => b.dur - a.dur);

  const totalRes = resMetrics.length;
  const avgResDur = totalRes ? resMetrics.reduce((s, r) => s + r.dur, 0) / totalRes : 0;
  const slowRes = resMetrics.filter(r => r.dur >= 500).length;

  const totalUrl = _urlTests.length;
  const avgUrlDur = totalUrl ? _urlTests.reduce((s, r) => s + (r.duration || 0), 0) / totalUrl : 0;
  const slowUrl = _urlTests.filter(r => r.duration >= 300).length;

  const updated = document.getElementById('ptUpdated');
  if (updated) updated.textContent = new Date().toLocaleTimeString();

  const allSlow = slowRes + slowUrl;

  body.innerHTML = `
    <div class="pt-url-bar">
      <select class="pt-method-select" id="ptMethod">
        <option value="GET">GET</option>
        <option value="POST">POST</option>
        <option value="PUT">PUT</option>
        <option value="PATCH">PATCH</option>
        <option value="DELETE">DELETE</option>
      </select>
      <input class="pt-url-input" id="ptUrlInput" type="text" placeholder="http://localhost:3000/api/endpoint" spellcheck="false">
      <button class="pt-test-btn" id="ptTestBtn">Test</button>
      <span class="pt-test-spinner" id="ptTestSpinner"></span>
    </div>

    <div class="pt-summary">
      <div class="pt-stat"><span class="pt-stat-num">${totalUrl}</span><span class="pt-stat-label">URL Tests</span></div>
      <div class="pt-stat"><span class="pt-stat-num">${_fmt(avgUrlDur)}</span><span class="pt-stat-label">Avg API</span></div>
      <div class="pt-stat ${slowUrl > 0 ? 'pt-stat-warn' : ''}"><span class="pt-stat-num">${slowUrl}</span><span class="pt-stat-label">Slow APIs</span></div>
      <div class="pt-stat ${allSlow > 0 ? 'pt-stat-warn' : ''}"><span class="pt-stat-num">${totalRes}</span><span class="pt-stat-label">Resources</span></div>
      <div class="pt-stat"><span class="pt-stat-num">${_fmt(avgResDur)}</span><span class="pt-stat-label">Avg Resource</span></div>
      <div class="pt-stat ${slowRes > 0 ? 'pt-stat-warn' : ''}"><span class="pt-stat-num">${slowRes}</span><span class="pt-stat-label">Slow Resources</span></div>
    </div>

    <div class="pt-section">
      <div class="pt-section-title">URL Tests <span class="pt-section-count">${totalUrl}</span></div>
      ${totalUrl ? `
      <table class="pt-table">
        <thead><tr><th>Method</th><th>URL</th><th>Status</th><th>Duration</th><th>Size</th><th>Time</th><th></th></tr></thead>
        <tbody>
          ${_urlTests.slice().reverse().map(t => {
            const s = t.error || t.status;
            const st = t.error ? { cls: 'pt-badge-slow', label: 'ERR', icon: ICON_SLOW } : _apiStatus(t.duration);
            return `<tr>
              <td class="pt-cell-method">${t.method}</td>
              <td class="pt-cell-label" title="${t.url}">${t.url}</td>
              <td>${s}</td>
              <td>${_fmt(t.duration)}</td>
              <td class="pt-cell-size">${_fmtBytes(t.size)}</td>
              <td class="pt-cell-time">${t.time}</td>
              <td>${_badge(st)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<div class="pt-empty">Enter a URL above and click Test to measure an endpoint.</div>'}
    </div>

    ${navMetrics.length ? `
    <div class="pt-section">
      <div class="pt-section-title">Navigation Timing (this window)</div>
      <table class="pt-table">
        <thead><tr><th>Metric</th><th>Duration</th><th>Gauge</th><th>Status</th></tr></thead>
        <tbody>
          ${navMetrics.map(m => {
            const d = m.value;
            const s = _navStatus(d);
            return `<tr><td class="pt-cell-label">${m.label}</td><td>${_fmt(d)}</td><td>${_gauge(d, 5000)}</td><td>${_badge(s)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <div class="pt-section">
      <div class="pt-section-title">Resource Timing <span class="pt-section-count">${totalRes}</span></div>
      ${totalRes ? `
      <table class="pt-table">
        <thead><tr><th>Resource</th><th>Type</th><th>Duration</th><th>Gauge</th><th>Size</th><th>Status</th></tr></thead>
        <tbody>
          ${resMetrics.map(r => {
            const s = _resStatus(r.dur);
            return `<tr>
              <td class="pt-cell-label" title="${r.name}">${r.name}</td>
              <td class="pt-cell-type">${r.type}</td>
              <td>${_fmt(r.dur)}</td>
              <td>${_gauge(r.dur, 2000)}</td>
              <td class="pt-cell-size">${_fmtBytes(r.size)}</td>
              <td>${_badge(s)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<div class="pt-empty">No resources captured. Reload HelperTool and open this panel again to capture resource loading data.</div>'}
    </div>
  `;

  _wireUrlBar();
}

function _wireUrlBar() {
  const testBtn = document.getElementById('ptTestBtn');
  const urlInput = document.getElementById('ptUrlInput');
  const method = document.getElementById('ptMethod');
  if (!testBtn || !urlInput) return;

  const run = () => {
    const url = urlInput.value.trim();
    if (!url) return;
    _testUrl(url, method.value);
  };

  testBtn.addEventListener('click', run);
  urlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') run();
  });
}
