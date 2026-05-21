/**
 * gitCommandHandler.js
 * Handles communication between renderer and main process for git operations
 * Also manages local git state and file watching
 */

class GitCommandHandler {
  constructor(gitManager) {
    this.gitManager = gitManager;
    this.repoPath = null;
    this.ipc = window.electronAPI?.git;
    this.fileWatcher = null;
    this.lastStatusRefresh = 0;
    this.statusDebounce = 500; // ms
  }

  /**
   * Check if git is available
   */
  async checkGitAvailable() {
    if (!this.ipc) {
      console.error('Git API not available');
      return false;
    }
    return true;
  }

  /**
   * Get current git status from repository
   */
  async getStatus() {
    try {
      const isAvailable = await this.checkGitAvailable();
      if (!isAvailable) return { error: 'Git API not available' };

      const result = await this.ipc.status(this.repoPath);
      if (result.error) return result;

      // Update manager with fresh status
      this.gitManager.updateWorkingTree(result.files || []);
      return result;
    } catch (error) {
      console.error('Error getting git status:', error);
      return { error: error.message };
    }
  }

  /**
   * Stage files
   */
  async stageFiles(filePaths) {
    try {
      if (!filePaths || filePaths.length === 0) {
        return { error: 'No files to stage' };
      }

      // First try actual git staging if available
      let gitResult = null;
      if (this.ipc?.stage) {
        gitResult = await this.ipc.stage(this.repoPath, filePaths);
      }

      // Also update local state
      const localResult = this.gitManager.stageFiles(filePaths);
      
      return {
        success: true,
        staged: this.gitManager.stagedFiles,
        gitResult
      };
    } catch (error) {
      console.error('Error staging files:', error);
      return { error: error.message };
    }
  }

  /**
   * Unstage files
   */
  async unstageFiles(filePaths) {
    try {
      if (!filePaths || filePaths.length === 0) {
        return { error: 'No files to unstage' };
      }

      // Try actual git unstaging if available
      if (this.ipc?.unstage) {
        await this.ipc.unstage(this.repoPath, filePaths);
      }

      // Update local state
      const result = this.gitManager.unstageFiles(filePaths);
      
      return {
        success: true,
        working: this.gitManager.workingTreeFiles
      };
    } catch (error) {
      console.error('Error unstaging files:', error);
      return { error: error.message };
    }
  }

  /**
   * Create a commit
   */
  async createCommit(message, options = {}) {
    try {
      if (!message || message.trim().length === 0) {
        return { error: 'Commit message cannot be empty' };
      }

      if (this.gitManager.stagedFiles.length === 0) {
        return { error: 'No files staged for commit' };
      }

      // Try actual git commit if available
      let gitResult = null;
      if (this.ipc?.commit) {
        const stagedPaths = this.gitManager.stagedFiles.map(f => f.file);
        gitResult = await this.ipc.commit(this.repoPath, message, stagedPaths);
      }

      // Update local state
      const commit = this.gitManager.createCommit(message, options);

      // If push after commit is enabled
      if (options.pushAfter && this.ipc?.push) {
        await this.ipc.push(this.repoPath);
        if (commit.commit) {
          commit.commit.pushed = true;
        }
      }

      return {
        ...commit,
        gitResult
      };
    } catch (error) {
      console.error('Error creating commit:', error);
      return { error: error.message };
    }
  }

  /**
   * Push a commit to remote
   */
  async pushCommit(commitId) {
    try {
      const commit = this.gitManager.commitHistory.find(c => c.id === commitId);
      if (!commit) {
        return { error: 'Commit not found' };
      }

      // Try actual git push if available
      if (this.ipc?.push) {
        const result = await this.ipc.push(this.repoPath);
        if (result.error) {
          return result;
        }
      }

      // Mark as pushed in local state
      const result = this.gitManager.markCommitPushed(commitId);
      return {
        success: true,
        commit: result.commit
      };
    } catch (error) {
      console.error('Error pushing commit:', error);
      return { error: error.message };
    }
  }

  /**
   * Set up file watching for real-time status updates
   * Watches for file changes and refreshes git status
   */
  startWatching(repoPath, onUpdate) {
    try {
      if (!this.ipc?.watch) {
        console.warn('File watching not available');
        return;
      }

      this.ipc.watch(repoPath, (result) => {
        if (result.files) {
          this.gitManager.updateWorkingTree(result.files);
          if (onUpdate) onUpdate(this.gitManager.getState());
        }
      });
    } catch (error) {
      console.error('Error starting file watcher:', error);
    }
  }

  /**
   * Stop file watching
   */
  stopWatching() {
    if (this.ipc?.unwatch) {
      this.ipc.unwatch();
    }
  }

  /**
   * Get diff for a specific file
   */
  async getDiff(filePath) {
    try {
      if (!this.ipc?.diff) {
        return { error: 'Diff not available' };
      }
      return await this.ipc.diff(this.repoPath, filePath);
    } catch (error) {
      console.error('Error getting diff:', error);
      return { error: error.message };
    }
  }

  /**
   * Get full git state
   */
  getState() {
    return this.gitManager.getState();
  }

  /**
   * Initialize for a repository
   */
  async initialize(repoPath) {
    try {
      this.repoPath = repoPath;
      this.gitManager.setRepository(repoPath);
      
      // Get initial status
      const statusResult = await this.getStatus();
      if (statusResult.error) {
        return { error: statusResult.error };
      }

      return {
        success: true,
        state: this.gitManager.getState()
      };
    } catch (error) {
      console.error('Error initializing git handler:', error);
      return { error: error.message };
    }
  }
}

export default GitCommandHandler;