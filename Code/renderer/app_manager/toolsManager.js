/**
 * toolsManager.js
 * Orchestrator only — composes panels, sidebar, shortcuts, and tool lifecycles.
 * Does NOT own panel DOM creation, sidebar behaviour, or close logic directly.
 */

import { state }                          from './appState.js';
import { initShortcutManager, openConfig } from '../shortcutEntry.js';
import { initContextMenu }                from '../utils/contextMenu.js';
import DependenciesUI                     from '../dependencies/dependenciesUI.js';
import * as fileSeederTool                from '../fileSeederTool.js';
import * as locDetector    from '../locDetector.js'; 

import { initSidebar, createSidebarItem } from './sidebarManager.js';
import PanelRegistry                      from './panels/panelRegistry.js';
import {
  createGitPanel,
  createSymbolIndexPanel,
  createDepsPanel,
  createLocPanel,
} from './panels/panelFactory.js';

// ---- Tool handles ----------------------------------------------------------

let _apiTool       = null;
let _secretHolder  = null;
let _workspaceTool = null;
let _canvasTool    = null;
let _dbInspector   = null;
let _settingsManager = null;

let _gitTool       = null;
let _gitPanel      = null;
let _gitContainer  = null;

let _symbolIndexTool      = null;
let _symbolIndexPanel     = null;
let _symbolIndexContainer = null;

let _depsUI        = null;
let _depsPanel     = null;
let _depsContainer = null;

let _locPanel     = null;
let _locContainer = null;

let _feats    = {};
let _registry = new PanelRegistry();

// ---- Sidebar population ----------------------------------------------------

