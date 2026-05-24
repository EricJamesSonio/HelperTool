/**
 * toolsManager.js
 * Owns: lazy init and button wiring for all panel tools:
 *   - API Tool
 *   - Secret Holder
 *   - Workspace Tool
 *   - Git Tool
 */

import { state } from './appState.js';
import { initShortcutManager, openConfig } from '../shortcutEntry.js';
import { initContextMenu } from '../utils/contextMenu.js';
import DependenciesUI from '../dependencies/dependenciesUI.js';

// ---- Module-level handles ------------------------------------------------

let _apiTool       = null;
let _secretHolder  = null;
let _workspaceTool = null;
let _gitTool       = null;
let _gitPanel      = null;
let _gitContainer  = null;

let _symbolIndexTool  = null;
let _symbolIndexPanel = null;
let _symbolIndexContainer = null;

let _depsUI       = null;
let _depsPanel    = null;
let _depsContainer = null;

let _settingsManager = null;

// ---- Saved features for conditional tool entries ---------------------------

let _feats = {};

// ---- Sidebar (collapsible tools launcher) -----------------------------------

function initSidebar() {
  const sidebar = document.getElementById('toolsSidebar');
  if (!sidebar) return;

  let hoverTimer;

  sidebar.addEventListener('mouseenter', function () {
    if (sidebar.classList.contains('pinned')) return;
    clearTimeout(hoverTimer);
    sidebar.classList.add('expanded');
  });

  sidebar.addEventListener('mouseleave', function () {
    if (sidebar.classList.contains('pinned')) return;
    sidebar.classList.remove('expanded');
  });

  const pinBtn = document.getElementById('sidebarPinBtn');
  if (pinBtn) {
    pinBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const pinned = sidebar.classList.toggle('pinned');
      if (pinned) {
        sidebar.classList.add('expanded');
        pinBtn.title = 'Unpin sidebar';
      } else {
        sidebar.classList.remove('expanded');
        pinBtn.title = 'Pin sidebar open';
      }
    });
  }
}

