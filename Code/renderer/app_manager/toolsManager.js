/**
 * toolsManager.js
 * Orchestrator only - composes panels, sidebar, shortcuts, and tool lifecycles.
 * Every tool is gated by its feature flag; heavy modules load on first use.
 */

import { state }                          from './appState.js';
import { initShortcutManager, openConfig, closeConfig, isConfigOpen } from '../shortcutEntry.js';
import { initContextMenu }                from '../utils/contextMenu.js';
import { openRenameModal, openCreateFilesModal, openCreateFolderModal, showToast, openInputContentModal } from '../codebaseManager.js';
import { refreshTree }                    from './viewManager.js';
import { confirmDialog }                  from '../utils/confirmDialog.js';
import * as fileSeederTool                from '../fileSeederTool.js';
import * as locDetector                   from '../locDetector.js';
import * as sessionNotes                  from '../sessionNotes.js';
import * as diffViewer                    from '../diffViewer.js';
import * as fileViewer                    from '../fileViewer.js';
import * as essentialsGlossary            from '../essentialsGlossary.js';

import { initSidebar, createSidebarItem } from './sidebarManager.js';
import { startPrefetch } from './prefetchManager.js';
import PanelRegistry                      from './panels/panelRegistry.js';
import {
  createGitPanel,
  createSymbolIndexPanel,
  createDepsPanel,
  createVideoPanel,
  createGmailPanel,
  createAutomationPanel,
  createCodebaseChatPanel,
  createGithubExplorerPanel,
  createProjectInspectorPanel,
  createGraphifyPanel,
  createMcpPanel,
} from './panels/panelFactory.js';

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
  terminal: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M5 8l3 2-3 2M10 12h5"/></svg>',
  port: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h10M5 13h10"/><path d="M7 7V3M13 7V3M7 13v4M13 13v4"/><rect x="3" y="7" width="14" height="6" rx="1"/></svg>',
  team: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6"/><rect x="3" y="6" width="14" height="4" rx="1"/><path d="M10 3v7"/><path d="M7 6l3-3 3 3"/></svg>',
  blueprint: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h8l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="12,3 12,7 16,7"/><line x1="6" y1="10" x2="12" y2="10"/><line x1="6" y1="13" x2="11" y2="13"/><line x1="6" y1="16" x2="10" y2="16"/></svg>',
  profile: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M2 18a8 8 0 0 1 16 0"/></svg>',
  docker: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/></svg>',
  env: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="14" height="12" rx="1.5"/><path d="M3 9h14"/><path d="M7 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><circle cx="10" cy="12" r="1"/><path d="M10 13v2"/></svg>',
  codebbaseChat: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"/><circle cx="10" cy="9" r="1.5"/><circle cx="6" cy="9" r="1.5"/><circle cx="14" cy="9" r="1.5"/></svg>',
  flow: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="4" r="2.5"/><circle cx="4" cy="16" r="2.5"/><circle cx="16" cy="16" r="2.5"/><line x1="10" y1="6.5" x2="4" y2="13.5"/><line x1="10" y1="6.5" x2="16" y2="13.5"/></svg>',
  flowTool: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h9"/><path d="M3 10h14"/><path d="M3 15h6"/><path d="M14 3l3 2-3 2"/><path d="M12 13l3 2-3 2"/></svg>',
  github: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>',
  opencode: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"/><path d="M8 9h4"/><path d="M8 12h2"/></svg>',
  map: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 7 10 4 17 7"/><polyline points="3 17 10 14 17 17"/><line x1="10" y1="4" x2="10" y2="14"/><path d="M3 7v10"/><path d="M17 7v10"/></svg>',
  layout: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="16" height="16" rx="2"/><line x1="2" y1="7" x2="18" y2="7"/><line x1="8" y1="7" x2="8" y2="18"/><line x1="2" y1="13" x2="18" y2="13"/><line x1="14" y1="7" x2="14" y2="18"/></svg>',
  essentials: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2L2 6l8 4 8-4L10 2z"/><path d="M2 14l8 4 8-4"/><path d="M2 10l8 4 8-4"/></svg>',
  graphify: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5"/><path d="M13 13l4 4"/><path d="M4 3h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M4 9h8a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z"/></svg>',
  mcp: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 4v12"/><path d="M4 10h12"/></svg>',
  eye: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4c-4 0-7.5 2.5-9 6 1.5 3.5 5 6 9 6s7.5-2.5 9-6c-1.5-3.5-5-6-9-6z"/><circle cx="10" cy="10" r="2.5"/></svg>',
  radar: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2a8 8 0 1 0 8 8"/><path d="M10 6a4 4 0 1 0 4 4"/><circle cx="10" cy="10" r="1.5"/></svg>',
  inspector: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 7v6"/><path d="M7 10h6"/></svg>',
  harness: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12v12H4z"/><path d="M8 8h4v4H8z"/><circle cx="10" cy="10" r="1.5"/></svg>',
  globalSeeder: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15M10 2.5c2 2.2 3 5 3 7.5s-1 5.3-3 7.5c-2-2.2-3-5-3-7.5s1-5.3 3-7.5z"/></svg>',
};

// ---- Tool handles ----------------------------------------------------------

let _apiTool       = null;
let _secretHolder  = null;
let _workspaceTool = null;
let _canvasTool    = null;
let _dbInspector   = null;
let _portManagerTool = null;
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

let _ccPanel      = null;
let _ccContainer  = null;
let _ccTool       = null;

let _videoTool    = null;
let _videoPanel   = null;
let _videoContainer = null;

let _gmailTool    = null;
let _gmailPanel   = null;
let _gmailContainer = null;

