import { state } from './state.js';
import { refreshSidebar, loadConversation, startNewChat } from './sidebar.js';
import { hasTerminalSession, showTerminalSession, getSlotForRepo, getConvSlotMap, getTerminalInstances, killSlot, activateSlot } from './terminalManager.js';
import { escapeHtml, formatTime, groupByDate } from './utils.js';
import { getProvider } from './providers.js';
import { convStore } from './conversationStore.js';
import { promptDialog, confirmDialog } from '../utils/confirmDialog.js';
import { isTerminalRevealed, syncStage } from './terminalManager.js';
import { ensureRepoBadges, dismissRepo, undismissRepo } from './repoBadges.js';

function normRepo(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function sameRepoPath(a, b) {
  return normRepo(a) === normRepo(b);
}

function showWelcomeOnly() {
  const welcome = document.getElementById('ocWelcome');
  const terminal = document.getElementById('ocTerminal');
  if (welcome) welcome.style.display = '';
  if (terminal) terminal.style.display = 'none';
}

export async function addRepo(repoPath) {
  console.log('[CS] addRepo:', repoPath);
  if (!repoPath) {
    console.log('[CS] addRepo: no path, return');
    return;
  }
  undismissRepo(repoPath);
  const existing = state.tabs.find(t => t.repoPath === repoPath);
  if (existing) {
    console.log('[CS] addRepo: already exists, switching tab');
    switchTab(repoPath);
    return;
  }

  const label = repoPath.split(/[/\\]/).filter(Boolean).pop() || repoPath;
  console.log('[CS] addRepo: label:', label);
  state.tabs.push({ repoPath, label, active: false });
  state.conversations[repoPath] = [];
  state.activeConvId[repoPath] = null;
  switchTab(repoPath);
  renderRepoTabs();
}

export async function closeRepoTab(repoPath, slotIndex) {
  if (!repoPath) return false;

  const slotMode = slotIndex !== undefined && slotIndex >= 0;
  const name = repoPath.split(/[/\\]/).filter(Boolean).pop() || repoPath;
  const insts = Object.values(getTerminalInstances()).filter((i) => {
    if (!i || !sameRepoPath(i.repoPath, repoPath)) return false;
    return !slotMode || i.slotIndex === slotIndex;
  });
  const running = insts.length > 0;

  const safeName = escapeHtml(name);
  let message;
  if (slotMode) {
    message = 'Close the terminal for <strong>' + safeName + '</strong> (slot ' + (slotIndex + 1) + ')? ' +
      'The running session will be stopped. Your saved conversations stay in the sidebar and can be resumed.';
  } else if (running) {
    message = 'Close the <strong>' + safeName + '</strong> tab? ' +
      'Its running terminal session will be stopped and unsaved terminal output is lost. ' +
      'Your saved conversations stay in the sidebar and can be resumed.';
  } else {
    message = 'Close the <strong>' + safeName + '</strong> tab? Your saved conversations are kept.';
  }

  const ok = await confirmDialog(message, {
    title: 'Close tab?',
    confirmText: 'Close tab',
    cancelText: 'Keep open',
    danger: true,
  });
  if (!ok) return false;

  for (const inst of insts) killSlot(inst.slotIndex);

  if (slotMode) {
    const left = Object.values(getTerminalInstances()).filter(Boolean);
    if (!left.length) {
      showWelcomeOnly();
    } else if (state.parallelMode) {
      activateSlot(left[0].slotIndex);
    }
    syncStage(state.activeTab);
    renderConvList();
    ensureRepoBadges();
    return true;
  }

  dismissRepo(repoPath);
  state.tabs = state.tabs.filter((t) => !sameRepoPath(t.repoPath, repoPath));
  for (const key of Object.keys(state.conversations)) {
    if (sameRepoPath(key, repoPath)) delete state.conversations[key];
  }
  for (const key of Object.keys(state.activeConvId)) {
    if (sameRepoPath(key, repoPath)) delete state.activeConvId[key];
  }

  if (sameRepoPath(state.activeTab, repoPath)) {
    let next = state.tabs.length ? state.tabs[0].repoPath : null;
    if (!next) {
      const live = Object.values(getTerminalInstances()).find((i) => i && i.repoPath);
      if (live) next = live.repoPath;
    }
    if (next) {
      switchTab(next);
    } else {
      state.activeTab = null;
      showWelcomeOnly();
      syncStage(null);
      updateRepoPath(null);
      renderConvList();
    }
  } else {
    syncStage(state.activeTab);
    renderConvList();
  }

  ensureRepoBadges();
  return true;
}

export function updateRepoPath(repoPath) {
  const el = document.getElementById('ocRepoPath');
  if (el) {
    if (repoPath) {
      const parts = repoPath.replace(/\\/g, '/').split('/').filter(Boolean);
      const short = parts.length > 2 ? '\u2026/' + parts.slice(-2).join('/') : repoPath;
      el.textContent = short;
      el.title = repoPath;
    } else {
      el.textContent = '';
    }
  }
  ensureRepoBadges();
}

export function switchTab(repoPath) {
  state.activeTab = repoPath;
  for (const tab of state.tabs) tab.active = tab.repoPath === repoPath;

  if (hasTerminalSession(repoPath) && isTerminalRevealed(repoPath)) {
    const slot = getSlotForRepo(repoPath);
    if (slot >= 0) state.activeSlotIndex = slot;
    showTerminalSession(repoPath);
    const welcome = document.getElementById('ocWelcome');
    const terminal = document.getElementById('ocTerminal');
    if (welcome) welcome.style.display = 'none';
    if (terminal) terminal.style.display = '';
  } else {
    const welcome = document.getElementById('ocWelcome');
    const terminal = document.getElementById('ocTerminal');
    if (welcome) welcome.style.display = '';
    if (terminal) terminal.style.display = 'none';
  }

  syncStage(repoPath);
  updateRepoPath(repoPath);
  renderRepoTabs();
  renderConvList();
}

export function renderRepoTabs() {
  const container = document.getElementById('ocRepoTabs');
  if (container) container.style.display = 'none';
}

export function renderConvList(loading) {
  const list = document.getElementById('ocConvList');
  if (!list) return;
  list.innerHTML = '';

  if (loading) {
    list.innerHTML = '<div class="oc-conv-loading"><span class="oc-conv-loading-spinner"></span>Loading conversations...</div>';
    return;
  }

  const allConvs = state.conversations[state.activeTab] || [];
  const selectedProvider = state.selectedProvider;
  const convs = allConvs.filter(c => (c.provider || 'opencode') === selectedProvider);

  if (!convs.length) {
    const prov = getProvider(selectedProvider);
    list.innerHTML = `
      <div class="oc-conv-empty">No ${prov.label} conversations yet</div>
      <div style="padding:4px 10px">
        <button class="oc-btn oc-btn-refresh" id="ocRefreshConvsBtn" style="width:100%;height:28px;font-size:11px">\u27f3 Refresh</button>
      </div>`;
    const refreshBtn = document.getElementById('ocRefreshConvsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => refreshSidebar(true));
    return;
  }

  const groups = groupByDate(convs);
  const labels = {
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This Week',
    older: 'Older',
  };

  for (const [key, label] of Object.entries(labels)) {
    const items = groups[key];
    if (!items || !items.length) continue;

    const groupEl = document.createElement('div');
    groupEl.className = 'oc-conv-group';

    const header = document.createElement('div');
    header.className = 'oc-conv-group-label';
    header.textContent = label;
    groupEl.appendChild(header);

    const activeConvId = state.activeConvId[state.activeTab];
    const convSlotMap = state.parallelMode ? getConvSlotMap(state.activeTab) : {};

    for (const conv of items) {
      const isActive = conv.id === activeConvId;
      const slot = convSlotMap[conv.id];
      let itemClass = 'oc-conv-item';
      if (isActive) itemClass += ' active';
      if (slot !== undefined && state.parallelMode) itemClass += ` slot-${slot}`;
      const item = document.createElement('div');
      item.className = itemClass;
      const prov = getProvider(conv.provider || 'opencode');
      const slotBadge = (slot !== undefined && state.parallelMode)
        ? `<span class="oc-conv-slot-badge slot-${slot}">${slot + 1}</span>`
        : '';
      item.innerHTML = `
        <div class="oc-conv-item-title">
          ${slotBadge}
          <span class="oc-conv-provider-tag oc-provider-${prov.id}">${prov.shortLabel}</span>
          ${escapeHtml(conv.title)}
        </div>
        <div class="oc-conv-item-meta">
          <span class="oc-conv-item-time">${formatTime(conv.date)}</span>
          ${conv.messageCount > 0
            ? `<span class="oc-conv-item-tag oc-conv-item-count">${conv.messageCount} msgs</span>`
            : `<span class="oc-conv-item-tag oc-conv-item-new">New</span>`}
        </div>
      `;
      item.addEventListener('click', () => loadConversation(conv.id));
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _showConvContextMenu(e.clientX, e.clientY, conv);
      });
      groupEl.appendChild(item);
    }

    list.appendChild(groupEl);
  }
}

