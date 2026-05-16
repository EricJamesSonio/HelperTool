/**
 * workspaceRenderer.js
 * ─────────────────────
 * All UI rendering. No business logic — imports managers for data/mutations.
 *
 * Navigation state:
 *   home → projects list OR workers list OR logs
 *   project-details → selected project (tabs: overview, workers, tickets, db, folders, logs)
 *   worker-details → (reserved for future use)
 */

import { state }                                                  from './workspaceStore.js';
import { getAllProjects, createProject, updateProject, deleteProject,
         assignWorkerToProject, removeWorkerFromProject, PROJECT_STATUSES } from './projectManager.js';
import { getAllWorkers, createWorker, updateWorker, deleteWorker, WORKER_ROLES } from './workerManager.js';
import { getTicketsByProject, createTicket, updateTicket, updateTicketStatus,
         deleteTicket, TICKET_STATUSES, TICKET_PRIORITIES,
         STATUS_COLORS, PRIORITY_COLORS }                         from './ticketManager.js';
import { getProjectById }                                          from './projectManager.js';

// ─── Nav state ────────────────────────────────────────────────────────────────

let _view           = 'home';      // 'home' | 'projects' | 'workers' | 'logs' | 'project-details'
let _selectedProject = null;
let _projectTab      = 'overview'; // 'overview' | 'workers' | 'tickets' | 'db' | 'folders' | 'logs'

// ─── Entry ────────────────────────────────────────────────────────────────────

export function ensurePanel() {
  if (document.getElementById('workspaceContainer')) return;

  const el = document.createElement('div');
  el.id        = 'workspaceContainer';
  el.className = 'workspace-container';
  el.innerHTML = `
    <div class="workspace-content">
      <nav class="workspace-navbar" id="workspaceNavbar"></nav>
      <div class="workspace-body" id="workspaceBody"></div>
    </div>
  `;
  document.body.appendChild(el);
}

export function render() {
  _renderNavbar();
  _renderBody();
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function _renderNavbar() {
  const nav = document.getElementById('workspaceNavbar');
  if (!nav) return;

  const canGoBack = _view !== 'home';
  const title = _getNavTitle();

  nav.innerHTML = `
    ${canGoBack ? `<button class="workspace-back-btn" id="wsBackBtn">← Back</button>` : ''}
    <h1 class="workspace-title">${title}</h1>
    <div class="workspace-navbar-right">
      ${_view === 'home' ? `
        <button class="workspace-nav-chip ${_view==='projects'?'active':''}" data-goto="projects">📁 Projects</button>
        <button class="workspace-nav-chip" data-goto="workers">👥 Workers</button>
        <button class="workspace-nav-chip" data-goto="logs">📋 Logs</button>
      ` : ''}
      <button class="workspace-close-btn" id="wsCloseBtn">✕</button>
    </div>
  `;

  nav.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => { _view = btn.dataset.goto; render(); });
  });

  nav.querySelector('#wsBackBtn')?.addEventListener('click', () => {
    if (_view === 'project-details') { _view = 'projects'; _selectedProject = null; }
    else { _view = 'home'; }
    render();
  });

  nav.querySelector('#wsCloseBtn')?.addEventListener('click', () => {
    document.getElementById('workspaceContainer')?.classList.remove('open');
  });
}

function _getNavTitle() {
  switch (_view) {
    case 'home':           return '🏠 Workspace';
    case 'projects':       return '📁 Projects';
    case 'workers':        return '👥 Workers';
    case 'logs':           return '📋 Global Logs';
    case 'project-details':
      return _selectedProject ? `📁 ${_selectedProject.title}` : '📁 Project';
    default:               return 'Workspace';
  }
}

// ─── Body dispatcher ─────────────────────────────────────────────────────────

function _renderBody() {
  const body = document.getElementById('workspaceBody');
  if (!body) return;
  body.innerHTML = '';

  switch (_view) {
    case 'home':           _renderHome(body);           break;
    case 'projects':       _renderProjectsList(body);   break;
    case 'workers':        _renderWorkersList(body);    break;
    case 'logs':           _renderGlobalLogs(body);     break;
    case 'project-details':_renderProjectDetails(body); break;
  }
}

// ─── HOME ────────────────────────────────────────────────────────────────────