let _automationTool    = null;
let _automationPanel   = null;
let _automationContainer = null;

let _githubTool    = null;
let _githubPanel   = null;
let _githubContainer = null;

let _graphifyPanel      = null;
let _graphifyContainer   = null;
let _graphifyInitialized = false;

let _piPanel      = null;
let _piContainer  = null;
let _piModule     = null;

let _mcpPanel           = null;
let _mcpContainer        = null;
let _mcpInitialized      = false;

let _terminalUI    = null;
let _terminalInit  = null;
let _dockerTool   = null;
let _apiCleanup   = null;

let _feats    = {};
let _registry = new PanelRegistry();
let _toolsReady = false;
let _pendingRepoPath = null;

const on = (flag) => !flag || _feats[flag] !== false;

// ---- Lazy module loading ---------------------------------------------------

const _modPromises = {};

function loadMod(key, loader, onLoad) {
  if (!_modPromises[key]) {
    _modPromises[key] = loader().then((m) => {
      if (onLoad) onLoad(m);
      return m;
    }).catch((err) => {
      delete _modPromises[key];
      throw err;
    });
  }
  return _modPromises[key];
}

const loadTeamActivity = () => loadMod('team', () => import('../teamActivityFeed.js'), (m) => _registry.setTeamActivity(m));
const loadBlueprint    = () => loadMod('blueprint', () => import('../blueprintLibrary.js'), (m) => _registry.setBlueprintLibrary(m));
const loadProfile      = () => loadMod('profile', () => import('../profile.js'), (m) => _registry.setProfileTool(m));
const loadGlobalSeeder = () => loadMod('globalSeeder', () => import('../globalSeeder.js'), (m) => _registry.setGlobalSeeder(m));
const loadEco          = () => loadMod('eco', () => import('../ecoDashboardUI.js'), (m) => _registry.setEcoDashboard(m));

export async function ensureTerminalUI() {
  if (_terminalUI) return _terminalUI;
  if (!_terminalInit) {
    _terminalInit = (async () => {
      const { default: TerminalUI } = await import('../terminal/terminalUI.js');
      const ui = new TerminalUI();
      _registry.setTerminalUI(ui);
      await ui.init();
      _terminalUI = ui;
      return ui;
    })().catch((err) => {
      _terminalInit = null;
      throw err;
    });
  }
  return _terminalInit;
}

export function getTerminalUI() { return _terminalUI; }

// ---- Panel init helpers ----------------------------------------------------

function _initVideoPanel() {
  const { panel, container } = createVideoPanel();
  _videoPanel = panel;
  _videoContainer = container;
  _registry.register('video', _videoPanel);
}

function _initGmailPanel() {
  const { panel, container } = createGmailPanel();
  _gmailPanel = panel;
  _gmailContainer = container;
  _registry.register('gmail', _gmailPanel);
}

function _initAutomationPanel() {
  const { panel, container } = createAutomationPanel();
  _automationPanel = panel;
  _automationContainer = container;
  _registry.register('automation', _automationPanel);
}

function _initGithubPanel() {
  const { panel, container } = createGithubExplorerPanel();
  _githubPanel = panel;
  _githubContainer = container;
  _registry.register('github', _githubPanel);
}

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

function _initCCPanel() {
  const { panel, container } = createCodebaseChatPanel();
  _ccPanel = panel;
  _ccContainer = container;
  _registry.register('codebbaseChat', _ccPanel);
}

function _initGraphifyPanel() {
  const { panel, container } = createGraphifyPanel();
  _graphifyPanel = panel;
  _graphifyContainer = container;
  _registry.setGraphifyPanel(_graphifyPanel);
}

function _initMcpPanel(mcpModule) {
  const { panel, container } = createMcpPanel();
  _mcpPanel = panel;
  _mcpContainer = container;
  _registry.setMcpPanel(_mcpPanel);
  _registry.setMcpHideCallback(() => mcpModule.hide());
  if (!_mcpInitialized) {
    mcpModule.activate(container);
    _mcpInitialized = true;
  }
}

function _initProjectInspectorPanel() {
  const { panel, container } = createProjectInspectorPanel();
  _piPanel = panel;
  _piContainer = container;
  _registry.register('projectInspector', _piPanel);
}

async function _mountProjectInspector(repoPath) {
  if (!_piContainer) return;
  try {
    const { initProjectInspector } = await import('../../project-inspector/ui.js');
    _piModule = initProjectInspector(_piContainer, repoPath);
  } catch (err) {
    console.error('[Tools] Project Inspector:', err);
  }
}

async function _mountGraphify() {
  if (!_graphifyContainer) return;
  try {
    const graphify = await import('../graphify.js');
    if (!_graphifyInitialized) {
      graphify.activate(_graphifyContainer);
      _graphifyInitialized = true;
    } else {
      graphify.show();
    }
    _registry.setGraphifyHideCallback(() => graphify.hide());
  } catch (err) {
    console.error('[Tools] Graphify:', err);
  }
}

function _hideGraphify() {
  import('../graphify.js').then(m => m.hide()).catch(() => {});
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
  _gitPanel?._escCleanup?.(); _gitPanel?.classList.remove('open');
}

async function _initializeCCTool(repoPath) {
  if (!repoPath) { console.warn('[Tools] _initializeCCTool skipped - no repoPath'); return; }
  try {
    const { default: CodebaseChat } = await import('../codebbaseChat.js');
    if (!_ccTool) _ccTool = new CodebaseChat();
    const result = await _ccTool.initialize(repoPath);
    if (!result.success) { console.error('[Tools] Codebase Chat init failed:', result.error); return; }
    if (!_ccPanel) _initCCPanel();
    await _ccTool.render(_ccContainer);
    console.log('[Tools] Codebase Chat initialised');
  } catch (err) {
    console.error('[Tools] Codebase Chat error:', err);
  }
}

