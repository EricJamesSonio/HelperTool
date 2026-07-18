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
  console.log('[CS] initCodeSwampUI start');
  if (_initialized) { console.log('[CS] initCodeSwampUI already initialized, return'); return; }
  _initialized = true;

let panel = document.getElementById('ocPanel');
if (!panel || !panel.querySelector('.oc-header')) {
  // If panelFactory already created an empty placeholder, remove it first
  if (panel) panel.remove();
  const container = document.getElementById('ocPanelContainer') || document.body;
  container.insertAdjacentHTML('beforeend', getTemplate('content'));
  console.log('[CS] template inserted');
}

  getLoadingController(); // warm up loading controller singleton
  renderAIProviderSelect();
  renderParallelModeControls();
  renderSidebarToggle();
  setupDom();
  showWelcome();
  renderInput();
  setupTerminalDataHandler();

  // When terminal output contains a session ID, track the active conversation.
  // If we just sent a message, store it with the message text as title.
  // For loaded conversations (no lastSentMessage), the conversation is already stored
  // by loadConversation() — skip to avoid overwriting. New chats get a default title.
  setOnSessionDetected((sessionId, repoPath, slotIndex) => {
    state.activeConvId[repoPath] = sessionId;

    // Track the session in slotData so the sidebar can map it to a slot
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

  // Init xterm.js (async, fire-and-forget)
  initXterm().catch(e => console.error('[CS] xterm init error:', e));

  // Discover opencode binary path FIRST — before any terminal is created
  let info = null;
  try { info = await discoverOpencode(); } catch {}
  if (info) {
    state.opencodePath = info.binaryPath;
    state.dataRoot = info.dataRoot;
  }

  // Load active repo
  const activeRepo = await getActiveRepoPath();
  console.log('[CS] activeRepo:', activeRepo);
  if (activeRepo) {
    await addRepo(activeRepo);
    console.log('[CS] addRepo done, activeTab:', state.activeTab);
  }

  // Listen for repo switches
  document.addEventListener('repo:switched', async (e) => {
    const { repoPath } = e.detail;
    if (!repoPath) return;
    state.activeTab = repoPath;
    showWelcome();
    clearFilePickerCache();
    if (state.activeTab) {
      await refreshSidebar();
    }
  });

  // Defer slow non-blocking tasks (shells, repo list, refresh interval)
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
  console.log('[CS] setupDom — ocNewChatBtn found:', !!newChatBtn);
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
      const panel = document.getElementById('ocPanel');
      if (panel && panel.classList.contains('open')) closeCodeSwampUI();
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
  console.log('[CS] openCodeSwampUI, tabs.length:', state.tabs.length);
  const panel = document.getElementById('ocPanel');
  console.log('[CS] panel found:', !!panel);
  if (panel) {
    panel.classList.add('open');
    state.open = true;
    if (state.tabs.length === 0) {
      console.log('[CS] tabs empty, calling initCodeSwampUI');
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
