import * as state from './state.js';

export function bytes(v) {
  if (v == null) return '—';
  if (v >= 1073741824) return (v / 1073741824).toFixed(1) + ' GB';
  if (v >= 1048576) return (v / 1048576).toFixed(1) + ' MB';
  if (v >= 1024) return (v / 1024).toFixed(1) + ' KB';
  return v + ' B';
}

export function showToast(msg, type) {
  const el = document.createElement('div');
  el.className = `dt-toast dt-toast-${type || 'info'}`;
  el.textContent = msg;
  document.getElementById('dtPanel').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2500);
}

export function loading(show) {
  state.set('loading', show);
  const overlay = document.getElementById('dtOverlay');
  if (!overlay) return;
  overlay.classList.toggle('dt-loading', show);
}

export function updateBadge(connected) {
  const badge = document.getElementById('dtStatusBadge');
  if (!badge) return;
  badge.textContent = connected ? 'connected' : 'disconnected';
  badge.className = 'dt-badge' + (connected ? ' dt-badge-ok' : ' dt-badge-err');
}
