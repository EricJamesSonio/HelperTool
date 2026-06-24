import { state } from './state.js';
import { listConversations } from './history.js';
import { openTerminalForRepo, closeTerminalSession } from './chat.js';
import { hasTerminalSession } from './terminalManager.js';
import { renderConvList } from './repoTabs.js';

export function renderShellSelect() {
  const select = document.getElementById('ocShellSelect');
  if (!select) return;
  select.innerHTML = '';

  const shells = state.terminalShells && state.terminalShells.length > 0
    ? state.terminalShells
    : [
        { name: 'PowerShell (powershell.exe)', cmd: 'powershell.exe', args: ['-NoLogo'] },
        { name: 'Command Prompt (cmd.exe)', cmd: 'cmd.exe', args: [] },
        { name: 'Git Bash (bash.exe)', cmd: 'bash.exe', args: [] },
        { name: 'WSL / Ubuntu (wsl.exe)', cmd: 'wsl.exe', args: [] },
      ];

  for (const shell of shells) {
    const opt = document.createElement('option');
    opt.value = shell.cmd + '|' + (shell.args || []).join('||');
    opt.textContent = shell.name;
    select.appendChild(opt);
  }

  if (!state.selectedShell) {
    const s = shells[0];
    state.selectedShell = s.cmd + '|' + (s.args || []).join('||');
  }

  select.value = state.selectedShell;
  select.addEventListener('change', () => {
    state.selectedShell = select.value;
  });
}

export function getSelectedShell() {
  if (!state.selectedShell && state.terminalShells.length > 0) {
    const s = state.terminalShells[0];
    state.selectedShell = s.cmd + '|' + (s.args || []).join('||');
  }
  if (!state.selectedShell) {
    return { cmd: 'powershell.exe', args: ['-NoLogo'] };
  }
  const parts = state.selectedShell.split('|');
  const cmd = parts[0];
  const args = parts.slice(1).filter(Boolean).map(a => a.replace(/\|\|/g, ' '));
  return { cmd, args };
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

  if (hasTerminalSession(repoPath)) {
    closeTerminalSession(repoPath);
  }

  await openTerminalForRepo(repoPath);
  renderConvList();

  const input = document.getElementById('ocInput');
  if (input) setTimeout(() => input.focus(), 50);

  console.log('[CS] startNewChat done, terminal open');
}
