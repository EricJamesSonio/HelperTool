import ChatState from './codebbaseChat/chatState.js';
import ChatQueryEngine from './codebbaseChat/chatQueryEngine.js';
import ChatUI from './codebbaseChat/chatUI.js';

class CodebaseChat {
  constructor() {
    this.state = new ChatState();
    this.queryEngine = null;
    this.chatUI = null;
    this.isInitialized = false;
    this.currentRepoPath = null;
  }

  async initialize(repoPath) {
    try {
      this.currentRepoPath = repoPath;
      const ipc = window.electronAPI?.codebaseChat;
      if (!ipc) throw new Error('codebaseChat API not available');

      this.state.activeRepoPath = repoPath;
      this.queryEngine = new ChatQueryEngine(ipc);

      const files = await ipc.getFiles({ repoPath });
      this.state.setFiles(files || []);

      const status = await window.electronAPI?.symbolIndex?.check(repoPath);
      this.state.isIndexed = status?.indexed === true;

      this.isInitialized = true;
      return { success: true };
    } catch (err) {
      console.error('Error initializing Codebase Chat:', err);
      return { error: err.message, success: false };
    }
  }

  async render(containerElement) {
    try {
      if (!this.isInitialized) throw new Error('Codebase Chat not initialized');

      this.chatUI = new ChatUI(this.state, this.queryEngine, window.electronAPI?.codebaseChat);
      await this.chatUI.render(containerElement);
      return { success: true };
    } catch (err) {
      console.error('Error rendering Codebase Chat UI:', err);
      return { error: err.message, success: false };
    }
  }

  async refresh() {
    if (this.currentRepoPath) {
      try {
        const status = await window.electronAPI?.symbolIndex?.check(this.currentRepoPath);
        this.state.isIndexed = status?.indexed === true;
      } catch (_) {}
    }
    this.chatUI?.refresh();
  }

  reset() {
    this.state.reset();
    this.isInitialized = false;
    this.currentRepoPath = null;
  }

  destroy() {
    this.chatUI?.destroy();
    this.chatUI = null;
    this.reset();
  }
}

export default CodebaseChat;
