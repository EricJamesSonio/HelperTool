import { state } from './state.js';
import { loadAll } from '../workspace/workspaceStore.js';
import { getProjectByRepoPath } from '../workspace/projectManager.js';
import { getTicketsByProject, updateTicketStatus, TICKET_STATUSES, STATUS_COLORS, PRIORITY_COLORS } from '../workspace/ticketManager.js';

let _initialized = false;

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export async function openTicketPanel() {
  const existing = document.getElementById('ocTicketPanelModal');
  if (existing) existing.remove();

  const repoPath = state.activeTab;
  if (!repoPath) return;

  if (!_initialized) {
    await loadAll();
    _initialized = true;
  }

  const project = getProjectByRepoPath(repoPath);
  if (!project) return;

  const tickets = getTicketsByProject(project.id);

  const overlay = document.createElement('div');
  overlay.id = 'ocTicketPanelModal';
  overlay.className = 'oc-tp-overlay';
  document.body.appendChild(overlay);

  const modal = document.createElement('div');
  modal.className = 'oc-tp-modal';
  overlay.appendChild(modal);

  function close() { overlay.remove(); }
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const kbHandler = (e) => {
    if (e.key === 'Escape' && document.getElementById('ocTicketPanelModal')) {
      close();
      document.removeEventListener('keydown', kbHandler);
    }
  };
  document.addEventListener('keydown', kbHandler);

  function populateInput(text) {
    const input = document.getElementById('ocInput');
    if (!input) return;
    const existing = input.value.trim();
    input.value = existing ? existing + '\n' + text : text;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    input.selectionStart = input.selectionEnd = input.value.length;
    input.focus();
    close();
  }

  let activeFilter = 'all';

  function render() {
    const filtered = activeFilter === 'all'
      ? tickets
      : tickets.filter(t => t.status === activeFilter);

    modal.innerHTML = `
      <div class="oc-tp-header">
        <span class="oc-tp-title">Tickets — ${_esc(project.title)}</span>
        <button class="oc-tp-close" id="ocTpClose">✕</button>
      </div>
      <div class="oc-tp-filters" id="ocTpFilters">
        <button class="oc-tp-filter ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${tickets.length})</button>
        ${TICKET_STATUSES.map(s => `
          <button class="oc-tp-filter ${activeFilter === s ? 'active' : ''}" data-filter="${s}" style="--tp-color:${STATUS_COLORS[s]}">
            ${s} (${tickets.filter(t => t.status === s).length})
          </button>`).join('')}
      </div>
      <div class="oc-tp-body" id="ocTpBody">
        ${filtered.length === 0 ? '<div class="oc-tp-empty">No tickets in this view.</div>' : ''}
      </div>
    `;

    modal.querySelector('#ocTpClose').addEventListener('click', close);

    modal.querySelectorAll('.oc-tp-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter;
        render();
      });
    });

    const body = modal.querySelector('#ocTpBody');
    if (!filtered.length) return;

    filtered.forEach(t => {
      const pColor = PRIORITY_COLORS[t.priority] || '#8b949e';
      const sColor = STATUS_COLORS[t.status] || '#556080';

      const card = document.createElement('div');
      card.className = 'oc-tp-card';
      card.innerHTML = `
        <div class="oc-tp-card-top">
          <span class="oc-tp-status-dot" style="background:${sColor}"></span>
          <span class="oc-tp-card-title">${_esc(t.title)}</span>
          <span class="oc-tp-priority" style="color:${pColor}">${t.priority}</span>
        </div>
        <div class="oc-tp-card-desc">${_esc(t.description || 'No description')}</div>
        <div class="oc-tp-card-meta">
          <span class="oc-tp-card-time">${_timeAgo(t.updatedAt)}</span>
          <select class="oc-tp-status-select" data-ticket-id="${t.id}">
            ${TICKET_STATUSES.map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.oc-tp-status-select')) return;
        const text = `**Ticket: ${t.title}**\n${t.description || ''}`;
        populateInput(text);
      });

      const select = card.querySelector('.oc-tp-status-select');
      select.addEventListener('change', async () => {
        const newStatus = select.value;
        try {
          updateTicketStatus(t.id, newStatus);
          t.status = newStatus;
          render();
        } catch (err) {
          console.error('[TP] status update failed:', err);
        }
      });

      body.appendChild(card);
    });
  }

  render();
}


