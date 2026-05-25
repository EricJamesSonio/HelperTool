import SymbolIndexManager from './symbolIndex/symbolIndexManager.js';
import SymbolIndexUI from './symbolIndex/symbolIndexUI.js';
import SymbolIndexHandler from './symbolIndex/symbolIndexHandler.js';

class SymbolIndex {
  constructor() {
    this.manager = new SymbolIndexManager();
    this.handler = new SymbolIndexHandler();
    this.ui = null;
    this.isInitialized = false;
    this.currentRepoPath = null;
  }

  async initialize(repoPath) {
    try {
      this.currentRepoPath = repoPath;
      const initResult = await this.handler.init();
      if (!initResult.success) {
        console.error('[SymbolIndex] Init handler error:', initResult.error);
        return { success: false, error: initResult.error || 'Symbol Index IPC not available' };
      }

      const checkResult = await this.handler.check(repoPath);
      this.manager.isIndexed = checkResult.indexed || false;

      this.isInitialized = true;
      console.log('[SymbolIndex] Initialized for:', repoPath);

      return { success: true, state: this.manager.getState() };
    } catch (err) {
      console.error('[SymbolIndex] Init error:', err);
      return { success: false, error: err.message };
    }
  }

  async render(containerElement) {
    try {
      if (!this.isInitialized) {
        throw new Error('SymbolIndex not initialized. Call initialize() first.');
      }

      this.ui = new SymbolIndexUI(this.manager, this.handler);
      await this.ui.render(containerElement, this.currentRepoPath);

      console.log('[SymbolIndex] UI rendered');
      return { success: true };
    } catch (err) {
      console.error('[SymbolIndex] Render error:', err);
      return { success: false, error: err.message };
    }
  }

  async refresh() {
    if (this.ui) {
      await this.ui.refreshUI();
    }
    return { success: true };
  }

  getState() {
    return this.manager.getState();
  }

  reset() {
    this.manager.reset();
    this.isInitialized = false;
    this.currentRepoPath = null;
  }

  destroy() {
    if (this.currentRepoPath) {
      this.handler.stopWatcher(this.currentRepoPath);
    }
    this.ui = null;
    this.reset();
  }
}

export default SymbolIndex;