function populateSidebar() {
  const body = document.getElementById('toolsSidebarBody');
  if (!body) return;
  body.innerHTML = '';

  if (_feats.apiTool) {
    const item = createSidebarItem('\uD83D\uDD0C', 'API Tool', 'Test & manage REST endpoints', () => {
      if (_apiTool?.isApiToolPanelOpen?.()) { _apiTool.closeApiToolPanel(); item.classList.remove('active'); return; }
      _registry.closeAll();
      _apiTool?.openApiToolPanel?.();
      item.classList.add('active');
    });
    body.appendChild(item);
  }

  body.appendChild(createSidebarItem('\uD83E\uDDE9', 'Prompt Tool', 'Manage custom AI prompts', async () => {
    const existing = document.getElementById('promptToolModal');
    if (existing && existing.style.display !== 'none') { existing.style.display = 'none'; return; }
    _registry.closeAll();
    try { const { openPromptToolModal } = await import('../promptTool.js'); openPromptToolModal(); }
    catch (err) { console.error('[Tools] Prompt Tool:', err); }
  }));

  body.appendChild(createSidebarItem('\uD83D\uDD00', 'Git Tool', 'Stage, commit & push changes', () => {
    if (_gitPanel?.classList.contains('open')) { _gitPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_gitPanel) _initGitPanel();
    _gitPanel.classList.add('open');
    if (_gitTool?.isInitialized) _gitTool.refresh();
    else if (state.selectedRepoPath) _initializeGitTool(state.selectedRepoPath);
  }));

  body.appendChild(createSidebarItem('🌱', 'File Seeder', 'Seed files into a folder', () => {
    if (fileSeederTool.isOpen()) { fileSeederTool.close(); return; }
    _registry.closeAll();
    fileSeederTool.open(state.selectedRepoPath || '', 'Select a folder via right-click');
  }));

body.appendChild(createSidebarItem('📏', 'LOC Detector', 'Find bloated files by line count', () => {
  if (locDetector.isOpen()) { locDetector.close(); return; }
  _registry.closeAll();
  // Open without a pre-set path — user can right-click a folder to scan
  locDetector.open(state.selectedRepoPath || '', state.selectedRepoPath?.split(/[\\/]/).pop() || 'Select a folder');
}));

  body.appendChild(createSidebarItem('\uD83C\uDFA8', 'Settings', 'Appearance & features', () => {
    const full  = document.getElementById('settingsOverlay');
    const light = document.getElementById('lightSettingsOverlay');
    if (full?.classList.contains('open'))  { full.classList.remove('open');  return; }
    if (light?.classList.contains('open')) { light.classList.remove('open'); return; }
    _registry.closeAll();
    _settingsManager?.openSettings?.();
  }));

  if (_feats.secretHolder) {
    body.appendChild(createSidebarItem('\uD83D\uDD10', 'Secret Holder', 'Manage API keys & secrets', async () => {
      if (_secretHolder?.isSecretHolderOpen?.()) { _secretHolder.closeSecretHolder(); return; }
      _registry.closeAll();
      await _secretHolder?.openSecretHolder?.();
    }));
  }

  body.appendChild(createSidebarItem('\u2328\uFE0F', 'CLI Tool', 'Keyboard shortcuts config', () => openConfig()));

  if (_feats.workspaceTool) {
    body.appendChild(createSidebarItem('\uD83D\uDC65', 'Workspace', 'Projects, tickets & workers', async () => {
      if (_workspaceTool?.isWorkspacePanelOpen?.()) { _workspaceTool.closeWorkspacePanel(); return; }
      _registry.closeAll();
      await _workspaceTool?.openWorkspacePanel?.();
    }));
  }

  if (_feats.symbolIndex) {
    body.appendChild(createSidebarItem('\uD83D\uDD0D', 'Symbol Index', 'Search code symbols & navigate', () => {
      if (_symbolIndexPanel?.classList.contains('open')) { _symbolIndexPanel.classList.remove('open'); return; }
      _registry.closeAll();
      if (!_symbolIndexPanel) _initSymbolIndexPanel();
      _symbolIndexPanel.classList.add('open');
      if (_symbolIndexTool?.isInitialized) _symbolIndexTool.refresh();
      else if (state.selectedRepoPath) _initializeSymbolIndexTool(state.selectedRepoPath);
    }));
  }

  if (_feats.canvasTool) {
    body.appendChild(createSidebarItem('\uD83C\uDFA8', 'Canvas', 'Draw diagrams & sketches', () => {
      if (_canvasTool?.isCanvasPanelOpen?.()) { _canvasTool.closeCanvasPanel(); return; }
      _registry.closeAll();
      _canvasTool?.openCanvasPanel?.(state.selectedRepoPath);
    }));
  }

  if (_feats.dbInspector) {
    body.appendChild(createSidebarItem('\uD83D\uDDC3\uFE0F', 'DB Inspector', 'View & explore database schemas', () => {
      if (_dbInspector?.isDbInspectorPanelOpen?.()) { _dbInspector.closeDbInspectorPanel(); return; }
      _registry.closeAll();
      _dbInspector?.openDbInspectorPanel?.();
    }));
  }
}

// ---- Panel init helpers ----------------------------------------------------

function _initGitPanel() {
  const { panel, container } = createGitPanel();
  _gitPanel = panel;
  _gitContainer = container;
  _registry.register('git', _gitPanel);
}

function _initSymbolIndexPanel() {
  const { panel, container } = createSymbolIndexPanel();
  _symbolIndexPanel = panel;
  _symbolIndexContainer = container;
  _registry.register('symbolIndex', _symbolIndexPanel);
}

function _initLocPanel() {
  const { panel, container } = createLocPanel();
  _locPanel = panel;
  _locContainer = container;
  _registry.register('loc', _locPanel);

  import('../locDetector.js').then(mod => { console.log('[LOC] keys:', Object.keys(mod)); console.log('[LOC] fn:', mod.initLocDetector); if (typeof mod.initLocDetector === 'function') mod.initLocDetector(_locContainer); else console.error('[LOC] initLocDetector missing'); })
    .catch(err => console.error('[Tools] LOC Detector:', err));
}

// ---- Tool lifecycles -------------------------------------------------------

async function _initializeGitTool(repoPath) {
  try {
    const { default: GitTool } = await import('../gitTool.js');
    if (!_gitTool) _gitTool = new GitTool();
    const result = await _gitTool.initialize(repoPath);
    if (!result.success) { console.error('[Tools] Git Tool init failed:', result.error); return; }
    if (!_gitPanel) _initGitPanel();
    await _gitTool.render(_gitContainer);
    console.log('[Tools] Git Tool initialised');
  } catch (err) {
    console.error('[Tools] Git Tool error:', err);
  }
}

