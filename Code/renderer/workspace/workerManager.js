/**
 * workerManager.js
 * ─────────────────
 * Worker CRUD. Workers are global and reusable across projects.
 */

import { state, saveAll, genId } from './workspaceStore.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const WORKER_ROLES = [
  'developer',
  'frontend dev',
  'backend dev',
  'fullstack dev',
  'product manager',
  'designer',
  'qa engineer',
  'devops',
];

const AVATAR_COLORS = [
  '#f0b429', '#60a5fa', '#34d399', '#f87171',
  '#a78bfa', '#fb923c', '#38bdf8', '#4ade80',
];

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getAllWorkers() {
  return state.workers;
}

export function getWorkerById(id) {
  return state.workers.find(w => w.id === id) || null;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function createWorker(name, role) {
  if (!name?.trim()) throw new Error('Worker name is required');
  if (!WORKER_ROLES.includes(role)) throw new Error('Invalid worker role');

  const worker = {
    id:          genId(),
    name:        name.trim(),
    role,
    avatarColor: AVATAR_COLORS[state.workers.length % AVATAR_COLORS.length],
    skills:      [],
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };

  state.workers.push(worker);
  _addGlobalLog('worker_created', `Worker **${worker.name}** (${worker.role}) added`);
  saveAll();
  return worker;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function updateWorker(id, name, role) {
  if (!name?.trim()) throw new Error('Worker name is required');
  if (!WORKER_ROLES.includes(role)) throw new Error('Invalid worker role');

  const worker = getWorkerById(id);
  if (!worker) throw new Error('Worker not found');

  const oldName = worker.name;
  worker.name      = name.trim();
  worker.role      = role;
  worker.updatedAt = new Date().toISOString();

  _addGlobalLog('worker_updated', `Worker **${oldName}** renamed to **${worker.name}**`);
  saveAll();
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function deleteWorker(id) {
  const worker = getWorkerById(id);
  if (!worker) throw new Error('Worker not found');

  const name = worker.name;

  // Remove from all projects
  state.projects.forEach(p => {
    p.assignedWorkerIds = p.assignedWorkerIds.filter(wid => wid !== id);
  });

  // Unassign their tickets (keep tickets, just unassign)
  state.tickets
    .filter(t => t.assignedWorkerId === id)
    .forEach(t => { t.assignedWorkerId = null; });

  state.workers = state.workers.filter(w => w.id !== id);
  _addGlobalLog('worker_deleted', `Worker **${name}** removed`);
  saveAll();
}

// ─── Global log (private) ─────────────────────────────────────────────────────

function _addGlobalLog(type, message) {
  state.globalLogs.unshift({
    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    message,
    timestamp: new Date().toISOString(),
  });
}