function _destroyCCTool() {
  _ccTool?.destroy(); _ccTool = null;
  if (_ccContainer) _ccContainer.innerHTML = '';
  _ccPanel?._escCleanup?.(); _ccPanel?.classList.remove('open');
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
  _symbolIndexPanel?._escCleanup?.(); _symbolIndexPanel?.classList.remove('open');
}

function _initializeVideoTool() {
  if (_videoTool) return;
  import('../videoTool.js').then(mod => {
    const VideoTool = mod.default;
    _videoTool = new VideoTool();
    _videoTool.initialize();
    if (_videoContainer) _videoTool.render(_videoContainer);
  }).catch(err => console.error('[Tools] Video Tool:', err));
}

function _destroyVideoTool() {
  _videoTool?.destroy();
  _videoTool = null;
  if (_videoContainer) _videoContainer.innerHTML = '';
  _videoPanel?._escCleanup?.(); _videoPanel?.classList.remove('open');
}

function _initializeGmailTool() {
  if (_gmailTool) return;
  import('../gmailTool/gmailTool.js').then(async (mod) => {
    const GmailTool = mod.default;
    _gmailTool = new GmailTool();
    if (_gmailContainer) _gmailTool.render(_gmailContainer);
    await _gmailTool.init();
  }).catch(err => console.error('[Tools] Gmail Tool:', err));
}

function _destroyGmailTool() {
  _gmailTool?.destroy?.();
  _gmailTool = null;
  if (_gmailContainer) _gmailContainer.innerHTML = '';
  _gmailPanel?._escCleanup?.(); _gmailPanel?.classList.remove('open');
}

function _initializeAutomationTool() {
  if (_automationTool) return;
  import('../automationSketch/automationSketch.js').then(async (mod) => {
    const AutomationSketch = mod.default;
    _automationTool = new AutomationSketch();
    await _automationTool.init();
    if (_automationContainer) _automationTool.render(_automationContainer);
  }).catch(err => console.error('[Tools] Automation Sketch:', err));
}

function _destroyAutomationTool() {
  if (_automationTool) {
    const p = _automationTool.destroy();
    if (p && p.then) p.catch(() => {});
  }
  _automationTool = null;
  if (_automationContainer) _automationContainer.innerHTML = '';
  _automationPanel?._escCleanup?.(); _automationPanel?.classList.remove('open');
}

function _initializeGithubTool() {
  if (_githubTool) return;
  import('../githubExplorer/githubExplorer.js').then((mod) => {
    const GithubExplorer = mod.default;
    _githubTool = new GithubExplorer();
    if (_githubContainer) _githubTool.init(_githubContainer);
  }).catch(err => console.error('[Tools] GitHub Explorer:', err));
}

function _destroyGithubTool() {
  _githubTool?.destroy();
  _githubTool = null;
  if (_githubContainer) _githubContainer.innerHTML = '';
  _githubPanel?._escCleanup?.(); _githubPanel?.classList.remove('open');
}

async function _destroyGraphify() {
  try {
    const m = await import('../graphify.js');
    m.deactivate();
  } catch {}
  _graphifyInitialized = false;
  if (_graphifyContainer) _graphifyContainer.innerHTML = '';
  if (_graphifyPanel) _graphifyPanel.classList.remove('open');
}

// ---- Tool actions (shared by sidebar + shortcuts) --------------------------