function populateSidebar() {
  const body = document.getElementById('toolsSidebarBody');
  if (!body) return;
  body.innerHTML = '';

  // ── API Tool ─────────────────────────────────────────────
  if (_feats.apiTool) {
    const item = createItem('\uD83D\uDD0C', 'API Tool', 'Test & manage REST endpoints', function () {
      if (_apiTool && _apiTool.isApiToolPanelOpen && _apiTool.isApiToolPanelOpen()) {
        _apiTool.closeApiToolPanel();
        item.classList.remove('active');
      } else {
        _closeAllToolPanels();
        if (_apiTool && _apiTool.openApiToolPanel) _apiTool.openApiToolPanel();
        item.classList.add('active');
      }
    });
    body.appendChild(item);
  }

  // ── Prompt Tool ──────────────────────────────────────────
  {
    const item = createItem('\uD83E\uDDE9', 'Prompt Tool', 'Manage custom AI prompts', async function () {
      const existing = document.getElementById('promptToolModal');
      if (existing && existing.style.display !== 'none') {
        existing.style.display = 'none';
        return;
      }
      _closeAllToolPanels();
      try {
        const { openPromptToolModal } = await import('../promptTool.js');
        openPromptToolModal();
      } catch (err) {
        console.error('[Tools] Failed to open Prompt Tool:', err);
      }
    });
    body.appendChild(item);
  }

  // ── Git Tool ─────────────────────────────────────────────
  {
    const item = createItem('\uD83D\uDD00', 'Git Tool', 'Stage, commit & push changes', function () {
      if (_gitPanel && _gitPanel.classList.contains('open')) {
        _gitPanel.classList.remove('open');
      } else {
        _closeAllToolPanels();
        if (!_gitPanel) _gitPanel = createGitPanel();
        _gitPanel.classList.add('open');
        if (_gitTool && _gitTool.isInitialized) {
          _gitTool.refresh();
        } else {
          var repoPath = state.selectedRepoPath;
          if (repoPath) initializeGitTool(repoPath);
        }
      }
    });
    body.appendChild(item);
  }

  // ── Settings ─────────────────────────────────────────────
  {
    const item = createItem('\uD83C\uDFA8', 'Settings', 'Appearance & features', function () {
      const fullOverlay = document.getElementById('settingsOverlay');
      const lightOverlay = document.getElementById('lightSettingsOverlay');
      if (fullOverlay && fullOverlay.classList.contains('open')) { fullOverlay.classList.remove('open'); return; }
      if (lightOverlay && lightOverlay.classList.contains('open')) { lightOverlay.classList.remove('open'); return; }
      _closeAllToolPanels();
      if (_settingsManager && _settingsManager.openSettings) {
        _settingsManager.openSettings();
      }
    });
    body.appendChild(item);
  }

  // ── Secret Holder ────────────────────────────────────────
  if (_feats.secretHolder) {
    const item = createItem('\uD83D\uDD10', 'Secret Holder', 'Manage API keys & secrets', async function () {
      if (_secretHolder && _secretHolder.isSecretHolderOpen && _secretHolder.isSecretHolderOpen()) {
        _secretHolder.closeSecretHolder();
      } else {
        _closeAllToolPanels();
        if (_secretHolder && _secretHolder.openSecretHolder) {
          await _secretHolder.openSecretHolder();
        }
      }
    });
    body.appendChild(item);
  }

  // ── CLI Tool Shortcuts ───────────────────────────────────
  {
    const item = createItem('\u2328\uFE0F', 'CLI Tool', 'Keyboard shortcuts config', function () {
      openConfig();
    });
    body.appendChild(item);
  }

  // ── Workspace ────────────────────────────────────────────
  if (_feats.workspaceTool) {
    const item = createItem('\uD83D\uDC65', 'Workspace', 'Projects, tickets & workers', async function () {
      if (_workspaceTool && _workspaceTool.isWorkspacePanelOpen && _workspaceTool.isWorkspacePanelOpen()) {
        _workspaceTool.closeWorkspacePanel();
      } else {
        _closeAllToolPanels();
        if (_workspaceTool && _workspaceTool.openWorkspacePanel) {
          await _workspaceTool.openWorkspacePanel();
        }
      }
    });
    body.appendChild(item);
  }

  // ── Symbol Index ────────────────────────────────────────
  if (_feats.symbolIndex) {
    const item = createItem('\uD83D\uDD0D', 'Symbol Index', 'Search code symbols & navigate', function () {
      if (_symbolIndexPanel && _symbolIndexPanel.classList.contains('open')) {
        _symbolIndexPanel.classList.remove('open');
      } else {
        _closeAllToolPanels();
        if (!_symbolIndexPanel) _symbolIndexPanel = createSymbolIndexPanel();
        _symbolIndexPanel.classList.add('open');
        if (_symbolIndexTool && _symbolIndexTool.isInitialized) {
          _symbolIndexTool.refresh();
        } else {
          var repoPath = state.selectedRepoPath;
          if (repoPath) initializeSymbolIndexTool(repoPath);
        }
      }
    });
    body.appendChild(item);
  }
}

function createItem(icon, name, desc, onClick) {
  const el = document.createElement('button');
  el.className = 'tools-sidebar-item';
  el.innerHTML =
    '<span class="tools-sidebar-item-icon">' + icon + '</span>' +
    '<div class="tools-sidebar-item-info">' +
      '<span class="tools-sidebar-item-name">' + name + '</span>' +
      '<span class="tools-sidebar-item-desc">' + desc + '</span>' +
    '</div>';
  el.addEventListener('click', onClick);
  return el;
}

// ---- Git Tool lifecycle --------------------------------------------------

function createGitPanel() {
  const panel = document.createElement('div');
  panel.id = 'gitToolPanel';
  panel.className = 'git-tool-panel';
  panel.innerHTML = 
    '<div class="git-tool-content">' +
      '<div class="git-tool-navbar">' +
        '<h1 class="git-tool-title">\uD83D\uDD00 Git Tool</h1>' +
        '<div class="git-tool-navbar-right">' +
          '<button class="git-tool-close-btn" id="closeGitToolBtn">\u2715</button>' +
        '</div>' +
      '</div>' +
      '<div class="git-tool-body" id="gitToolContainer"></div>' +
    '</div>';
  document.body.appendChild(panel);

  _gitContainer = panel.querySelector('#gitToolContainer');

  // Close button just hides the panel, never destroys the tool
  panel.querySelector('#closeGitToolBtn').addEventListener('click', function () {
    panel.classList.remove('open');
  });

  panel.addEventListener('click', function (e) {
    if (e.target === panel) {
      panel.classList.remove('open');
    }
  });

  document.addEventListener('keydown', function gitEscape(e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) {
      panel.classList.remove('open');
    }
  });

  return panel;
}

