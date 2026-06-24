import { state } from './state.js';
import { refreshSidebar, loadConversation } from './sidebar.js';
import { clearTerminal, loadConvMessages } from './chat.js';
import { listConversations } from './history.js';
import { escapeHtml, formatTime, groupByDate } from './utils.js';

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
  el.textContent = repoPath || '';
}

export function switchTab(repoPath) {
  state.activeTab = repoPath;
  for (const tab of state.tabs) tab.active = tab.repoPath === repoPath;

  clearTerminal();
  if (state.messages[repoPath] && state.messages[repoPath].length > 0) {
    loadConvMessages(state.messages[repoPath]);
  }

  updateRepoPath(repoPath);
  renderRepoTabs();
  renderConvList();
}

export function renderRepoTabs() {
  const container = document.getElementById('ocRepoTabs');
  if (!container) return;
  container.innerHTML = '';

  for (const tab of state.tabs) {
    const el = document.createElement('button');
    el.className = `oc-repo-tab ${tab.active ? 'active' : ''}`;
    el.title = tab.repoPath;
    el.innerHTML = escapeHtml(tab.label);
    el.addEventListener('click', () => switchTab(tab.repoPath));
    container.appendChild(el);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'oc-repo-tab oc-repo-tab-add';
  addBtn.textContent = '+';
  addBtn.title = 'Add repo tab';
  addBtn.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.selectRepo();
      if (result) addRepo(result);
    } catch {}
  });
  container.appendChild(addBtn);

  if (state.activeTab) {
    const convs = state.conversations[state.activeTab] || [];
    const count = document.createElement('span');
    count.className = 'oc-repo-count';
    count.textContent = convs.length;
    container.appendChild(count);
  }
}

export function renderConvList() {
  const list = document.getElementById('ocConvList');
  if (!list) return;
  list.innerHTML = '';

  const convs = state.conversations[state.activeTab] || [];

  if (!convs.length) {
    list.innerHTML = '<div class="oc-conv-empty">No conversations yet</div>';
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
      item.innerHTML = `
        <div class="oc-conv-item-title">${escapeHtml(conv.title)}</div>
        <div class="oc-conv-item-meta">
          <span class="oc-conv-item-time">${formatTime(conv.date)}</span>
          ${conv.messageCount > 0 ? `<span class="oc-conv-item-count">${conv.messageCount} msgs</span>` : ''}
        </div>
      `;
      item.addEventListener('click', () => loadConversation(conv.id));
      groupEl.appendChild(item);
    }

    list.appendChild(groupEl);
  }
}
