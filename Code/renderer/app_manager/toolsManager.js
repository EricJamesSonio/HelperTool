/**
 * toolsManager.js
 * Orchestrator only — composes panels, sidebar, shortcuts, and tool lifecycles.
 * Does NOT own panel DOM creation, sidebar behaviour, or close logic directly.
 */

import { state }                          from './appState.js';
import { initShortcutManager, openConfig, closeConfig, isConfigOpen } from '../shortcutEntry.js';
import { initContextMenu }                from '../utils/contextMenu.js';
import { openRenameModal }                from '../codebaseManager.js';
import { displayTree }                    from './viewManager.js';
import { confirmDialog }                  from '../utils/confirmDialog.js';
import * as fileSeederTool                from '../fileSeederTool.js';
import * as locDetector    from '../locDetector.js';
import * as sessionNotes   from '../sessionNotes.js';
import * as diffViewer     from '../diffViewer.js';
import * as fileViewer     from '../fileViewer.js';
import TerminalUI          from '../terminal/terminalUI.js';
import * as teamActivity   from '../teamActivityFeed.js';
import * as blueprintLibrary from '../blueprintLibrary.js';
import * as profileTool from '../profile.js';
import * as essentialsGlossary from '../essentialsGlossary.js';
import { openEnvManager } from '../envManager.js';
import toolRegistry        from '../mcp/toolRegistry.js';
import * as mcpModule      from '../mcp/index.js';

import { initSidebar, createSidebarItem } from './sidebarManager.js';
import { startPrefetch } from './prefetchManager.js';

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
  };
import PanelRegistry                      from './panels/panelRegistry.js';
import {
  createGitPanel,
  createSymbolIndexPanel,
  createDepsPanel,
  createLocPanel,
  createVideoPanel,
  createGmailPanel,
  createAutomationPanel,
  createCodebaseChatPanel,
  createGithubExplorerPanel,
  createProjectInspectorPanel,
  createGraphifyPanel,
  createMcpPanel,
} from './panels/panelFactory.js';

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

let _locPanel     = null;
let _locContainer = null;

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
let _dockerTool   = null;
let _apiCleanup   = null;

let _feats    = {};
let _registry = new PanelRegistry();

// ---- Sidebar population ----------------------------------------------------

