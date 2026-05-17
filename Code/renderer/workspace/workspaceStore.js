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

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadAll() {
  try {
    const data = await window.electronAPI.workspaceGetAll();
    state.projects   = Array.isArray(data?.projects)   ? data.projects   : [];
    state.workers    = Array.isArray(data?.workers)     ? data.workers    : [];
    state.tickets    = Array.isArray(data?.tickets)     ? data.tickets    : [];
    state.globalLogs = Array.isArray(data?.globalLogs)  ? data.globalLogs : [];
    console.log('[WorkspaceStore] ✅ Loaded', {
      projects: state.projects.length,
      workers:  state.workers.length,
      tickets:  state.tickets.length,
      logs:     state.globalLogs.length,
    });
  } catch (err) {
    console.error('[WorkspaceStore] ❌ Load failed:', err);
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
    if (!result) console.error('[WorkspaceStore] ❌ Save returned false');
  } catch (err) {
    console.error('[WorkspaceStore] ❌ Save failed:', err);
  }
}

// ─── ID generator ─────────────────────────────────────────────────────────────

export function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}