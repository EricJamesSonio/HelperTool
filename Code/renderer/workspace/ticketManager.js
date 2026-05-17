/**
 * ticketManager.js
 * ─────────────────
 * Project-scoped ticket CRUD.
 * Tickets belong to a project, optionally assigned to a worker.
 */

import { state, saveAll, genId } from './workspaceStore.js';
import { addProjectLog }          from './projectManager.js';
import { getWorkerById }          from './workerManager.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const TICKET_STATUSES = ['backlog', 'pending', 'in-progress', 'review', 'complete'];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'];

export const STATUS_COLORS = {
  backlog:      '#556080',
  pending:      '#f0b429',
  'in-progress':'#60a5fa',
  review:       '#a78bfa',
  complete:     '#34d399',
};

export const PRIORITY_COLORS = {
  low:      '#34d399',
  medium:   '#f0b429',
  high:     '#fb923c',
  critical: '#f87171',
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getAllTickets() {
  return state.tickets;
}

export function getTicketsByProject(projectId) {
  return state.tickets.filter(t => t.projectId === projectId);
}

export function getTicketById(id) {
  return state.tickets.find(t => t.id === id) || null;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function createTicket(projectId, title, description = '', assignedWorkerId = null, priority = 'medium') {
  if (!title?.trim()) throw new Error('Ticket title is required');
  if (!state.projects.find(p => p.id === projectId)) throw new Error('Project not found');
  if (!TICKET_PRIORITIES.includes(priority)) throw new Error('Invalid priority');

  const ticket = {
    id:               genId(),
    projectId,
    assignedWorkerId: assignedWorkerId || null,
    title:            title.trim(),
    description:      description.trim(),
    status:           'backlog',
    priority,
    createdAt:        new Date().toISOString(),
    updatedAt:        new Date().toISOString(),
  };

  state.tickets.push(ticket);

  const workerName = assignedWorkerId ? (getWorkerById(assignedWorkerId)?.name || 'Unknown') : 'Unassigned';
  addProjectLog(projectId, 'ticket_created', `Ticket **"${ticket.title}"** created (${workerName})`);
  saveAll();
  return ticket;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function updateTicket(id, fields) {
  const ticket = getTicketById(id);
  if (!ticket) throw new Error('Ticket not found');

  const changes = [];

  if (fields.title !== undefined && fields.title.trim() !== ticket.title) {
    changes.push(`title changed`);
    ticket.title = fields.title.trim();
  }
  if (fields.description !== undefined) {
    ticket.description = fields.description.trim();
  }
  if (fields.status !== undefined && TICKET_STATUSES.includes(fields.status)) {
    if (fields.status !== ticket.status) {
      changes.push(`status: ${ticket.status} → ${fields.status}`);
    }
    ticket.status = fields.status;
  }
  if (fields.priority !== undefined && TICKET_PRIORITIES.includes(fields.priority)) {
    ticket.priority = fields.priority;
  }
  if (fields.assignedWorkerId !== undefined) {
    ticket.assignedWorkerId = fields.assignedWorkerId;
    const worker = getWorkerById(fields.assignedWorkerId);
    if (worker) changes.push(`assigned to ${worker.name}`);
  }

  ticket.updatedAt = new Date().toISOString();

  if (changes.length) {
    addProjectLog(ticket.projectId, 'ticket_updated', `Ticket **"${ticket.title}"**: ${changes.join(', ')}`);
  }

  saveAll();
}

// ─── Status shortcut ──────────────────────────────────────────────────────────

export function updateTicketStatus(id, status) {
  if (!TICKET_STATUSES.includes(status)) throw new Error('Invalid status');
  updateTicket(id, { status });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function deleteTicket(id) {
  const ticket = getTicketById(id);
  if (!ticket) throw new Error('Ticket not found');

  const { title, projectId } = ticket;
  state.tickets = state.tickets.filter(t => t.id !== id);
  addProjectLog(projectId, 'ticket_deleted', `Ticket **"${title}"** deleted`);
  saveAll();
}