function populateSidebar() {
  const body = document.getElementById('toolsSidebarBody');
  if (!body) return;
  body.innerHTML = '';
  const frag = document.createDocumentFragment();
  const add = (item) => frag.appendChild(item);

  if (_feats.apiTool) {
    const item = createSidebarItem(ICONS.api, 'API Tool', 'Test & manage REST endpoints', () => {
      if (_apiTool?.isApiToolPanelOpen?.()) { _apiTool.closeApiToolPanel(); item.classList.remove('active'); return; }
      _registry.closeAll();
      _apiTool?.openApiToolPanel?.();
      item.classList.add('active');
    }, 'api');
    add(item);
  }

  add(createSidebarItem(ICONS.prompt, 'Prompt Tool', 'Manage custom AI prompts', async () => {
    const existing = document.getElementById('promptToolModal');
    if (existing && existing.style.display !== 'none') { existing.style.display = 'none'; return; }
    _registry.closeAll();
    try { const { openPromptToolModal } = await import('../promptTool.js'); openPromptToolModal(); }
      catch (err) { console.error('[Tools] Prompt Tool:', err); }
  }, 'prompt'));

  add(createSidebarItem(ICONS.git, 'Git Tool', 'Stage, commit & push changes', () => {
    if (_gitPanel?.classList.contains('open')) { _gitPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_gitPanel) _initGitPanel();
    _gitPanel.classList.add('open');
    if (_gitTool?.isInitialized) _gitTool.refresh();
      else if (state.selectedRepoPath) _initializeGitTool(state.selectedRepoPath);
  }, 'git'));

  add(createSidebarItem(ICONS.fileSeeder, 'File Seeder', 'Seed files into a folder', () => {
    if (fileSeederTool.isOpen()) { fileSeederTool.close(); return; }
    _registry.closeAll();
    fileSeederTool.open(state.selectedRepoPath || '', 'Select a folder via right-click');
  }, 'fileSeeder'));

  add(createSidebarItem('🎬', 'Video Compressor', 'Compress video files with FFmpeg', () => {
    if (_videoPanel?.classList.contains('open')) { _videoPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_videoPanel) _initVideoPanel();
    _videoPanel.classList.add('open');
    if (!_videoTool) _initializeVideoTool();
  }, 'video'));

  add(createSidebarItem(ICONS.api, 'Gmail Inbox', 'Check unread emails', () => {
    if (_gmailPanel?.classList.contains('open')) { _gmailPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_gmailPanel) _initGmailPanel();
    _gmailPanel.classList.add('open');
    if (!_gmailTool) _initializeGmailTool();
  }, 'gmail'));

  add(createSidebarItem(ICONS.flow, 'Automation Sketch', 'Visual flow builder', () => {
    if (_automationPanel?.classList.contains('open')) { _automationPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_automationPanel) _initAutomationPanel();
    _automationPanel.classList.add('open');
    if (!_automationTool) _initializeAutomationTool();
  }, 'automation'));

  add(createSidebarItem(ICONS.github, 'GitHub Explorer', 'Browse any public repo file tree', () => {
    if (_githubPanel?.classList.contains('open')) { _githubPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_githubPanel) _initGithubPanel();
    _githubPanel.classList.add('open');
    if (!_githubTool) _initializeGithubTool();
  }, 'github'));

  add(createSidebarItem(ICONS.loc, 'LOC Detector', 'Find bloated files by line count', () => {
  if (locDetector.isOpen()) { locDetector.close(); return; }
  _registry.closeAll();
  locDetector.open(state.selectedRepoPath || '', state.selectedRepoPath?.split(/[\\/]/).pop() || 'Select a folder');
}, 'loc'));

  add(createSidebarItem(ICONS.settings, 'Settings', 'Appearance & features', () => {
    const full  = document.getElementById('settingsOverlay');
    const light = document.getElementById('lightSettingsOverlay');
    if (full?.classList.contains('open'))  { full.classList.remove('open');  return; }
    if (light?.classList.contains('open')) { light.classList.remove('open'); return; }
    _registry.closeAll();
    _settingsManager?.openSettings?.();
  }, 'settings'));

  if (_feats.secretHolder) {
    add(createSidebarItem(ICONS.secret, 'Secret Holder', 'Manage API keys & secrets', async () => {
      if (_secretHolder?.isSecretHolderOpen?.()) { _secretHolder.closeSecretHolder(); return; }
      _registry.closeAll();
      await _secretHolder?.openSecretHolder?.();
    }, 'secret'));
  }

  if (_feats.ecosystemWatcher) {
    add(createSidebarItem(ICONS.eye, 'Ecosystem Watcher', 'Real-time runtime observability & event timeline', async () => {
      try {
        const w = await import('../ecosystemWatcherUI.js');
        if (w.isOpen()) { w.close(); return; }
        _registry.closeAll();
        w.open();
      } catch (err) { console.error('[Tools] Ecosystem Watcher:', err); }
    }, 'ecosystemWatcher'));
  }

  add(createSidebarItem(ICONS.cli, 'CLI Tool', 'Keyboard shortcuts config', () => {
    if (isConfigOpen()) { closeConfig(); return; }
    _registry.closeAll();
    openConfig();
  }, 'cli'));

  if (_feats.workspaceTool) {
    add(createSidebarItem(ICONS.workspace, 'Workspace', 'Projects, tickets & workers', async () => {
      if (_workspaceTool?.isWorkspacePanelOpen?.()) { _workspaceTool.closeWorkspacePanel(); return; }
      _registry.closeAll();
      await _workspaceTool?.openWorkspacePanel?.();
    }, 'workspace'));
  }

  if (_feats.terminalTool) {
    add(createSidebarItem(ICONS.terminal, 'Terminal', 'Integrated command-line terminal', async () => {
      if (!_terminalUI) {
        _terminalUI = new TerminalUI();
        _registry.setTerminalUI(_terminalUI);
        await _terminalUI.init();
      }
      if (_terminalUI.isOpen()) { _terminalUI.close(); return; }
      _registry.closeAll();
      _terminalUI.open(state.selectedRepoPath);
    }, 'terminal'));
  }

  if (_feats.portManagerTool) {
    add(createSidebarItem(ICONS.port, 'Port Manager', 'View & kill processes on ports', () => {
      if (_portManagerTool?.isPortManagerPanelOpen?.()) { _portManagerTool.closePortManagerPanel(); return; }
      _registry.closeAll();
      _portManagerTool?.openPortManagerPanel?.();
    }, 'port'));
  }

  if (_feats.teamActivityTool) {
    add(createSidebarItem(ICONS.team, 'Team Activity', 'Contributor stats & commit timeline', () => {
      if (teamActivity.isOpen()) { teamActivity.close(); return; }
      _registry.closeAll();
      teamActivity.open(state.selectedRepoPath);
    }, 'team'));
  }

  if (_feats.blueprintLibraryTool) {
    add(createSidebarItem(ICONS.blueprint, 'Blueprint Library', 'Architecture patterns & code structure guides', () => {
      if (blueprintLibrary.isOpen()) { blueprintLibrary.close(); return; }
      _registry.closeAll();
      blueprintLibrary.open();
    }, 'blueprint'));
  }

  if (_feats.profileTool) {
    add(createSidebarItem(ICONS.profile, 'Profile', 'Personal stats & activity heatmap', () => {
      if (profileTool.isOpen()) { profileTool.close(); return; }
      _registry.closeAll();
      profileTool.open();
    }, 'profile'));
  }

  if (_feats.dockerTool) {
    add(createSidebarItem(ICONS.docker, 'Docker', 'Manage containers & images', () => {
      if (_dockerTool?.isOpen?.()) { _dockerTool.close(); return; }
      _registry.closeAll();
      _dockerTool?.open?.();
    }, 'docker'));
  }

  if (_feats.essentialsGlossary) {
    add(createSidebarItem(ICONS.essentials, 'SE Essentials', 'Software engineering term glossary', () => {
      if (essentialsGlossary.isOpen()) { essentialsGlossary.close(); return; }
      _registry.closeAll();
      essentialsGlossary.open();
    }, 'essentials'));
  }

  if (_feats.symbolIndex) {
    add(createSidebarItem(ICONS.symbolIndex, 'Symbol Index', 'Search code symbols & navigate', () => {
      if (_symbolIndexPanel?.classList.contains('open')) { _symbolIndexPanel.classList.remove('open'); return; }
      _registry.closeAll();
      if (!_symbolIndexPanel) _initSymbolIndexPanel();
      _symbolIndexPanel.classList.add('open');
      if (!_symbolIndexTool?.isInitialized && state.selectedRepoPath) _initializeSymbolIndexTool(state.selectedRepoPath);
    }, 'symbolIndex'));
  }

  if (_feats.canvasTool) {
    add(createSidebarItem(ICONS.canvas, 'Canvas', 'Draw diagrams & sketches', () => {
      if (_canvasTool?.isCanvasPanelOpen?.()) { _canvasTool.closeCanvasPanel(); return; }
      _registry.closeAll();
      _canvasTool?.openCanvasPanel?.(state.selectedRepoPath);
    }, 'canvas'));
  }

  if (_feats.dbInspector) {
    add(createSidebarItem(ICONS.db, 'DB Inspector', 'View & explore database schemas', () => {
      if (_dbInspector?.isDbInspectorPanelOpen?.()) { _dbInspector.closeDbInspectorPanel(); return; }
      _registry.closeAll();
      _dbInspector?.openDbInspectorPanel?.();
    }, 'db'));
  }

  add(createSidebarItem(ICONS.codebbaseChat, 'HelperChat', 'Query your codebase structure', () => {
    if (_ccPanel?.classList.contains('open')) { _ccPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_ccPanel) _initCCPanel();
    _ccPanel.classList.add('open');
    if (_ccTool?.isInitialized) _ccTool.refresh();
    else if (state.selectedRepoPath) _initializeCCTool(state.selectedRepoPath);
  }, 'codebbaseChat'));

  add(createSidebarItem(ICONS.map, 'Codebase Map', 'Visual codebase structure & dependencies', async () => {
    try {
      const m = await import('../codebaseMap.js');
      if (m.isOpen()) { m.closeCodebaseMap(); return; }
      _registry.closeAll();
      await m.openCodebaseMap();
    } catch (err) { console.error('[Tools] Codebase Map:', err); }
  }, 'codebaseMap'));

  add(createSidebarItem(ICONS.env, 'Env Files', 'Manage .env configuration files', () => {
    const existing = document.getElementById('envOverlay');
    if (existing) { existing.remove(); return; }
    _registry.closeAll();
    openEnvManager(state.selectedRepoPath);
  }, 'env'));

  add(createSidebarItem(ICONS.layout, 'UI Layout Helper', 'Draw UI layouts as ASCII art', async () => {
    try {
      const ulh = await import('../uiLayoutHelper.js');
      if (ulh.isOpen()) { ulh.closeUI(); return; }
      _registry.closeAll();
      ulh.openUI();
    } catch (err) { console.error('[Tools] UI Layout Helper:', err); }
  }, 'layout'));

  add(createSidebarItem(ICONS.graphify, 'Graphify', 'Find relevant code by natural language', async () => {
    if (_graphifyPanel?.classList.contains('open')) { _graphifyPanel.classList.remove('open'); _hideGraphify(); return; }
    _registry.closeAll();
    if (!_graphifyPanel) _initGraphifyPanel();
    _graphifyPanel.classList.add('open');
    await _mountGraphify();
  }, 'graphify'));

  add(createSidebarItem(ICONS.mcp, 'MCP', 'Tool provider & server manager', async () => {
    if (_mcpPanel?.classList.contains('open')) { _mcpPanel.classList.remove('open'); mcpModule.hide(); return; }
    _registry.closeAll();
    if (!_mcpPanel) _initMcpPanel();
    _mcpPanel.classList.add('open');
    mcpModule.show();
  }, 'mcp'));

  add(createSidebarItem(ICONS.inspector, 'Project Inspector', 'Analyze languages, frameworks & tools used in this project', async () => {
    if (_piPanel?.classList.contains('open')) { _piPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_piPanel) _initProjectInspectorPanel();
    _piPanel.classList.add('open');
    if (_piModule && state.selectedRepoPath) _piModule.updateRepo(state.selectedRepoPath);
    else if (state.selectedRepoPath) _mountProjectInspector(state.selectedRepoPath);
  }, 'projectInspector'));

  add(createSidebarItem(ICONS.opencode, 'Code Swamp', 'Chat with AI via Code Swamp', async () => {
    try {
      const oc = await import('../codeswampUI.js');
      if (oc.isCodeSwampOpen()) { oc.close(); return; }
      _registry.closeAll();
      await oc.open();
    } catch (err) {  console.error('[Tools] CodeSwamp:', err) }
  }, 'opencode'));

  body.appendChild(frag);
}

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

