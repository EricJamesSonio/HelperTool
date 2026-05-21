/**
 * gitManager.js
 * Manages Git state and provides core Git functionality
 * Handles: working tree, staged files, commit history
 */

class GitManager {
  constructor() {
    this.workingTreeFiles = [];
    this.stagedFiles = [];
    this.commitHistory = [];
    this.currentRepo = null;
    this.isWatching = false;
    this.lastStatusRefresh = 0;
    this.statusRefreshInterval = 500; // ms
  }

  /**
   * Initialize the Git manager with a repository path
   */
  setRepository(repoPath) {
    this.currentRepo = repoPath;
    this.workingTreeFiles = [];
    this.stagedFiles = [];
    return { success: true, repo: repoPath };
  }

  /**
   * Update working tree with git status output
   * @param {Array} files - Array of {file: string, status: string}
   */
  updateWorkingTree(files) {
    this.workingTreeFiles = files || [];
    return this.workingTreeFiles;
  }

  /**
   * Stage a file (move from working tree to staged)
   */
  stageFile(filePath) {
    const fileIndex = this.workingTreeFiles.findIndex(f => f.file === filePath);
    if (fileIndex === -1) return { error: 'File not found in working tree' };

    const file = this.workingTreeFiles[fileIndex];
    
    // Check if already staged
    if (this.stagedFiles.some(f => f.file === filePath)) {
      return { error: 'File already staged' };
    }

    this.stagedFiles.push({ ...file, originalIndex: fileIndex });
    this.workingTreeFiles.splice(fileIndex, 1);

    return { success: true, staged: this.stagedFiles };
  }

  /**
   * Stage multiple files at once
   */
  stageFiles(filePaths) {
    const results = filePaths.map(path => this.stageFile(path));
    return { success: true, staged: this.stagedFiles, results };
  }

  /**
   * Unstage a file (move back to working tree)
   */
  unstageFile(filePath) {
    const fileIndex = this.stagedFiles.findIndex(f => f.file === filePath);
    if (fileIndex === -1) return { error: 'File not found in staged area' };

    const file = this.stagedFiles[fileIndex];
    this.workingTreeFiles.push({ file: file.file, status: file.status });
    this.stagedFiles.splice(fileIndex, 1);

    return { success: true, working: this.workingTreeFiles };
  }

  /**
   * Unstage multiple files at once
   */
  unstageFiles(filePaths) {
    const results = filePaths.map(path => this.unstageFile(path));
    return { success: true, working: this.workingTreeFiles, results };
  }

  /**
   * Create a commit from staged files
   */
  createCommit(message, options = {}) {
    if (this.stagedFiles.length === 0) {
      return { error: 'No files staged for commit' };
    }

    if (!message || message.trim().length === 0) {
      return { error: 'Commit message cannot be empty' };
    }

    const commit = {
      id: this.generateCommitId(),
      message: message.trim(),
      files: this.stagedFiles.map(f => ({ file: f.file, status: f.status })),
      timestamp: new Date().toISOString(),
      committed: true,
      pushed: false,
      pushRequested: options.pushAfter || false
    };

    this.commitHistory.unshift(commit);
    this.stagedFiles = [];

    return {
      success: true,
      commit,
      history: this.commitHistory
    };
  }

  /**
   * Mark a commit as pushed
   */
  markCommitPushed(commitId) {
    const commit = this.commitHistory.find(c => c.id === commitId);
    if (!commit) return { error: 'Commit not found' };

    commit.pushed = true;
    return { success: true, commit };
  }

  /**
   * Get current state as object (for UI rendering)
   */
  getState() {
    return {
      currentRepo: this.currentRepo,
      workingTree: this.workingTreeFiles,
      staged: this.stagedFiles,
      history: this.commitHistory,
      stats: {
        working: this.workingTreeFiles.length,
        staged: this.stagedFiles.length,
        commits: this.commitHistory.length,
        unpushed: this.commitHistory.filter(c => !c.pushed).length
      }
    };
  }

  /**
   * Clear all data (when switching repos or resetting)
   */
  reset() {
    this.workingTreeFiles = [];
    this.stagedFiles = [];
    this.commitHistory = [];
    return { success: true };
  }

  /**
   * Generate a unique commit ID (simplified - use git hash in production)
   */
  generateCommitId() {
    return `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get stats for UI badges and counters
   */
  getStats() {
    return {
      working: this.workingTreeFiles.length,
      staged: this.stagedFiles.length,
      commits: this.commitHistory.length,
      unpushed: this.commitHistory.filter(c => !c.pushed).length
    };
  }
}

module.exports = GitManager;