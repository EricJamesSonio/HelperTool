/**
 * workspaceTool.js
 * ────────────────
 * Manages workers and tickets globally.
 * - Workers: name + fixed role labels (developer, product manager, frontend dev, backend dev, fullstack dev)
 * - Tickets: title + notes + status (pending, in-progress, complete)
 * - Persist via IPC to config.js (global storage, like apiTool and secretHolder)
 */

const WORKER_ROLES = [
  'developer',
  'product manager',
  'frontend dev',
  'backend dev',
  'fullstack dev',
];

let _workers = [];
let _tickets = [];
let _isWorkspacePanelOpen = false;

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC EXPORT FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Initialize workspace tool: load workers and tickets from storage
 */
export async function initWorkspaceTool() {
  try {
    const data = await window.electronAPI.workspaceGetAll();
    _workers = data?.workers || [];
    _tickets = data?.tickets || [];
    console.log('[WorkspaceTool] Loaded', _workers.length, 'workers,', _tickets.length, 'tickets');
  } catch (err) {
    console.error('[WorkspaceTool] Failed to load data:', err);
    _workers = [];
    _tickets = [];
  }
}

/**
 * Check if workspace panel is open
 */
export function isWorkspacePanelOpen() {
  return _isWorkspacePanelOpen;
}

/**
 * Open workspace panel
 */
export async function openWorkspacePanel() {
  if (_isWorkspacePanelOpen) return;
  await initWorkspaceTool();
  _ensureWorkspacePanel();
  document.getElementById('workspaceOverlay')?.classList.add('open');
  _isWorkspacePanelOpen = true;
}

/**
 * Close workspace panel
 */
export function closeWorkspacePanel() {
  document.getElementById('workspaceOverlay')?.classList.remove('open');
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
  _saveWorkspaceData();
  return worker;
}

function updateWorker(id, name, role) {
  const idx = _workers.findIndex(w => w.id === id);
  if (idx === -1) throw new Error('Worker not found');
  if (!name?.trim() || !WORKER_ROLES.includes(role)) {
    throw new Error('Invalid worker name or role');
  }
  _workers[idx] = {
    ..._workers[idx],
    name: name.trim(),
    role,
  };
  _saveWorkspaceData();
}

function deleteWorker(id) {
  _workers = _workers.filter(w => w.id !== id);
  // Also remove worker assignments from tickets
  _tickets.forEach(t => {
    if (t.assignedTo === id) t.assignedTo = null;
  });
  _saveWorkspaceData();
}

// ────────────────────────────────────────────────────────────────────────────
// TICKET MANAGEMENT
// ────────────────────────────────────────────────────────────────────────────

