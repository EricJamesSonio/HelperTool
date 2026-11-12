import { state } from './state.js';
import { getTemplate } from './template.js';
import { renderRepoTabs, addRepo, renderConvList } from './repoTabs.js';
import { refreshSidebar, startNewChat, renderShellSelect, renderAIProviderSelect, renderSidebarToggle, renderParallelModeControls } from './sidebar.js';
import { renderInput } from './input.js';
import { clearCache as clearFilePickerCache, isOpen as isFilePickerOpen } from './filePicker.js';
import { discoverOpencode, listRepos } from './history.js';
import { showWelcome } from './chat.js';
import { setupTerminalDataHandler, initXterm, setOnSessionDetected } from './terminalManager.js';
import { getLoadingController } from './loading.js';
import { convStore } from './conversationStore.js';

let _initialized = false;
let _refreshInterval = null;

export async function initCodeSwampUI() {
  if (_initialized) {
    return;
  }
  _initialized = true;

  const panel = document.getElementById('ocPanel');
  if (!panel || !panel.querySelector('.oc-header')) {
    if (panel) panel.remove();
    const container = document.getElementById('ocPanelContainer') || document.body;
    container.insertAdjacentHTML('beforeend', getTemplate('content'));
  }

  getLoadingController();
  renderAIProviderSelect();
  renderParallelModeControls();
  renderSidebarToggle();
  setupDom();
  showWelcome();
  renderInput();
  setupTerminalDataHandler();

  setOnSessionDetected((sessionId, repoPath, slotIndex) => {
    state.activeConvId[repoPath] = sessionId;

    if (state.parallelMode && slotIndex !== undefined) {
      state.slotData[slotIndex] = { repoPath, convId: sessionId };
    }

    const msg = state.lastSentMessage;
    state.lastSentMessage = null;

    if (msg) {
      const title = msg.length > 40 ? msg.slice(0, 40) + '\u2026' : msg;
      convStore.addConversation(repoPath, {
        id: sessionId,
        title,
        date: new Date().toISOString(),
        provider: state.selectedProvider,
      });
    } else {
      const existingConvs = convStore.getConversations(repoPath);
      const alreadyExists = existingConvs.some(c => c.id === sessionId);
      if (!alreadyExists) {
        convStore.addConversation(repoPath, {
          id: sessionId,
          title: 'New Chat',
          date: new Date().toISOString(),
          provider: state.selectedProvider,
        });
      }
    }

    convStore.touchConversation(repoPath, sessionId);

    if (state.activeTab === repoPath) {
      state.conversations[repoPath] = convStore.getConversations(repoPath);
      renderConvList();
    }
  });

  initXterm().catch(e => console.error('[CS] xterm init error:', e));

  discoverOpencode().then(info => {
    if (info) {
      state.opencodePath = info.binaryPath;
      state.dataRoot = info.dataRoot;
    }
  }).catch(() => {});

  const activeRepo = await getActiveRepoPath();
  if (activeRepo) {
    await addRepo(activeRepo);
  }

  document.addEventListener('repo:switched', async (e) => {
    const { repoPath } = e.detail;
    if (!repoPath) return;
    await addRepo(repoPath);
    clearFilePickerCache();
  });

  setTimeout(async () => {
    try {
      const repos = await listRepos();
      if (!state.activeTab && repos.length > 0) {
        await addRepo(repos[0].repoPath);
      }

      try {
        const shells = await window.electronAPI.terminalListShells();
        state.terminalShells = shells || [];
        renderShellSelect();
      } catch {}

      if (state.activeTab) {
        await refreshSidebar();
      }

      if (!_refreshInterval) {
        _refreshInterval = setInterval(() => {
          if (state.open && state.activeTab) {
            refreshSidebar().catch(() => {});
          }
        }, 60000);
      }
    } catch (err) {
      console.error('[CodeSwamp] Init error:', err);
    }
  }, 0);
}

function setupDom() {
  const newChatBtn = document.getElementById('ocNewChatBtn');
  newChatBtn?.addEventListener('click', startNewChat);
  document.getElementById('ocRefreshBtn')?.addEventListener('click', () => refreshSidebar(true));
  document.getElementById('ocCloseBtn')?.addEventListener('click', closeCodeSwampUI);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isFilePickerOpen()) return;
      const overlay = document.getElementById('ocResponseOverlay');
      if (overlay && overlay.style.display !== 'none') {
        overlay.style.display = 'none';
        return;
      }
      const panelEl = document.getElementById('ocPanel');
      if (panelEl && panelEl.classList.contains('open')) closeCodeSwampUI();
    }
  });
}

async function getActiveRepoPath() {
  try {
    const result = await window.electronAPI.getActiveProject?.();
    return result?.repoPath || result || null;
  } catch {
    return null;
  }
}

export function openCodeSwampUI() {
  const panel = document.getElementById('ocPanel');
  if (panel) {
    panel.classList.add('open');
    state.open = true;
    if (state.tabs.length === 0) {
      initCodeSwampUI();
    }
  }
}

export function closeCodeSwampUI() {
  const panel = document.getElementById('ocPanel');
  if (panel) {
    panel.classList.remove('open');
    state.open = false;
  }
  if (_refreshInterval) {
    clearInterval(_refreshInterval);
    _refreshInterval = null;
  }
  const picker = document.getElementById('ocPromptPickerModal');
  if (picker) picker.remove();
}

export function isOpen() {
  return state.open;
}