function _destroyGitTool() {
  _gitTool?.destroy(); _gitTool = null;
  if (_gitContainer) _gitContainer.innerHTML = '';
  _gitPanel?.classList.remove('open');
}

async function _initializeSymbolIndexTool(repoPath) {
  try {
    const { default: SymbolIndex } = await import('../symbolIndex.js');
    if (!_symbolIndexTool) _symbolIndexTool = new SymbolIndex();
    const result = await _symbolIndexTool.initialize(repoPath);
    if (!result.success) { console.error('[Tools] Symbol Index init failed:', result.error); return; }
    if (!_symbolIndexPanel) _initSymbolIndexPanel();
    await _symbolIndexTool.render(_symbolIndexContainer);
    console.log('[Tools] Symbol Index initialised');
  } catch (err) {
    console.error('[Tools] Symbol Index error:', err);
  }
}

function _destroySymbolIndexTool() {
  _symbolIndexTool?.destroy(); _symbolIndexTool = null;
  if (_symbolIndexContainer) _symbolIndexContainer.innerHTML = '';
  _symbolIndexPanel?.classList.remove('open');
}

// ---- Shortcut actions ------------------------------------------------------

function _buildShortcutActions() {
  const actions = {};

  if (_feats.apiTool) {
    actions.apiTool = () => {
      if (_apiTool?.isApiToolPanelOpen?.()) { _apiTool.closeApiToolPanel(); return; }
      _registry.closeAll(); _apiTool?.openApiToolPanel?.();
    };
  }

  actions.shortcutTool = () => openConfig();

  actions.gitTool = () => {
    if (_gitPanel?.classList.contains('open')) { _gitPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_gitPanel) _initGitPanel();
    _gitPanel.classList.add('open');
    if (_gitTool?.isInitialized) _gitTool.refresh();
    else if (state.selectedRepoPath) _initializeGitTool(state.selectedRepoPath);
  };

  actions.promptTool = async () => {
    const modal = document.getElementById('promptToolModal');
    if (modal && modal.style.display !== 'none') { modal.style.display = 'none'; return; }
    _registry.closeAll();
    try { const { openPromptToolModal } = await import('../promptTool.js'); openPromptToolModal(); }
    catch (err) { console.error('[Shortcuts] Prompt Tool:', err); }
  };

  actions.settings = () => {
    const full  = document.getElementById('settingsOverlay');
    const light = document.getElementById('lightSettingsOverlay');
    if (full?.classList.contains('open'))  { full.classList.remove('open');  return; }
    if (light?.classList.contains('open')) { light.classList.remove('open'); return; }
    _registry.closeAll(); _settingsManager?.openSettings?.();
  };

  actions.locDetector = () => {
    if (locDetector.isOpen()) { locDetector.close(); return; }
    _registry.closeAll();
    locDetector.open(state.selectedRepoPath || '', state.selectedRepoPath?.split(/[\\/]/).pop() || 'Select a folder');
  };

  if (_feats.secretHolder) {
    actions.secretHolder = async () => {
      if (_secretHolder?.isSecretHolderOpen?.()) { _secretHolder.closeSecretHolder(); return; }
      _registry.closeAll(); await _secretHolder?.openSecretHolder?.();
    };
  }

  if (_feats.workspaceTool) {
    actions.workspaceTool = async () => {
      if (_workspaceTool?.isWorkspacePanelOpen?.()) { _workspaceTool.closeWorkspacePanel(); return; }
      _registry.closeAll(); await _workspaceTool?.openWorkspacePanel?.();
    };
  }

  if (_feats.symbolIndex) {
    actions.symbolIndex = () => {
      if (_symbolIndexPanel?.classList.contains('open')) { _symbolIndexPanel.classList.remove('open'); return; }
      _registry.closeAll();
      if (!_symbolIndexPanel) _initSymbolIndexPanel();
      _symbolIndexPanel.classList.add('open');
      if (_symbolIndexTool?.isInitialized) _symbolIndexTool.refresh();
      else if (state.selectedRepoPath) _initializeSymbolIndexTool(state.selectedRepoPath);
    };
  }

  if (_feats.canvasTool) {
    actions.canvasTool = () => {
      if (_canvasTool?.isCanvasPanelOpen?.()) { _canvasTool.closeCanvasPanel(); return; }
      _registry.closeAll(); _canvasTool?.openCanvasPanel?.(state.selectedRepoPath);
    };
  }

  if (_feats.dbInspector) {
    actions.dbInspector = () => {
      if (_dbInspector?.isDbInspectorPanelOpen?.()) { _dbInspector.closeDbInspectorPanel(); return; }
      _registry.closeAll(); _dbInspector?.openDbInspectorPanel?.();
    };
  }

  return actions;
}

