/**
 * workspaceStore.js
 * ─────────────────
 * Central state container and persistence layer.
 * All managers import from here — no one else talks to electronAPI directly.
 */

// ─── State ───────────────────────────────────────────────────────────────────

export const state = {
  projects:   [],
  workers:    [],
  tickets:    [],
  globalLogs: [],
};

// ─── Log retention ────────────────────────────────────────────────────────────

export const LOG_RETENTION_DAYS = 7;
const LOG_RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function pruneOldLogs(now = Date.now()) {
  const cutoff = now - LOG_RETENTION_MS;
  const keep = (log) => {
    const t = Date.parse(log && log.timestamp);
    return Number.isNaN(t) || t >= cutoff;
  };

  let removed = 0;

  const globalBefore = state.globalLogs.length;
  state.globalLogs = state.globalLogs.filter(keep);
  removed += globalBefore - state.globalLogs.length;

  for (const project of state.projects) {
    if (!Array.isArray(project.projectLogs)) continue;
    const before = project.projectLogs.length;
    project.projectLogs = project.projectLogs.filter(keep);
    removed += before - project.projectLogs.length;
  }

  return removed > 0;
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadAll() {
  try {
    const data = await window.electronAPI.workspaceGetAll();
    state.projects   = Array.isArray(data?.projects)   ? data.projects   : [];
    state.workers    = Array.isArray(data?.workers)     ? data.workers    : [];
    state.tickets    = Array.isArray(data?.tickets)     ? data.tickets    : [];
    state.globalLogs = Array.isArray(data?.globalLogs)  ? data.globalLogs : [];

    if (pruneOldLogs()) markDirty();

    console.log('[WorkspaceStore] Loaded', {
      projects: state.projects.length,
      workers:  state.workers.length,
      tickets:  state.tickets.length,
      logs:     state.globalLogs.length,
    });
  } catch (err) {
    console.error('[WorkspaceStore] Load failed:', err);
    state.projects   = [];
    state.workers    = [];
    state.tickets    = [];
    state.globalLogs = [];
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveAll() {
  try {
    const result = await window.electronAPI.workspaceSaveAll({
      projects:   state.projects,
      workers:    state.workers,
      tickets:    state.tickets,
      globalLogs: state.globalLogs,
    });
    if (!result) console.error('[WorkspaceStore] Save returned false');
    _dirty = false;
  } catch (err) {
    console.error('[WorkspaceStore] Save failed:', err);
  }
}

// ─── Debounced autosave ────────────────────────────────────────────────────────

let _dirty = false;
let _saveTimer = null;

export function markDirty() {
  _dirty = true;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    await saveAll();
    _saveTimer = null;
  }, 800);
}

export async function flushSave() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  if (_dirty) {
    await saveAll();
  }
}

// ─── ID generator ─────────────────────────────────────────────────────────────

export function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}