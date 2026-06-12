import { createPanel, destroyPanel, refreshConnections, restorePanelState } from './databaseInspector/ui.js';
import { setState } from './databaseInspector/state.js';

let _panelWrapper = null;
let _panelOpen = false;

export function initDbInspector() {
  // One-time setup
}

export async function openDbInspectorPanel() {
  if (_panelOpen) return;
  if (!_panelWrapper) {
    _panelWrapper = createPanel();
  }
  _panelWrapper.style.display = '';
  _panelOpen = true;

  const { getPrefetchCache } = await import('./app_manager/prefetchManager.js');
  const cached = getPrefetchCache().get('dbConnections');
  if (cached) {
    const { refreshConnectionsWithData } = await import('./databaseInspector/ui.js');
    refreshConnectionsWithData(cached);
    restorePanelState();
    return;
  }

  await refreshConnections();
  restorePanelState();
}

export function closeDbInspectorPanel() {
  if (!_panelOpen) return;
  if (_panelWrapper) _panelWrapper.style.display = 'none';
  _panelOpen = false;
}

export function isDbInspectorPanelOpen() {
  return _panelOpen;
}

// Listen for close events from inside the panel
document.addEventListener('dbi-close', () => {
  closeDbInspectorPanel();
});