const RUN = {
  api: (item) => {
    if (_apiTool?.isApiToolPanelOpen?.()) { _apiTool.closeApiToolPanel(); item?.classList.remove('active'); return; }
    _registry.closeAll();
    _apiTool?.openApiToolPanel?.();
    item?.classList.add('active');
  },

  prompt: async () => {
    const existing = document.getElementById('promptToolModal');
    if (existing && existing.style.display !== 'none') { existing.style.display = 'none'; return; }
    _registry.closeAll();
    const { openPromptToolModal } = await import('../promptTool.js');
    openPromptToolModal();
  },

  git: () => {
    if (_gitPanel?.classList.contains('open')) { _gitPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_gitPanel) _initGitPanel();
    _gitPanel.classList.add('open');
    if (_gitTool?.isInitialized) _gitTool.refresh();
    else if (state.selectedRepoPath) _initializeGitTool(state.selectedRepoPath);
  },

  fileSeeder: () => {
    if (fileSeederTool.isOpen()) { fileSeederTool.close(); return; }
    _registry.closeAll();
    fileSeederTool.open(state.selectedRepoPath || '', 'Select a folder via right-click');
  },

  video: () => {
    if (_videoPanel?.classList.contains('open')) { _videoPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_videoPanel) _initVideoPanel();
    _videoPanel.classList.add('open');
    if (!_videoTool) _initializeVideoTool();
  },

  gmail: () => {
    if (_gmailPanel?.classList.contains('open')) { _gmailPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_gmailPanel) _initGmailPanel();
    _gmailPanel.classList.add('open');
    if (!_gmailTool) _initializeGmailTool();
  },

  automation: () => {
    if (_automationPanel?.classList.contains('open')) { _automationPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_automationPanel) _initAutomationPanel();
    _automationPanel.classList.add('open');
    if (!_automationTool) _initializeAutomationTool();
  },

  github: () => {
    if (_githubPanel?.classList.contains('open')) { _githubPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_githubPanel) _initGithubPanel();
    _githubPanel.classList.add('open');
    if (!_githubTool) _initializeGithubTool();
  },

  loc: () => {
    if (locDetector.isOpen()) { locDetector.close(); return; }
    _registry.closeAll();
    locDetector.open(state.selectedRepoPath || '', state.selectedRepoPath?.split(/[\\/]/).pop() || 'Select a folder');
  },

  settings: () => {
    const full  = document.getElementById('settingsOverlay');
    const light = document.getElementById('lightSettingsOverlay');
    if (full?.classList.contains('open'))  { full.classList.remove('open');  return; }
    if (light?.classList.contains('open')) { light.classList.remove('open'); return; }
    _registry.closeAll();
    _settingsManager?.openSettings?.();
  },

  secret: async () => {
    if (_secretHolder?.isSecretHolderOpen?.()) { _secretHolder.closeSecretHolder(); return; }
    _registry.closeAll();
    await _secretHolder?.openSecretHolder?.();
  },

  ecosystemWatcher: async () => {
    const w = await loadEco();
    if (w.isOpen()) { w.close(); return; }
    _registry.closeAll();
    w.open();
  },

  performanceTracker: async () => {
    const p = await import('../performanceTracker.js');
    if (p.isOpen()) { p.close(); return; }
    _registry.closeAll();
    p.open();
  },

  cli: () => {
    if (isConfigOpen()) { closeConfig(); return; }
    _registry.closeAll();
    openConfig();
  },

  harness: async () => {
    const h = await import('../harnessTool/harnessUI.js');
    if (h.isOpen()) { h.close(); return; }
    _registry.closeAll();
    h.open(state.selectedRepoPath);
  },

  workspace: async () => {
    if (_workspaceTool?.isWorkspacePanelOpen?.()) { _workspaceTool.closeWorkspacePanel(); return; }
    _registry.closeAll();
    await _workspaceTool?.openWorkspacePanel?.();
  },

  terminal: async () => {
    const ui = await ensureTerminalUI();
    if (ui.isOpen()) { ui.close(); return; }
    _registry.closeAll();
    ui.open(state.selectedRepoPath);
  },

  errorCop: async () => {
    const ui = await ensureTerminalUI();
    _registry.closeAll();
    ui._errorCop.toggle();
  },

  port: () => {
    if (_portManagerTool?.isPortManagerPanelOpen?.()) { _portManagerTool.closePortManagerPanel(); return; }
    _registry.closeAll();
    _portManagerTool?.openPortManagerPanel?.();
  },

  team: async () => {
    const m = await loadTeamActivity();
    if (m.isOpen()) { m.close(); return; }
    _registry.closeAll();
    m.open(state.selectedRepoPath);
  },

  blueprint: async () => {
    const m = await loadBlueprint();
    if (m.isOpen()) { m.close(); return; }
    _registry.closeAll();
    m.open();
  },

  profile: async () => {
    const m = await loadProfile();
    if (m.isOpen()) { m.close(); return; }
    _registry.closeAll();
    m.open();
  },

  docker: () => {
    if (_dockerTool?.isOpen?.()) { _dockerTool.close(); return; }
    _registry.closeAll();
    _dockerTool?.open?.();
  },

  essentials: () => {
    if (essentialsGlossary.isOpen()) { essentialsGlossary.close(); return; }
    _registry.closeAll();
    essentialsGlossary.open();
  },

  symbolIndex: () => {
    if (_symbolIndexPanel?.classList.contains('open')) { _symbolIndexPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_symbolIndexPanel) _initSymbolIndexPanel();
    _symbolIndexPanel.classList.add('open');
    if (_symbolIndexTool?.isInitialized) _symbolIndexTool.refresh();
    else if (state.selectedRepoPath) _initializeSymbolIndexTool(state.selectedRepoPath);
  },

  canvas: () => {
    if (_canvasTool?.isCanvasPanelOpen?.()) { _canvasTool.closeCanvasPanel(); return; }
    _registry.closeAll();
    _canvasTool?.openCanvasPanel?.(state.selectedRepoPath);
  },

  db: () => {
    if (_dbInspector?.isDbInspectorPanelOpen?.()) { _dbInspector.closeDbInspectorPanel(); return; }
    _registry.closeAll();
    _dbInspector?.openDbInspectorPanel?.();
  },

  codebbaseChat: () => {
    if (_ccPanel?.classList.contains('open')) { _ccPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_ccPanel) _initCCPanel();
    _ccPanel.classList.add('open');
    if (_ccTool?.isInitialized) _ccTool.refresh();
    else if (state.selectedRepoPath) _initializeCCTool(state.selectedRepoPath);
  },

  codebaseMap: async () => {
    const m = await import('../codebaseMap.js');
    if (m.isOpen()) { m.closeCodebaseMap(); return; }
    _registry.closeAll();
    await m.openCodebaseMap();
  },

  env: async () => {
    const existing = document.getElementById('envOverlay');
    if (existing) { existing.remove(); return; }
    _registry.closeAll();
    const { openEnvManager } = await import('../envManager.js');
    openEnvManager(state.selectedRepoPath);
  },

  layout: async () => {
    const ulh = await import('../uiLayoutHelper.js');
    if (ulh.isOpen()) { ulh.closeUI(); return; }
    _registry.closeAll();
    ulh.openUI();
  },

  graphify: async () => {
    if (_graphifyPanel?.classList.contains('open')) { _graphifyPanel.classList.remove('open'); _hideGraphify(); return; }
    _registry.closeAll();
    if (!_graphifyPanel) _initGraphifyPanel();
    _graphifyPanel.classList.add('open');
    await _mountGraphify();
  },

  mcp: async () => {
    const mcpModule = await import('../mcp/index.js');
    if (_mcpPanel?.classList.contains('open')) { _mcpPanel.classList.remove('open'); mcpModule.hide(); return; }
    _registry.closeAll();
    if (!_mcpPanel) _initMcpPanel(mcpModule);
    _mcpPanel.classList.add('open');
    mcpModule.show();
  },

  projectInspector: async () => {
    if (_piPanel?.classList.contains('open')) { _piPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_piPanel) _initProjectInspectorPanel();
    _piPanel.classList.add('open');
    if (_piModule && state.selectedRepoPath) _piModule.updateRepo(state.selectedRepoPath);
    else if (state.selectedRepoPath) _mountProjectInspector(state.selectedRepoPath);
  },

  codeswamp: async () => {
    const oc = await import('../codeswampUI.js');
    if (oc.isCodeSwampOpen()) { oc.close(); return; }
    _registry.closeAll();
    await oc.open();
  },

  globalSeeder: async () => {
    const gs = await loadGlobalSeeder();
    if (gs.isOpen()) { gs.close(); return; }
    _registry.closeAll();
    if (diffViewer.isOpen()) diffViewer.close();
    gs.open();
  },

  researcher: async () => {
    const mod = await import('../researcherUI.js');
    if (mod.isResearcherOpen()) { mod.close(); return; }
    _registry.closeAll();
    await mod.open();
  },

  flow: async () => {
    const mod = await import('../flowTool/index.js');
    if (mod.isOpen()) { mod.close(); return; }
    _registry.closeAll();
    await mod.open();
    _registry.register('flowTool', mod.getPanel());
  },
};

