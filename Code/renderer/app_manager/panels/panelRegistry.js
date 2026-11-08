/**
 * panelRegistry.js
 * Single responsibility: tracks which panels are open,
 * and provides a single closeAll() for the single-active-tool rule.
 */

import * as fileSeederTool from '../../fileSeederTool.js';
import * as locDetector from '../../locDetector.js';
import * as codebaseMap from '../../codebaseMap.js';
import { close as closeServiceTracker } from '../../serviceTracker.js';
import { closeConfig as closeCliConfig } from '../../shortcuts/ui.js';
import { state as csState } from '../../codeswampUI/state.js';

export default class PanelRegistry {
  constructor() {
    this._panels   = new Map(); // name -> panel element
    this._apiTool      = null;
    this._secretHolder = null;
    this._sessionNotes = null;
    this._workspaceTool = null;
    this._canvasTool    = null;
    this._dbInspector   = null;
    this._portManagerTool = null;
    this._diffViewer    = null;
    this._fileViewer    = null;
    this._teamActivity  = null;
    this._blueprintLibrary = null;
    this._profileTool = null;
    this._essentialsGlossary = null;
    this._dockerTool = null;
    this._terminalUI = null;
    this._ecoDashboard = null;
    this._globalSeeder = null;
    this._graphifyPanel = null;
    this._graphifyHideCb = null;
    this._mcpPanel = null;
    this._mcpHideCb = null;
  }

  setApiTool(t)        { this._apiTool = t; }
  setSecretHolder(t)   { this._secretHolder = t; }
  setSessionNotes(t)   { this._sessionNotes = t; }
  setWorkspaceTool(t)  { this._workspaceTool = t; }
  setCanvasTool(t)     { this._canvasTool = t; }
  setDbInspector(t)    { this._dbInspector = t; }
  setPortManagerTool(t){ this._portManagerTool = t; }
  setDiffViewer(t)     { this._diffViewer = t; }
  setFileViewer(t)     { this._fileViewer = t; }
  setTeamActivity(t)      { this._teamActivity = t; }
  setBlueprintLibrary(t)  { this._blueprintLibrary = t; }
  setProfileTool(t)       { this._profileTool = t; }
  setEssentialsGlossary(t){ this._essentialsGlossary = t; }
  setDockerTool(t)        { this._dockerTool = t; }
  setTerminalUI(t)        { this._terminalUI = t; }
  setEcoDashboard(t)      { this._ecoDashboard = t; }
  setGlobalSeeder(t)      { this._globalSeeder = t; }
  setGraphifyPanel(p)     { this._graphifyPanel = p; }
  setGraphifyHideCallback(fn) { this._graphifyHideCb = fn; }
  setMcpPanel(p)          { this._mcpPanel = p; }
  setMcpHideCallback(fn)  { this._mcpHideCb = fn; }

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
    if (this._portManagerTool?.isPortManagerPanelOpen?.()) this._portManagerTool.closePortManagerPanel();

    // Modal overlays
    const envOverlay = document.getElementById('envOverlay');
    if (envOverlay) envOverlay.remove();
    const promptModal  = document.getElementById('promptToolModal');
    if (promptModal && promptModal.style.display !== 'none') promptModal.style.display = 'none';
    const cmOverlay  = document.querySelector('.cm-overlay');
    if (cmOverlay) cmOverlay.remove();
    const fullOverlay  = document.getElementById('settingsOverlay');
    if (fullOverlay?.classList.contains('open')) fullOverlay.classList.remove('open');
    const lightOverlay = document.getElementById('lightSettingsOverlay');
    if (lightOverlay?.classList.contains('open')) lightOverlay.classList.remove('open');
    closeCliConfig();

    // Registered panels
    this._panels.forEach((panel) => {
      if (panel?.classList.contains('open')) panel.classList.remove('open');
    });

    // File Seeder
    if (fileSeederTool.isOpen()) fileSeederTool.close();

    // Global seeder (only when loaded)
    if (this._globalSeeder?.isOpen?.()) this._globalSeeder.close();

    // LOC Detector
    if (locDetector.isOpen()) locDetector.close();

    // Codebase Map
    if (codebaseMap.isOpen()) codebaseMap.closeCodebaseMap();

    if (this._diffViewer?.isOpen?.()) this._diffViewer.close();
    if (this._fileViewer?.isOpen?.()) this._fileViewer.close();
    if (this._teamActivity?.isOpen?.()) this._teamActivity.close();
    if (this._blueprintLibrary?.isOpen?.()) this._blueprintLibrary.close();
    if (this._profileTool?.isOpen?.()) this._profileTool.close();
    if (this._essentialsGlossary?.isOpen?.()) this._essentialsGlossary.close();
    if (this._dockerTool?.isOpen?.()) this._dockerTool.close();

    // Terminal
    if (this._terminalUI?.isOpen?.()) this._terminalUI.close();

    // Code Swamp - close panel when any other tool opens (keep running in bg)
    const ocPanel = document.getElementById('ocPanel');
    if (ocPanel?.classList.contains('open')) {
      ocPanel.classList.remove('open');
      csState.open = false;
    }

    // UI Layout Helper
    const ulhPanel = document.getElementById('ulhPanel');
    if (ulhPanel?.classList.contains('ulh-visible')) {
      ulhPanel.classList.remove('ulh-visible');
    }

    // Graphify
    if (this._graphifyPanel?.classList.contains('open')) {
      if (this._graphifyHideCb) this._graphifyHideCb();
      this._graphifyPanel.classList.remove('open');
    }

    // Error Cop
    const ecpWrapper = document.querySelector('.ecp-wrapper');
    if (ecpWrapper?.classList.contains('open')) {
      ecpWrapper.classList.remove('open');
    }

    // MCP
    if (this._mcpPanel?.classList.contains('open')) {
      if (this._mcpHideCb) this._mcpHideCb();
      this._mcpPanel.classList.remove('open');
    }

    // Researcher - close panel + hide browser view when any other tool opens
    const rsPanel = document.getElementById('rsPanel');
    if (rsPanel?.classList.contains('open')) {
      rsPanel.classList.remove('open');
      window.electronAPI.researcher?.hideBrowserView?.().catch(() => {});
    }

    // Ecosystem Dashboard (only when loaded)
    if (this._ecoDashboard?.isOpen?.()) this._ecoDashboard.close();

    const harnessPanel = document.getElementById('harnessPanel');
    if (harnessPanel?.classList.contains('open')) {
      harnessPanel.classList.remove('open');
    }

    // Performance Tracker
    const ptPanel = document.getElementById('perfTrackerPanel');
    if (ptPanel?.classList.contains('open')) {
      ptPanel.classList.remove('open');
    }

    // Service tracker
    closeServiceTracker();
  }
}
const _origCloseAll = PanelRegistry.prototype.closeAll;
PanelRegistry.prototype.closeAll = function closeAllWithIdeSearch() {
  document.dispatchEvent(new CustomEvent('ide:close-search'));
  return _origCloseAll.apply(this, arguments);
};