async function initializeGitTool(repoPath) {
  try {
    const { default: GitTool } = await import('../gitTool.js');
    if (!_gitTool) _gitTool = new GitTool();

    const result = await _gitTool.initialize(repoPath);
    if (!result.success) {
      console.error('[Tools] Git Tool init failed:', result.error);
      return;
    }

    if (!_gitPanel) _gitPanel = createGitPanel();
    await _gitTool.render(_gitContainer);
    console.log('[Tools] Git Tool initialised');
  } catch (err) {
    console.error('[Tools] Git Tool error:', err);
  }
}

function destroyGitTool() {
  if (_gitTool) {
    _gitTool.destroy();
    _gitTool = null;
  }
  if (_gitContainer) {
    _gitContainer.innerHTML = '';
  }
  if (_gitPanel) {
    _gitPanel.classList.remove('open');
  }
}

// ---- Symbol Index Tool lifecycle -------------------------------------------

function createSymbolIndexPanel() {
  const panel = document.createElement('div');
  panel.id = 'symbolIndexPanel';
  panel.className = 'symbol-index-panel';
  panel.innerHTML =
    '<div class="symbol-index-content">' +
      '<div class="symbol-index-navbar">' +
        '<h1 class="symbol-index-title">\uD83D\uDD0D Symbol Index</h1>' +
        '<div class="symbol-index-navbar-right">' +
          '<button class="symbol-index-close-btn" id="closeSymbolIndexBtn">\u2715</button>' +
        '</div>' +
      '</div>' +
      '<div class="symbol-index-body" id="symbolIndexContainer"></div>' +
    '</div>';
  document.body.appendChild(panel);

  _symbolIndexContainer = panel.querySelector('#symbolIndexContainer');

  panel.querySelector('#closeSymbolIndexBtn').addEventListener('click', function () {
    panel.classList.remove('open');
  });

  panel.addEventListener('click', function (e) {
    if (e.target === panel) {
      panel.classList.remove('open');
    }
  });

  document.addEventListener('keydown', function siEscape(e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) {
      panel.classList.remove('open');
    }
  });

  return panel;
}

async function initializeSymbolIndexTool(repoPath) {
  try {
    const { default: SymbolIndex } = await import('../symbolIndex.js');
    if (!_symbolIndexTool) _symbolIndexTool = new SymbolIndex();

    const result = await _symbolIndexTool.initialize(repoPath);
    if (!result.success) {
      console.error('[Tools] Symbol Index init failed:', result.error);
      return;
    }

    if (!_symbolIndexPanel) _symbolIndexPanel = createSymbolIndexPanel();
    await _symbolIndexTool.render(_symbolIndexContainer);
    console.log('[Tools] Symbol Index initialised');
  } catch (err) {
    console.error('[Tools] Symbol Index error:', err);
  }
}

function destroySymbolIndexTool() {
  if (_symbolIndexTool) {
    _symbolIndexTool.destroy();
    _symbolIndexTool = null;
  }
  if (_symbolIndexContainer) {
    _symbolIndexContainer.innerHTML = '';
  }
  if (_symbolIndexPanel) {
    _symbolIndexPanel.classList.remove('open');
  }
}

// ---- Dependencies Panel ------------------------------------------------------

function createDepsPanel() {
  const panel = document.createElement('div');
  panel.id = 'depsPanel';
  panel.className = 'deps-panel';
  panel.innerHTML =
    '<div class="deps-content">' +
      '<div class="deps-navbar">' +
        '<h1 class="deps-title">🔗 Dependencies</h1>' +
        '<div class="deps-navbar-right">' +
          '<button class="deps-close-btn" id="closeDepsBtn">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="deps-body" id="depsContainer"></div>' +
    '</div>';
  document.body.appendChild(panel);

  _depsContainer = panel.querySelector('#depsContainer');

  panel.querySelector('#closeDepsBtn').addEventListener('click', function () {
    panel.classList.remove('open');
  });

  panel.addEventListener('click', function (e) {
    if (e.target === panel) {
      panel.classList.remove('open');
    }
  });

  document.addEventListener('keydown', function depsEscape(e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) {
      panel.classList.remove('open');
    }
  });

  return panel;
}

