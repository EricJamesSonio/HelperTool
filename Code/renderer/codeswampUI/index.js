import { state } from './state.js';
import { getTemplate } from './template.js';
import { renderRepoTabs, addRepo, renderConvList, restoreActiveView } from './repoTabs.js';
import { refreshSidebar, startNewChat, renderShellSelect, renderAIProviderSelect, renderSidebarToggle, renderParallelModeControls, renderNotificationSettings } from './sidebar.js';
import { renderInput } from './input.js';
import { clearCache as clearFilePickerCache, isOpen as isFilePickerOpen } from './filePicker.js';
import { discoverOpencode, listRepos } from './history.js';
import { showWelcome } from './chat.js';
import {
  setupTerminalDataHandler,
  initXterm,
  setOnSessionDetected,
  setOnTermActivated,
  hasRevealedProvider,
  getSlotForRepo,
  getTerminalInstances,
  showProviderForRepo,
  prewarmAllProviders,
  awaitPrewarm,
} from './terminalManager.js';
import { getLoadingController } from './loading.js';
import { convStore } from './conversationStore.js';

let _initialized = false;
let _refreshInterval = null;
let _ensuring = null;

const PREWARM_OTHERS_DELAY_MS = 1500;

function startRefresh() {
  if (_refreshInterval) return;
  _refreshInterval = setInterval(() => {
    if (state.open && state.activeTab) {
      refreshSidebar().catch(() => {});
    }
  }, 60000);
}

function schedulePrewarmOthers(repoPath) {
  setTimeout(() => {
    if (!state.open || state.activeTab !== repoPath) return;
    prewarmAllProviders(repoPath).catch(() => {});
  }, PREWARM_OTHERS_DELAY_MS);
}

async function runEnsureFirstChat() {
  const repo = state.activeTab;
  if (!repo || !state.open) return;

  await awaitPrewarm(repo, state.selectedProvider);
  if (state.activeTab !== repo || !state.open) return;

  if (hasRevealedProvider(repo, state.selectedProvider)) {
    schedulePrewarmOthers(repo);
    return;
  }

  if (!state.terminalShells || state.terminalShells.length === 0) {
    try {
      const shells = await window.electronAPI.terminalListShells();
      if (shells && shells.length) state.terminalShells = shells;
    } catch (_) {}
  }
  if (state.activeTab !== repo || !state.open) return;

  const slot = getSlotForRepo(repo);
  const inst = slot >= 0 ? getTerminalInstances()[slot] : null;
  if (inst && (inst.chatted || inst.convId)) {
    showProviderForRepo(repo, state.selectedProvider);
  } else {
    await startNewChat();
  }
  schedulePrewarmOthers(repo);
}

export function ensureFirstChat() {
  if (_ensuring) return _ensuring;
  _ensuring = runEnsureFirstChat()
    .catch((err) => {
      console.error('[CodeSwamp] auto-start failed:', err);
    })
    .finally(() => {
      _ensuring = null;
    });
  return _ensuring;
}

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
  renderNotificationSettings();
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

  setOnTermActivated(async ({ repoPath, slotIndex }) => {
    openCodeSwampUI({ autoStart: false });
    if (repoPath) {
      const { openRepoTab } = await import('./repoTabs.js');
      await openRepoTab(repoPath);
    }
    if (slotIndex !== undefined && slotIndex !== null) {
      const { activateSlot } = await import('./terminalManager.js');
      activateSlot(Number(slotIndex));
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
    if (state.open) ensureFirstChat();
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

      startRefresh();
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
  if (window.__activeRepoPath) return window.__activeRepoPath;
  try {
    const result = await window.electronAPI.getActiveProject?.();
    return result?.repoPath || result || null;
  } catch {
    return null;
  }
}

export function openCodeSwampUI(opts) {
  const panel = document.getElementById('ocPanel');
  if (!panel) return;
  panel.classList.add('open');
  state.open = true;
  startRefresh();
  restoreActiveView();
  if (!opts || opts.autoStart !== false) {
    ensureFirstChat();
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