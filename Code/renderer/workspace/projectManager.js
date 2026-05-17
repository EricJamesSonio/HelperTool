/**
 * projectManager.js
 * ──────────────────
 * Project CRUD + project-scoped log helpers.
 *
 * Folder structure is split into 3 independent fields:
 *   folderMain      — full codebase / monorepo root
 *   folderFrontend  — frontend-specific structure
 *   folderBackend   — backend-specific structure
 */

import { state, saveAll, genId } from './workspaceStore.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const PROJECT_STATUSES = ['planning', 'pending', 'in-progress', 'maintenance', 'complete'];

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getAllProjects() {
  return state.projects;
}

export function getProjectById(id) {
  return state.projects.find(p => p.id === id) || null;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function createProject(title, description = '') {
  if (!title?.trim()) throw new Error('Project title is required');

  const project = {
    id: genId(),
    title: title.trim(),
    description: description.trim(),
    overview: '',
    // 3-part folder structure
    folderMain: '',
    folderFrontend: '',
    folderBackend: '',
    // Legacy field kept for backward-compat with any saved data
    folderStructure: '',
    databaseInfo: '',
    status: 'planning',
    assignedWorkerIds: [],
    projectLogs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.projects.push(project);
  _addGlobalLog('project_created', `Project **${project.title}** created`);
  saveAll();
  return project;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function updateProject(id, fields) {
  const project = getProjectById(id);
  if (!project) throw new Error('Project not found');

  const allowed = [
    'title', 'description', 'overview',
    'folderMain', 'folderFrontend', 'folderBackend',
    'folderStructure', // legacy
    'databaseInfo', 'status',
  ];
  allowed.forEach(key => {
    if (fields[key] !== undefined) project[key] = fields[key];
  });
  project.updatedAt = new Date().toISOString();

  if (fields.status) {
    _addProjectLog(project, 'status_changed', `Status changed to **${fields.status}**`);
    if (fields.status === 'complete') {
      _addGlobalLog('project_completed', `Project **${project.title}** marked complete`);
    }
  }

  saveAll();
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function deleteProject(id) {
  const project = getProjectById(id);
  if (!project) throw new Error('Project not found');

  const title = project.title;
  state.projects = state.projects.filter(p => p.id !== id);
  state.tickets = state.tickets.filter(t => t.projectId !== id);
  _addGlobalLog('project_deleted', `Project **${title}** deleted`);
  saveAll();
}

// ─── Worker Assignment ────────────────────────────────────────────────────────

export function assignWorkerToProject(projectId, workerId) {
  const project = getProjectById(projectId);
  if (!project) throw new Error('Project not found');
  if (project.assignedWorkerIds.includes(workerId)) return;

  const worker = state.workers.find(w => w.id === workerId);
  if (!worker) throw new Error('Worker not found');

  project.assignedWorkerIds.push(workerId);
  project.updatedAt = new Date().toISOString();

  _addProjectLog(project, 'worker_assigned', `**${worker.name}** assigned to project`);
  _addGlobalLog('worker_assigned', `**${worker.name}** assigned to project **${project.title}**`);
  saveAll();
}

export function removeWorkerFromProject(projectId, workerId) {
  const project = getProjectById(projectId);
  if (!project) throw new Error('Project not found');

  const worker = state.workers.find(w => w.id === workerId);
  project.assignedWorkerIds = project.assignedWorkerIds.filter(id => id !== workerId);
  project.updatedAt = new Date().toISOString();

  state.tickets
    .filter(t => t.projectId === projectId && t.assignedWorkerId === workerId)
    .forEach(t => { t.assignedWorkerId = null; });

  if (worker) {
    _addProjectLog(project, 'worker_removed', `**${worker.name}** removed from project`);
  }
  saveAll();
}

// ─── Project-scoped log helpers ───────────────────────────────────────────────

export function addProjectLog(projectId, type, message) {
  const project = getProjectById(projectId);
  if (!project) return;
  _addProjectLog(project, type, message);
  saveAll();
}

function _addProjectLog(project, type, message) {
  if (!Array.isArray(project.projectLogs)) project.projectLogs = [];
  project.projectLogs.unshift({
    id: genId(),
    type,
    message,
    timestamp: new Date().toISOString(),
  });
}

// ─── Global log ───────────────────────────────────────────────────────────────

function _addGlobalLog(type, message) {
  state.globalLogs.unshift({
    id: genId(),
    type,
    message,
    timestamp: new Date().toISOString(),
  });
}

export function addGlobalLog(type, message) {
  _addGlobalLog(type, message);
  saveAll();
}