function _renderHome(body) {
  const totalTickets    = state.tickets.length;
  const activeTickets   = state.tickets.filter(t => !['complete','backlog'].includes(t.status)).length;
  const completeTickets = state.tickets.filter(t => t.status === 'complete').length;
  const activeProjects  = state.projects.filter(p => p.status === 'in-progress').length;

  body.innerHTML = `
    <div class="ws-home-stats">
      <div class="ws-stat-card"><span class="ws-stat-num">${state.projects.length}</span><span class="ws-stat-lbl">Projects</span></div>
      <div class="ws-stat-card"><span class="ws-stat-num">${activeProjects}</span><span class="ws-stat-lbl">Active</span></div>
      <div class="ws-stat-card"><span class="ws-stat-num">${state.workers.length}</span><span class="ws-stat-lbl">Workers</span></div>
      <div class="ws-stat-card"><span class="ws-stat-num" style="color:#60a5fa">${activeTickets}</span><span class="ws-stat-lbl">Active Tickets</span></div>
      <div class="ws-stat-card"><span class="ws-stat-num" style="color:#34d399">${completeTickets}</span><span class="ws-stat-lbl">Done</span></div>
    </div>

    <div class="ws-home-nav-cards">
      <button class="ws-home-card" data-goto="projects">
        <span class="ws-home-card-icon">📁</span>
        <span class="ws-home-card-label">Projects</span>
        <span class="ws-home-card-count">${state.projects.length}</span>
      </button>
      <button class="ws-home-card" data-goto="workers">
        <span class="ws-home-card-icon">👥</span>
        <span class="ws-home-card-label">Workers</span>
        <span class="ws-home-card-count">${state.workers.length}</span>
      </button>
      <button class="ws-home-card" data-goto="logs">
        <span class="ws-home-card-icon">📋</span>
        <span class="ws-home-card-label">Activity Log</span>
        <span class="ws-home-card-count">${state.globalLogs.length}</span>
      </button>
    </div>
  `;

  body.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => { _view = btn.dataset.goto; render(); });
  });
}

// ─── PROJECTS LIST ────────────────────────────────────────────────────────────

function _renderProjectsList(body) {
  // Add project form
  const form = document.createElement('div');
  form.className = 'workspace-form-section';
  form.innerHTML = `
    <div class="workspace-form-label">New Project</div>
    <div class="ws-add-project-form">
      <input type="text" id="newProjectTitle" placeholder="Project title..." class="workspace-input" />
      <input type="text" id="newProjectDesc"  placeholder="Short description (optional)..." class="workspace-input" />
      <button class="workspace-btn-add" id="addProjectBtn">+ Add Project</button>
    </div>
  `;
  body.appendChild(form);

  form.querySelector('#addProjectBtn').addEventListener('click', () => {
    const title = document.getElementById('newProjectTitle').value;
    const desc  = document.getElementById('newProjectDesc').value;
    try {
      createProject(title, desc);
      document.getElementById('newProjectTitle').value = '';
      document.getElementById('newProjectDesc').value  = '';
      render();
    } catch (err) { alert(err.message); }
  });

  // Grid
  const grid = document.createElement('div');
  grid.className = 'workspace-grid';

  const projects = getAllProjects();
  if (projects.length === 0) {
    grid.innerHTML = '<p class="workspace-empty">No projects yet. Create one above.</p>';
  } else {
    projects.forEach(p => grid.appendChild(_buildProjectCard(p)));
  }
  body.appendChild(grid);
}

function _buildProjectCard(project) {
  const tickets   = getTicketsByProject(project.id);
  const done      = tickets.filter(t => t.status === 'complete').length;
  const progress  = tickets.length ? Math.round((done / tickets.length) * 100) : 0;
  const workerCnt = project.assignedWorkerIds.length;

  const card = document.createElement('div');
  card.className = 'workspace-project-card';
  card.innerHTML = `
    <div class="workspace-card-header">
      <div class="workspace-card-title">${project.title}</div>
      <button class="workspace-card-edit" title="Edit">✏️</button>
      <button class="workspace-card-delete" title="Delete">🗑️</button>
    </div>
    ${project.description ? `<div class="ws-project-desc">${project.description}</div>` : ''}
    <div class="ws-project-status-badge ws-status-${project.status}">${project.status}</div>
    <div class="ws-project-meta">
      <span>👥 ${workerCnt} worker${workerCnt !== 1 ? 's' : ''}</span>
      <span>🎫 ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="ws-progress-bar-wrap">
      <div class="ws-progress-bar" style="width:${progress}%"></div>
    </div>
    <div class="ws-progress-label">${progress}% complete</div>
  `;

  card.addEventListener('click', e => {
    if (e.target.closest('.workspace-card-edit') || e.target.closest('.workspace-card-delete')) return;
    _selectedProject = getProjectById(project.id);
    _projectTab = 'overview';
    _view = 'project-details';
    render();
  });

  card.querySelector('.workspace-card-edit').addEventListener('click', e => {
    e.stopPropagation();
    _showEditProjectModal(project);
  });

  card.querySelector('.workspace-card-delete').addEventListener('click', e => {
    e.stopPropagation();
    if (confirm(`Delete project "${project.title}" and all its tickets?`)) {
      deleteProject(project.id);
      render();
    }
  });

  return card;
}

