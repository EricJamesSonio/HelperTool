import { getLogModal } from './template.js';

export function openLogModal(containerId, containerName, logText) {
  let overlay = document.getElementById('dtLogOverlay');
  if (!overlay) {
    const div = document.createElement('div');
    div.innerHTML = getLogModal();
    overlay = div.firstElementChild;
    document.getElementById('dtPanel').appendChild(overlay);
    overlay.querySelector('#dtLogClose').addEventListener('click', () => closeLogModal());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLogModal(); });
  }
  document.getElementById('dtLogTitle').textContent = `Logs — ${containerName || containerId.slice(0, 12)}`;
  const body = document.getElementById('dtLogBody');
  body.textContent = '';
  if (logText) {
    const lines = logText.split('\n').filter(Boolean);
    lines.forEach(line => {
      const el = document.createElement('div');
      el.className = 'dt-log-line';
      el.textContent = line;
      body.appendChild(el);
    });
  }
  overlay.classList.add('open');
}

export function closeLogModal() {
  const overlay = document.getElementById('dtLogOverlay');
  if (overlay) overlay.classList.remove('open');
}