// id = sidebar tool id, key = RUN key, shortcut = shortcut action name
const TOOLS = [
  { id: 'api',              key: 'api',              flag: 'apiTool',            icon: ICONS.api,          name: 'API Tool',             desc: 'Test & manage REST endpoints',                              shortcut: 'apiTool' },
  { id: 'prompt',           key: 'prompt',           flag: 'promptTool',         icon: ICONS.prompt,       name: 'Prompt Tool',          desc: 'Manage custom AI prompts',                                  shortcut: 'promptTool' },
  { id: 'git',              key: 'git',              flag: 'gitTool',            icon: ICONS.git,          name: 'Git Tool',             desc: 'Stage, commit & push changes',                              shortcut: 'gitTool' },
  { id: 'fileSeeder',       key: 'fileSeeder',       flag: 'fileSeeder',         icon: ICONS.fileSeeder,   name: 'File Seeder',          desc: 'Seed files into a folder',                                  shortcut: null },
  { id: 'video',            key: 'video',            flag: 'videoTool',          icon: '\uD83C\uDFAC',     name: 'Video Compressor',     desc: 'Compress video files with FFmpeg',                          shortcut: 'videoTool' },
  { id: 'gmail',            key: 'gmail',            flag: 'gmailTool',          icon: ICONS.api,          name: 'Gmail Inbox',          desc: 'Check unread emails',                                       shortcut: 'gmailTool' },
  { id: 'automation',       key: 'automation',       flag: 'automationSketch',   icon: ICONS.flow,         name: 'Automation Sketch',    desc: 'Visual flow builder',                                       shortcut: 'automationSketch' },
  { id: 'github',           key: 'github',           flag: 'githubExplorer',     icon: ICONS.github,       name: 'GitHub Explorer',      desc: 'Browse any public repo file tree',                          shortcut: 'githubExplorer' },
  { id: 'loc',              key: 'loc',              flag: 'locDetector',        icon: ICONS.loc,          name: 'LOC Detector',         desc: 'Find bloated files by line count',                          shortcut: 'locDetector' },
  { id: 'settings',         key: 'settings',         flag: null,                 icon: ICONS.settings,     name: 'Settings',             desc: 'Appearance & features',                                     shortcut: 'settings' },
  { id: 'secret',           key: 'secret',           flag: 'secretHolder',       icon: ICONS.secret,       name: 'Secret Holder',        desc: 'Manage API keys & secrets',                                 shortcut: 'secretHolder' },
  { id: 'ecosystemWatcher', key: 'ecosystemWatcher', flag: 'ecosystemWatcher',   icon: ICONS.eye,          name: 'Ecosystem Dashboard',  desc: 'Real-time 2x2 grid: logs, network, console & errors',       shortcut: 'ecosystemWatcher' },
  { id: 'performanceTracker', key: 'performanceTracker', flag: 'performanceTracker', icon: ICONS.radar,     name: 'Performance Tracker',  desc: 'Browser performance metrics & timing data',                 shortcut: 'performanceTracker' },
  { id: 'cli',              key: 'cli',              flag: null,                 icon: ICONS.cli,          name: 'CLI Tool',             desc: 'Keyboard shortcuts config',                                 shortcut: 'shortcutTool' },
  { id: 'harness',          key: 'harness',          flag: 'harnessTool',        icon: ICONS.harness,      name: 'Harness Tool',         desc: 'Controlled AI execution loop',                              shortcut: 'harnessTool' },
  { id: 'workspace',        key: 'workspace',        flag: 'workspaceTool',      icon: ICONS.workspace,    name: 'Workspace',            desc: 'Projects, tickets & workers',                               shortcut: 'workspaceTool' },
  { id: 'terminal',         key: 'terminal',         flag: 'terminalTool',       icon: ICONS.terminal,     name: 'Terminal',             desc: 'Integrated command-line terminal',                          shortcut: 'terminalTool' },
  { id: 'port',             key: 'port',             flag: 'portManagerTool',    icon: ICONS.port,         name: 'Port Manager',         desc: 'View & kill processes on ports',                            shortcut: 'portManagerTool' },
  { id: 'team',             key: 'team',             flag: 'teamActivityTool',   icon: ICONS.team,         name: 'Team Activity',        desc: 'Contributor stats & commit timeline',                       shortcut: 'teamActivityTool' },
  { id: 'blueprint',        key: 'blueprint',        flag: 'blueprintLibraryTool', icon: ICONS.blueprint,  name: 'Blueprint Library',    desc: 'Architecture patterns & code structure guides',             shortcut: 'blueprintLibraryTool' },
  { id: 'profile',          key: 'profile',          flag: 'profileTool',        icon: ICONS.profile,      name: 'Profile',              desc: 'Personal stats & activity heatmap',                         shortcut: 'profileTool' },
  { id: 'docker',           key: 'docker',           flag: 'dockerTool',         icon: ICONS.docker,       name: 'Docker',               desc: 'Manage containers & images',                                shortcut: 'dockerTool' },
  { id: 'essentials',       key: 'essentials',       flag: 'essentialsGlossary', icon: ICONS.essentials,   name: 'SE Essentials',        desc: 'Software engineering term glossary',                        shortcut: 'essentialsGlossary' },
  { id: 'symbolIndex',      key: 'symbolIndex',      flag: 'symbolIndex',        icon: ICONS.symbolIndex,  name: 'Symbol Index',         desc: 'Search code symbols & navigate',                            shortcut: 'symbolIndex' },
  { id: 'canvas',           key: 'canvas',           flag: 'canvasTool',         icon: ICONS.canvas,       name: 'Canvas',               desc: 'Draw diagrams & sketches',                                  shortcut: 'canvasTool' },
  { id: 'db',               key: 'db',               flag: 'dbInspector',        icon: ICONS.db,           name: 'DB Inspector',         desc: 'View & explore database schemas',                           shortcut: 'dbInspector' },
  { id: 'codebbaseChat',    key: 'codebbaseChat',    flag: 'codebbaseChat',      icon: ICONS.codebbaseChat, name: 'HelperChat',          desc: 'Query your codebase structure',                             shortcut: 'codebbaseChat' },
  { id: 'codebaseMap',      key: 'codebaseMap',      flag: 'codebaseMap',        icon: ICONS.map,          name: 'Codebase Map',         desc: 'Visual codebase structure & dependencies',                  shortcut: 'codebaseMap' },
  { id: 'env',              key: 'env',              flag: 'envManager',         icon: ICONS.env,          name: 'Env Files',            desc: 'Manage .env configuration files',                           shortcut: 'envManager' },
  { id: 'layout',           key: 'layout',           flag: 'uiLayoutHelper',     icon: ICONS.layout,       name: 'UI Layout Helper',     desc: 'Draw UI layouts as ASCII art',                              shortcut: 'uiLayoutHelper' },
  { id: 'graphify',         key: 'graphify',         flag: 'graphify',           icon: ICONS.graphify,     name: 'Graphify',             desc: 'Find relevant code by natural language',                    shortcut: 'graphify' },
  { id: 'mcp',              key: 'mcp',              flag: 'mcp',                icon: ICONS.mcp,          name: 'MCP',                  desc: 'Tool provider & server manager',                            shortcut: 'mcp' },
  { id: 'projectInspector', key: 'projectInspector', flag: 'projectInspector',   icon: ICONS.inspector,    name: 'Project Inspector',    desc: 'Analyze languages, frameworks & tools used in this project', shortcut: 'projectInspector' },
  { id: 'opencode',         key: 'codeswamp',        flag: 'codeswampChat',      icon: ICONS.opencode,     name: 'Code Swamp',           desc: 'Chat with AI via Code Swamp',                               shortcut: 'codeswampChat' },
  { id: 'globalSeeder',     key: 'globalSeeder',     flag: 'globalSeeder',       icon: ICONS.globalSeeder, name: 'Global Seeder',        desc: 'Seed structure or code across the whole repo',              shortcut: 'globalSeeder' },
  { id: 'researcher',       key: 'researcher',       flag: 'researcherTool',     icon: ICONS.radar,        name: 'Researcher',           desc: 'Select AI & build prompts with live browser',               shortcut: 'researcherTool' },
  { id: 'flow',             key: 'flow',             flag: 'flowTool',           icon: ICONS.flowTool,     name: 'Flow Tool',            desc: 'Process Claude replies and review changes before applying', shortcut: null },
];

