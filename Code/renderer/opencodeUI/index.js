import { state } from './state.js';
import { getTemplate } from './template.js';
import { renderRepoTabs, addRepo, renderConvList } from './repoTabs.js';
import { refreshSidebar, startNewChat } from './sidebar.js';
import { renderInput, setupStreamListeners } from './input.js';
import { discoverOpencode, listRepos } from './history.js';
import { clearTerminal } from './chat.js';

let _initialized = false;

export async function initOpencodeUI() {
  console.log('[CS] initOpencodeUI start');
  if (_initialized) { console.log('[CS] initOpencodeUI already initialized, return'); return; }
  _initialized = true;

  const panel = document.getElementById('ocPanel');
  if (!panel) {
    const container = document.getElementById('ocPanelContainer') || document.body;
    container.insertAdjacentHTML('beforeend', getTemplate('content'));
    console.log('[CS] template inserted');
  }

  setupDom();
  clearTerminal();
  renderInput();
  setupStreamListeners();

  // Fast IPC — blocks until active repo is set so New Chat / Send work immediately
  const activeRepo = await getActiveRepoPath();
  console.log('[CS] activeRepo:', activeRepo);
  if (activeRepo) {
    await addRepo(activeRepo);
    console.log('[CS] addRepo done, activeTab:', state.activeTab);
  }

  // Defer slow CLI discovery + conversation listing
  setTimeout(async () => {
    try {
      const info = await discoverOpencode();
      state.opencodePath = info.binaryPath;
      state.dataRoot = info.dataRoot;

      const repos = await listRepos();
      if (!state.activeTab && repos.length > 0) {
        await addRepo(repos[0].repoPath);
      }

      if (state.activeTab) {
        await refreshSidebar();
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
  document.getElementById('ocCloseBtn')?.addEventListener('click', closeOpencodeUI);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const panel = document.getElementById('ocPanel');
      if (panel && panel.classList.contains('open')) closeOpencodeUI();
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

export function openOpencodeUI() {
  console.log('[CS] openOpencodeUI, tabs.length:', state.tabs.length);
  const panel = document.getElementById('ocPanel');
  console.log('[CS] panel found:', !!panel);
  if (panel) {
    panel.classList.add('open');
    state.open = true;
    if (state.tabs.length === 0) {
      console.log('[CS] tabs empty, calling initOpencodeUI');
      initOpencodeUI();
    }
  }
}

export function closeOpencodeUI() {
  const panel = document.getElementById('ocPanel');
  if (panel) {
    panel.classList.remove('open');
    state.open = false;
  }
}

export function isOpen() {
  return state.open;
}
