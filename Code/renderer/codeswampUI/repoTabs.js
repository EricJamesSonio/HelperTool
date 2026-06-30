import { state } from './state.js';
import { refreshSidebar, loadConversation, startNewChat } from './sidebar.js';
import { hasTerminalSession, showTerminalSession } from './terminalManager.js';
import { escapeHtml, formatTime, groupByDate } from './utils.js';
import { getProvider } from './providers.js';
import { convStore } from './conversationStore.js';
import { promptDialog } from '../utils/confirmDialog.js';

export async function addRepo(repoPath) {
  console.log('[CS] addRepo:', repoPath);
  if (!repoPath) { console.log('[CS] addRepo: no path, return'); return; }
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

export function updateRepoPath(repoPath) {
  const el = document.getElementById('ocRepoPath');
  if (!el) return;
  if (repoPath) {
    const parts = repoPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const short = parts.length > 2 ? '…/' + parts.slice(-2).join('/') : repoPath;
    el.textContent = short;
    el.title = repoPath;
  } else {
    el.textContent = '';
  }
}

export function switchTab(repoPath) {
  state.activeTab = repoPath;
  for (const tab of state.tabs) tab.active = tab.repoPath === repoPath;

  if (hasTerminalSession(repoPath)) {
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

  updateRepoPath(repoPath);
  renderRepoTabs();
  renderConvList();
}

export function renderRepoTabs() {
  // Tab row is hidden — we use the repo path bar instead.
  // Keep the element check safe so nothing crashes if it's missing.
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
        <button class="oc-btn oc-btn-refresh" id="ocRefreshConvsBtn" style="width:100%;height:28px;font-size:11px">⟳ Refresh</button>
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

    for (const conv of items) {
      const item = document.createElement('div');
      const activeConvId = state.activeConvId[state.activeTab];
      item.className = `oc-conv-item ${conv.id === activeConvId ? 'active' : ''}`;
      const prov = getProvider(conv.provider || 'opencode');
      item.innerHTML = `
        <div class="oc-conv-item-title">
          <span class="oc-conv-provider-tag oc-provider-${prov.id}">${prov.shortLabel}</span>
          ${escapeHtml(conv.title)}
        </div>
        <div class="oc-conv-item-meta">
          <span class="oc-conv-item-time">${formatTime(conv.date)}</span>
          ${conv.messageCount > 0 ? `<span class="oc-conv-item-count">${conv.messageCount} msgs</span>` : ''}
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

// ── Conversation context menu ──

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
  console.log('[CS] _renameConversation called with conv:', { id: conv.id, title: conv.title, customTitle: conv.customTitle });
  const name = await promptDialog('Rename conversation:', conv.title || conv.id);
  console.log('[CS] _renameConversation prompt result:', { name, original: conv.title || conv.id });
  if (!name || name.trim() === (conv.title || conv.id)) {
    console.log('[CS] _renameConversation: no change, skipping');
    return;
  }
  convStore.renameConversation(state.activeTab, conv.id, name.trim());
  const afterStore = convStore.getConversations(state.activeTab);
  const renamedConv = afterStore.find(c => c.id === conv.id);
  console.log('[CS] _renameConversation: after rename, store conv:', { id: renamedConv?.id, title: renamedConv?.title, customTitle: renamedConv?.customTitle });
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