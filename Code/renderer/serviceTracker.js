const SERVICES = [
  { id: 'worker',         label: 'Worker Process',        group: 'Core' },
  { id: 'database',       label: 'Database Init',          group: 'Core' },
  { id: 'symbolIndexer',  label: 'Symbol Indexer',         group: 'Core' },
  { id: 'profileSync',    label: 'Profile Commit Sync',    group: 'Profile' },
  { id: 'profileWatcher', label: 'Profile File Watcher',   group: 'Profile' },
  { id: 'prefetchProfile',label: 'Prefetch: Profile',      group: 'Prefetch' },
  { id: 'prefetchTeam',   label: 'Prefetch: Team Activity',group: 'Prefetch' },
  { id: 'prefetchPorts',  label: 'Prefetch: Port Manager', group: 'Prefetch' },
];

const state = {
  open: false,
  services: {},
  autoOpened: false,
};

let _overlay = null;
let _modalBody = null;
let _footer = null;
let _navBtn = null;

function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _buildModal() {
  _overlay = document.createElement('div');
  _overlay.className = 'st-overlay';
  _overlay.style.display = 'none';

  const groups = {};
  for (const s of SERVICES) {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  }

  let bodyHtml = '';
  for (const [groupName, svcs] of Object.entries(groups)) {
    bodyHtml += `<div class="st-group"><div class="st-group-title">${_esc(groupName)}</div>`;
    for (const s of svcs) {
      bodyHtml += `<div class="st-row st-row-idle" id="st-row-${s.id}">
        <span class="st-icon st-idle">○</span>
        <span class="st-label">${_esc(s.label)}</span>
        <span class="st-status-text"></span>
      </div>`;
    }
    bodyHtml += '</div>';
  }

  _overlay.innerHTML = `
    <div class="st-modal">
      <div class="st-modal-header">
        <span class="st-modal-title">⚙ Background Services</span>
        <button class="st-modal-close" id="stCloseBtn">✕</button>
      </div>
      <div class="st-modal-body" id="stModalBody">${bodyHtml}</div>
      <div class="st-footer" id="stFooter">0 / ${SERVICES.length} complete</div>
    </div>
  `;

  _modalBody = _overlay.querySelector('#stModalBody');
  _footer = _overlay.querySelector('#stFooter');

  _overlay.querySelector('#stCloseBtn').addEventListener('click', close);
  _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });

  document.body.appendChild(_overlay);
}

function _buildNavBtn() {
  const container = document.querySelector('.navbar-section.right');
  if (!container) return;
  const btn = document.createElement('button');
  btn.id = 'stNavBtn';
  btn.className = 'tool-btn';
  btn.title = 'Background Services';
  btn.innerHTML = '<span class="st-nav-icon">⚙</span><span class="st-nav-badge" id="stNavBadge"></span>';
  btn.addEventListener('click', toggle);
  container.insertBefore(btn, container.firstChild);
  _navBtn = btn;
}

export function open() {
  if (_overlay) _overlay.style.display = '';
  state.open = true;
}

export function close() {
  if (_overlay) _overlay.style.display = 'none';
  state.open = false;
}

export function toggle() {
  if (state.open) close();
  else open();
}

function _statusIcon(status) {
  if (status === 'running') return '<span class="st-spinner">↻</span>';
  if (status === 'done')    return '<span class="st-done">✓</span>';
  if (status === 'failed')  return '<span class="st-failed">✗</span>';
  return '<span class="st-idle">○</span>';
}

function _updateServiceRow(id) {
  const row = document.getElementById('st-row-' + id);
  if (!row) return;
  const s = state.services[id] || { status: 'idle', detail: '' };
  row.className = 'st-row st-row-' + s.status;
  const icon = row.querySelector('.st-icon');
  if (icon) icon.innerHTML = _statusIcon(s.status);
  const detail = row.querySelector('.st-status-text');
  if (detail) {
    if (s.status === 'failed' && s.detail) {
      detail.textContent = s.detail;
    } else if (s.status === 'done') {
      detail.textContent = 'Done';
    } else if (s.status === 'running') {
      detail.textContent = s.detail || 'Running...';
    } else {
      detail.textContent = '';
    }
  }
}

function _updateNavBtn() {
  if (!_navBtn) return;
  const badge = document.getElementById('stNavBadge');
  if (!badge) return;
  const counts = { running: 0, idle: 0, done: 0, failed: 0 };
  for (const s of SERVICES) {
    const st = state.services[s.id]?.status || 'idle';
    counts[st]++;
  }
  if (counts.running > 0) {
    badge.className = 'st-nav-badge running';
    badge.textContent = '↻';
  } else if (counts.failed > 0) {
    badge.className = 'st-nav-badge failed';
    badge.textContent = '✗';
  } else if (counts.done > 0) {
    badge.className = 'st-nav-badge done';
    badge.textContent = '✓';
  } else {
    badge.className = 'st-nav-badge';
    badge.textContent = '';
  }
}

function _updateSummary() {
  if (!_footer) return;
  const done = SERVICES.filter(s => {
    const st = state.services[s.id]?.status;
    return st === 'done' || st === 'failed';
  }).length;
  _footer.textContent = `${done} / ${SERVICES.length} complete`;
}

function _allSettled() {
  return SERVICES.every(s => {
    const st = state.services[s.id]?.status;
    return st === 'done' || st === 'failed' || !st;
  });
}

export async function init() {
  _buildModal();
  _buildNavBtn();

  try {
    const all = await window.serviceTrackerAPI.getAll();
    console.log('[ServiceTracker] init: getAll returned', JSON.stringify(all));
    state.services = all || {};
  } catch (err) {
    console.error('[ServiceTracker] init: getAll failed', err);
  }

  for (const s of SERVICES) {
    _updateServiceRow(s.id);
  }
  _updateNavBtn();
  _updateSummary();

  if (!state.autoOpened) {
    for (const s of SERVICES) {
      if (state.services[s.id]?.status === 'running') {
        state.autoOpened = true;
        open();
        break;
      }
    }
  }

  window.serviceTrackerAPI.onUpdate((data) => {
    state.services[data.id] = {
      status: data.status,
      detail: data.detail,
      ts: Date.now(),
    };
    _updateServiceRow(data.id);
    _updateNavBtn();
    _updateSummary();

    if (!state.autoOpened && data.status === 'running') {
      state.autoOpened = true;
      open();
    }

    if (_allSettled()) {
      setTimeout(() => {
        if (_allSettled() && state.autoOpened) close();
      }, 3000);
    }
  });
}