async function _run(key, item) {
  try {
    await RUN[key]?.(item);
  } catch (err) {
    console.error('[Tools] ' + key + ':', err);
  }
}

// ---- Sidebar population ----------------------------------------------------

function populateSidebar() {
  const body = document.getElementById('toolsSidebarBody');
  if (!body) return;
  body.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const t of TOOLS) {
    if (!on(t.flag)) continue;
    const item = createSidebarItem(t.icon, t.name, t.desc, () => _run(t.key, item), t.id);
    frag.appendChild(item);
  }

  body.appendChild(frag);
}

// ---- Shortcut actions ------------------------------------------------------

function _buildShortcutActions() {
  const actions = {};

  for (const t of TOOLS) {
    if (!t.shortcut || !on(t.flag)) continue;
    actions[t.shortcut] = () => _run(t.key);
  }

  actions.exitInput = () => document.activeElement?.blur();

  if (on('shortcutMode')) {
    actions.shortcutMode = async () => {
      try {
        const modal = document.getElementById('shortcutInputModal');
        const { openShortcutInputModal, closeShortcutInputModal } = await import('../shortcutMode/modal.js');
        if (modal?.classList.contains('open')) { closeShortcutInputModal(); return; }
        _registry.closeAll();
        openShortcutInputModal();
      } catch (err) { console.error('[Shortcuts] Shortcut Mode:', err); }
    };
  }

  if (on('terminalTool')) {
    actions.errorCop = () => _run('errorCop');
  }

  return actions;
}

