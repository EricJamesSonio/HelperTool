/**
 * workspaceTool.js  (entry point — replaces old monolith)
 * ─────────────────────────────────────────────────────────
 * Public API consumed by renderer/app.js
 *
 * Usage (same as before):
 *   import { initWorkspaceTool, openWorkspacePanel, closeWorkspacePanel,
 *            isWorkspacePanelOpen } from './workspace/workspaceTool.js';
 */

import { loadAll, flushSave } from './workspaceStore.js';
import { ensurePanel, render, navigateToProject } from './workspaceRenderer.js';
import { getProjectByRepoPath } from './projectManager.js';

let _isOpen = false;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function initWorkspaceTool() {
  await loadAll();
}

export function isWorkspacePanelOpen() {
  return _isOpen;
}

export async function openWorkspacePanel() {
  if (_isOpen) return;
  await loadAll();          // always reload fresh data from disk
  ensurePanel();
  render();

  // Auto-navigate to project linked to the active repo
  try {
    const active = await window.electronAPI.getActiveProject();
    if (active?.repoPath) {
      const linked = getProjectByRepoPath(active.repoPath);
      if (linked) navigateToProject(linked.id);
    }
  } catch {}

  document.getElementById('workspaceContainer')?.classList.add('open');
  _isOpen = true;
}

export function closeWorkspacePanel() {
  flushSave();
  document.getElementById('workspaceContainer')?.classList.remove('open');
  _isOpen = false;
}

document.addEventListener('keydown', function wsEscape(e) {
  if (e.key === 'Escape') {
    const container = document.getElementById('workspaceContainer');
    if (container && container.classList.contains('open')) {
      closeWorkspacePanel();
    }
  }
});