function addTicket(title, notes = '') {
  if (!title?.trim()) throw new Error('Ticket title required');
  const ticket = {
    id: Date.now().toString(),
    title: title.trim(),
    notes: notes.trim(),
    status: 'pending', // pending | in-progress | complete
    assignedTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  _tickets.push(ticket);
  _saveWorkspaceData();
  return ticket;
}

function updateTicket(id, title, notes, status, assignedTo) {
  const idx = _tickets.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('Ticket not found');
  if (!title?.trim()) throw new Error('Ticket title required');
  if (!['pending', 'in-progress', 'complete'].includes(status)) {
    throw new Error('Invalid status');
  }
  _tickets[idx] = {
    ..._tickets[idx],
    title: title.trim(),
    notes: notes.trim(),
    status,
    assignedTo: assignedTo || null,
    updatedAt: new Date().toISOString(),
  };
  _saveWorkspaceData();
}

function deleteTicket(id) {
  _tickets = _tickets.filter(t => t.id !== id);
  _saveWorkspaceData();
}

function updateTicketStatus(id, status) {
  if (!['pending', 'in-progress', 'complete'].includes(status)) {
    throw new Error('Invalid status');
  }
  const ticket = _tickets.find(t => t.id === id);
  if (!ticket) throw new Error('Ticket not found');
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  _saveWorkspaceData();
}

// ────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ────────────────────────────────────────────────────────────────────────────

async function _saveWorkspaceData() {
  try {
    await window.electronAPI.workspaceSaveAll({
      workers: _workers,
      tickets: _tickets,
    });
  } catch (err) {
    console.error('[WorkspaceTool] Failed to save:', err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// UI PANEL
// ────────────────────────────────────────────────────────────────────────────

function _ensureWorkspacePanel() {
  if (document.getElementById('workspaceOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'workspaceOverlay';
  overlay.className = 'workspace-overlay';
  overlay.innerHTML = `
    <div class="workspace-panel">
      <div class="workspace-header">
        <div class="workspace-header-left">
          <h2 class="workspace-title">👥 Workspace</h2>
        </div>
        <button class="workspace-close-btn" id="workspaceCloseBtn">✕</button>
      </div>

      <div class="workspace-body">
        <div class="workspace-tabs">
          <button class="workspace-tab active" data-tab="workers">
            Workers <span class="workspace-badge" id="workerCount">0</span>
          </button>
          <button class="workspace-tab" data-tab="tickets">
            Tickets <span class="workspace-badge" id="ticketCount">0</span>
          </button>
        </div>

        <!-- WORKERS TAB -->
        <div id="workersTab" class="workspace-tab-content active">
          <div class="workspace-section">
            <div class="workspace-section-title">Add Worker</div>
            <form id="addWorkerForm" class="workspace-form">
              <input
                type="text"
                id="workerName"
                placeholder="Worker name"
                class="workspace-input"
                required
              />
              <select id="workerRole" class="workspace-select" required>
                <option value="">Select role</option>
                ${WORKER_ROLES.map(r => `<option value="${r}">${r}</option>`).join('')}
              </select>
              <button type="submit" class="workspace-btn-primary">Add Worker</button>
            </form>
          </div>

          <div class="workspace-section">
            <div class="workspace-section-title">Workers List</div>
            <div id="workersList" class="workspace-list">
              <!-- populated by render -->
            </div>
          </div>
        </div>

        <!-- TICKETS TAB -->
        <div id="ticketsTab" class="workspace-tab-content">
          <div class="workspace-section">
            <div class="workspace-section-title">Create Ticket</div>
            <form id="addTicketForm" class="workspace-form">
              <input
                type="text"
                id="ticketTitle"
                placeholder="Ticket title"
                class="workspace-input"
                required
              />
              <textarea
                id="ticketNotes"
                placeholder="Notes (optional)"
                class="workspace-textarea"
                rows="3"
              ></textarea>
              <button type="submit" class="workspace-btn-primary">Create Ticket</button>
            </form>
          </div>

          <div class="workspace-section">
            <div class="workspace-section-title">Tickets List</div>
            <div id="ticketsList" class="workspace-list">
              <!-- populated by render -->
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Wire events
  document.getElementById('workspaceCloseBtn').addEventListener('click', closeWorkspacePanel);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeWorkspacePanel();
  });

  // Tab switching
  document.querySelectorAll('.workspace-tab').forEach(tab => {
    tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
  });

  // Form submissions
  document.getElementById('addWorkerForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('workerName').value;
    const role = document.getElementById('workerRole').value;
    try {
      addWorker(name, role);
      document.getElementById('addWorkerForm').reset();
      _renderWorkers();
      _updateBadges();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  document.getElementById('addTicketForm').addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('ticketTitle').value;
    const notes = document.getElementById('ticketNotes').value;
    try {
      addTicket(title, notes);
      document.getElementById('addTicketForm').reset();
      _renderTickets();
      _updateBadges();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  _renderWorkers();
  _renderTickets();
  _updateBadges();
}

function _switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.workspace-tab-content').forEach(t => {
    t.classList.remove('active');
  });

  // Deactivate all tab buttons
  document.querySelectorAll('.workspace-tab').forEach(t => {
    t.classList.remove('active');
  });

  // Show selected tab
  const contentId = tabName === 'workers' ? 'workersTab' : 'ticketsTab';
  document.getElementById(contentId).classList.add('active');

  // Activate tab button
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

function _renderWorkers() {
  const list = document.getElementById('workersList');
  if (!list) return;

  if (_workers.length === 0) {
    list.innerHTML = '<p class="workspace-empty">No workers yet</p>';
    return;
  }

  list.innerHTML = _workers
    .map(
      worker => `
    <div class="workspace-item worker-item">
      <div class="workspace-item-content">
        <div class="workspace-item-title">${worker.name}</div>
        <div class="workspace-item-meta">${worker.role}</div>
      </div>
      <button
        class="workspace-btn-icon delete"
        title="Delete worker"
        data-worker-id="${worker.id}"
      >🗑️</button>
    </div>
  `
    )
    .join('');

  // Wire delete buttons
  document.querySelectorAll('[data-worker-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this worker?')) {
        deleteWorker(btn.dataset.workerId);
        _renderWorkers();
        _updateBadges();
      }
    });
  });
}

function _renderTickets() {
  const list = document.getElementById('ticketsList');
  if (!list) return;

  if (_tickets.length === 0) {
    list.innerHTML = '<p class="workspace-empty">No tickets yet</p>';
    return;
  }

  list.innerHTML = _tickets
    .map(
      ticket => `
    <div class="workspace-item ticket-item status-${ticket.status}">
      <div class="workspace-item-content">
        <div class="workspace-item-title">${ticket.title}</div>
        ${ticket.notes ? `<div class="workspace-item-notes">${ticket.notes}</div>` : ''}
        <div class="workspace-item-meta">
          Status: <strong>${ticket.status}</strong>
          ${ticket.assignedTo ? ` | Assigned to: <strong>${_getWorkerName(ticket.assignedTo)}</strong>` : ''}
        </div>
      </div>
      <div class="workspace-item-actions">
        <select
          class="workspace-select-small status-select"
          data-ticket-id="${ticket.id}"
          value="${ticket.status}"
        >
          <option value="pending">pending</option>
          <option value="in-progress">in-progress</option>
          <option value="complete">complete</option>
        </select>
        <button
          class="workspace-btn-icon delete"
          title="Delete ticket"
          data-ticket-id="${ticket.id}"
        >🗑️</button>
      </div>
    </div>
  `
    )
    .join('');

  // Wire status change
  document.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', () => {
      const status = select.value;
      const ticketId = select.dataset.ticketId;
      updateTicketStatus(ticketId, status);
      _renderTickets();
    });
  });

  // Wire delete buttons
  document.querySelectorAll('[data-ticket-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this ticket?')) {
        deleteTicket(btn.dataset.ticketId);
        _renderTickets();
        _updateBadges();
      }
    });
  });
}

function _updateBadges() {
  const workerBadge = document.getElementById('workerCount');
  const ticketBadge = document.getElementById('ticketCount');
  if (workerBadge) workerBadge.textContent = _workers.length;
  if (ticketBadge) ticketBadge.textContent = _tickets.length;
}

function _getWorkerName(workerId) {
  const worker = _workers.find(w => w.id === workerId);
  return worker?.name || 'Unknown';
}