// ---- Public API ------------------------------------------------------------

export function closeAllPanels() {
  _registry.closeAll();
  if (diffViewer.isOpen()) diffViewer.close();
  if (fileViewer.isOpen()) fileViewer.close();
  _destroyGmailTool();
  _destroyAutomationTool();
  _destroyGithubTool();
}

export async function handleRepoChange(newRepoPath) {
  if (!_toolsReady) { _pendingRepoPath = newRepoPath; return; }

  if (on('graphify') && (_graphifyInitialized || _graphifyPanel)) await _destroyGraphify();
  sessionNotes.handleRepoChange(newRepoPath);

  if (on('gitTool')) {
    _destroyGitTool();
    _initializeGitTool(newRepoPath);
  }
  if (on('symbolIndex')) {
    _destroySymbolIndexTool();
    _initializeSymbolIndexTool(newRepoPath);
  }
  if (on('codebbaseChat')) {
    _destroyCCTool();
    _initializeCCTool(newRepoPath);
  }

  if (on('gitTool') || on('teamActivityTool') || on('profileTool')) {
    startPrefetch(newRepoPath);
  }

  if (_piModule) _piModule.updateRepo(newRepoPath);

  if (on('codeswampChat')) {
    import('../codeswampUI.js').then(mod => {
      mod.handleRepoChange?.(newRepoPath);
    }).catch(() => {});
  }
}

window.addEventListener('beforeunload', () => {
  if (_graphifyInitialized) _destroyGraphify();
  _gitTool?.destroy();
  _symbolIndexTool?.destroy();
  _ccTool?.destroy();
  _destroyVideoTool();
  _destroyGmailTool();
  _destroyAutomationTool();
  _destroyGithubTool();
  _apiCleanup?.();
});

