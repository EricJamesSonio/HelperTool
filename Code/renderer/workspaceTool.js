/**
 * workspaceTool.js - v3 FIXED
 * ────────────────────────────
 * Card-based workspace manager with:
 * - Edit workers (name, role)
 * - Edit tickets (title, notes, status)
 * - Comprehensive audit logs of all actions
 * - Global activity timeline
 * - PERSISTENT STORAGE (workers/tickets/logs stay after close)
 */

import { confirmDialog } from './utils/confirmDialog.js';

const WORKER_ROLES = [
  'developer',
  'product manager',
  'frontend dev',
  'backend dev',
  'fullstack dev',
];

const STATUS_COLORS = {
  pending: '#f0b429',
  'in-progress': '#60a5fa',
  complete: '#34d399',
};

let _workers = [];
let _tickets = [];
let _auditLogs = []; // Global audit trail
let _isWorkspacePanelOpen = false;
let _selectedWorker = null;
let _editingTicket = null; // Track which ticket is being edited

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────────────────────────────────────────

export async function initWorkspaceTool() {
  try {
    const data = await window.electronAPI.workspaceGetAll();
    _workers = data?.workers || [];
    _tickets = data?.tickets || [];
    _auditLogs = data?.auditLogs || [];
    console.log('[WorkspaceTool] ✅ Loaded', _workers.length, 'workers,', _tickets.length, 'tickets,', _auditLogs.length, 'logs');
  } catch (err) {
    console.error('[WorkspaceTool] ❌ Failed to load:', err);
    _workers = [];
    _tickets = [];
    _auditLogs = [];
  }
}

export function isWorkspacePanelOpen() {
  return _isWorkspacePanelOpen;
}

export async function openWorkspacePanel() {
  if (_isWorkspacePanelOpen) return;
  await initWorkspaceTool(); // Load fresh data from disk
  _ensureWorkspacePanel();
  _selectedWorker = null;
  _editingTicket = null;
  _render();
  document.getElementById('workspaceContainer')?.classList.add('open');
  _isWorkspacePanelOpen = true;
}

export function closeWorkspacePanel() {
  document.getElementById('workspaceContainer')?.classList.remove('open');
  _isWorkspacePanelOpen = false;
}

// ────────────────────────────────────────────────────────────────────────────
// AUDIT LOGGING
// ────────────────────────────────────────────────────────────────────────────

function _addAuditLog(action, details) {
  const log = {
    id: Date.now().toString(),
    action,
    details,
    timestamp: new Date().toISOString(),
  };
  _auditLogs.unshift(log); // Add to beginning (most recent first)
  console.log('[WorkspaceTool] 📝 Audit log:', action, details);
}

// ────────────────────────────────────────────────────────────────────────────
// WORKER MANAGEMENT
// ────────────────────────────────────────────────────────────────────────────

function addWorker(name, role) {
  if (!name?.trim() || !WORKER_ROLES.includes(role)) {
    throw new Error('Invalid worker name or role');
  }
  const worker = {
    id: Date.now().toString(),
    name: name.trim(),
    role,
    createdAt: new Date().toISOString(),
  };
  _workers.push(worker);
  _addAuditLog('WORKER_CREATED', {
    workerId: worker.id,
    workerName: worker.name,
    workerRole: worker.role,
  });
  _saveData();
  return worker;
}

function updateWorker(workerId, name, role) {
  if (!name?.trim() || !WORKER_ROLES.includes(role)) {
    throw new Error('Invalid worker name or role');
  }
  const worker = _workers.find(w => w.id === workerId);
  if (!worker) throw new Error('Worker not found');
  
  const oldName = worker.name;
  const oldRole = worker.role;
  
  worker.name = name.trim();
  worker.role = role;
  
  _addAuditLog('WORKER_UPDATED', {
    workerId,
    oldName,
    newName: worker.name,
    oldRole,
    newRole: worker.role,
  });
  _saveData();
}