function _showEditProjectModal(project) {
  const modal = _createModal('Edit Project', `
    <div class="workspace-form-group">
      <label>Title</label>
      <input type="text" id="editProjTitle" value="${_esc(project.title)}" class="workspace-input" />
    </div>
    <div class="workspace-form-group">
      <label>Description</label>
      <input type="text" id="editProjDesc" value="${_esc(project.description)}" class="workspace-input" />
    </div>
    <div class="workspace-form-group">
      <label>Status</label>
      <select id="editProjStatus" class="workspace-select">
        ${PROJECT_STATUSES.map(s => `<option value="${s}" ${s === project.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
  `, () => {
    try {
      updateProject(project.id, {
        title:       document.getElementById('editProjTitle').value,
        description: document.getElementById('editProjDesc').value,
        status:      document.getElementById('editProjStatus').value,
      });
      modal.remove();
      render();
    } catch (err) { alert(err.message); }
  });
  document.body.appendChild(modal);
}

// ─── WORKERS LIST ─────────────────────────────────────────────────────────────

function _renderWorkersList(body) {
  const form = document.createElement('div');
  form.className = 'workspace-form-section';
  form.innerHTML = `
    <div class="workspace-form-label">Add Worker</div>
    <div class="workspace-add-worker-form">
      <input type="text" id="newWorkerName" placeholder="Worker name..." class="workspace-input" />
      <select id="newWorkerRole" class="workspace-select">
        <option value="">Select role...</option>
        ${WORKER_ROLES.map(r => `<option value="${r}">${r}</option>`).join('')}
      </select>
      <button class="workspace-btn-add" id="addWorkerBtn">+ Add Worker</button>
    </div>
  `;
  body.appendChild(form);

  form.querySelector('#addWorkerBtn').addEventListener('click', () => {
    try {
      createWorker(
        document.getElementById('newWorkerName').value,
        document.getElementById('newWorkerRole').value
      );
      document.getElementById('newWorkerName').value = '';
      document.getElementById('newWorkerRole').value = '';
      render();
    } catch (err) { alert(err.message); }
  });

  const grid = document.createElement('div');
  grid.className = 'workspace-grid';

  const workers = getAllWorkers();
  if (workers.length === 0) {
    grid.innerHTML = '<p class="workspace-empty">No workers yet. Add one above.</p>';
  } else {
    workers.forEach(w => grid.appendChild(_buildWorkerCard(w)));
  }
  body.appendChild(grid);
}

function _buildWorkerCard(worker) {
  // Count tickets assigned to this worker across all projects
  const workerTickets    = state.tickets.filter(t => t.assignedWorkerId === worker.id);
  const completedTickets = workerTickets.filter(t => t.status === 'complete').length;
  const projectCount     = state.projects.filter(p => p.assignedWorkerIds.includes(worker.id)).length;

  const card = document.createElement('div');
  card.className = 'workspace-worker-card';
  card.innerHTML = `
    <div class="workspace-card-header">
      <div class="ws-worker-avatar" style="background:${worker.avatarColor}">${worker.name.charAt(0).toUpperCase()}</div>
      <div class="workspace-card-title">${worker.name}</div>
      <button class="workspace-card-edit" title="Edit">✏️</button>
      <button class="workspace-card-delete" title="Delete">🗑️</button>
    </div>
    <div class="workspace-card-role">${worker.role}</div>
    <div class="workspace-card-stats">
      <div class="workspace-stat">
        <span class="workspace-stat-value">${projectCount}</span>
        <span class="workspace-stat-label">Projects</span>
      </div>
      <div class="workspace-stat">
        <span class="workspace-stat-value">${workerTickets.length}</span>
        <span class="workspace-stat-label">Tickets</span>
      </div>
      <div class="workspace-stat">
        <span class="workspace-stat-value" style="color:#34d399">${completedTickets}</span>
        <span class="workspace-stat-label">Done</span>
      </div>
    </div>
  `;

  card.querySelector('.workspace-card-edit').addEventListener('click', e => {
    e.stopPropagation();
    _showEditWorkerModal(worker);
  });

  card.querySelector('.workspace-card-delete').addEventListener('click', e => {
    e.stopPropagation();
    if (confirm(`Delete ${worker.name}? Their tickets will become unassigned.`)) {
      deleteWorker(worker.id);
      render();
    }
  });

  return card;
}

function _showEditWorkerModal(worker) {
  const modal = _createModal('Edit Worker', `
    <div class="workspace-form-group">
      <label>Name</label>
      <input type="text" id="editWorkerName" value="${_esc(worker.name)}" class="workspace-input" />
    </div>
    <div class="workspace-form-group">
      <label>Role</label>
      <select id="editWorkerRole" class="workspace-select">
        ${WORKER_ROLES.map(r => `<option value="${r}" ${r === worker.role ? 'selected' : ''}>${r}</option>`).join('')}
      </select>
    </div>
  `, () => {
    try {
      updateWorker(
        worker.id,
        document.getElementById('editWorkerName').value,
        document.getElementById('editWorkerRole').value
      );
      modal.remove();
      render();
    } catch (err) { alert(err.message); }
  });
  document.body.appendChild(modal);
}

// ─── GLOBAL LOGS ──────────────────────────────────────────────────────────────

function _renderGlobalLogs(body) {
  const logs = state.globalLogs;
  if (logs.length === 0) {
    body.innerHTML = '<p class="workspace-empty">No global activity yet.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'workspace-logs-container';
  logs.forEach(log => list.appendChild(_buildLogItem(log)));
  body.appendChild(list);
}

// ─── PROJECT DETAILS ──────────────────────────────────────────────────────────

function _renderProjectDetails(body) {
  if (!_selectedProject) return;
  // Always get fresh reference
  _selectedProject = getProjectById(_selectedProject.id);
  if (!_selectedProject) { _view = 'projects'; render(); return; }

  const tabs = [
    { key: 'overview', label: '📄 Overview' },
    { key: 'workers',  label: '👥 Workers'  },
    { key: 'tickets',  label: '🎫 Tickets'  },
    { key: 'db',       label: '🗄️ Database' },
    { key: 'folders',  label: '📂 Folders'  },
    { key: 'logs',     label: '📋 Logs'     },
  ];

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'ws-tab-bar';
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = `ws-tab-btn ${_projectTab === t.key ? 'active' : ''}`;
    btn.textContent = t.label;
    btn.addEventListener('click', () => { _projectTab = t.key; render(); });
    tabBar.appendChild(btn);
  });
  body.appendChild(tabBar);

  // Tab content
  const content = document.createElement('div');
  content.className = 'ws-tab-content';

  switch (_projectTab) {
    case 'overview': _renderTabOverview(content);  break;
    case 'workers':  _renderTabWorkers(content);   break;
    case 'tickets':  _renderTabTickets(content);   break;
    case 'db':       _renderTabDb(content);         break;
    case 'folders':  _renderTabFolders(content);   break;
    case 'logs':     _renderTabProjectLogs(content);break;
  }
  body.appendChild(content);
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function _renderTabOverview(el) {
  const p = _selectedProject;
  el.innerHTML = `
    <div class="ws-overview-grid">
      <div class="ws-overview-field">
        <label>Status</label>
        <select id="overviewStatus" class="workspace-select ws-status-${p.status}">
          ${PROJECT_STATUSES.map(s => `<option value="${s}" ${s === p.status ? 'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="ws-overview-field ws-overview-full">
        <label>Description</label>
        <input type="text" id="overviewDesc" value="${_esc(p.description)}" class="workspace-input" placeholder="Short description..." />
      </div>
      <div class="ws-overview-field ws-overview-full">
        <label>Overview / Notes</label>
        <textarea id="overviewText" class="workspace-textarea" rows="6" placeholder="Project overview, goals, notes...">${_esc(p.overview)}</textarea>
      </div>
    </div>
    <div class="workspace-form-actions" style="margin-top:12px">
      <button class="workspace-btn-add" id="saveOverviewBtn">Save Overview</button>
    </div>
  `;

  el.querySelector('#saveOverviewBtn').addEventListener('click', () => {
    updateProject(p.id, {
      status:      document.getElementById('overviewStatus').value,
      description: document.getElementById('overviewDesc').value,
      overview:    document.getElementById('overviewText').value,
    });
    render();
  });
}

// ── Tab: Workers ──────────────────────────────────────────────────────────────

function _renderTabWorkers(el) {
  const p            = _selectedProject;
  const allWorkers   = getAllWorkers();
  const assignedIds  = p.assignedWorkerIds;
  const unassigned   = allWorkers.filter(w => !assignedIds.includes(w.id));

  // Assign form
  const assignWrap = document.createElement('div');
  assignWrap.className = 'workspace-form-section';
  assignWrap.innerHTML = `
    <div class="workspace-form-label">Assign Worker</div>
    <div class="ws-assign-row">
      <select id="assignWorkerSelect" class="workspace-select" ${unassigned.length === 0 ? 'disabled' : ''}>
        <option value="">${unassigned.length === 0 ? 'All workers assigned' : 'Select worker...'}</option>
        ${unassigned.map(w => `<option value="${w.id}">${w.name} — ${w.role}</option>`).join('')}
      </select>
      <button class="workspace-btn-add" id="assignWorkerBtn" ${unassigned.length === 0 ? 'disabled' : ''}>+ Assign</button>
    </div>
  `;
  el.appendChild(assignWrap);

  assignWrap.querySelector('#assignWorkerBtn').addEventListener('click', () => {
    const id = document.getElementById('assignWorkerSelect').value;
    if (!id) return;
    try { assignWorkerToProject(p.id, id); render(); }
    catch (err) { alert(err.message); }
  });

  // Assigned list
  const list = document.createElement('div');
  list.className = 'ws-assigned-workers-list';

  if (assignedIds.length === 0) {
    list.innerHTML = '<p class="workspace-empty">No workers assigned yet.</p>';
  } else {
    assignedIds.forEach(wid => {
      const worker = allWorkers.find(w => w.id === wid);
      if (!worker) return;
      const ticketCount = getTicketsByProject(p.id).filter(t => t.assignedWorkerId === wid).length;
      const row = document.createElement('div');
      row.className = 'ws-assigned-worker-row';
      row.innerHTML = `
        <div class="ws-worker-avatar sm" style="background:${worker.avatarColor}">${worker.name.charAt(0).toUpperCase()}</div>
        <div class="ws-assigned-info">
          <span class="ws-assigned-name">${worker.name}</span>
          <span class="ws-assigned-role">${worker.role}</span>
        </div>
        <span class="ws-assigned-tickets">${ticketCount} ticket${ticketCount !== 1 ? 's' : ''}</span>
        <button class="workspace-card-delete ws-remove-worker-btn" data-wid="${wid}" title="Remove from project">✕</button>
      `;
      row.querySelector('.ws-remove-worker-btn').addEventListener('click', () => {
        if (confirm(`Remove ${worker.name} from this project?`)) {
          removeWorkerFromProject(p.id, wid);
          render();
        }
      });
      list.appendChild(row);
    });
  }
  el.appendChild(list);
}

// ── Tab: Tickets (Kanban) ─────────────────────────────────────────────────────

function _renderTabTickets(el) {
  const p         = _selectedProject;
  const workers   = getAllWorkers().filter(w => p.assignedWorkerIds.includes(w.id));
  const tickets   = getTicketsByProject(p.id);

  // Add ticket form
  const form = document.createElement('div');
  form.className = 'workspace-form-section';
  form.innerHTML = `
    <div class="workspace-form-label">New Ticket</div>
    <div class="ws-ticket-form-grid">
      <input type="text" id="newTicketTitle" placeholder="Ticket title..." class="workspace-input" />
      <select id="newTicketWorker" class="workspace-select">
        <option value="">Unassigned</option>
        ${workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
      </select>
      <select id="newTicketPriority" class="workspace-select">
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="high">High</option>
        <option value="critical">Critical</option>
      </select>
      <button class="workspace-btn-add" id="addTicketBtn">+ Add</button>
    </div>
    <textarea id="newTicketDesc" placeholder="Description (optional)..." class="workspace-textarea" rows="2" style="margin-top:8px"></textarea>
  `;
  el.appendChild(form);

  form.querySelector('#addTicketBtn').addEventListener('click', () => {
    try {
      createTicket(
        p.id,
        document.getElementById('newTicketTitle').value,
        document.getElementById('newTicketDesc').value,
        document.getElementById('newTicketWorker').value || null,
        document.getElementById('newTicketPriority').value,
      );
      document.getElementById('newTicketTitle').value = '';
      document.getElementById('newTicketDesc').value  = '';
      document.getElementById('newTicketWorker').value = '';
      render();
    } catch (err) { alert(err.message); }
  });

  // Kanban board
  const board = document.createElement('div');
  board.className = 'ws-kanban-board';

  TICKET_STATUSES.forEach(status => {
    const col = document.createElement('div');
    col.className = 'ws-kanban-col';
    const colTickets = tickets.filter(t => t.status === status);
    col.innerHTML = `
      <div class="ws-kanban-col-header" style="border-top-color:${STATUS_COLORS[status]}">
        <span class="ws-kanban-col-title">${status}</span>
        <span class="ws-kanban-col-count">${colTickets.length}</span>
      </div>
      <div class="ws-kanban-col-body" id="kanban-col-${status}"></div>
    `;
    const colBody = col.querySelector(`#kanban-col-${status}`);
    colTickets.forEach(ticket => colBody.appendChild(_buildKanbanCard(ticket, workers, p)));
    board.appendChild(col);
  });

  el.appendChild(board);
}

function _buildKanbanCard(ticket, workers, project) {
  const worker = workers.find(w => w.id === ticket.assignedWorkerId);
  const card = document.createElement('div');
  card.className = 'ws-kanban-card';
  card.innerHTML = `
    <div class="ws-kanban-card-header">
      <span class="ws-kanban-priority" style="background:${PRIORITY_COLORS[ticket.priority]}22;color:${PRIORITY_COLORS[ticket.priority]}">${ticket.priority}</span>
      <div class="ws-kanban-card-actions">
        <button class="workspace-ticket-edit" title="Edit">✏️</button>
        <button class="workspace-ticket-delete" title="Delete">🗑️</button>
      </div>
    </div>
    <div class="ws-kanban-card-title">${ticket.title}</div>
    ${ticket.description ? `<div class="ws-kanban-card-desc">${ticket.description}</div>` : ''}
    <div class="ws-kanban-card-footer">
      ${worker ? `<span class="ws-kanban-assignee" style="background:${worker.avatarColor}">${worker.name.charAt(0)}</span>` : '<span class="ws-kanban-unassigned">—</span>'}
      <select class="workspace-status-select ws-kanban-status-select">
        ${TICKET_STATUSES.map(s => `<option value="${s}" ${s === ticket.status ? 'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
  `;

  card.querySelector('.workspace-ticket-edit').addEventListener('click', () => {
    _showEditTicketModal(ticket, project, workers);
  });

  card.querySelector('.workspace-ticket-delete').addEventListener('click', () => {
    if (confirm('Delete this ticket?')) { deleteTicket(ticket.id); render(); }
  });

  card.querySelector('.ws-kanban-status-select').addEventListener('change', e => {
    updateTicketStatus(ticket.id, e.target.value);
    render();
  });

  return card;
}

function _showEditTicketModal(ticket, project, workers) {
  const modal = _createModal('Edit Ticket', `
    <div class="workspace-form-group">
      <label>Title</label>
      <input type="text" id="etTitle" value="${_esc(ticket.title)}" class="workspace-input" />
    </div>
    <div class="workspace-form-group">
      <label>Description</label>
      <textarea id="etDesc" class="workspace-textarea" rows="3">${_esc(ticket.description)}</textarea>
    </div>
    <div class="workspace-form-group">
      <label>Assigned Worker</label>
      <select id="etWorker" class="workspace-select">
        <option value="">Unassigned</option>
        ${workers.map(w => `<option value="${w.id}" ${w.id === ticket.assignedWorkerId ? 'selected':''}>${w.name}</option>`).join('')}
      </select>
    </div>
    <div class="workspace-form-group">
      <label>Priority</label>
      <select id="etPriority" class="workspace-select">
        ${['low','medium','high','critical'].map(p => `<option value="${p}" ${p === ticket.priority ? 'selected':''}>${p}</option>`).join('')}
      </select>
    </div>
    <div class="workspace-form-group">
      <label>Status</label>
      <select id="etStatus" class="workspace-select">
        ${TICKET_STATUSES.map(s => `<option value="${s}" ${s === ticket.status ? 'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
  `, () => {
    try {
      updateTicket(ticket.id, {
        title:            document.getElementById('etTitle').value,
        description:      document.getElementById('etDesc').value,
        assignedWorkerId: document.getElementById('etWorker').value || null,
        priority:         document.getElementById('etPriority').value,
        status:           document.getElementById('etStatus').value,
      });
      modal.remove();
      render();
    } catch (err) { alert(err.message); }
  });
  document.body.appendChild(modal);
}

// ── Tab: Database ─────────────────────────────────────────────────────────────

function _renderTabDb(el) {
  const p = _selectedProject;
  el.innerHTML = `
    <div class="workspace-form-section">
      <div class="workspace-form-label">Database Info</div>
      <textarea id="dbInfoText" class="workspace-textarea ws-mono" rows="14" placeholder="Describe your database schema, tables, relations...">${_esc(p.databaseInfo)}</textarea>
      <div class="workspace-form-actions" style="margin-top:10px">
        <button class="workspace-btn-add" id="saveDbBtn">Save</button>
      </div>
    </div>
  `;
  el.querySelector('#saveDbBtn').addEventListener('click', () => {
    updateProject(p.id, { databaseInfo: document.getElementById('dbInfoText').value });
    render();
  });
}

// ── Tab: Folder Structure ─────────────────────────────────────────────────────

function _renderTabFolders(el) {
  const p = _selectedProject;
  el.innerHTML = `
    <div class="workspace-form-section">
      <div class="workspace-form-label">Folder Structure</div>
      <textarea id="folderText" class="workspace-textarea ws-mono" rows="14" placeholder="src/\n  components/\n  pages/\n  api/">${_esc(p.folderStructure)}</textarea>
      <div class="workspace-form-actions" style="margin-top:10px">
        <button class="workspace-btn-add" id="saveFolderBtn">Save</button>
      </div>
    </div>
  `;
  el.querySelector('#saveFolderBtn').addEventListener('click', () => {
    updateProject(p.id, { folderStructure: document.getElementById('folderText').value });
    render();
  });
}

// ── Tab: Project Logs ─────────────────────────────────────────────────────────

function _renderTabProjectLogs(el) {
  const logs = (_selectedProject.projectLogs || []);
  if (logs.length === 0) {
    el.innerHTML = '<p class="workspace-empty">No project activity yet.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'workspace-logs-container';
  logs.forEach(log => list.appendChild(_buildLogItem(log)));
  el.appendChild(list);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function _buildLogItem(log) {
  const el = document.createElement('div');
  el.className = 'workspace-log-item';
  const date = new Date(log.timestamp);
  el.innerHTML = `
    <div class="workspace-log-content">
      <div class="workspace-log-message">${_renderMarkdown(log.message)}</div>
      <div class="workspace-log-time">${date.toLocaleString()}</div>
    </div>
  `;
  return el;
}

/** Render **bold** markdown only */
function _renderMarkdown(str) {
  return String(str).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Generic modal factory */
function _createModal(title, bodyHtml, onSave) {
  const modal = document.createElement('div');
  modal.className = 'workspace-modal-overlay';
  modal.innerHTML = `
    <div class="workspace-modal">
      <div class="workspace-modal-header">
        <h2>${title}</h2>
        <button class="workspace-modal-close">✕</button>
      </div>
      <div class="workspace-modal-form">${bodyHtml}</div>
      <div class="workspace-modal-footer">
        <button class="workspace-btn-cancel ws-modal-cancel-btn">Cancel</button>
        <button class="workspace-btn-add ws-modal-save-btn">Save</button>
      </div>
    </div>
  `;
  modal.querySelector('.workspace-modal-close').addEventListener('click', () => modal.remove());
  modal.querySelector('.ws-modal-cancel-btn').addEventListener('click', () => modal.remove());
  modal.querySelector('.ws-modal-save-btn').addEventListener('click', onSave);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  return modal;
}