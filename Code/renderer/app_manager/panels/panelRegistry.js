/**
 * panelRegistry.js
 * Single responsibility: tracks which panels are open,
 * and provides a single closeAll() for the single-active-tool rule.
 */

import * as fileSeederTool from '../../fileSeederTool.js';

export default class PanelRegistry {
  constructor() {
    this._panels   = new Map(); // name → { panel, isOpen, close }
    this._apiTool      = null;
    this._secretHolder = null;
    this._sessionNotes = null;
    this._workspaceTool = null;
    this._canvasTool    = null;
    this._dbInspector   = null;
    this._diffViewer    = null;
    this._fileViewer    = null;
  }

  // Register external tools that don't use a panel element
  setApiTool(t)        { this._apiTool = t; }
  setSecretHolder(t)   { this._secretHolder = t; }
  setSessionNotes(t)   { this._sessionNotes = t; }
  setWorkspaceTool(t)  { this._workspaceTool = t; }
  setCanvasTool(t)     { this._canvasTool = t; }
  setDbInspector(t)    { this._dbInspector = t; }
  setDiffViewer(t)     { this._diffViewer = t; }
  setFileViewer(t)     { this._fileViewer = t; }

  // Register a panel element by name
  register(name, panel) {
    this._panels.set(name, panel);
  }

  closeAll() {
    // External tools
    if (this._apiTool?.isApiToolPanelOpen?.()) this._apiTool.closeApiToolPanel();
    if (this._secretHolder?.isSecretHolderOpen?.()) this._secretHolder.closeSecretHolder();
    if (this._sessionNotes?.isSessionNotesOpen?.()) this._sessionNotes.closeSessionNotes();
    if (this._workspaceTool?.isWorkspacePanelOpen?.()) this._workspaceTool.closeWorkspacePanel();
    if (this._canvasTool?.isCanvasPanelOpen?.()) this._canvasTool.closeCanvasPanel();
    if (this._dbInspector?.isDbInspectorPanelOpen?.()) this._dbInspector.closeDbInspectorPanel();

    // Modal overlays
    const promptModal  = document.getElementById('promptToolModal');
    if (promptModal && promptModal.style.display !== 'none') promptModal.style.display = 'none';
    const fullOverlay  = document.getElementById('settingsOverlay');
    if (fullOverlay?.classList.contains('open')) fullOverlay.classList.remove('open');
    const lightOverlay = document.getElementById('lightSettingsOverlay');
    if (lightOverlay?.classList.contains('open')) lightOverlay.classList.remove('open');

    // Registered panels
    this._panels.forEach((panel) => {
      if (panel?.classList.contains('open')) panel.classList.remove('open');
    });

    // File Seeder
    if (fileSeederTool.isOpen()) fileSeederTool.close();

    // Diff Viewer
    if (this._diffViewer?.isOpen?.()) this._diffViewer.close();
    // File Viewer
    if (this._fileViewer?.isOpen?.()) this._fileViewer.close();
  }
}