function deleteWorker(id) {
  const worker = _workers.find(w => w.id === id);
  if (!worker) throw new Error('Worker not found');
  
  _workers = _workers.filter(w => w.id !== id);
  
  const affectedTickets = _tickets.filter(t => t.assignedTo === id);
  _tickets = _tickets.filter(t => t.assignedTo !== id);
  
  _addAuditLog('WORKER_DELETED', {
    workerId: id,
    workerName: worker.name,
    workerRole: worker.role,
    affectedTicketsCount: affectedTickets.length,
  });
  
  if (_selectedWorker?.id === id) _selectedWorker = null;
  _saveData();
}

function getWorkerById(id) {
  return _workers.find(w => w.id === id);
}

function getWorkerTickets(workerId) {
  return _tickets.filter(t => t.assignedTo === workerId);
}

// ────────────────────────────────────────────────────────────────────────────
// TICKET MANAGEMENT
// ────────────────────────────────────────────────────────────────────────────

function addTicket(workerId, title, notes = '') {
  if (!title?.trim()) throw new Error('Ticket title required');
  if (!_workers.find(w => w.id === workerId)) throw new Error('Invalid worker');
  
  const worker = getWorkerById(workerId);
  const ticket = {
    id: Date.now().toString(),
    assignedTo: workerId,
    title: title.trim(),
    notes: notes.trim(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  _tickets.push(ticket);
  
  _addAuditLog('TICKET_CREATED', {
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    workerId,
    workerName: worker.name,
  });
  
  _saveData();
  return ticket;
}

function updateTicket(ticketId, title, notes, status) {
  if (!title?.trim()) throw new Error('Ticket title required');
  if (!['pending', 'in-progress', 'complete'].includes(status)) {
    throw new Error('Invalid status');
  }
  
  const ticket = _tickets.find(t => t.id === ticketId);
  if (!ticket) throw new Error('Ticket not found');
  
  const oldTitle = ticket.title;
  const oldNotes = ticket.notes;
  const oldStatus = ticket.status;
  
  ticket.title = title.trim();
  ticket.notes = notes.trim();
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  
  const worker = getWorkerById(ticket.assignedTo);
  
  const changes = [];
  if (oldTitle !== ticket.title) changes.push(`title: "${oldTitle}" → "${ticket.title}"`);
  if (oldNotes !== ticket.notes) changes.push('notes updated');
  if (oldStatus !== status) changes.push(`status: ${oldStatus} → ${status}`);
  
  _addAuditLog('TICKET_UPDATED', {
    ticketId,
    ticketTitle: ticket.title,
    workerId: ticket.assignedTo,
    workerName: worker.name,
    changes: changes.join(', '),
  });
  
  _saveData();
}

function updateTicketStatus(ticketId, status) {
  if (!['pending', 'in-progress', 'complete'].includes(status)) {
    throw new Error('Invalid status');
  }
  const ticket = _tickets.find(t => t.id === ticketId);
  if (!ticket) throw new Error('Ticket not found');
  
  const oldStatus = ticket.status;
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  
  const worker = getWorkerById(ticket.assignedTo);
  
  _addAuditLog('TICKET_STATUS_CHANGED', {
    ticketId,
    ticketTitle: ticket.title,
    workerId: ticket.assignedTo,
    workerName: worker.name,
    oldStatus,
    newStatus: status,
  });
  
  _saveData();
}

function deleteTicket(ticketId) {
  const ticket = _tickets.find(t => t.id === ticketId);
  if (!ticket) throw new Error('Ticket not found');
  
  const worker = getWorkerById(ticket.assignedTo);
  
  _tickets = _tickets.filter(t => t.id !== ticketId);
  
  _addAuditLog('TICKET_DELETED', {
    ticketId,
    ticketTitle: ticket.title,
    workerId: ticket.assignedTo,
    workerName: worker.name,
    status: ticket.status,
  });
  
  _saveData();
}

// ────────────────────────────────────────────────────────────────────────────
// PERSISTENCE - WITH PROPER AWAIT & ERROR HANDLING
// ────────────────────────────────────────────────────────────────────────────

async function _saveData() {
  try {
    console.log('[WorkspaceTool] 💾 Saving to disk...');
    const result = await window.electronAPI.workspaceSaveAll({
      workers: _workers,
      tickets: _tickets,
      auditLogs: _auditLogs,
    });
    
    if (result) {
      console.log('[WorkspaceTool] ✅ Saved successfully:', {
        workers: _workers.length,
        tickets: _tickets.length,
        logs: _auditLogs.length,
      });
    } else {
      console.error('[WorkspaceTool] ❌ Save returned false');
    }
  } catch (err) {
    console.error('[WorkspaceTool] ❌ Save failed:', err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// UI RENDERING
// ────────────────────────────────────────────────────────────────────────────

function _ensureWorkspacePanel() {
  if (document.getElementById('workspaceContainer')) return;

  const container = document.createElement('div');
  container.id = 'workspaceContainer';
  container.className = 'workspace-container';
  container.innerHTML = `
    <div class="workspace-content">
      <div class="workspace-navbar">
        <button class="workspace-back-btn" id="workspaceBackBtn" style="display:none;">← Back</button>
        <h1 class="workspace-title" id="workspaceTitle">👥 Workers</h1>
        <div class="workspace-navbar-right">
          <button class="workspace-logs-btn" id="workspaceLogsBtn" title="View audit logs">📋 Logs</button>
          <button class="workspace-close-btn" id="workspaceCloseBtn">✕</button>
        </div>
      </div>
      <div class="workspace-body" id="workspaceBody"></div>
    </div>
  `;

  document.body.appendChild(container);

  document.getElementById('workspaceCloseBtn').addEventListener('click', closeWorkspacePanel);
  document.getElementById('workspaceBackBtn').addEventListener('click', () => {
    _selectedWorker = null;
    _editingTicket = null;
    _render();
  });
  document.getElementById('workspaceLogsBtn').addEventListener('click', _showAuditLogs);
}

function _render() {
  if (_selectedWorker) {
    _renderWorkerDetails();
  } else {
    _renderWorkersList();
  }
}

function _renderWorkersList() {
  const backBtn = document.getElementById('workspaceBackBtn');
  const titleEl = document.getElementById('workspaceTitle');
  const body = document.getElementById('workspaceBody');

  if (backBtn) backBtn.style.display = 'none';
  if (titleEl) titleEl.textContent = '👥 Workers';

  body.innerHTML = '';

  const formSection = document.createElement('div');
  formSection.className = 'workspace-form-section';
  formSection.innerHTML = `
    <form class="workspace-add-worker-form" id="addWorkerForm">
      <input
        type="text"
        id="workerNameInput"
        placeholder="Worker name..."
        class="workspace-input"
        required
      />
      <select id="workerRoleSelect" class="workspace-select" required>
        <option value="">Select role</option>
        ${WORKER_ROLES.map(r => `<option value="${r}">${r}</option>`).join('')}
      </select>
      <div class="workspace-form-error" id="addWorkerError"></div>
      <button type="submit" class="workspace-btn-add">+ Add Worker</button>
    </form>
  `;
  body.appendChild(formSection);

  const grid = document.createElement('div');
  grid.className = 'workspace-grid';

  if (_workers.length === 0) {
    grid.innerHTML = '<p class="workspace-empty">No workers yet. Add one to get started!</p>';
    body.appendChild(grid);
  } else {
    _workers.forEach(worker => {
      const card = _createWorkerCard(worker);
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  document.getElementById('addWorkerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('workerNameInput').value;
    const role = document.getElementById('workerRoleSelect').value;
    const errEl = document.getElementById('addWorkerError');
    try {
      addWorker(name, role);
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      document.getElementById('addWorkerForm').reset();
      _render();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    }
  });
}

function _createWorkerCard(worker) {
  const card = document.createElement('div');
  card.className = 'workspace-worker-card';
  
  const ticketCount = getWorkerTickets(worker.id).length;
  const completedCount = getWorkerTickets(worker.id).filter(t => t.status === 'complete').length;

  card.innerHTML = `
    <div class="workspace-card-header">
      <div class="workspace-card-title">${worker.name}</div>
      <button class="workspace-card-edit" title="Edit worker">✏️</button>
      <button class="workspace-card-delete" title="Delete worker">🗑️</button>
    </div>
    <div class="workspace-card-role">${worker.role}</div>
    <div class="workspace-card-stats">
      <div class="workspace-stat">
        <span class="workspace-stat-value">${ticketCount}</span>
        <span class="workspace-stat-label">Tickets</span>
      </div>
      <div class="workspace-stat">
        <span class="workspace-stat-value" style="color: #34d399;">${completedCount}</span>
        <span class="workspace-stat-label">Completed</span>
      </div>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (!e.target.closest('.workspace-card-edit') && !e.target.closest('.workspace-card-delete')) {
      _selectedWorker = worker;
      _render();
    }
  });

  card.querySelector('.workspace-card-edit').addEventListener('click', (e) => {
    e.stopPropagation();
    _showEditWorkerModal(worker);
  });

  card.querySelector('.workspace-card-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog(`Delete ${worker.name} and all their tickets?`);
    if (!ok) return;
    deleteWorker(worker.id);
    _render();
  });

  return card;
}

function _showEditWorkerModal(worker) {
  const modal = document.createElement('div');
  modal.className = 'workspace-modal-overlay';
  modal.innerHTML = `
    <div class="workspace-modal">
      <div class="workspace-modal-header">
        <h2>Edit Worker</h2>
        <button class="workspace-modal-close">✕</button>
      </div>
      <form id="editWorkerForm" class="workspace-modal-form">
        <div class="workspace-modal-form-fields">
          <div class="workspace-form-group">
            <label>Name</label>
            <input type="text" id="editWorkerName" value="${worker.name}" class="workspace-input" required />
          </div>
          <div class="workspace-form-group">
            <label>Role</label>
            <select id="editWorkerRole" class="workspace-select" required>
              ${WORKER_ROLES.map(r => `<option value="${r}" ${r === worker.role ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="workspace-modal-form-content">
          <div class="workspace-form-error" id="editWorkerError"></div>
        </div>
        <div class="workspace-modal-footer">
          <button type="button" class="workspace-btn-cancel">Cancel</button>
          <button type="submit" class="workspace-btn-add">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  // ... rest of the listener logic remains the same ...
  const closeBtn = modal.querySelector('.workspace-modal-close');
  const cancelBtn = modal.querySelector('.workspace-btn-cancel');
  closeBtn.addEventListener('click', () => modal.remove());
  cancelBtn.addEventListener('click', () => modal.remove());

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  document.getElementById('editWorkerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('editWorkerName').value;
    const role = document.getElementById('editWorkerRole').value;
    const errEl = document.getElementById('editWorkerError');
    try {
      updateWorker(worker.id, name, role);
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      modal.remove();
      _render();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    }
  });
}

function _renderWorkerDetails() {
  if (!_selectedWorker) return;

  const backBtn = document.getElementById('workspaceBackBtn');
  const titleEl = document.getElementById('workspaceTitle');
  const body = document.getElementById('workspaceBody');

  if (backBtn) backBtn.style.display = 'block';
  if (titleEl) titleEl.innerHTML = `<span>${_selectedWorker.name}</span> <span style="opacity:0.5;font-size:0.8em">${_selectedWorker.role}</span>`;

  body.innerHTML = '';

  const formSection = document.createElement('div');
  formSection.className = 'workspace-form-section';
  
// ... (existing code above) ...

  const formSection = document.createElement('div');
  formSection.className = 'workspace-form-section';
  
  formSection.innerHTML = `
      <form class="workspace-add-ticket-form" id="addTicketForm">
        <div class="workspace-form-group">
          <input
            type="text"
            id="ticketTitleInput"
            placeholder="Ticket title..."
            class="workspace-input"
            required
          />
        </div>
        <div class="workspace-form-group">
          <textarea
            id="ticketNotesInput"
            placeholder="Notes (optional)..."
            class="workspace-textarea"
            rows="3"
          ></textarea>
        </div>
        <div class="workspace-form-error" id="ticketFormError"></div>
        <button type="submit" class="workspace-btn-add">+ Create Ticket</button>
      </form>
    `;
  
  body.appendChild(formSection);

  const ticketsList = document.createElement('div');
  ticketsList.className = 'workspace-tickets-list';

  const tickets = getWorkerTickets(_selectedWorker.id);
  
  if (tickets.length === 0) {
    ticketsList.innerHTML = '<p class="workspace-empty">No tickets yet. Create one!</p>';
  } else {
    tickets.forEach(ticket => {
      const ticketEl = _createTicketElement(ticket);
      ticketsList.appendChild(ticketEl);
    });
  }

  body.appendChild(ticketsList);

  document.getElementById('addTicketForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('ticketTitleInput').value;
    const notes = document.getElementById('ticketNotesInput').value;
    const errEl = document.getElementById('ticketFormError');
    try {
      addTicket(_selectedWorker.id, title, notes);
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      document.getElementById('addTicketForm').reset();
      _render();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    }
  });
}

function _showEditTicketModal(ticket) {
  const modal = document.createElement('div');
  modal.className = 'workspace-modal-overlay';
  modal.innerHTML = `
    <div class="workspace-modal">
      <div class="workspace-modal-header">
        <h2>Edit Ticket</h2>
        <button class="workspace-modal-close">✕</button>
      </div>
      <form id="editTicketForm" class="workspace-modal-form">
        <div class="workspace-modal-form-fields">
          <div class="workspace-form-group">
            <label>Title</label>
            <input type="text" id="editTicketTitle" value="${ticket.title}" class="workspace-input" required />
          </div>
          <div class="workspace-form-group">
            <label>Status</label>
            <select id="editTicketStatus" class="workspace-select" required>
              ${['pending', 'in-progress', 'complete'].map(s => `<option value="${s}" ${s === ticket.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="workspace-modal-form-content">
          <div class="workspace-form-group" style="flex:1">
            <label>Description</label>
            <textarea id="editTicketNotes" class="workspace-textarea" style="height:280px" placeholder="Add ticket description or notes here...">${ticket.notes}</textarea>
          </div>
          <div class="workspace-form-error" id="editTicketError"></div>
        </div>
        <div class="workspace-modal-footer">
          <button type="button" class="workspace-btn-cancel">Cancel</button>
          <button type="submit" class="workspace-btn-add">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('.workspace-modal-close');
  const cancelBtn = modal.querySelector('.workspace-btn-cancel');
  closeBtn.addEventListener('click', () => modal.remove());
  cancelBtn.addEventListener('click', () => modal.remove());

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  document.getElementById('editTicketForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('editTicketTitle').value;
    const notes = document.getElementById('editTicketNotes').value;
    const status = document.getElementById('editTicketStatus').value;
    const errEl = document.getElementById('editTicketError');
    try {
      updateTicket(ticket.id, title, notes, status);
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      modal.remove();
      _render();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    }
  });
}

function _createTicketElement(ticket) {
  const el = document.createElement('div');
  el.className = `workspace-ticket-item status-${ticket.status}`;
  el.style.borderLeftColor = STATUS_COLORS[ticket.status];

  el.innerHTML = `
    <div class="workspace-ticket-content">
      <div class="workspace-ticket-title">${ticket.title}</div>
      ${ticket.notes ? `<div class="workspace-ticket-notes">${ticket.notes}</div>` : ''}
      <div class="workspace-ticket-meta">
        <span class="workspace-ticket-status" style="background-color: ${STATUS_COLORS[ticket.status]}40;">
          ${ticket.status}
        </span>
        <span class="workspace-ticket-date">${new Date(ticket.updatedAt).toLocaleDateString()}</span>
      </div>
    </div>
    <div class="workspace-ticket-actions">
      <button class="workspace-ticket-edit" title="Edit ticket">✏️</button>
      <select class="workspace-status-select" value="${ticket.status}">
        <option value="pending">pending</option>
        <option value="in-progress">in-progress</option>
        <option value="complete">complete</option>
      </select>
      <button class="workspace-ticket-delete" title="Delete ticket">🗑️</button>
    </div>
  `;

  el.querySelector('.workspace-ticket-edit').addEventListener('click', () => {
    _showEditTicketModal(ticket);
  });
// ... rest remains same ...

  const statusSelect = el.querySelector('.workspace-status-select');
  statusSelect.addEventListener('change', () => {
    updateTicketStatus(ticket.id, statusSelect.value);
    _render();
  });

  el.querySelector('.workspace-ticket-delete').addEventListener('click', async () => {
    const ok = await confirmDialog('Delete this ticket?');
    if (!ok) return;
    deleteTicket(ticket.id);
    _render();
  });

  return el;
}

function _showAuditLogs() {
  const modal = document.createElement('div');
  modal.className = 'workspace-modal-overlay';
  modal.innerHTML = `
    <div class="workspace-modal workspace-modal-logs">
      <div class="workspace-modal-header">
        <h2>📋 Audit Logs</h2>
        <button class="workspace-modal-close">✕</button>
      </div>
      <div class="workspace-logs-container" id="logsContainer"></div>
    </div>
  `;

  document.body.appendChild(modal);

  const logsContainer = modal.querySelector('#logsContainer');

  if (_auditLogs.length === 0) {
    logsContainer.innerHTML = '<p class="workspace-empty">No activity yet</p>';
  } else {
    _auditLogs.forEach(log => {
      const logEl = _createLogElement(log);
      logsContainer.appendChild(logEl);
    });
  }

  modal.querySelector('.workspace-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function _createLogElement(log) {
  const el = document.createElement('div');
  el.className = 'workspace-log-item';
  
  const date = new Date(log.timestamp);
  const timeStr = date.toLocaleTimeString();
  const dateStr = date.toLocaleDateString();
  
  let icon = '📝';
  let message = '';
  const d = log.details;

  switch (log.action) {
    case 'WORKER_CREATED':
      icon = '👤';
      message = `Created worker <strong>${d.workerName}</strong> (${d.workerRole})`;
      break;
    case 'WORKER_UPDATED':
      icon = '✏️';
      message = `Updated worker <strong>${d.newName}</strong>: ${d.oldName !== d.newName ? `name changed, ` : ''}role ${d.oldRole} → ${d.newRole}`;
      break;
    case 'WORKER_DELETED':
      icon = '🗑️';
      message = `Deleted worker <strong>${d.workerName}</strong> (${d.affectedTicketsCount} tickets removed)`;
      break;
    case 'TICKET_CREATED':
      icon = '🎫';
      message = `Created ticket <strong>"${d.ticketTitle}"</strong> for <strong>${d.workerName}</strong>`;
      break;
    case 'TICKET_UPDATED':
      icon = '✏️';
      message = `Updated ticket <strong>"${d.ticketTitle}"</strong>: ${d.changes}`;
      break;
    case 'TICKET_STATUS_CHANGED':
      icon = '🔄';
      message = `Status changed for <strong>"${d.ticketTitle}"</strong>: ${d.oldStatus} → ${d.newStatus}`;
      break;
    case 'TICKET_DELETED':
      icon = '🗑️';
      message = `Deleted ticket <strong>"${d.ticketTitle}"</strong> from ${d.workerName}`;
      break;
  }

  el.innerHTML = `
    <div class="workspace-log-icon">${icon}</div>
    <div class="workspace-log-content">
      <div class="workspace-log-message">${message}</div>
      <div class="workspace-log-time">${timeStr} • ${dateStr}</div>
    </div>
  `;

  return el;
}