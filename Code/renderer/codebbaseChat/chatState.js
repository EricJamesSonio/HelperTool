class ChatState {
  constructor() {
    this.activeRepoPath = null;
    this.selectedFile = null;
    this.selectedQuery = null;
    this.isLoading = false;
    this.isIndexed = false;
    this.allFiles = [];

    this.conversations = [];
    this.activeConversationId = null;
    this.conversationHistory = [];
  }

  get activeConversation() {
    return this.conversations.find(c => c.id === this.activeConversationId) || null;
  }

  generateTitle(filePath, queryType) {
    const name = filePath.split(/[/\\]/).pop();
    const labels = {
      dependencies:  'Find Dependencies',
      dependents:    'Find Dependents',
      symbols:       'Find Symbols',
      importChain:   'Trace Import Chain',
      circularDeps:  'Find Circular Deps',
    };
    return `@${name} → ${labels[queryType] || queryType}`;
  }

  async loadConversations(ipc) {
    if (!this.activeRepoPath) return;
    this.conversations = await ipc.getConversations({ repoPath: this.activeRepoPath });
    if (this.activeConversationId) {
      const stillExists = this.conversations.find(c => c.id === this.activeConversationId);
      if (!stillExists) this.activeConversationId = null;
    }
  }

  async selectConversation(ipc, conversationId) {
    this._saveCurrentSession();
    this.activeConversationId = conversationId;
    const rows = await ipc.getMessages({ conversationId });
    this.conversationHistory = rows.map(r => ({
      role: r.role,
      content: r.content,
      queryType: r.query_type || null,
      file: r.file_ref || null,
      timestamp: r.created_at,
    }));
    this.selectedFile = null;
    this.selectedQuery = null;
  }

  async createConversation(ipc) {
    this._saveCurrentSession();
    const result = await ipc.newConversation({ repoPath: this.activeRepoPath, title: 'New Chat' });
    if (!result) return;
    const conv = { id: result.id, title: 'New Chat', created_at: result.created_at, updated_at: result.created_at };
    this.conversations.unshift(conv);
    this.activeConversationId = conv.id;
    this.conversationHistory = [];
    this.selectedFile = null;
    this.selectedQuery = null;
  }

  async saveMessagePair(ipc, queryType, filePath, botContent, promptText, userContent) {
    if (!this.activeConversationId) return;
    await ipc.saveMessage({ conversationId: this.activeConversationId, role: 'user', content: userContent || '', queryType, fileRef: filePath });
    await ipc.saveMessage({ conversationId: this.activeConversationId, role: 'bot', content: botContent, queryType: queryType || null, fileRef: null });
    const conv = this.conversations.find(c => c.id === this.activeConversationId);
    if (conv && conv.title === 'New Chat') {
      conv.title = this.generateTitle(filePath, queryType);
      await ipc.renameConversation({ conversationId: this.activeConversationId, title: conv.title });
    }
  }

  async saveFreeTextPair(ipc, userContent, botContent, fileRef) {
    if (!this.activeConversationId) return;
    await ipc.saveMessage({ conversationId: this.activeConversationId, role: 'user', content: userContent || '', queryType: null, fileRef: fileRef || null });
    await ipc.saveMessage({ conversationId: this.activeConversationId, role: 'bot', content: botContent, queryType: null, fileRef: null });
    const conv = this.conversations.find(c => c.id === this.activeConversationId);
    if (conv && conv.title === 'New Chat') {
      const title = fileRef
        ? '@' + fileRef.split(/[/\\]/).pop()
        : (userContent || '').slice(0, 40).trim() || 'New Chat';
      conv.title = title;
      await ipc.renameConversation({ conversationId: this.activeConversationId, title });
    }
  }

  async deleteConversation(ipc, conversationId) {
    await ipc.deleteConversation({ conversationId });
    const idx = this.conversations.findIndex(c => c.id === conversationId);
    if (idx >= 0) this.conversations.splice(idx, 1);
    if (this.activeConversationId === conversationId) {
      if (this.conversations.length > 0) {
        await this.selectConversation(ipc, this.conversations[Math.min(idx, this.conversations.length - 1)].id);
      } else {
        this.activeConversationId = null;
        this.conversationHistory = [];
      }
    }
  }

  addMessage(role, content, queryType, file) {
    this.conversationHistory.push({
      role,
      content,
      queryType: queryType || null,
      file: file || null,
      timestamp: new Date().toISOString(),
    });
  }

  replaceLastBot(content) {
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      if (this.conversationHistory[i].role === 'bot') {
        this.conversationHistory[i].content = content;
        return;
      }
    }
  }

  getLastBotIndex() {
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      if (this.conversationHistory[i].role === 'bot') return i;
    }
    return -1;
  }

  _saveCurrentSession() {
    if (!this.activeConversationId) return;
    const conv = this.conversations.find(c => c.id === this.activeConversationId);
    if (conv) conv.conversationHistory = this.conversationHistory;
  }

  reset() {
    this.conversations = [];
    this.activeConversationId = null;
    this.conversationHistory = [];
    this.selectedFile = null;
    this.selectedQuery = null;
    this.isLoading = false;
  }

  setFiles(files) {
    this.allFiles = files || [];
  }
}

export default ChatState;
