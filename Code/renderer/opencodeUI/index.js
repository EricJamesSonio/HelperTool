import { state } from './state.js';
import { getTemplate } from './template.js';
import { renderRepoTabs, addRepo, renderConvList } from './repoTabs.js';
import { refreshSidebar, startNewChat } from './sidebar.js';
import { renderInput, setupStreamListeners } from './input.js';
import { discoverOpencode, listRepos } from './history.js';
import { showWelcome } from './chat.js';

let _initialized = false;

export async function initOpencodeUI() {
  if (_initialized) return;
  _initialized = true;

  const panel = document.getElementById('ocPanel');
  if (!panel) {
    const container = document.getElementById('ocPanelContainer') || document.body;
    container.insertAdjacentHTML('beforeend', getTemplate('content'));
  }

  setupDom();

  const info = await discoverOpencode();
  state.opencodePath = info.binaryPath;
  state.dataRoot = info.dataRoot;

  const repos = await listRepos();
  const activeRepo = await getActiveRepoPath();

  if (activeRepo) {
    await addRepo(activeRepo);
  } else if (repos.length > 0) {
    await addRepo(repos[0].repoPath);
  }

  showWelcome();
  renderInput();
  setupStreamListeners();
}

function setupDom() {
  document.getElementById('ocCloseBtn')?.addEventListener('click', closeOpencodeUI);
  document.getElementById('ocNewChatBtn')?.addEventListener('click', startNewChat);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const panel = document.getElementById('ocPanel');
      if (panel && panel.classList.contains('open')) closeOpencodeUI();
    }
  });
}

async function getActiveRepoPath() {
  try {
    return await window.electronAPI.getActiveProject?.() || null;
  } catch {
    return null;
  }
}

export function openOpencodeUI() {
  const panel = document.getElementById('ocPanel');
  if (panel) {
    panel.classList.add('open');
    state.open = true;
    if (state.tabs.length === 0) initOpencodeUI();
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
