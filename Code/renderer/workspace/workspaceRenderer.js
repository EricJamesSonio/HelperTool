/**
 * workspaceRenderer.js
 * ─────────────────────
 * All UI rendering. No business logic — imports managers for data/mutations.
 */

import { state, genId }                                           from './workspaceStore.js';
import { getAllProjects, createProject, updateProject, deleteProject,
         assignWorkerToProject, removeWorkerFromProject,
         PROJECT_STATUSES, getProjectById }                       from './projectManager.js';
import { getAllWorkers, createWorker, updateWorker, deleteWorker,
         WORKER_ROLES }                                           from './workerManager.js';
import { getTicketsByProject, createTicket, updateTicket,
         updateTicketStatus, deleteTicket, TICKET_STATUSES,
         TICKET_PRIORITIES, STATUS_COLORS, PRIORITY_COLORS }      from './ticketManager.js';
import { confirmDialog }                                          from '../utils/confirmDialog.js';

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const ICON_HOME = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l7-7 7 7"/><path d="M5 7v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7"/></svg>';
const ICON_PROJECTS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/></svg>';
const ICON_WORKERS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M14 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M1 18v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M14 14a4 4 0 0 1 4 4v2"/></svg>';
const ICON_LOGS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="12" height="15" rx="2"/><path d="M8 1v4h4V1"/><path d="M7 9h6"/><path d="M7 12h6"/><path d="M7 15h4"/></svg>';
const ICON_ARROW_RIGHT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10h10"/><path d="m10 5 5 5-5 5"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3.5a2.12 2.12 0 0 1 3 3L5.5 19l-4 1 1-4Z"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14"/><path d="M7 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M5 5v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5"/></svg>';
const ICON_DATABASE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="10" cy="4" rx="7" ry="2"/><path d="M3 4v12c0 1.1 3.1 2 7 2s7-.9 7-2V4"/><path d="M3 10c0 1.1 3.1 2 7 2s7-.9 7-2"/></svg>';
const ICON_FOLDER_OPEN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9L7 4H4a2 2 0 0 0-2 2v1z"/></svg>';
const ICON_PLANNING = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4a2 2 0 0 1 2-2h4.5L15 7.5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M10.5 2v5.5H16"/><path d="M7 11h4"/><path d="M7 14h4"/></svg>';
const ICON_TICKET = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 8h4"/><path d="M8 11h4"/><path d="M8 14h2"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v12"/><path d="M4 10h12"/></svg>';
const ICON_CODEBASE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12v12H4z"/><path d="M8 8h4"/><path d="M8 11h4"/><path d="M8 14h2"/></svg>';
const ICON_DESIGN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 2v8"/><path d="M10 10a4 4 0 0 1 4 4"/><path d="M2 10h6"/><path d="M12 10h6"/></svg>';
const ICON_GEAR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v3"/><path d="M10 16v3"/><path d="M3.5 3.5l2 2"/><path d="M14.5 14.5l2 2"/><path d="M1 10h3"/><path d="M16 10h3"/><path d="M3.5 16.5l2-2"/><path d="M14.5 5.5l2-2"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10H5"/><path d="m10 5-5 5 5 5"/></svg>';
const ICON_REMOVE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';

// ─── Nav state ────────────────────────────────────────────────────────────────

let _view            = 'home';
let _selectedProject = null;
let _projectTab      = 'overview';
let _selectedNoteId  = null;

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

  nav.innerHTML = `
    ${_view !== 'home' ? `<button class="workspace-back-btn" id="wsBackBtn">${ICON_BACK} Back</button>` : ''}
    <h1 class="workspace-title">${_getNavTitle()}</h1>
    <div class="workspace-navbar-right">
      ${_view === 'home' ? `
        <button class="workspace-nav-chip" data-goto="projects">${ICON_PROJECTS} Projects</button>
        <button class="workspace-nav-chip" data-goto="workers">${ICON_WORKERS} Workers</button>
        <button class="workspace-nav-chip" data-goto="logs">${ICON_LOGS} Logs</button>
      ` : ''}
      <button class="workspace-close-btn" id="wsCloseBtn">${ICON_REMOVE}</button>
    </div>
  `;

  nav.querySelectorAll('[data-goto]').forEach(btn =>
    btn.addEventListener('click', () => { _view = btn.dataset.goto; render(); })
  );
  nav.querySelector('#wsBackBtn')?.addEventListener('click', () => {
    if (_view === 'project-details') { _view = 'projects'; _selectedProject = null; }
    else { _view = 'home'; }
    render();
  });
  nav.querySelector('#wsCloseBtn')?.addEventListener('click', () =>
    document.getElementById('workspaceContainer')?.classList.remove('open')
  );
}

