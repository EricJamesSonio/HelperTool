import { state } from './state.js';
import { listConversations } from './history.js';
import { loadConvMessages, renderMessages, updateChatHeader, showWelcome } from './chat.js';
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

  const conv = (state.conversations[repoPath] || []).find(c => c.id === convId);
  updateChatHeader(conv ? conv.title : 'Chat');
  renderMessages(messages);
  renderConvList();
}

export async function startNewChat() {
  const repoPath = state.activeTab;
  if (!repoPath) return;

  state.activeConvId[repoPath] = 'new';
  state.messages[repoPath] = [];

  updateChatHeader('New Chat');
  showWelcome();
  renderConvList();
}
