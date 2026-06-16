const SERVICES = [
  { id: 'worker',         label: 'Worker Process',        group: 'Core', icon: '⚙' },
  { id: 'database',       label: 'Database Init',          group: 'Core', icon: '🗄' },
  { id: 'symbolIndexer',  label: 'Symbol Indexer',         group: 'Core', icon: '🔍' },
  { id: 'profileSync',    label: 'Profile Commit Sync',    group: 'Profile', icon: '🔄' },
  { id: 'profileWatcher', label: 'Profile File Watcher',   group: 'Profile', icon: '👁' },
  { id: 'prefetchProfile',label: 'Prefetch: Profile',      group: 'Prefetch', icon: '📥' },
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
        <span class="st-icon st-idle" style="font-size:16px">${s.icon}</span>
        <span class="st-label">${_esc(s.label)}</span>
        <span class="st-status-text"></span>
      </div>`;
    }
    bodyHtml += '</div>';
  }

  _overlay.innerHTML = `
    <div class="st-modal">
      <div class="st-modal-header">
        <span class="st-modal-title"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41"/></svg> Background Services</span>
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

const _statusIcons = {
  running: '<svg class="st-spinner" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6" opacity="0.3"/><path d="M8 2a6 6 0 0 1 6 6" stroke-linecap="round"/></svg>',
  done: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none"><circle cx="8" cy="8" r="6" fill="#3fb950"/><path d="M5 8l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  failed: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none"><circle cx="8" cy="8" r="6" fill="#f85149"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
  idle: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none"><circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5" opacity="0.4"/></svg>',
};

function _updateServiceRow(id) {
  const row = document.getElementById('st-row-' + id);
  if (!row) return;
  const s = state.services[id] || { status: 'idle', detail: '' };
  row.className = 'st-row st-row-' + s.status;
  const icon = row.querySelector('.st-icon');
  if (icon) icon.innerHTML = _statusIcons[s.status] || _statusIcons.idle;
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
    return st === 'done' || st === 'failed';
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

  window.serviceTrackerAPI.onUpdate((data) => {
    state.services[data.id] = {
      status: data.status,
      detail: data.detail,
      ts: Date.now(),
    };
    _updateServiceRow(data.id);
    _updateNavBtn();
    _updateSummary();

    if (_allSettled()) {
      setTimeout(() => {
        if (_allSettled() && state.autoOpened) close();
      }, 3000);
    }
  });
}