function _getNavTitle() {
  switch (_view) {
    case 'home':           return `${ICON_HOME} Workspace`;
    case 'projects':       return `${ICON_PROJECTS} Projects`;
    case 'workers':        return `${ICON_WORKERS} Workers`;
    case 'logs':           return `${ICON_LOGS} Global Logs`;
    case 'project-details':return _selectedProject ? `${ICON_PROJECTS} ${_selectedProject.title}` : `${ICON_PROJECTS} Project`;
    default:               return 'Workspace';
  }
}

// ─── Body dispatcher ──────────────────────────────────────────────────────────

function _renderBody() {
  const body = document.getElementById('workspaceBody');
  if (!body) return;
  body.innerHTML = '';
  switch (_view) {
    case 'home':            _renderHome(body);           break;
    case 'projects':        _renderProjectsList(body);   break;
    case 'workers':         _renderWorkersList(body);    break;
    case 'logs':            _renderGlobalLogs(body);     break;
    case 'project-details': _renderProjectDetails(body); break;
  }
}

// ─── HOME ─────────────────────────────────────────────────────────────────────

function _renderHome(body) {
  const activeTickets   = state.tickets.filter(t => !['complete','backlog'].includes(t.status)).length;
  const completeTickets = state.tickets.filter(t => t.status === 'complete').length;
  const activeProjects  = state.projects.filter(p => p.status === 'in-progress').length;
  const totalTickets    = state.tickets.length;
  const completePct     = totalTickets ? Math.round((completeTickets / totalTickets) * 100) : 0;

  // Recent logs (last 4)
  const recentLogs = state.globalLogs.slice(0, 4);

  body.innerHTML = `
    <div class="ws-home-layout">

      <!-- Left column: stats + nav cards -->
      <div class="ws-home-left">

        <div class="ws-home-stats-grid">
          <div class="ws-stat-card ws-stat-accent">
            <span class="ws-stat-num">${state.projects.length}</span>
            <span class="ws-stat-lbl">Total Projects</span>
            <span class="ws-stat-sub">${activeProjects} active</span>
          </div>
          <div class="ws-stat-card">
            <span class="ws-stat-num">${state.workers.length}</span>
            <span class="ws-stat-lbl">Workers</span>
            <span class="ws-stat-sub">global team</span>
          </div>
          <div class="ws-stat-card">
            <span class="ws-stat-num" style="color:#60a5fa">${activeTickets}</span>
            <span class="ws-stat-lbl">Active Tickets</span>
            <span class="ws-stat-sub">in progress</span>
          </div>
          <div class="ws-stat-card">
            <span class="ws-stat-num" style="color:#34d399">${completeTickets}</span>
            <span class="ws-stat-lbl">Done</span>
            <span class="ws-stat-sub">${completePct}% of total</span>
          </div>
        </div>

        <div class="ws-home-section-label">Navigate</div>
        <div class="ws-home-nav-cards">
          <button class="ws-home-card" data-goto="projects">
            <div class="ws-home-card-left">
              <span class="ws-home-card-icon">${ICON_PROJECTS}</span>
              <div>
                <div class="ws-home-card-label">Projects</div>
                <div class="ws-home-card-sub">${state.projects.length} total · ${activeProjects} active</div>
              </div>
            </div>
            <span class="ws-home-card-arrow">${ICON_ARROW_RIGHT}</span>
          </button>
          <button class="ws-home-card" data-goto="workers">
            <div class="ws-home-card-left">
              <span class="ws-home-card-icon">${ICON_WORKERS}</span>
              <div>
                <div class="ws-home-card-label">Workers</div>
                <div class="ws-home-card-sub">${state.workers.length} team members</div>
              </div>
            </div>
            <span class="ws-home-card-arrow">${ICON_ARROW_RIGHT}</span>
          </button>
          <button class="ws-home-card" data-goto="logs">
            <div class="ws-home-card-left">
              <span class="ws-home-card-icon">${ICON_LOGS}</span>
              <div>
                <div class="ws-home-card-label">Activity Log</div>
                <div class="ws-home-card-sub">${state.globalLogs.length} events</div>
              </div>
            </div>
            <span class="ws-home-card-arrow">${ICON_ARROW_RIGHT}</span>
          </button>
        </div>

      </div>

      <!-- Right column: recent activity -->
      <div class="ws-home-right">
        <div class="ws-home-section-label">Recent Activity</div>
        <div class="ws-home-activity" id="wsHomeActivity">
          ${recentLogs.length === 0
            ? '<p class="ws-home-empty">No activity yet.</p>'
            : recentLogs.map(log => `
                <div class="ws-home-activity-item">
                  <div class="ws-home-activity-dot"></div>
                  <div class="ws-home-activity-content">
                    <div class="ws-home-activity-msg">${log.message.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>
                    <div class="ws-home-activity-time">${new Date(log.timestamp).toLocaleString()}</div>
                  </div>
                </div>
              `).join('')
          }
        </div>
        ${state.globalLogs.length > 4 ? `
          <button class="ws-home-view-all" data-goto="logs">View all activity ${ICON_ARROW_RIGHT}</button>
        ` : ''}
      </div>

    </div>
  `;

  body.querySelectorAll('[data-goto]').forEach(btn =>
    btn.addEventListener('click', () => { _view = btn.dataset.goto; render(); })
  );
}

// ─── PROJECTS LIST ────────────────────────────────────────────────────────────

function _renderProjectsList(body) {
  const form = document.createElement('div');
  form.className = 'workspace-form-section';
  form.innerHTML = `
    <div class="workspace-form-label">New Project</div>
    <div class="ws-add-project-form">
      <input type="text" id="newProjectTitle" placeholder="Project title..." class="workspace-input" />
      <input type="text" id="newProjectDesc"  placeholder="Short description (optional)..." class="workspace-input" />
      <button class="workspace-btn-add" id="addProjectBtn">${ICON_PLUS} Add Project</button>
    </div>
    <div class="workspace-form-error" id="addProjectError"></div>
  `;
  body.appendChild(form);

  form.querySelector('#addProjectBtn').addEventListener('click', () => {
    const errEl = document.getElementById('addProjectError');
    try {
      createProject(
        document.getElementById('newProjectTitle').value,
        document.getElementById('newProjectDesc').value,
      );
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      document.getElementById('newProjectTitle').value = '';
      document.getElementById('newProjectDesc').value  = '';
      render();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    }
  });

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
      <button class="workspace-card-edit" title="Edit">${ICON_EDIT}</button>
      <button class="workspace-card-delete" title="Delete">${ICON_DELETE}</button>
    </div>
    <div class="ws-project-desc">${_esc(project.description) || ''}</div>
    <div class="ws-project-status-badge ws-status-${project.status}">${project.status}</div>
    <div class="ws-project-meta">
      <span>${ICON_WORKERS} ${workerCnt} worker${workerCnt !== 1 ? 's' : ''}</span>
      <span>${ICON_TICKET} ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="ws-progress-bar-wrap"><div class="ws-progress-bar" style="width:${progress}%"></div></div>
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

  card.querySelector('.workspace-card-delete').addEventListener('click', async e => {
    e.stopPropagation();
    const ok = await confirmDialog(`Delete project "${project.title}" and all its tickets?`);
    if (!ok) return;
    deleteProject(project.id);
    render();
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
  `, errEl => {
    try {
      updateProject(project.id, {
        title:       document.getElementById('editProjTitle').value,
        description: document.getElementById('editProjDesc').value,
        status:      document.getElementById('editProjStatus').value,
      });
      modal.remove();
      render();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
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
      <button class="workspace-btn-add" id="addWorkerBtn">${ICON_PLUS} Add Worker</button>
    </div>
    <div class="workspace-form-error" id="addWorkerError"></div>
  `;
  body.appendChild(form);

  form.querySelector('#addWorkerBtn').addEventListener('click', () => {
    const errEl = document.getElementById('addWorkerError');
    try {
      createWorker(
        document.getElementById('newWorkerName').value,
        document.getElementById('newWorkerRole').value,
      );
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      document.getElementById('newWorkerName').value = '';
      document.getElementById('newWorkerRole').value = '';
      render();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    }
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
  const workerTickets    = state.tickets.filter(t => t.assignedWorkerId === worker.id);
  const completedTickets = workerTickets.filter(t => t.status === 'complete').length;
  const projectCount     = state.projects.filter(p => p.assignedWorkerIds.includes(worker.id)).length;

  const card = document.createElement('div');
  card.className = 'workspace-worker-card';
  card.innerHTML = `
    <div class="workspace-card-header">
      <div class="ws-worker-avatar" style="background:${worker.avatarColor}">${worker.name.charAt(0).toUpperCase()}</div>
      <div class="workspace-card-title">${worker.name}</div>
      <button class="workspace-card-edit" title="Edit">${ICON_EDIT}</button>
      <button class="workspace-card-delete" title="Delete">${ICON_DELETE}</button>
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
  card.querySelector('.workspace-card-delete').addEventListener('click', async e => {
    e.stopPropagation();
    const ok = await confirmDialog(`Delete ${worker.name}? Their tickets will become unassigned.`);
    if (!ok) return;
    deleteWorker(worker.id);
    render();
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
  `, errEl => {
    try {
      updateWorker(
        worker.id,
        document.getElementById('editWorkerName').value,
        document.getElementById('editWorkerRole').value,
      );
      modal.remove();
      render();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
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
  _selectedProject = getProjectById(_selectedProject.id);
  if (!_selectedProject) { _view = 'projects'; render(); return; }

  const tabs = [
    { key: 'overview', label: 'Overview'  },
    { key: 'workers',  label: `${ICON_WORKERS} Workers`   },
    { key: 'tickets',  label: `${ICON_TICKET} Tickets`   },
    { key: 'db',       label: `${ICON_DATABASE} Database`  },
    { key: 'folders',  label: `${ICON_FOLDER_OPEN} Folders`   },
    { key: 'plannings', label: `${ICON_PLANNING} Plannings` },
    { key: 'logs',      label: `${ICON_LOGS} Logs`     },
  ];

  const tabBar = document.createElement('div');
  tabBar.className = 'ws-tab-bar';
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = `ws-tab-btn ${_projectTab === t.key ? 'active' : ''}`;
    btn.dataset.key = t.key;
    btn.innerHTML = t.label;
    btn.addEventListener('click', () => { _projectTab = t.key; render(); });
    tabBar.appendChild(btn);
  });
  body.appendChild(tabBar);

  const content = document.createElement('div');
  content.className = 'ws-tab-content';

  switch (_projectTab) {
    case 'overview': _renderTabOverview(content);     break;
    case 'workers':  _renderTabWorkers(content);      break;
    case 'tickets':  _renderTabTickets(content);      break;
    case 'db':       _renderTabDb(content);            break;
    case 'folders':  _renderTabFolders(content);      break;
    case 'plannings': _renderTabPlannings(content);   break;
    case 'logs':      _renderTabProjectLogs(content); break;
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
        <select id="overviewStatus" class="workspace-select">
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
  const p           = _selectedProject;
  const allWorkers  = getAllWorkers();
  const assignedIds = p.assignedWorkerIds;
  const unassigned  = allWorkers.filter(w => !assignedIds.includes(w.id));

  const assignWrap = document.createElement('div');
  assignWrap.className = 'workspace-form-section';
  assignWrap.innerHTML = `
    <div class="workspace-form-label">Assign Worker</div>
    <div class="ws-assign-row">
      <select id="assignWorkerSelect" class="workspace-select" ${unassigned.length === 0 ? 'disabled' : ''}>
        <option value="">${unassigned.length === 0 ? 'All workers assigned' : 'Select worker...'}</option>
        ${unassigned.map(w => `<option value="${w.id}">${w.name} — ${w.role}</option>`).join('')}
      </select>
      <button class="workspace-btn-add" id="assignWorkerBtn" ${unassigned.length === 0 ? 'disabled' : ''}>${ICON_PLUS} Assign</button>
      <div class="workspace-form-error" id="assignWorkerError"></div>
    </div>
  `;
  el.appendChild(assignWrap);

  assignWrap.querySelector('#assignWorkerBtn').addEventListener('click', () => {
    const errEl = document.getElementById('assignWorkerError');
    const id = document.getElementById('assignWorkerSelect').value;
    if (!id) return;
    try {
      assignWorkerToProject(p.id, id);
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      render();
    }
    catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    }
  });

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
        <button class="workspace-card-delete ws-remove-worker-btn" data-wid="${wid}" title="Remove">${ICON_REMOVE}</button>
      `;
      row.querySelector('.ws-remove-worker-btn').addEventListener('click', async () => {
        const ok = await confirmDialog(`Remove ${worker.name} from this project?`);
        if (!ok) return;
        removeWorkerFromProject(p.id, wid);
        render();
      });
      list.appendChild(row);
    });
  }
  el.appendChild(list);
}

// ── Tab: Tickets (Kanban) ─────────────────────────────────────────────────────

function _renderTabTickets(el) {
  const p       = _selectedProject;
  const workers = getAllWorkers().filter(w => p.assignedWorkerIds.includes(w.id));
  const tickets = getTicketsByProject(p.id);

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
      <button class="workspace-btn-add" id="addTicketBtn">${ICON_PLUS} Add</button>
    </div>
    <textarea id="newTicketDesc" placeholder="Description (optional)..." class="workspace-textarea" rows="2" style="margin-top:10px;width:100%;box-sizing:border-box"></textarea>
    <div class="workspace-form-error" id="addTicketError"></div>
  `;
  el.appendChild(form);

  form.querySelector('#addTicketBtn').addEventListener('click', () => {
    const errEl = document.getElementById('addTicketError');
    try {
      createTicket(
        p.id,
        document.getElementById('newTicketTitle').value,
        document.getElementById('newTicketDesc').value,
        document.getElementById('newTicketWorker').value || null,
        document.getElementById('newTicketPriority').value,
      );
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      document.getElementById('newTicketTitle').value   = '';
      document.getElementById('newTicketDesc').value    = '';
      document.getElementById('newTicketWorker').value  = '';
      render();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    }
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
      <div class="ws-kanban-col-body"></div>
    `;
    const colBody = col.querySelector('.ws-kanban-col-body');
    colTickets.forEach(ticket => colBody.appendChild(_buildKanbanCard(ticket, workers, p)));
    board.appendChild(col);
  });

  el.appendChild(board);
}

function _buildKanbanCard(ticket, workers, project) {
  const worker  = workers.find(w => w.id === ticket.assignedWorkerId);
  const PREVIEW = 90; // chars shown before "show more"
  const hasLongDesc = ticket.description && ticket.description.length > PREVIEW;
  const previewText  = hasLongDesc
    ? ticket.description.slice(0, PREVIEW).trimEnd() + '…'
    : ticket.description;

  const card = document.createElement('div');
  card.className = 'ws-kanban-card';
  card.innerHTML = `
    <div class="ws-kanban-card-header">
      <span class="ws-kanban-priority"
        style="background:${PRIORITY_COLORS[ticket.priority]}22;color:${PRIORITY_COLORS[ticket.priority]}">
        ${ticket.priority}
      </span>
      <div class="ws-kanban-card-actions">
        <button class="workspace-ticket-edit"   title="Edit">${ICON_EDIT}</button>
        <button class="workspace-ticket-delete" title="Delete">${ICON_DELETE}</button>
      </div>
    </div>

    <div class="ws-kanban-card-title">${_esc(ticket.title)}</div>

    ${ticket.description ? `
      <div class="ws-kanban-desc-wrap">
        <div class="ws-kanban-card-desc ws-kanban-desc-preview">${_esc(previewText)}</div>
        ${hasLongDesc ? `
          <div class="ws-kanban-card-desc ws-kanban-desc-full" style="display:none">${_esc(ticket.description)}</div>
          <button class="ws-kanban-desc-toggle">Show more</button>
        ` : ''}
      </div>
    ` : ''}

    <div class="ws-kanban-card-footer">
      <div class="ws-kanban-assignee-wrap">
        ${worker
          ? `<span class="ws-kanban-assignee" style="background:${worker.avatarColor}">${worker.name.charAt(0)}</span>
             <span class="ws-kanban-assignee-name">${worker.name}</span>`
          : `<span class="ws-kanban-unassigned">—</span>
             <span class="ws-kanban-assignee-name ws-kanban-unassigned-lbl">Unassigned</span>`}
      </div>
      <select class="ws-kanban-status-select">
        ${TICKET_STATUSES.map(s => `<option value="${s}" ${s === ticket.status ? 'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
  `;

  // Toggle description expand/collapse
  const toggleBtn = card.querySelector('.ws-kanban-desc-toggle');
  if (toggleBtn) {
    const preview = card.querySelector('.ws-kanban-desc-preview');
    const full    = card.querySelector('.ws-kanban-desc-full');
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const expanded = full.style.display !== 'none';
      full.style.display    = expanded ? 'none'  : 'block';
      preview.style.display = expanded ? 'block' : 'none';
      toggleBtn.textContent = expanded ? 'Show more' : 'Show less';
    });
  }

  card.querySelector('.workspace-ticket-edit').addEventListener('click', () =>
    _showEditTicketModal(ticket, project, workers)
  );
  card.querySelector('.workspace-ticket-delete').addEventListener('click', async () => {
    const ok = await confirmDialog('Delete this ticket?');
    if (!ok) return;
    deleteTicket(ticket.id);
    render();
  });
  card.querySelector('.ws-kanban-status-select').addEventListener('change', e => {
    updateTicketStatus(ticket.id, e.target.value);
    render();
  });

  return card;
}

function _showEditTicketModal(ticket, project, workers) {
  const modal = _createModal('Edit Ticket', `
  <div class="ws-edit-ticket-grid">

    <div class="ws-edit-ticket-left">
      <div class="workspace-form-group">
        <label>Title</label>
        <input type="text" id="etTitle" value="${_esc(ticket.title)}" class="workspace-input" />
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
          ${TICKET_PRIORITIES.map(p => `<option value="${p}" ${p === ticket.priority ? 'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="workspace-form-group">
        <label>Status</label>
        <select id="etStatus" class="workspace-select">
          ${TICKET_STATUSES.map(s => `<option value="${s}" ${s === ticket.status ? 'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="ws-edit-ticket-right">
      <label>Description</label>
      <textarea id="etDesc" class="workspace-textarea">${_esc(ticket.description)}</textarea>
    </div>

  </div>
  `, errEl => {
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
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  });
  document.body.appendChild(modal);
}

// ── Tab: Database ─────────────────────────────────────────────────────────────

function _renderTabDb(el) {
  const p = _selectedProject;
  el.innerHTML = `
    <div class="ws-fullheight-section">
      <div class="workspace-form-label">Database Info</div>
      <textarea id="dbInfoText" class="ws-fullheight-textarea"
        placeholder="Describe your database schema, tables, relations, indexes...">${_esc(p.databaseInfo)}</textarea>
      <div class="ws-fullheight-footer">
        <button class="workspace-btn-add" id="saveDbBtn">Save</button>
      </div>
    </div>
  `;
  el.querySelector('#saveDbBtn').addEventListener('click', () => {
    updateProject(p.id, { databaseInfo: document.getElementById('dbInfoText').value });
    render();
  });
}

// ── Tab: Folder Structure (3 panels) ─────────────────────────────────────────

function _renderTabFolders(el) {
  const p = _selectedProject;

  // Migrate legacy single folderStructure field into folderMain if folderMain is empty
  const mainVal     = p.folderMain     || p.folderStructure || '';
  const frontendVal = p.folderFrontend || '';
  const backendVal  = p.folderBackend  || '';

  el.className = 'ws-tab-content ws-folders-tab';

  el.innerHTML = `
    <div class="ws-folders-grid">

      <div class="ws-folder-panel">
        <div class="ws-folder-panel-header">
          <span class="ws-folder-panel-icon">${ICON_CODEBASE}</span>
          <div>
            <div class="ws-folder-panel-title">Full Codebase</div>
            <div class="ws-folder-panel-sub">Root / monorepo structure</div>
          </div>
        </div>
        <textarea id="folderMain" class="ws-fullheight-textarea"
          placeholder="root/\n├─ src/\n│   ├─ frontend/\n│   └─ backend/\n├─ docs/\n└─ package.json">${_esc(mainVal)}</textarea>
      </div>

      <div class="ws-folder-panel">
        <div class="ws-folder-panel-header">
          <span class="ws-folder-panel-icon">${ICON_DESIGN}</span>
          <div>
            <div class="ws-folder-panel-title">Frontend</div>
            <div class="ws-folder-panel-sub">UI / client-side structure</div>
          </div>
        </div>
        <textarea id="folderFrontend" class="ws-fullheight-textarea"
          placeholder="src/\n├─ components/\n├─ pages/\n├─ hooks/\n├─ styles/\n└─ utils/">${_esc(frontendVal)}</textarea>
      </div>

      <div class="ws-folder-panel">
        <div class="ws-folder-panel-header">
          <span class="ws-folder-panel-icon">${ICON_GEAR}</span>
          <div>
            <div class="ws-folder-panel-title">Backend</div>
            <div class="ws-folder-panel-sub">Server / API structure</div>
          </div>
        </div>
        <textarea id="folderBackend" class="ws-fullheight-textarea"
          placeholder="src/\n├─ controllers/\n├─ services/\n├─ models/\n├─ routes/\n└─ middleware/">${_esc(backendVal)}</textarea>
      </div>

    </div>

    <div class="workspace-form-actions ws-folders-save-row">
      <button class="workspace-btn-add" id="saveFoldersBtn">Save All</button>
    </div>
  `;

  el.querySelector('#saveFoldersBtn').addEventListener('click', () => {
    updateProject(p.id, {
      folderMain:     document.getElementById('folderMain').value,
      folderFrontend: document.getElementById('folderFrontend').value,
      folderBackend:  document.getElementById('folderBackend').value,
    });
    render();
  });
}

// ── Tab: Plannings ──────────────────────────────────────────────────────────────

function _renderTabPlannings(el) {
  const p = _selectedProject;
  const notes = Array.isArray(p.planningNotes) ? p.planningNotes : [];

  // Reset selection if the selected note no longer exists
  if (!notes.find(n => n.id === _selectedNoteId)) {
    _selectedNoteId = notes.length > 0 ? notes[0].id : null;
  }

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;gap:16px;flex:1;min-height:0;';

  const sidebar = document.createElement('div');
  sidebar.style.cssText = 'width:220px;flex-shrink:0;display:flex;flex-direction:column;gap:6px;background:var(--bg-elevated,#111d34);border:1px solid var(--border-default,rgba(255,255,255,0.09));border-radius:14px;padding:14px;overflow-y:auto;';

  const sidebarTitle = document.createElement('div');
  sidebarTitle.style.cssText = 'font-weight:600;font-size:0.85rem;color:var(--text-secondary,#a0b0d8);padding-bottom:8px;margin-bottom:2px;border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.07));flex-shrink:0;';
  sidebarTitle.textContent = 'Plans';
  sidebar.appendChild(sidebarTitle);

  notes.forEach((note, i) => {
    const item = document.createElement('div');
    const displayName = note.title || note.content?.split('\n')[0]?.trim() || `Note ${i + 1}`;
    item.textContent = displayName;
    const selected = note.id === _selectedNoteId;
    item.style.cssText = `padding:8px 10px;border-radius:8px;cursor:pointer;font-size:0.83rem;word-break:break-word;transition:all 0.12s;${selected ? 'background:var(--accent);color:var(--accent-text,#000);font-weight:600;' : 'color:var(--text-primary,#eef2ff);background:transparent;'}`;
    if (!selected) {
      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,0.06)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
    }
    item.addEventListener('click', () => { _selectedNoteId = note.id; render(); });
    sidebar.appendChild(item);
  });

  const addBtn = document.createElement('button');
  addBtn.innerHTML = `${ICON_PLUS} Add`;
  addBtn.className = 'workspace-btn-add';
  addBtn.style.cssText = 'margin-top:auto;width:100%;flex-shrink:0;';
  addBtn.addEventListener('click', () => {
    if (!Array.isArray(p.planningNotes)) p.planningNotes = [];
    const newNote = { id: genId(), title: '', content: '' };
    p.planningNotes.push(newNote);
    _selectedNoteId = newNote.id;
    updateProject(p.id, { planningNotes: p.planningNotes });
    render();
  });
  sidebar.appendChild(addBtn);
  container.appendChild(sidebar);

  // ── Right panel ──
  const right = document.createElement('div');
  right.style.cssText = 'flex:1;display:flex;flex-direction:column;background:var(--bg-elevated,#111d34);border:1px solid var(--border-default,rgba(255,255,255,0.09));border-radius:14px;padding:22px 24px;gap:14px;min-height:0;';

  const selectedNote = _selectedNoteId ? notes.find(n => n.id === _selectedNoteId) : notes[0] || null;

  if (selectedNote) {
    if (!_selectedNoteId) _selectedNoteId = selectedNote.id;

    const rightHeader = document.createElement('div');
    rightHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'workspace-input';
    titleInput.value = selectedNote.title || '';
    titleInput.placeholder = 'Note title...';
    titleInput.style.cssText = 'font-size:1rem;font-weight:600;padding:10px 14px;flex:1;';
    rightHeader.appendChild(titleInput);

    const delBtn = document.createElement('button');
    delBtn.innerHTML = ICON_REMOVE;
    delBtn.style.cssText = 'background:transparent;border:1px solid var(--red-dim,rgba(255,80,80,0.3));color:var(--red,#ff5050);border-radius:8px;padding:6px 14px;cursor:pointer;font-size:0.85rem;margin-left:10px;flex-shrink:0;';
    delBtn.addEventListener('mouseenter', () => { delBtn.style.background = 'rgba(255,80,80,0.1)'; });
    delBtn.addEventListener('mouseleave', () => { delBtn.style.background = 'transparent'; });
    delBtn.addEventListener('click', () => {
      p.planningNotes = notes.filter(n => n.id !== selectedNote.id);
      _selectedNoteId = null;
      updateProject(p.id, { planningNotes: p.planningNotes });
      render();
    });
    rightHeader.appendChild(delBtn);
    right.appendChild(rightHeader);

    const textarea = document.createElement('textarea');
    textarea.className = 'ws-fullheight-textarea';
    textarea.value = selectedNote.content || '';
    textarea.placeholder = 'Write your planning notes...';
    right.appendChild(textarea);

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:flex-end;flex-shrink:0;';
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'workspace-btn-add';
    saveBtn.addEventListener('click', () => {
      selectedNote.title = titleInput.value;
      selectedNote.content = textarea.value;
      updateProject(p.id, { planningNotes: p.planningNotes });
      render();
    });
    footer.appendChild(saveBtn);
    right.appendChild(footer);
  } else {
    const empty = document.createElement('div');
    empty.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary,#a0b0d8);font-size:0.9rem;';
    empty.textContent = 'No plans yet. Click "+ Add" to create one.';
    right.appendChild(empty);
  }

  container.appendChild(right);
  el.appendChild(container);
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

function _renderMarkdown(str) {
  return String(str).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _createModal(title, bodyHtml, onSave) {
  const modal = document.createElement('div');
  modal.className = 'workspace-modal-overlay';
  const errId = `wsModalErr_${Date.now()}`;
  modal.innerHTML = `
    <div class="workspace-modal">
      <div class="workspace-modal-header">
        <h2>${title}</h2>
        <button class="workspace-modal-close">${ICON_REMOVE}</button>
      </div>
      <div class="workspace-modal-form">${bodyHtml}</div>
      <div class="workspace-form-error" id="${errId}"></div>
      <div class="workspace-modal-footer">
        <button class="workspace-btn-cancel ws-modal-cancel-btn">Cancel</button>
        <button class="workspace-btn-add ws-modal-save-btn">Save</button>
      </div>
    </div>
  `;
  const errEl = modal.querySelector('.workspace-form-error');
  modal.querySelector('.workspace-modal-close').addEventListener('click',   () => modal.remove());
  modal.querySelector('.ws-modal-cancel-btn').addEventListener('click',     () => modal.remove());
  modal.querySelector('.ws-modal-save-btn').addEventListener('click', () => {
    errEl.textContent = '';
    errEl.style.display = 'none';
    onSave(errEl);
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  return modal;
}