// ---- Close all tool panels (single-active-tool) ------------------------------

function _closeAllToolPanels() {
  if (_apiTool && _apiTool.isApiToolPanelOpen && _apiTool.isApiToolPanelOpen()) _apiTool.closeApiToolPanel();
  if (_gitPanel && _gitPanel.classList.contains('open')) _gitPanel.classList.remove('open');
  const promptModal = document.getElementById('promptToolModal');
  if (promptModal && promptModal.style.display !== 'none') promptModal.style.display = 'none';
  const fullOverlay = document.getElementById('settingsOverlay');
  if (fullOverlay && fullOverlay.classList.contains('open')) fullOverlay.classList.remove('open');
  const lightOverlay = document.getElementById('lightSettingsOverlay');
  if (lightOverlay && lightOverlay.classList.contains('open')) lightOverlay.classList.remove('open');
  if (_secretHolder && _secretHolder.isSecretHolderOpen && _secretHolder.isSecretHolderOpen()) _secretHolder.closeSecretHolder();
  if (_workspaceTool && _workspaceTool.isWorkspacePanelOpen && _workspaceTool.isWorkspacePanelOpen()) _workspaceTool.closeWorkspacePanel();
  if (_symbolIndexPanel && _symbolIndexPanel.classList.contains('open')) _symbolIndexPanel.classList.remove('open');
  if (_depsPanel && _depsPanel.classList.contains('open')) _depsPanel.classList.remove('open');
}

export function handleRepoChange(newRepoPath) {
  destroyGitTool();
  destroySymbolIndexTool();
  initializeGitTool(newRepoPath);
}

// ---- beforeunload cleanup --------------------------------------------------

window.addEventListener('beforeunload', function () {
  if (_gitTool) _gitTool.destroy();
  if (_symbolIndexTool) _symbolIndexTool.destroy();
});

// ---- Main init -------------------------------------------------------------