function _showConvContextMenu(x, y, conv) {
  const existing = document.querySelector('.oc-ctx-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'custom-context-menu oc-ctx-menu';
  menu.innerHTML = `
    <div class="context-menu-header">${escapeHtml(conv.title || conv.id)}</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" data-action="rename">
      <span class="context-menu-label">Rename</span>
    </div>
    <div class="context-menu-item" data-action="delete">
      <span class="context-menu-label" style="color:var(--red,#f87171)">Delete</span>
    </div>
  `;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  document.body.appendChild(menu);

  menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
    menu.remove();
    _renameConversation(conv);
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    menu.remove();
    _deleteConversation(conv);
  });

  const close = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

async function _renameConversation(conv) {
  const name = await promptDialog('Rename conversation:', conv.title || conv.id);
  if (!name || name.trim() === (conv.title || conv.id)) {
    return;
  }
  convStore.renameConversation(state.activeTab, conv.id, name.trim());
  const afterStore = convStore.getConversations(state.activeTab);
  state.conversations[state.activeTab] = afterStore;
  renderConvList();
}

function _deleteConversation(conv) {
  if (!confirm(`Delete "${conv.title || conv.id}"?`)) return;
  convStore.removeConversation(state.activeTab, conv.id);
  state.conversations[state.activeTab] = convStore.getConversations(state.activeTab);
  if (state.activeConvId[state.activeTab] === conv.id) {
    state.activeConvId[state.activeTab] = null;
  }
  renderConvList();
}