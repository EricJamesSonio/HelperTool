import { state } from './state.js';
import { listConversations, getConversation } from './history.js';
import { openTerminalForRepo, closeTerminalSession, showWelcome } from './chat.js';
import { hasTerminalSession, writeToTerminal } from './terminalManager.js';
import { renderConvList } from './repoTabs.js';
import { confirmDialog } from '../utils/confirmDialog.js';

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

  const hadSession = hasTerminalSession(repoPath);
  await openTerminalForRepo(repoPath);

  // If terminal already existed, tell opencode CLI to switch to this session
  if (hadSession) {
    writeToTerminal(repoPath, `opencode -c ${convId}\n`);
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

  // Clear active conversation and messages
  state.activeConvId[repoPath] = null;
  state.messages[repoPath] = [];
  state.messageCache[repoPath] = [];

  console.log('[CS] startNewChat: killing existing terminal session if any');
  if (hasTerminalSession(repoPath)) {
    closeTerminalSession(repoPath);
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

export class ChatSidebar {
  constructor() {
    this._activeSessionId = null;
    this._listEl = null;
    this._init();
    this._listenSessionUpdates();
  }

  _listenSessionUpdates() {
    window.chatAPI.onSessionUpdated((data) => {
      if (!data.sessionId) return;
      const item = this._listEl?.querySelector(`[data-session-id="${data.sessionId}"]`);
      if (!item) return;
      if (data.title) {
        const titleEl = item.querySelector('.oc-chat-session-title');
        if (titleEl) titleEl.textContent = data.title;
      }
      if (data.timestamp) {
        const timeEl = item.querySelector('.oc-chat-session-time');
        if (timeEl) timeEl.textContent = this._formatTimestamp(data.timestamp);
      }
    });
  }

  _init() {
    const sidebar = document.getElementById('ocSidebar');
    if (!sidebar) return;

    const section = document.createElement('div');
    section.className = 'oc-chat-sessions';

    const header = document.createElement('div');
    header.className = 'oc-chat-sessions-header';

    const label = document.createElement('span');
    label.className = 'oc-chat-sessions-label';
    label.textContent = 'Chats';
    header.appendChild(label);

    const newBtn = document.createElement('button');
    newBtn.className = 'oc-btn oc-btn-new-chat';
    newBtn.textContent = '+ New Chat';
    newBtn.addEventListener('click', () => this._onNewChat());
    header.appendChild(newBtn);

    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'oc-chat-sessions-list';
    section.appendChild(list);

    this._listEl = list;

    const repoPathBar = document.getElementById('ocRepoPath');
    if (repoPathBar && repoPathBar.nextSibling) {
      sidebar.insertBefore(section, repoPathBar.nextSibling);
    } else {
      sidebar.prepend(section);
    }
  }

  async renderSessionList(repoPath) {
    if (!this._listEl) return;
    this._listEl.innerHTML = '';

    let sessions;
    try {
      sessions = await window.chatAPI.getSessions(repoPath);
    } catch (err) {
      console.error('[CS] getSessions error:', err);
      sessions = [];
    }

    if (sessions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'oc-chat-sessions-empty';
      empty.textContent = 'No chats yet';
      this._listEl.appendChild(empty);
      return;
    }

    for (const session of sessions) {
      const item = this._createSessionItem(session, session.id === this._activeSessionId);
      this._listEl.appendChild(item);
    }
  }

  selectSession(sessionId) {
    this._activeSessionId = sessionId;

    const items = this._listEl.querySelectorAll('.oc-chat-session-item');
    for (const item of items) {
      item.classList.toggle('active', item.dataset.sessionId === sessionId);
    }

    const event = new CustomEvent('chat:session-selected', { detail: { sessionId } });
    document.dispatchEvent(event);
  }

  addSession(session) {
    const item = this._createSessionItem(session, false);
    this._listEl.prepend(item);

    const empty = this._listEl.querySelector('.oc-chat-sessions-empty');
    if (empty) empty.remove();

    this.selectSession(session.id);
  }

  removeSession(sessionId) {
    const item = this._listEl.querySelector(`[data-session-id="${sessionId}"]`);
    if (item) item.remove();

    if (this._activeSessionId === sessionId) {
      const remaining = this._listEl.querySelectorAll('.oc-chat-session-item');
      if (remaining.length > 0) {
        this.selectSession(remaining[0].dataset.sessionId);
      } else {
        this._activeSessionId = null;
        const empty = document.createElement('div');
        empty.className = 'oc-chat-sessions-empty';
        empty.textContent = 'No chats yet';
        this._listEl.appendChild(empty);
      }
    }
  }

  _createSessionItem(session, isActive) {
    const item = document.createElement('div');
    item.className = 'oc-chat-session-item' + (isActive ? ' active' : '');
    item.dataset.sessionId = session.id;

    const info = document.createElement('div');
    info.className = 'oc-chat-session-info';

    const title = document.createElement('div');
    title.className = 'oc-chat-session-title';
    title.textContent = session.title || 'New Chat';

    const time = document.createElement('div');
    time.className = 'oc-chat-session-time';
    time.textContent = this._formatTimestamp(session.updatedAt);

    info.appendChild(title);
    info.appendChild(time);

    const delBtn = document.createElement('button');
    delBtn.className = 'oc-chat-session-delete';
    delBtn.innerHTML = '&#x1F5D1;';
    delBtn.title = 'Delete chat';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._onDeleteSession(session.id);
    });

    item.appendChild(info);
    item.appendChild(delBtn);

    item.addEventListener('click', () => this.selectSession(session.id));

    return item;
  }

  async _onNewChat() {
    const repoPath = state.activeTab;
    if (!repoPath) {
      console.warn('[CS] No active repo path for new chat');
      return;
    }

    let session;
    try {
      session = await window.chatAPI.createSession(repoPath, 'opencode');
    } catch (err) {
      console.error('[CS] createSession error:', err);
      return;
    }

    this.addSession(session);
  }

  async _onDeleteSession(sessionId) {
    const confirmed = await confirmDialog('Are you sure you want to delete this chat?');
    if (!confirmed) return;

    try {
      await window.chatAPI.deleteSession(sessionId);
    } catch (err) {
      console.error('[CS] deleteSession error:', err);
      return;
    }

    this.removeSession(sessionId);
  }

  _formatTimestamp(unixTimestamp) {
    if (!unixTimestamp) return '';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - unixTimestamp;

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(unixTimestamp * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}