export async function initTools(feats, settingsManager) {
  _feats = feats || {};
  _settingsManager = settingsManager;

  // ---- Sidebar init -------------------------------------------------------
  initSidebar();
  populateSidebar();

  // ---- API Tool -----------------------------------------------------------
  if (feats.apiTool) {
    try {
      _apiTool = await import('../apiToolUI.js');
      await _apiTool.initApiToolUI();
      console.log('[Tools] API Tool initialised');
    } catch (err) {
      console.error('[Tools] API Tool failed:', err);
    }

    document.addEventListener('keydown', function () {
      if (_apiTool && !_apiTool.isApiToolPanelOpen()) {
        const items = document.querySelectorAll('.tools-sidebar-item');
        items.forEach(function (el) { el.classList.remove('active'); });
      }
    });
  }

  // ---- Secret Holder ------------------------------------------------------
  if (feats.secretHolder) {
    try {
      _secretHolder = await import('../secretHolder.js');
      _secretHolder.initSecretHolder();
      console.log('[Tools] Secret Holder initialised');
    } catch (err) {
      console.error('[Tools] Secret Holder failed:', err);
    }
  }

  // ---- Workspace Tool -----------------------------------------------------
  if (feats.workspaceTool) {
    try {
      _workspaceTool = await import('../workspace/workspaceTool.js');
      await _workspaceTool.initWorkspaceTool();
      console.log('[Tools] Workspace Tool initialised');
    } catch (err) {
      console.error('[Tools] Workspace Tool failed:', err);
    }
  }

  // ---- CLI Tool Shortcuts --------------------------------------------------
  const shortcutActions = {};

  if (feats.apiTool) {
    shortcutActions.apiTool = function () {
      if (_apiTool) {
        if (_apiTool.isApiToolPanelOpen && _apiTool.isApiToolPanelOpen()) {
          _apiTool.closeApiToolPanel();
          return;
        }
        _closeAllToolPanels();
        _apiTool.openApiToolPanel();
      }
    };
  }

  shortcutActions.shortcutTool = function () {
    if (openConfig.isConfigOpen && openConfig.isConfigOpen()) {
      openConfig();
      return;
    }
    openConfig();
  };

  // ---- Context Menu Init ----------------------------------------------------
  initContextMenu((filePath) => {
    if (!state.selectedRepoPath) return;
    _closeAllToolPanels();
    if (!_depsPanel) _depsPanel = createDepsPanel();
    _depsPanel.classList.add('open');
    if (!_depsUI) {
      _depsUI = new DependenciesUI();
      _depsUI.render(_depsContainer, state.selectedRepoPath);
    }
    _depsUI.showForFile(filePath);
  });

  if (feats.apiTool) {
    shortcutActions.apiTool = function () {
      if (_apiTool) {
        if (_apiTool.isApiToolPanelOpen && _apiTool.isApiToolPanelOpen()) {
          _apiTool.closeApiToolPanel();
          return;
        }
        _closeAllToolPanels();
        _apiTool.openApiToolPanel();
      }
    };
  }

  shortcutActions.shortcutTool = function () {
    if (openConfig.isConfigOpen && openConfig.isConfigOpen()) {
      openConfig(); // This will close it internally
      return;
    }
    openConfig();
  };

  shortcutActions.gitTool = function () {
    if (_gitPanel && _gitPanel.classList.contains('open')) {
      _gitPanel.classList.remove('open');
      return;
    }
    _closeAllToolPanels();
    if (!_gitPanel) _gitPanel = createGitPanel();
    _gitPanel.classList.add('open');
    if (_gitTool && _gitTool.isInitialized) {
      _gitTool.refresh();
    } else {
      var repoPath = state.selectedRepoPath;
      if (repoPath) initializeGitTool(repoPath);
    }
  };

  shortcutActions.promptTool = async function () {
    const modal = document.getElementById('promptToolModal');
    if (modal && modal.style.display !== 'none') {
      modal.style.display = 'none';
      return;
    }
    _closeAllToolPanels();
    try {
      const { openPromptToolModal } = await import('../promptTool.js');
      openPromptToolModal();
    } catch (err) {
      console.error('[Shortcuts] Prompt Tool:', err);
    }
  };

  shortcutActions.settings = function () {
    const fullOverlay = document.getElementById('settingsOverlay');
    const lightOverlay = document.getElementById('lightSettingsOverlay');
    if (fullOverlay && fullOverlay.classList.contains('open')) { fullOverlay.classList.remove('open'); return; }
    if (lightOverlay && lightOverlay.classList.contains('open')) { lightOverlay.classList.remove('open'); return; }
    _closeAllToolPanels();
    if (_settingsManager && _settingsManager.openSettings) {
      _settingsManager.openSettings();
    }
  };

  if (feats.secretHolder) {
    shortcutActions.secretHolder = async function () {
      if (_secretHolder) {
        if (_secretHolder.isSecretHolderOpen && _secretHolder.isSecretHolderOpen()) {
          _secretHolder.closeSecretHolder();
          return;
        }
        _closeAllToolPanels();
        if (_secretHolder.openSecretHolder) {
          await _secretHolder.openSecretHolder();
        }
      }
    };
  }

  if (feats.workspaceTool) {
    shortcutActions.workspaceTool = async function () {
      if (_workspaceTool) {
        if (_workspaceTool.isWorkspacePanelOpen && _workspaceTool.isWorkspacePanelOpen()) {
          _workspaceTool.closeWorkspacePanel();
          return;
        }
        _closeAllToolPanels();
        if (_workspaceTool.openWorkspacePanel) {
          await _workspaceTool.openWorkspacePanel();
        }
      }
    };
  }

  if (_feats.symbolIndex) {
    shortcutActions.symbolIndex = function () {
      if (_symbolIndexPanel && _symbolIndexPanel.classList.contains('open')) {
        _symbolIndexPanel.classList.remove('open');
        return;
      }
      _closeAllToolPanels();
      if (!_symbolIndexPanel) _symbolIndexPanel = createSymbolIndexPanel();
      _symbolIndexPanel.classList.add('open');
      if (_symbolIndexTool && _symbolIndexTool.isInitialized) {
        _symbolIndexTool.refresh();
      } else {
        var repoPath = state.selectedRepoPath;
        if (repoPath) initializeSymbolIndexTool(repoPath);
      }
    };
  }

  initShortcutManager(shortcutActions, _feats);
}
