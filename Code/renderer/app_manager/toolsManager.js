/**
 * toolsManager.js
 * Owns: lazy init and button wiring for all panel tools:
 *   - API Tool
 *   - Secret Holder
 *   - Workspace Tool
 *   - Git Tool
 */

import { state } from './appState.js';

// ---- Module-level handles ------------------------------------------------

let _apiTool       = null;
let _secretHolder  = null;
let _workspaceTool = null;
let _gitTool       = null;
let _gitPanel      = null;
let _gitContainer  = null;
let _toolsPanel     = null;

// ---- Saved features for conditional tool entries ---------------------------

let _feats = {};

// ---- Tools Panel (floating launcher) ---------------------------------------

function createToolsPanel() {
  const overlay = document.createElement('div');
  overlay.id = 'toolsPanelOverlay';
  overlay.className = 'tools-panel-overlay';
  overlay.innerHTML = 
    '<div class="tools-panel">' +
      '<div class="tools-panel-header">' +
        '<h3>Tools</h3>' +
        '<button class="tools-panel-close" id="toolsPanelClose">\u2715</button>' +
      '</div>' +
      '<div class="tools-panel-body" id="toolsPanelBody"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function (e) {
    if (!e.target.closest('.tools-panel')) closeToolsPanel();
  });
  overlay.querySelector('#toolsPanelClose').addEventListener('click', closeToolsPanel);

  return overlay;
}

function renderToolsPanelEntries() {
  const body = document.getElementById('toolsPanelBody');
  if (!body) return;
  body.innerHTML = '';

  if (_feats.apiTool) {
    const item = document.createElement('button');
    item.className = 'tools-panel-item';
    item.innerHTML = 
      '<span class="tools-panel-item-icon">\uD83D\uDD0C</span>' +
      '<div class="tools-panel-item-info">' +
        '<span class="tools-panel-item-name">API Tool</span>' +
        '<span class="tools-panel-item-desc">Test & manage REST endpoints</span>' +
      '</div>';
    item.addEventListener('click', function () {
      closeToolsPanel();
      if (_apiTool && _apiTool.isApiToolPanelOpen && _apiTool.isApiToolPanelOpen()) {
        _apiTool.closeApiToolPanel();
        item.classList.remove('active');
      } else {
        if (_apiTool && _apiTool.openApiToolPanel) _apiTool.openApiToolPanel();
        item.classList.add('active');
      }
    });
    body.appendChild(item);
  }

  {
    const item = document.createElement('button');
    item.className = 'tools-panel-item';
    item.innerHTML = 
      '<span class="tools-panel-item-icon">\uD83E\uDDE9</span>' +
      '<div class="tools-panel-item-info">' +
        '<span class="tools-panel-item-name">Prompt Tool</span>' +
        '<span class="tools-panel-item-desc">Manage custom AI prompts</span>' +
      '</div>';
    item.addEventListener('click', async function () {
      closeToolsPanel();
      try {
        const { openPromptToolModal } = await import('../promptTool.js');
        openPromptToolModal();
      } catch (err) {
        console.error('[Tools] Failed to open Prompt Tool:', err);
      }
    });
    body.appendChild(item);
  }

  {
    const item = document.createElement('button');
    item.className = 'tools-panel-item';
    item.innerHTML = 
      '<span class="tools-panel-item-icon">\uD83D\uDD00</span>' +
      '<div class="tools-panel-item-info">' +
        '<span class="tools-panel-item-name">Git Tool</span>' +
        '<span class="tools-panel-item-desc">Stage, commit & push changes</span>' +
      '</div>';
    item.addEventListener('click', function () {
      closeToolsPanel();
      if (_gitPanel && _gitPanel.classList.contains('open')) {
        _gitPanel.classList.remove('open');
      } else {
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
}

function openToolsPanel() {
  if (!_toolsPanel) _toolsPanel = createToolsPanel();
  renderToolsPanelEntries();

  var btn = document.getElementById('toolsPanelBtn');
  if (btn) {
    var rect = btn.getBoundingClientRect();
    var panel = _toolsPanel.querySelector('.tools-panel');
    if (panel) {
      panel.style.left = Math.max(4, rect.left) + 'px';
      panel.style.top = (rect.bottom + 6) + 'px';
      panel.style.minWidth = Math.max(200, rect.width) + 'px';
    }
  }

  _toolsPanel.classList.add('open');
}

function closeToolsPanel() {
  if (_toolsPanel) _toolsPanel.classList.remove('open');
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

export function handleRepoChange(newRepoPath) {
  destroyGitTool();
  initializeGitTool(newRepoPath);
}

// ---- beforeunload cleanup --------------------------------------------------

window.addEventListener('beforeunload', function () {
  if (_gitTool) _gitTool.destroy();
});

// ---- Main init -------------------------------------------------------------

export async function initTools(feats) {
  _feats = feats || {};

  // ---- Tools Panel Button -------------------------------------------------
  const toolsPanelBtn = document.getElementById('toolsPanelBtn');
  if (toolsPanelBtn) {
    toolsPanelBtn.addEventListener('click', function () {
      if (_toolsPanel && _toolsPanel.classList.contains('open')) {
        closeToolsPanel();
      } else {
        openToolsPanel();
      }
    });
  }

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
        const items = document.querySelectorAll('.tools-panel-item');
        items.forEach(function (el) { el.classList.remove('active'); });
      }
    });
  }

  // ---- Secret Holder ------------------------------------------------------
  if (feats.secretHolder) {
    try {
      _secretHolder = await import('../secretHolder.js');
      _secretHolder.initSecretHolder();

      const secretHolderBtn = document.getElementById('secretHolderBtn');
      secretHolderBtn && secretHolderBtn.addEventListener('click', async function () {
        if (_secretHolder.isSecretHolderOpen()) _secretHolder.closeSecretHolder();
        else await _secretHolder.openSecretHolder();
      });

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

      const workspaceToolBtn = document.getElementById('workspaceTool');
      workspaceToolBtn && workspaceToolBtn.addEventListener('click', async function () {
        if (_workspaceTool.isWorkspacePanelOpen()) {
          _workspaceTool.closeWorkspacePanel();
          workspaceToolBtn.classList.remove('active');
        } else {
          await _workspaceTool.openWorkspacePanel();
          workspaceToolBtn.classList.add('active');
        }
      });

      console.log('[Tools] Workspace Tool initialised');
    } catch (err) {
      console.error('[Tools] Workspace Tool failed:', err);
    }
  }
}