function _initMcpPanel() {
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
  _gitPanel?._escCleanup?.(); _gitPanel?.classList.remove('open');
}

async function _initializeCCTool(repoPath) {
  if (!repoPath) { console.warn('[Tools] _initializeCCTool skipped — no repoPath'); return; }
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

// ---- Shortcut actions ------------------------------------------------------

function _buildShortcutActions() {
  const actions = {};

  if (_feats.apiTool) {
    actions.apiTool = () => {
      if (_apiTool?.isApiToolPanelOpen?.()) { _apiTool.closeApiToolPanel(); return; }
      _registry.closeAll(); _apiTool?.openApiToolPanel?.();
    };
  }

  actions.shortcutTool = () => {
    if (isConfigOpen()) { closeConfig(); return; }
    _registry.closeAll();
    openConfig();
  };

  actions.exitInput = () => document.activeElement?.blur();

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

  if (_feats.terminalTool) {
    actions.terminalTool = async () => {
      if (!_terminalUI) {
        _terminalUI = new TerminalUI();
        _registry.setTerminalUI(_terminalUI);
        await _terminalUI.init();
      }
      if (_terminalUI.isOpen()) { _terminalUI.close(); return; }
      _registry.closeAll();
      _terminalUI.open(state.selectedRepoPath);
    };

    actions.errorCop = async () => {
      if (!_terminalUI) {
        _terminalUI = new TerminalUI();
        _registry.setTerminalUI(_terminalUI);
        await _terminalUI.init();
      }
      _registry.closeAll();
      _terminalUI._errorCop.toggle();
    };
  }

  if (_feats.ecosystemWatcher) {
    actions.ecosystemWatcher = async () => {
      try {
        const w = await import('../ecosystemWatcherUI.js');
        if (w.isOpen()) { w.close(); return; }
        _registry.closeAll();
        w.open();
      } catch (err) { console.error('[Shortcuts] Ecosystem Watcher:', err); }
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

  if (_feats.portManagerTool) {
    actions.portManagerTool = () => {
      if (_portManagerTool?.isPortManagerPanelOpen?.()) { _portManagerTool.closePortManagerPanel(); return; }
      _registry.closeAll(); _portManagerTool?.openPortManagerPanel?.();
    };
  }

  actions.projectInspector = () => {
    if (_piPanel?.classList.contains('open')) { _piPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_piPanel) _initProjectInspectorPanel();
    _piPanel.classList.add('open');
    if (_piModule && state.selectedRepoPath) _piModule.updateRepo(state.selectedRepoPath);
    else if (state.selectedRepoPath) _mountProjectInspector(state.selectedRepoPath);
  };

  if (_feats.teamActivityTool) {
    actions.teamActivityTool = () => {
      if (teamActivity.isOpen()) { teamActivity.close(); return; }
      _registry.closeAll();
      teamActivity.open(state.selectedRepoPath);
    };
  }

  if (_feats.blueprintLibraryTool) {
    actions.blueprintLibraryTool = () => {
      if (blueprintLibrary.isOpen()) { blueprintLibrary.close(); return; }
      _registry.closeAll();
      blueprintLibrary.open();
    };
  }

  if (_feats.profileTool) {
    actions.profileTool = () => {
      if (profileTool.isOpen()) { profileTool.close(); return; }
      _registry.closeAll();
      profileTool.open();
    };
  }

  if (_feats.dockerTool) {
    actions.dockerTool = () => {
      if (_dockerTool?.isOpen?.()) { _dockerTool.close(); return; }
      _registry.closeAll();
      _dockerTool?.open?.();
    };
  }

  if (_feats.essentialsGlossary) {
    actions.essentialsGlossary = () => {
      if (essentialsGlossary.isOpen()) { essentialsGlossary.close(); return; }
      _registry.closeAll();
      essentialsGlossary.open();
    };
  }

  actions.codebbaseChat = () => {
    if (_ccPanel?.classList.contains('open')) { _ccPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_ccPanel) _initCCPanel();
    _ccPanel.classList.add('open');
    if (_ccTool?.isInitialized) _ccTool.refresh();
    else if (state.selectedRepoPath) _initializeCCTool(state.selectedRepoPath);
  };

  actions.codebaseMap = async () => {
    try {
      const m = await import('../codebaseMap.js');
      if (m.isOpen()) { m.closeCodebaseMap(); return; }
      _registry.closeAll();
      await m.openCodebaseMap();
    } catch (err) { console.error('[Shortcuts] Codebase Map:', err); }
  };

  actions.uiLayoutHelper = async () => {
    try {
      const ulh = await import('../uiLayoutHelper.js');
      if (ulh.isOpen()) { ulh.closeUI(); return; }
      _registry.closeAll();
      ulh.openUI();
    } catch (err) { console.error('[Shortcuts] UI Layout Helper:', err); }
  };

  actions.envManager = () => {
    const existing = document.getElementById('envOverlay');
    if (existing) { existing.remove(); return; }
    _registry.closeAll();
    openEnvManager(state.selectedRepoPath);
  };

  actions.videoTool = () => {
    if (_videoPanel?.classList.contains('open')) { _videoPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_videoPanel) _initVideoPanel();
    _videoPanel.classList.add('open');
    if (!_videoTool) _initializeVideoTool();
  };

  actions.gmailTool = () => {
    if (_gmailPanel?.classList.contains('open')) { _gmailPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_gmailPanel) _initGmailPanel();
    _gmailPanel.classList.add('open');
    if (!_gmailTool) _initializeGmailTool();
  };

  actions.automationSketch = () => {
    if (_automationPanel?.classList.contains('open')) { _automationPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_automationPanel) _initAutomationPanel();
    _automationPanel.classList.add('open');
    if (!_automationTool) _initializeAutomationTool();
  };

  actions.githubExplorer = () => {
    if (_githubPanel?.classList.contains('open')) { _githubPanel.classList.remove('open'); return; }
    _registry.closeAll();
    if (!_githubPanel) _initGithubPanel();
    _githubPanel.classList.add('open');
    if (!_githubTool) _initializeGithubTool();
  };

  actions.graphify = async () => {
    if (_graphifyPanel?.classList.contains('open')) { _graphifyPanel.classList.remove('open'); _hideGraphify(); return; }
    _registry.closeAll();
    if (!_graphifyPanel) _initGraphifyPanel();
    _graphifyPanel.classList.add('open');
    await _mountGraphify();
  };

  actions.mcp = async () => {
    if (_mcpPanel?.classList.contains('open')) { _mcpPanel.classList.remove('open'); mcpModule.hide(); return; }
    _registry.closeAll();
    if (!_mcpPanel) _initMcpPanel();
    _mcpPanel.classList.add('open');
    mcpModule.show();
  };

  actions.codeswampChat = async () => {
    try {
      const oc = await import('../codeswampUI.js');
      if (oc.isCodeSwampOpen()) {
        oc.close();
        return;
      }
      _registry.closeAll();
      await oc.open();
    } catch (err) { console.error('[Shortcuts] CodeSwamp:', err); }
  };

  return actions;
}

// ---- Public API ------------------------------------------------------------

async function _destroyGraphify() {
  try {
    const m = await import('../graphify.js');
    m.deactivate();
  } catch {}
  _graphifyInitialized = false;
  if (_graphifyContainer) _graphifyContainer.innerHTML = '';
  if (_graphifyPanel) _graphifyPanel.classList.remove('open');
}

export function closeAllPanels() {
  _registry.closeAll();
  if (diffViewer.isOpen()) diffViewer.close();
  if (fileViewer.isOpen()) fileViewer.close();
  if (teamActivity.isOpen()) teamActivity.close();
  if (blueprintLibrary.isOpen()) blueprintLibrary.close();
  if (profileTool.isOpen()) profileTool.close();
  if (essentialsGlossary.isOpen()) essentialsGlossary.close();
  if (_dockerTool?.isOpen?.()) _dockerTool.close();
  _destroyGmailTool();
  _destroyAutomationTool();
  _destroyGithubTool();
}

export async function handleRepoChange(newRepoPath) {
  await _destroyGraphify();
  sessionNotes.handleRepoChange(newRepoPath);
  _destroyGitTool();
  _destroySymbolIndexTool();
  _destroyCCTool();
  _initializeGitTool(newRepoPath);
  _initializeSymbolIndexTool(newRepoPath);
  _initializeCCTool(newRepoPath);
  startPrefetch(newRepoPath);

  // Update Project Inspector if panel is open
  if (_piModule) _piModule.updateRepo(newRepoPath);

  // Update Code Swamp active repo
  import('../codeswampUI.js').then(mod => {
    mod.handleRepoChange?.(newRepoPath);
  }).catch(() => {});
}

window.addEventListener('beforeunload', () => {
  _destroyGraphify();
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
  sessionNotes.initSessionNotes();
  _registry.setSessionNotes(sessionNotes);
  _registry.setDiffViewer(diffViewer);
  _registry.setFileViewer(fileViewer);
  initSidebar();
  requestAnimationFrame(() => populateSidebar());

  if (feats.teamActivityTool) {
    try { _registry.setTeamActivity(teamActivity); } catch (err) { console.error('[Tools] Team Activity failed:', err); }
  }
  if (feats.blueprintLibraryTool) {
    try { _registry.setBlueprintLibrary(blueprintLibrary); } catch (err) { console.error('[Tools] Blueprint Library failed:', err); }
  }
  if (feats.profileTool) {
    try { _registry.setProfileTool(profileTool); } catch (err) { console.error('[Tools] Profile failed:', err); }
  }
  if (feats.essentialsGlossary) {
    try { _registry.setEssentialsGlossary(essentialsGlossary); } catch (err) { console.error('[Tools] Essentials Glossary failed:', err); }
  }

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
      _registry.closeAll();
      fileSeederTool.open(folderPath, folderName);
    },
    (folderPath, folderName) => {
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
      if (!_terminalUI) {
        _terminalUI = new TerminalUI();
        _registry.setTerminalUI(_terminalUI);
        await _terminalUI.init();
      }
      _registry.closeAll();
      _terminalUI.openTerminalHere(folderPath);
    },
    (filePath, isFolder) => {
      const name = filePath.split(/[/\\]/).filter(Boolean).pop() || '';
      openRenameModal(filePath, name, () => { if (state.cachedTree) displayTree(false); }, isFolder);
    },
    async (filePath) => {
      const ok = await confirmDialog('Delete <strong>' + filePath.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</strong>? This cannot be undone.');
      if (!ok) return;
      const res = await window.electronAPI.deleteFile(filePath);
      if (res.success && state.cachedTree) displayTree(false);
    }
  );

  initShortcutManager(_buildShortcutActions(), _feats);

  // ── Register tools in MCP registry ──
  _registerMcpTools();

  // ── Lazy-load heavy tool modules after first paint ──
  requestAnimationFrame(() => {
    _lazyInitTools(feats);
  });
}

function _registerMcpTools() {
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
    openPanelFn: async () => {
      if (_graphifyPanel?.classList.contains('open')) { _graphifyPanel.classList.remove('open'); _hideGraphify(); return; }
      _registry.closeAll();
      if (!_graphifyPanel) _initGraphifyPanel();
      _graphifyPanel.classList.add('open');
      await _mountGraphify();
    },
  });

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
    openPanelFn: async () => {
      if (!_terminalUI) {
        _terminalUI = new TerminalUI();
        _registry.setTerminalUI(_terminalUI);
        await _terminalUI.init();
      }
      _registry.closeAll();
      _terminalUI._errorCop.toggle();
    },
  });

  toolRegistry.register({
    id: 'ecosystemWatcher',
    name: 'Ecosystem Watcher',
    description: 'Real-time runtime observability — log, error, network & process event timeline across sessions.',
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
    openPanelFn: async () => {
      try {
        const w = await import('../ecosystemWatcherUI.js');
        if (w.isOpen()) { w.close(); return; }
        _registry.closeAll();
        w.open();
      } catch (err) { console.error('[Tools] Ecosystem Watcher:', err); }
    },
  });
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

export function getTerminalUI() { return _terminalUI; }