// ---- Public API ------------------------------------------------------------

export function handleRepoChange(newRepoPath) {
  _destroyGitTool();
  _destroySymbolIndexTool();
  _initializeGitTool(newRepoPath);
}

window.addEventListener('beforeunload', () => {
  _gitTool?.destroy();
  _symbolIndexTool?.destroy();
});

export async function initTools(feats, settingsManager) {
  _feats           = feats || {};
  _settingsManager = settingsManager;

  fileSeederTool.init();
  initSidebar();
  populateSidebar();

  // Sync registry with external tool refs after they load
  if (feats.apiTool) {
    try {
      _apiTool = await import('../apiToolUI.js');
      await _apiTool.initApiToolUI();
      _registry.setApiTool(_apiTool);
      console.log('[Tools] API Tool initialised');
    } catch (err) { console.error('[Tools] API Tool failed:', err); }

    document.addEventListener('keydown', () => {
      if (_apiTool && !_apiTool.isApiToolPanelOpen?.()) {
        document.querySelectorAll('.tools-sidebar-item').forEach(el => el.classList.remove('active'));
      }
    });
  }

  if (feats.secretHolder) {
    try {
      _secretHolder = await import('../secretHolder.js');
      _secretHolder.initSecretHolder();
      _registry.setSecretHolder(_secretHolder);
      console.log('[Tools] Secret Holder initialised');
    } catch (err) { console.error('[Tools] Secret Holder failed:', err); }
  }

  if (feats.workspaceTool) {
    try {
      _workspaceTool = await import('../workspace/workspaceTool.js');
      await _workspaceTool.initWorkspaceTool();
      _registry.setWorkspaceTool(_workspaceTool);
      console.log('[Tools] Workspace Tool initialised');
    } catch (err) { console.error('[Tools] Workspace Tool failed:', err); }
  }

  if (feats.canvasTool) {
    try {
      _canvasTool = await import('../canvasTool.js');
      _canvasTool.initCanvasTool();
      _registry.setCanvasTool(_canvasTool);
      console.log('[Tools] Canvas Tool initialised');
    } catch (err) { console.error('[Tools] Canvas Tool failed:', err); }
  }

  if (feats.dbInspector) {
    try {
      _dbInspector = await import('../databaseInspector.js');
      _dbInspector.initDbInspector();
      _registry.setDbInspector(_dbInspector);
      console.log('[Tools] DB Inspector initialised');
    } catch (err) { console.error('[Tools] DB Inspector failed:', err); }
  }

  initContextMenu(
    (filePath) => {
      if (!state.selectedRepoPath) return;
      _registry.closeAll();
      if (!_depsPanel) {
        const { panel, container } = createDepsPanel();
        _depsPanel = panel; _depsContainer = container;
        _registry.register('deps', _depsPanel);
      }
      _depsPanel.classList.add('open');
      if (!_depsUI) {
        _depsUI = new DependenciesUI();
        _depsUI.render(_depsContainer, state.selectedRepoPath);
      }
      _depsUI.showForFile(filePath);
    },
    (folderPath, folderName) => {
      _registry.closeAll();
      fileSeederTool.open(folderPath, folderName);
    },
    (folderPath, folderName) => {          // ADD: onFolderLoc
      _registry.closeAll();
      locDetector.open(folderPath, folderName);
    }
  );

  initShortcutManager(_buildShortcutActions(), _feats);
}