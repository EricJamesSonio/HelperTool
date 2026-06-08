let _panel = null;
let _panelOpen = false;
let _refreshTimer = null;
let _data = null;
let _filterText = '';
let _killingPids = new Set();

const ICON_REFRESH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10a7 7 0 0 1-14 0"/><path d="M17 3v7h-7"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';
const ICON_PORT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h10M5 13h10"/><path d="M7 7V3M13 7V3M7 13v4M13 13v4"/><rect x="3" y="7" width="14" height="6" rx="1"/></svg>';

async function refresh() {
  const btn = _panel?.querySelector('.pm-btn-refresh');
  if (btn) btn.classList.add('spinning');

  try {
    _data = await window.electronAPI.portManagerList();
    render();
  } catch (err) {
    showToast('Failed to list ports: ' + err.message, 'error');
  }

  if (btn) btn.classList.remove('spinning');
}

function render() {
  const body = _panel?.querySelector('.pm-body');
  if (!body) return;

  const statsEl = _panel.querySelector('.pm-stats');
  if (statsEl && _data) {
    statsEl.textContent = `${_data.counts.ports} port\u00B7${_data.counts.processes} process\u00B7${_data.counts.ports !== 1 ? 's' : ''} ${_data.counts.processes !== 1 ? 'es' : ''}`;
    statsEl.textContent = `${_data.counts.ports} port${_data.counts.ports !== 1 ? 's' : ''} \u00B7 ${_data.counts.processes} process${_data.counts.processes !== 1 ? 'es' : ''}`;
  }

  if (!_data || Object.keys(_data.groups).length === 0) {
    body.innerHTML = '<div class="pm-empty">No listening ports found</div>';
    return;
  }

  let html = '';
  const filter = _filterText.toLowerCase().trim();

  for (const [port, processes] of Object.entries(_data.groups)) {
    const filtered = filter
      ? processes.filter(p =>
          port.includes(filter) ||
          p.name.toLowerCase().includes(filter) ||
          String(p.pid).includes(filter)
        )
      : processes;

    if (filtered.length === 0) continue;

    const allProtected = filtered.every(p => p.protected);
    const totalCount = processes.length;

    html += `<div class="pm-group" data-port="${port}">`;
    html += `<div class="pm-group-header">`;
    html += `<span class="pm-group-port">${port}</span>`;
    html += `<span class="pm-group-badge">${filtered.length} of ${totalCount}</span>`;
    if (!allProtected) {
      html += `<button class="pm-group-kill-all" data-action="kill-all" data-port="${port}">Kill All</button>`;
    }
    html += `</div>`;

    for (const proc of filtered) {
      const isKilling = _killingPids.has(proc.pid);
      html += `<div class="pm-row" data-pid="${proc.pid}">`;
      html += `<span class="pm-row-name">${esc(proc.name)}</span>`;
      html += `<span class="pm-row-pid">${proc.pid}</span>`;
      if (proc.protected) {
        html += `<span class="pm-row-badge protected">Protected</span>`;
        html += `<button class="pm-row-kill" disabled>Kill</button>`;
      } else if (isKilling) {
        html += `<span class="pm-row-badge killing">Killing\u2026</span>`;
        html += `<button class="pm-row-kill" disabled>Kill</button>`;
      } else {
        html += `<button class="pm-row-kill" data-action="kill" data-pid="${proc.pid}">Kill</button>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
  }

  if (!html) {
    body.innerHTML = '<div class="pm-empty">No matching ports found</div>';
    return;
  }

  body.innerHTML = html;

  body.querySelectorAll('[data-action="kill"]').forEach(btn => {
    btn.addEventListener('click', () => killPid(Number(btn.dataset.pid)));
  });
  body.querySelectorAll('[data-action="kill-all"]').forEach(btn => {
    btn.addEventListener('click', () => killAll(btn.dataset.port));
  });
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function killPid(pid) {
  _killingPids.add(pid);
  render();

  try {
    const result = await window.electronAPI.portManagerKill(pid);
    if (result.success) {
      showToast(`Process ${pid} killed`, 'success');
    } else {
      showToast(`Failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast('Error killing process: ' + err.message, 'error');
  }

  _killingPids.delete(pid);
  refresh();
}

async function killAll(port) {
  const processes = _data?.groups[port];
  if (!processes) return;

  for (const proc of processes) {
    if (proc.protected) continue;
    _killingPids.add(proc.pid);
  }
  render();

  for (const proc of processes) {
    if (proc.protected) continue;
    try {
      await window.electronAPI.portManagerKill(proc.pid);
    } catch {}
    _killingPids.delete(proc.pid);
  }

  showToast(`Killed processes on port ${port}`, 'success');
  refresh();
}

function showToast(msg, type) {
  const existing = _panel?.querySelector('.pm-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'pm-toast ' + type;
  el.textContent = msg;
  _panel?.querySelector('.pm-container')?.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function createPanel() {
  const panel = document.createElement('div');
  panel.className = 'pm-panel';
  panel.id = 'portManagerPanel';
  panel.innerHTML = `
    <div class="pm-backdrop"></div>
    <div class="pm-container">
      <div class="pm-header">
        <h2>${ICON_PORT} Port Manager</h2>
        <input type="text" class="pm-filter" id="pmFilter" placeholder="Filter by port, name, or PID\u2026">
        <button class="pm-btn pm-btn-refresh" id="pmRefreshBtn" title="Refresh">${ICON_REFRESH}</button>
        <span class="pm-stats"></span>
        <button class="pm-btn pm-btn-close" id="pmCloseBtn" title="Close">${ICON_CLOSE}</button>
      </div>
      <div class="pm-body"></div>
    </div>
  `;
  document.body.appendChild(panel);
  return panel;
}

function wireEvents() {
  const backdrop = _panel.querySelector('.pm-backdrop');
  backdrop.addEventListener('click', closePortManagerPanel);

  _panel.querySelector('#pmCloseBtn').addEventListener('click', closePortManagerPanel);

  _panel.querySelector('#pmRefreshBtn').addEventListener('click', refresh);

  const filterInput = _panel.querySelector('#pmFilter');
  filterInput.addEventListener('input', () => {
    _filterText = filterInput.value;
    render();
  });

  document.addEventListener('keydown', function pmEsc(e) {
    if (e.key === 'Escape' && _panelOpen) {
      closePortManagerPanel();
    }
  });
}

export function initPortManager() {
}

export async function openPortManagerPanel() {
  if (_panelOpen) return;

  if (!_panel) {
    _panel = createPanel();
    wireEvents();
  }

  _panelOpen = true;
  _panel.classList.add('pm-open');

  await refresh();

  _refreshTimer = setInterval(refresh, 5000);
}

export function closePortManagerPanel() {
  if (!_panelOpen) return;

  _panelOpen = false;
  _panel.classList.remove('pm-open');

  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}

export function isPortManagerPanelOpen() {
  return _panelOpen;
}
