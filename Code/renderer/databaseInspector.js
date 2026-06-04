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
