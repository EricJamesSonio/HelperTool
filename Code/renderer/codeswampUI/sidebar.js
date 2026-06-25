import { state } from './state.js';
import { listConversations, getConversation } from './history.js';
import { openTerminalForRepo, closeTerminalSession, showWelcome } from './chat.js';
import { hasTerminalSession, writeToTerminal } from './terminalManager.js';
import { renderConvList } from './repoTabs.js';
import { getLoadingController } from './loading.js';

export function renderShellSelect() {
  const select = document.getElementById('ocShellSelect');
  if (!select) return;
  select.innerHTML = '';

const shells = state.terminalShells && state.terminalShells.length > 0
  ? state.terminalShells
  : [
      { name: 'PowerShell (powershell.exe)', cmd: 'powershell.exe', args: ['-NoLogo', '-NoExit'] },
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

  // Fallback default
  if (!state.selectedShell) {
    return { cmd: 'powershell.exe', args: ['-NoLogo', '-NoExit'] };
  }

  const parts = state.selectedShell.split('|');
  const cmd = parts[0];
  const rawArgs = parts.slice(1).filter(Boolean).map(a => a.replace(/\|\|/g, ' '));

  // Always ensure -NoExit for powershell so it doesn't quit immediately
  if (cmd.toLowerCase().includes('powershell')) {
    const args = rawArgs.filter(a => a.trim());
    if (!args.includes('-NoExit')) args.push('-NoExit');
    if (!args.includes('-NoLogo')) args.push('-NoLogo');
    return { cmd, args };
  }

  return { cmd, args: rawArgs };
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

  const lc = getLoadingController();
  lc.start('Loading conversation...');

  if (hasTerminalSession(repoPath)) {
    closeTerminalSession(repoPath);
  }

  try {
    await openTerminalForRepo(repoPath);
    await lc.finish('Ready', 2000);
  } catch (e) {
    console.error('[CS] loadConversation error:', e);
    lc.hide();
  }
  renderConvList();
}

export async function startNewChat() {
  console.log('[CS] startNewChat called, activeTab:', state.activeTab);
  const repoPath = state.activeTab;
  if (!repoPath) {
    console.log('[CS] startNewChat: no activeTab, returning');
    return;
  }

  state.activeConvId[repoPath] = null;
  state.messages[repoPath] = [];
  state.messageCache[repoPath] = [];

  console.log('[CS] startNewChat: killing existing terminal session if any');
  if (hasTerminalSession(repoPath)) {
    writeToTerminal(repoPath, '/exit\n');
    await new Promise(r => setTimeout(r, 2000));
    closeTerminalSession(repoPath);
    await new Promise(r => setTimeout(r, 1000));
    await refreshSidebar();
  }

  showWelcome();
  renderConvList();

  const input = document.getElementById('ocInput');
  if (input) setTimeout(() => input.focus(), 50);
}

export async function refreshSidebarAfterDelay(delay = 1500) {
  setTimeout(async () => {
    await refreshSidebar();
  }, delay);
}