export async function initTools(feats, settingsManager) {
  _feats           = feats || {};
  _settingsManager = settingsManager;

  fileSeederTool.init();
  if (on('globalSeeder')) {
    loadGlobalSeeder().then((m) => m.init()).catch((err) => console.error('[Tools] Global Seeder failed:', err));
  }
  sessionNotes.initSessionNotes();
  _registry.setSessionNotes(sessionNotes);
  _registry.setDiffViewer(diffViewer);
  _registry.setFileViewer(fileViewer);
  if (on('essentialsGlossary')) _registry.setEssentialsGlossary(essentialsGlossary);
  initSidebar();
  requestAnimationFrame(() => populateSidebar());

  initContextMenu(
    async (filePath) => {
      if (!state.selectedRepoPath) return;
      _registry.closeAll();
      if (!_depsPanel) {
        const { panel, container } = createDepsPanel();
        _depsPanel = panel; _depsContainer = container;
        _registry.register('deps', _depsPanel);
      }
      _depsPanel.classList.add('open');
      if (!_depsUI) {
        const { default: DependenciesUIMod } = await import('../dependencies/dependenciesUI.js');
        _depsUI = new DependenciesUIMod();
        _depsUI.render(_depsContainer, state.selectedRepoPath);
      }
      _depsUI.showForFile(filePath);
    },
    (folderPath, folderName) => {
      if (!on('fileSeeder')) return;
      _registry.closeAll();
      fileSeederTool.open(folderPath, folderName);
    },
    (folderPath, folderName) => {
      if (!on('locDetector')) return;
      _registry.closeAll();
      locDetector.open(folderPath, folderName);
    },
    (filePath) => {
      if (!state.selectedRepoPath) return;
      _registry.closeAll();
      diffViewer.open(filePath, state.selectedRepoPath);
    },
    (filePath) => {
      if (!state.selectedRepoPath) return;
      _registry.closeAll();
      fileViewer.open(filePath, state.selectedRepoPath);
    },
    async (folderPath) => {
      if (!on('terminalTool')) return;
      const ui = await ensureTerminalUI();
      _registry.closeAll();
      ui.openTerminalHere(folderPath);
    },
    (filePath, isFolder) => {
      const name = filePath.split(/[/\\]/).filter(Boolean).pop() || '';
      openRenameModal(filePath, name, () => refreshTree(), isFolder);
    },
    async (filePath) => {
      const ok = await confirmDialog('Delete <strong>' + filePath.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</strong>? This cannot be undone.');
      if (!ok) return;
      const res = await window.electronAPI.deleteFile(filePath);
      if (res.success) {
        refreshTree();
        showToast('Deleted successfully');
      }
    },
    async (folderPath) => {
      if (!state.selectedRepoPath) return;
      _registry.closeAll();
      openCreateFilesModal(folderPath, () => refreshTree());
    },
    async (folderPath) => {
      if (!state.selectedRepoPath) return;
      _registry.closeAll();
      openCreateFolderModal(folderPath, () => refreshTree());
    },
    async (filePath) => {
      if (!state.selectedRepoPath) return;
      _registry.closeAll();
      openInputContentModal(filePath, () => refreshTree());
    }
  );

  initShortcutManager(_buildShortcutActions(), _feats);

  if (on('mcp')) {
    _registerMcpTools().catch((err) => console.error('[Tools] MCP registry failed:', err));
  }

  requestAnimationFrame(() => {
    _lazyInitTools(feats);
  });

  _toolsReady = true;
  if (_pendingRepoPath) {
    const pending = _pendingRepoPath;
    _pendingRepoPath = null;
    handleRepoChange(pending);
  }
}

async function _registerMcpTools() {
  const { default: toolRegistry } = await import('../mcp/toolRegistry.js');

  if (on('graphify')) {
    toolRegistry.register({
      id: 'graphify',
      name: 'Graphify',
      description: 'Find relevant code by natural language query against a knowledge graph.',
      color: '#22ff7a',
      icon: ICONS.graphify,
      cheatsheetPath: 'MCP/graphify/prompts/graphify-cheatsheet.md',
      startFn: (repoPath) => window.electronAPI.graphifyStart(repoPath),
      stopFn: () => window.electronAPI.graphifyStop(),
      statusFn: async () => {
        try { const s = await window.electronAPI.graphifyStatus(); return s.running ? 'running' : 'stopped'; }
        catch { return 'error'; }
      },
      openPanelFn: () => _run('graphify'),
    });
  }

  if (on('terminalTool')) {
    toolRegistry.register({
      id: 'errorCop',
      name: 'Error Cop',
      description: 'Real-time terminal error monitoring with session timelines and occurrence tracking.',
      color: '#ff4444',
      icon: ICONS.cli,
      cheatsheetPath: 'MCP/errorCop/errorcop-cheatsheet.md',
      startFn: () => window.electronAPI.startServer(),
      stopFn: () => window.electronAPI.stopServer(),
      statusFn: async () => {
        try { const s = await window.electronAPI.getServerStatus(); return s.running ? 'running' : 'stopped'; }
        catch { return 'error'; }
      },
      openPanelFn: () => _run('errorCop'),
    });
  }

  if (on('ecosystemWatcher')) {
    toolRegistry.register({
      id: 'ecosystemWatcher',
      name: 'Ecosystem Dashboard',
      description: 'Real-time 2x2 grid dashboard - logs, network, console & errors from the app ecosystem.',
      color: '#4F8EF7',
      icon: ICONS.radar,
      cheatsheetPath: 'MCP/ecosystemWatcher/watcher-cheatsheet.md',
      startFn: async () => {
        try { return await window.electronAPI.watcher.health(); }
        catch { return { success: false, error: 'Watcher unavailable' }; }
      },
      stopFn: async () => {
        return { success: true };
      },
      statusFn: async () => {
        try { const h = await window.electronAPI.watcher.health(); return h && h.data && h.data.running ? 'running' : 'stopped'; }
        catch { return 'error'; }
      },
      openPanelFn: () => _run('ecosystemWatcher'),
    });
  }
}

async function _lazyInitTools(feats) {
  if (feats.apiTool) {
    try {
      const mod = await import('../apiToolUI.js');
      _apiTool = mod;
      await mod.initApiToolUI();
      _registry.setApiTool(mod);
    } catch (err) { console.error('[Tools] API Tool failed:', err); }

    let _prevSidebarItems = null;
    let _apiKeyHandler = () => {
      if (!_apiTool || _apiTool.isApiToolPanelOpen?.()) return;
      if (!_prevSidebarItems) _prevSidebarItems = [...document.querySelectorAll('.tools-sidebar-item')];
      _prevSidebarItems.forEach(el => el.classList.remove('active'));
    };
    document.addEventListener('keydown', _apiKeyHandler);
    _apiCleanup = () => document.removeEventListener('keydown', _apiKeyHandler);
  }

  try {
    if (feats.secretHolder) {
      const mod = await import('../secretHolder.js');
      _secretHolder = mod;
      mod.initSecretHolder();
      _registry.setSecretHolder(mod);
    }
    if (feats.workspaceTool) {
      const mod = await import('../workspace/workspaceTool.js');
      _workspaceTool = mod;
      await mod.initWorkspaceTool();
      _registry.setWorkspaceTool(mod);
    }
    if (feats.canvasTool) {
      const mod = await import('../canvasTool.js');
      _canvasTool = mod;
      mod.initCanvasTool();
      _registry.setCanvasTool(mod);
    }
    if (feats.dbInspector) {
      const mod = await import('../databaseInspector.js');
      _dbInspector = mod;
      mod.initDbInspector();
      _registry.setDbInspector(mod);
    }
    if (feats.portManagerTool) {
      const mod = await import('../portManagerTool.js');
      _portManagerTool = mod;
      mod.initPortManager();
      _registry.setPortManagerTool(mod);
    }
    if (feats.dockerTool) {
      const mod = await import('../dockerTool.js');
      _dockerTool = mod;
      _registry.setDockerTool(mod);
    }
    console.log('[Tools] Lazy init complete');
  } catch (err) { console.error('[Tools] Lazy init error:', err); }
}
ICONS.repoConsole = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M6 8l3 2-3 2"/><path d="M11 13h4"/></svg>';

RUN.repoConsole = async () => {
  const mod = await import('../repoConsole.js');
  if (mod.isOpen()) { mod.close(); return; }
  _registry.closeAll();
  await mod.open(state.selectedRepoPath);
  _registry.register('repoConsole', mod.getPanel());
};

TOOLS.push({
  id: 'repoConsole',
  key: 'repoConsole',
  flag: 'repoConsole',
  icon: ICONS.repoConsole,
  name: 'Repo Console',
  desc: 'Seeds, migrations, scripts & tests for this repo',
  shortcut: null,
});

document.addEventListener('repoConsole:need-open', async () => {
  try {
    const mod = await import('../repoConsole.js');
    if (mod.isOpen()) return;
    _registry.closeAll();
    await mod.open(state.selectedRepoPath);
    _registry.register('repoConsole', mod.getPanel());
  } catch (err) {
    console.error('[Tools] Repo Console:', err);
  }
});
