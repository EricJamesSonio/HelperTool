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

// ---- Module-level handles ------------------------------------------------

let _apiTool       = null;
let _secretHolder  = null;
let _workspaceTool = null;
let _gitTool       = null;
let _gitPanel      = null;
let _gitContainer  = null;

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
}

export function handleRepoChange(newRepoPath) {
  destroyGitTool();
  initializeGitTool(newRepoPath);
}

// ---- beforeunload cleanup --------------------------------------------------

window.addEventListener('beforeunload', function () {
  if (_gitTool) _gitTool.destroy();
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

  initShortcutManager(shortcutActions, _feats);
}
