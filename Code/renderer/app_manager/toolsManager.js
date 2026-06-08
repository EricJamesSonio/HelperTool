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
import * as sessionNotes   from '../sessionNotes.js';
import * as diffViewer     from '../diffViewer.js';
import * as fileViewer     from '../fileViewer.js';

import { initSidebar, createSidebarItem } from './sidebarManager.js';

const ICONS = {
  api: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="10" y1="16" x2="10" y2="19"/><line x1="1" y1="10" x2="4" y2="10"/><line x1="16" y1="10" x2="19" y2="10"/></svg>',
  prompt: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"/></svg>',
  git: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="4" r="2"/><circle cx="14" cy="10" r="2"/><circle cx="6" cy="16" r="2"/><line x1="6" y1="6" x2="6" y2="14"/><line x1="8" y1="4" x2="12" y2="10"/></svg>',
  fileSeeder: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h5l2 2h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><line x1="10" y1="8" x2="10" y2="12"/><line x1="8" y1="10" x2="12" y2="10"/></svg>',
  loc: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="9" x2="14" y2="9"/><line x1="3" y1="13" x2="17" y2="13"/><line x1="3" y1="17" x2="11" y2="17"/></svg>',
  settings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41"/></svg>',
  secret: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="11" r="2"/><path d="M5 11V6a5 5 0 0 1 10 0v5"/><rect x="3" y="11" width="14" height="8" rx="1"/></svg>',
  cli: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M6 8l3 2-3 2M11 12h3"/></svg>',
  workspace: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>',
  symbolIndex: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5"/><line x1="13" y1="13" x2="18" y2="18"/></svg>',
  canvas: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
  db: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="10" cy="4" rx="7" ry="2"/><path d="M3 4v6c0 1.1 3.13 2 7 2s7-.9 7-2V4"/><path d="M3 10v6c0 1.1 3.13 2 7 2s7-.9 7-2v-6"/></svg>',
};
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
    const item = createSidebarItem(ICONS.api, 'API Tool', 'Test & manage REST endpoints', () => {
      if (_apiTool?.isApiToolPanelOpen?.()) { _apiTool.closeApiToolPanel(); item.classList.remove('active'); return; }
      _registry.closeAll();
      _apiTool?.openApiToolPanel?.();
      item.classList.add('active');
    }, 'api');
    body.appendChild(item);
  }

  body.appendChild(createSidebarItem(ICONS.prompt, 'Prompt Tool', 'Manage custom AI prompts', async () => {
    const existing = document.getElementById('promptToolModal');
    if (existing && existing.style.display !== 'none') { existing.style.display = 'none'; return; }
    _registry.closeAll();
    try { const { openPromptToolModal } = await import('../promptTool.js'); openPromptToolModal(); }
      catch (err) { console.error('[Tools] Prompt Tool:', err); }
  }, 'prompt'));

  body.appendChild(createSidebarItem(ICONS.git, 'Git Tool', 'Stage, commit & push changes', () => {
    if (_gitPanel?.classList.contains('open')) { _gitPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_gitPanel) _initGitPanel();
    _gitPanel.classList.add('open');
    if (_gitTool?.isInitialized) _gitTool.refresh();
      else if (state.selectedRepoPath) _initializeGitTool(state.selectedRepoPath);
  }, 'git'));

  body.appendChild(createSidebarItem(ICONS.fileSeeder, 'File Seeder', 'Seed files into a folder', () => {
    if (fileSeederTool.isOpen()) { fileSeederTool.close(); return; }
    _registry.closeAll();
    fileSeederTool.open(state.selectedRepoPath || '', 'Select a folder via right-click');
  }, 'fileSeeder'));

