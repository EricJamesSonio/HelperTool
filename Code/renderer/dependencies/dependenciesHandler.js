class DependenciesHandler {
  constructor() {
    this.ipc = window.electronAPI?.symbolIndex;
  }

  async getFileDeps(repoPath, filePath, mode) {
    if (!this.ipc) return { exists: false };
    return this.ipc.getFileDeps(repoPath, filePath, mode);
  }
}

export default DependenciesHandler;
