/**
 * workspaceTool.js - v2
 * ────────────────────
 * Card-based workspace manager:
 * - Workers displayed as clickable cards
 * - Click worker to view/manage their tickets
 * - Create tickets assigned to specific worker
 * - Track ticket status: pending → in-progress → complete
 */

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
let _isWorkspacePanelOpen = false;
let _selectedWorker = null; // Current worker being viewed

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────────────────────────────────────────

export async function initWorkspaceTool() {
  try {
    const data = await window.electronAPI.workspaceGetAll();
    _workers = data?.workers || [];
    _tickets = data?.tickets || [];
    console.log('[WorkspaceTool] Loaded', _workers.length, 'workers,', _tickets.length, 'tickets');
  } catch (err) {
    console.error('[WorkspaceTool] Failed to load:', err);
    _workers = [];
    _tickets = [];
  }
}

export function isWorkspacePanelOpen() {
  return _isWorkspacePanelOpen;
}

export async function openWorkspacePanel() {
  if (_isWorkspacePanelOpen) return;
  await initWorkspaceTool();
  _ensureWorkspacePanel();
  _selectedWorker = null;
  _render();
  document.getElementById('workspaceContainer')?.classList.add('open');
  _isWorkspacePanelOpen = true;
}

export function closeWorkspacePanel() {
  document.getElementById('workspaceContainer')?.classList.remove('open');
  _isWorkspacePanelOpen = false;
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
  _saveData();
  return worker;
}

function deleteWorker(id) {
  _workers = _workers.filter(w => w.id !== id);
  _tickets = _tickets.filter(t => t.assignedTo !== id);
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
  _saveData();
  return ticket;
}

function updateTicketStatus(ticketId, status) {
  if (!['pending', 'in-progress', 'complete'].includes(status)) {
    throw new Error('Invalid status');
  }
  const ticket = _tickets.find(t => t.id === ticketId);
  if (!ticket) throw new Error('Ticket not found');
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  _saveData();
}

function deleteTicket(ticketId) {
  _tickets = _tickets.filter(t => t.id !== ticketId);
  _saveData();
}

// ────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ────────────────────────────────────────────────────────────────────────────

async function _saveData() {
  try {
    await window.electronAPI.workspaceSaveAll({
      workers: _workers,
      tickets: _tickets,
    });
  } catch (err) {
    console.error('[WorkspaceTool] Save failed:', err);
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
        <button class="workspace-close-btn" id="workspaceCloseBtn">✕</button>
      </div>
      <div class="workspace-body" id="workspaceBody"></div>
    </div>
  `;

  document.body.appendChild(container);

  // Wire events
  document.getElementById('workspaceCloseBtn').addEventListener('click', closeWorkspacePanel);
  document.getElementById('workspaceBackBtn').addEventListener('click', () => {
    _selectedWorker = null;
    _render();
  });
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

  // Add Worker Form
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
      <button type="submit" class="workspace-btn-add">+ Add Worker</button>
    </form>
  `;
  body.appendChild(formSection);

  // Workers Grid
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

  // Wire form
  document.getElementById('addWorkerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('workerNameInput').value;
    const role = document.getElementById('workerRoleSelect').value;
    try {
      addWorker(name, role);
      document.getElementById('addWorkerForm').reset();
      _render();
    } catch (err) {
      alert('Error: ' + err.message);
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
    if (!e.target.closest('.workspace-card-delete')) {
      _selectedWorker = worker;
      _render();
    }
  });

  card.querySelector('.workspace-card-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Delete ${worker.name} and all their tickets?`)) {
      deleteWorker(worker.id);
      _render();
    }
  });

  return card;
}

function _renderWorkerDetails() {
  if (!_selectedWorker) return;

  const backBtn = document.getElementById('workspaceBackBtn');
  const titleEl = document.getElementById('workspaceTitle');
  const body = document.getElementById('workspaceBody');

  if (backBtn) backBtn.style.display = 'block';
  if (titleEl) titleEl.innerHTML = `<span>${_selectedWorker.name}</span> <span style="opacity:0.5;font-size:0.8em">${_selectedWorker.role}</span>`;

  body.innerHTML = '';

  // Create Ticket Form
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
      <button type="submit" class="workspace-btn-add">+ Create Ticket</button>
    </form>
  `;
  body.appendChild(formSection);

  // Tickets List
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

  // Wire form
  document.getElementById('addTicketForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('ticketTitleInput').value;
    const notes = document.getElementById('ticketNotesInput').value;
    try {
      addTicket(_selectedWorker.id, title, notes);
      document.getElementById('addTicketForm').reset();
      _render();
    } catch (err) {
      alert('Error: ' + err.message);
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
      <select class="workspace-status-select" value="${ticket.status}">
        <option value="pending">pending</option>
        <option value="in-progress">in-progress</option>
        <option value="complete">complete</option>
      </select>
      <button class="workspace-ticket-delete" title="Delete ticket">🗑️</button>
    </div>
  `;

  const statusSelect = el.querySelector('.workspace-status-select');
  statusSelect.addEventListener('change', () => {
    updateTicketStatus(ticket.id, statusSelect.value);
    _render();
  });

  el.querySelector('.workspace-ticket-delete').addEventListener('click', () => {
    if (confirm('Delete this ticket?')) {
      deleteTicket(ticket.id);
      _render();
    }
  });

  return el;
}