body.appendChild(createSidebarItem(ICONS.loc, 'LOC Detector', 'Find bloated files by line count', () => {
  if (locDetector.isOpen()) { locDetector.close(); return; }
  _registry.closeAll();
  // Open without a pre-set path — user can right-click a folder to scan
  locDetector.open(state.selectedRepoPath || '', state.selectedRepoPath?.split(/[\\/]/).pop() || 'Select a folder');
}, 'loc'));

  body.appendChild(createSidebarItem(ICONS.settings, 'Settings', 'Appearance & features', () => {
    const full  = document.getElementById('settingsOverlay');
    const light = document.getElementById('lightSettingsOverlay');
    if (full?.classList.contains('open'))  { full.classList.remove('open');  return; }
    if (light?.classList.contains('open')) { light.classList.remove('open'); return; }
    _registry.closeAll();
    _settingsManager?.openSettings?.();
  }, 'settings'));

  if (_feats.secretHolder) {
    body.appendChild(createSidebarItem(ICONS.secret, 'Secret Holder', 'Manage API keys & secrets', async () => {
      if (_secretHolder?.isSecretHolderOpen?.()) { _secretHolder.closeSecretHolder(); return; }
      _registry.closeAll();
      await _secretHolder?.openSecretHolder?.();
    }, 'secret'));
  }

  body.appendChild(createSidebarItem(ICONS.cli, 'CLI Tool', 'Keyboard shortcuts config', () => openConfig(), 'cli'));

  if (_feats.workspaceTool) {
    body.appendChild(createSidebarItem(ICONS.workspace, 'Workspace', 'Projects, tickets & workers', async () => {
      if (_workspaceTool?.isWorkspacePanelOpen?.()) { _workspaceTool.closeWorkspacePanel(); return; }
      _registry.closeAll();
      await _workspaceTool?.openWorkspacePanel?.();
    }, 'workspace'));
  }

  if (_feats.symbolIndex) {
    body.appendChild(createSidebarItem(ICONS.symbolIndex, 'Symbol Index', 'Search code symbols & navigate', () => {
      if (_symbolIndexPanel?.classList.contains('open')) { _symbolIndexPanel.classList.remove('open'); return; }
      _registry.closeAll();
      if (!_symbolIndexPanel) _initSymbolIndexPanel();
      _symbolIndexPanel.classList.add('open');
      if (_symbolIndexTool?.isInitialized) _symbolIndexTool.refresh();
      else if (state.selectedRepoPath) _initializeSymbolIndexTool(state.selectedRepoPath);
    }, 'symbolIndex'));
  }

  if (_feats.canvasTool) {
    body.appendChild(createSidebarItem(ICONS.canvas, 'Canvas', 'Draw diagrams & sketches', () => {
      if (_canvasTool?.isCanvasPanelOpen?.()) { _canvasTool.closeCanvasPanel(); return; }
      _registry.closeAll();
      _canvasTool?.openCanvasPanel?.(state.selectedRepoPath);
    }, 'canvas'));
  }

  if (_feats.dbInspector) {
    body.appendChild(createSidebarItem(ICONS.db, 'DB Inspector', 'View & explore database schemas', () => {
      if (_dbInspector?.isDbInspectorPanelOpen?.()) { _dbInspector.closeDbInspectorPanel(); return; }
      _registry.closeAll();
      _dbInspector?.openDbInspectorPanel?.();
    }, 'db'));
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

export function closeAllPanels() {
  _registry.closeAll();
  if (diffViewer.isOpen()) diffViewer.close();
  if (fileViewer.isOpen()) fileViewer.close();
}

export function handleRepoChange(newRepoPath) {
  sessionNotes.handleRepoChange(newRepoPath);
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
  sessionNotes.initSessionNotes();
  _registry.setSessionNotes(sessionNotes);
  _registry.setDiffViewer(diffViewer);
  _registry.setFileViewer(fileViewer);
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

    let _prevSidebarItems = null;
    document.addEventListener('keydown', () => {
      if (!_apiTool || _apiTool.isApiToolPanelOpen?.()) return;
      if (!_prevSidebarItems) _prevSidebarItems = [...document.querySelectorAll('.tools-sidebar-item')];
      _prevSidebarItems.forEach(el => el.classList.remove('active'));
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
    (folderPath, folderName) => {          // onFolderLoc
      _registry.closeAll();
      locDetector.open(folderPath, folderName);
    },
    (filePath) => {                        // onFileDiff
      if (!state.selectedRepoPath) return;
      _registry.closeAll();
      diffViewer.open(filePath, state.selectedRepoPath);
    },
    (filePath) => {                        // onFileView
      if (!state.selectedRepoPath) return;
      _registry.closeAll();
      fileViewer.open(filePath, state.selectedRepoPath);
    }
  );

  initShortcutManager(_buildShortcutActions(), _feats);
}