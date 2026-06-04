class SymbolIndexHandler {
  constructor() {
    this.ipc = window.electronAPI?.symbolIndex;
    this._progressCallback = null;
    this._errorCallback = null;
    this._dirtyCallback = null;

    if (this.ipc?.onProgress) {
      this.ipc.onProgress((data) => {
        if (this._progressCallback) this._progressCallback(data);
      });
    }
    if (this.ipc?.onError) {
      this.ipc.onError((msg) => {
        if (this._errorCallback) this._errorCallback(msg);
      });
    }
    if (this.ipc?.onDirtyChanged) {
      this.ipc.onDirtyChanged((count) => {
        if (this._dirtyCallback) this._dirtyCallback(count);
      });
    }
  }

  async init() {
    if (!this.ipc) return { success: false, error: 'IPC not available' };
    return this.ipc.init();
  }

  async check(repoPath) {
    if (!this.ipc) return { indexed: false };
    return this.ipc.check(repoPath);
  }

  async startIndexing(repoPath) {
    if (!this.ipc) return { success: false, error: 'IPC not available' };
    return this.ipc.startIndexing(repoPath);
  }

  async getStatus(repoPath) {
    if (!this.ipc) return { exists: false };
    return this.ipc.getStatus(repoPath);
  }

  async search(repoPath, query, limit) {
    if (!this.ipc) return { results: [] };
    return this.ipc.search(repoPath, query, limit);
  }

  async getDirtyCount(repoPath) {
    if (!this.ipc) return { count: 0 };
    return this.ipc.getDirtyCount(repoPath);
  }

  async reindexDirty(repoPath) {
    if (!this.ipc) return { success: false, error: 'IPC not available' };
    return this.ipc.reindexDirty(repoPath);
  }

  async reset(repoPath) {
    if (!this.ipc) return { success: false, error: 'IPC not available' };
    return this.ipc.reset(repoPath);
  }

  async getIndexedFiles(repoPath) {
    if (!this.ipc) return { files: [] };
    return this.ipc.getIndexedFiles(repoPath);
  }

  async getIndexedFileList(repoPath) {
    if (!this.ipc) return { files: [] };
    return this.ipc.getIndexedFileList(repoPath);
  }

  async getFileSymbols(repoPath, filePath) {
    if (!this.ipc) return { symbols: [] };
    return this.ipc.getFileSymbols(repoPath, filePath);
  }

  async getDirtyFiles(repoPath) {
    if (!this.ipc) return { files: [] };
    return this.ipc.getDirtyFiles(repoPath);
  }

  async reindexFile(repoPath, filePath) {
    if (!this.ipc) return { success: false, error: 'IPC not available' };
    return this.ipc.reindexFile(repoPath, filePath);
  }

  async delete(repoPath) {
    if (!this.ipc) return { success: false, error: 'IPC not available' };
    return this.ipc.delete(repoPath);
  }

  async stopWatcher(repoPath) {
    if (!this.ipc) return { success: false };
    return this.ipc.stopWatcher(repoPath);
  }

  onProgress(callback) {
    this._progressCallback = callback;
  }

  onError(callback) {
    this._errorCallback = callback;
  }

  onDirtyChanged(callback) {
    this._dirtyCallback = callback;
  }
}

export default SymbolIndexHandler;
