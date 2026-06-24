import { state } from './state.js';
import { listConversations } from './history.js';
import { loadConvMessages, clearTerminal } from './chat.js';
import { renderConvList } from './repoTabs.js';

export async function refreshSidebar() {
  const repoPath = state.activeTab;
  if (!repoPath) return;

  const convs = await listConversations(repoPath);
  state.conversations[repoPath] = convs;

  if (!state.messages[repoPath]) state.messages[repoPath] = [];
  renderConvList();
}

export async function loadConversation(convId) {
  const repoPath = state.activeTab;
  if (!repoPath) return;

  state.activeConvId[repoPath] = convId;

  const messages = await loadConvMessages(convId);
  state.messages[repoPath] = messages;

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

  clearTerminal();
  renderConvList();

  const input = document.getElementById('ocInput');
  if (input) setTimeout(() => input.focus(), 50);

  console.log('[CS] startNewChat done');
}
