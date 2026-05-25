class DependenciesHandler {
  constructor() {
    this.ipc = window.electronAPI?.symbolIndex;
  }

  async getFileDeps(repoPath, filePath) {
    if (!this.ipc) return { exists: false };
    return this.ipc.getFileDeps(repoPath, filePath);
  }
}

export default DependenciesHandler;
