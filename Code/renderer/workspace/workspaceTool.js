/**
 * workspaceTool.js  (entry point — replaces old monolith)
 * ─────────────────────────────────────────────────────────
 * Public API consumed by renderer/app.js
 *
 * Usage (same as before):
 *   import { initWorkspaceTool, openWorkspacePanel, closeWorkspacePanel,
 *            isWorkspacePanelOpen } from './workspace/workspaceTool.js';
 */

import { loadAll }            from './workspaceStore.js';
import { ensurePanel, render } from './workspaceRenderer.js';

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
  document.getElementById('workspaceContainer')?.classList.add('open');
  _isOpen = true;
}

export function closeWorkspacePanel() {
  document.getElementById('workspaceContainer')?.classList.remove('open');
  _isOpen = false;
}