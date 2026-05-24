class SymbolIndexManager {
  constructor() {
    this.isIndexed = false;
    this.status = null;
    this.config = null;
    this.searchResults = [];
    this.dirtyCount = 0;
    this.indexingProgress = null;
  }

  getState() {
    return {
      isIndexed: this.isIndexed,
      status: this.status ? { ...this.status } : null,
      config: this.config ? JSON.parse(JSON.stringify(this.config)) : null,
      searchResults: [...this.searchResults],
      dirtyCount: this.dirtyCount,
      indexingProgress: this.indexingProgress ? { ...this.indexingProgress } : null,
    };
  }

  reset() {
    this.isIndexed = false;
    this.status = null;
    this.config = null;
    this.searchResults = [];
    this.dirtyCount = 0;
    this.indexingProgress = null;
  }
}

export default SymbolIndexManager;
