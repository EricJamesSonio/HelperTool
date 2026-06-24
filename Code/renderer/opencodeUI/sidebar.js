import { state } from './state.js';
import { listConversations } from './history.js';
import { openTerminalForRepo, closeTerminalSession } from './chat.js';
import { hasTerminalSession } from './terminalManager.js';
import { renderConvList } from './repoTabs.js';

export function renderShellSelect() {
  const select = document.getElementById('ocShellSelect');
  if (!select) return;
  select.innerHTML = '';

  const opt = document.createElement('option');
  opt.value = 'opencode';
  opt.textContent = 'opencode (default)';
  const selectedShell = state.selectedShell || 'opencode';
  if (selectedShell === 'opencode') opt.selected = true;
  select.appendChild(opt);

  for (const shell of state.terminalShells || []) {
    const opt2 = document.createElement('option');
    opt2.value = shell.cmd + '|' + (shell.args || []).join(' ');
    opt2.textContent = shell.name + (shell.cmd !== 'opencode' ? ` (${shell.cmd})` : '');
    if (selectedShell === opt2.value) opt2.selected = true;
    select.appendChild(opt2);
  }

  select.addEventListener('change', () => {
    state.selectedShell = select.value;
  });
}

export async function refreshSidebar() {
  const repoPath = state.activeTab;
  if (!repoPath) return;

  const convs = await listConversations(repoPath);
  const currentConvs = state.conversations[repoPath] || [];

  const serverIds = new Set(convs.map(c => c.id));
  const localOnly = currentConvs.filter(c => c.id.startsWith('local_') && !serverIds.has(c.id));
  state.conversations[repoPath] = [...localOnly, ...convs];

  if (!state.messages[repoPath]) state.messages[repoPath] = [];
  renderConvList();
}

export async function loadConversation(convId) {
  const repoPath = state.activeTab;
  if (!repoPath) return;

  state.activeConvId[repoPath] = convId;

  // Open terminal if not already open
  await openTerminalForRepo(repoPath);

  renderConvList();
}

export async function startNewChat() {
  console.log('[CS] startNewChat called, activeTab:', state.activeTab);
  const repoPath = state.activeTab;
  if (!repoPath) {
    console.log('[CS] startNewChat: no activeTab, returning');
    return;
  }

  state.activeConvId[repoPath] = 'new';
  state.messages[repoPath] = [];

  // Kill old terminal session for this repo to start fresh
  if (hasTerminalSession(repoPath)) {
    closeTerminalSession(repoPath);
  }

  await openTerminalForRepo(repoPath);
  renderConvList();

  const input = document.getElementById('ocInput');
  if (input) setTimeout(() => input.focus(), 50);

  console.log('[CS] startNewChat done, terminal open');
}
