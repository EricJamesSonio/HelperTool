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
    this._onConnectivityReady = null; // callback when connectivity edges are loaded
    this._fileTimestamps = new Map(); // file -> last modified timestamp from watcher
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

      // Pass real watcher timestamps to updateWorkingTree for accurate session grouping
      const timestamps = this._fileTimestamps.size > 0
        ? Object.fromEntries(this._fileTimestamps)
        : null;

      this.gitManager.updateWorkingTree(result.workingFiles || [], timestamps);
      this.gitManager.updateStagedFiles(result.stagedFiles || []);

      // Prune stale timestamps (files no longer in working tree)
      if (this._fileTimestamps.size > 0 && result.workingFiles) {
        const currentFiles = new Set(result.workingFiles.map(f => f.file));
        for (const file of this._fileTimestamps.keys()) {
          if (!currentFiles.has(file)) {
            this._fileTimestamps.delete(file);
          }
        }
      }

      // Load connectivity data for smart grouping
      this.loadConnectivity();

      return result;
    } catch (error) {
      console.error('Error getting git status:', error);
      return { error: error.message };
    }
  }

  /**
   * Load connectivity edges from symbols.json for the current working tree
   */
  async loadConnectivity() {
    try {
      const files = this.gitManager.workingTreeFiles;
      if (!files || files.length === 0) {
        this.gitManager.clearConnectivity();
        return;
      }
      const filePaths = files.map(f => f.file);
      if (this.ipc?.checkConnectivity) {
        const result = await this.ipc.checkConnectivity(this.repoPath, filePaths);
        if (result?.success && Array.isArray(result.edges)) {
          this.gitManager.setConnectivityEdges(result.edges);
        } else {
          this.gitManager.clearConnectivity();
        }
      }
      if (this._onConnectivityReady) {
        this._onConnectivityReady();
      }
    } catch (_) {
      this.gitManager.clearConnectivity();
    }
  }

  /**
   * Manually trigger connectivity check (used when working tree changes externally)
   */
  async checkConnectivity(filePaths) {
    try {
      if (!this.ipc?.checkConnectivity) return { edges: [] };
      const result = await this.ipc.checkConnectivity(this.repoPath, filePaths);
      return { edges: result?.edges || [] };
    } catch (_) {
      return { edges: [] };
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
      if (this.ipc?.stage) {
        const gitResult = await this.ipc.stage(this.repoPath, filePaths);
        if (!gitResult.success) {
          return { error: gitResult.error || 'Failed to stage files' };
        }
      }

      // Update local state
      const localResult = this.gitManager.stageFiles(filePaths);
      
      return {
        success: true,
        staged: this.gitManager.stagedFiles,
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
        const gitResult = await this.ipc.unstage(this.repoPath, filePaths);
        if (!gitResult.success) {
          return { error: gitResult.error || 'Failed to unstage files' };
        }
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
      if (this.ipc?.commit) {
        const stagedPaths = this.gitManager.stagedFiles.map(f => f.file);
        const gitResult = await this.ipc.commit(this.repoPath, message, stagedPaths);
        if (!gitResult.success) {
          return { error: gitResult.error || 'Commit failed' };
        }
      }

      // Update local state
      const commit = this.gitManager.createCommit(message, options);

      // Re-sync with real git state after commit
      await this.getStatus();

      // If push after commit is enabled
      if (options.pushAfter && this.ipc?.push) {
        const pushResult = await this.ipc.push(this.repoPath);
        if (pushResult.success && commit.commit) {
          commit.commit.pushed = true;
        }
      }

      return {
        ...commit
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

  async pushAll() {
    try {
      if (this.ipc?.push) {
        const result = await this.ipc.push(this.repoPath);
        if (result.error) return result;
      }
      const result = this.gitManager.markAllPushed();
      return {
        success: true,
        count: result.count
      };
    } catch (error) {
      console.error('Error pushing all commits:', error);
      return { error: error.message };
    }
  }

  /**
   * Set up file watching for real-time status updates
   * Listens for individual file change events with OS timestamps,
   * stores them for accurate session-based grouping.
   */
  startWatching(repoPath, onUpdate) {
    try {
      if (!this.ipc?.watch) {
        console.warn('File watching not available');
        return;
      }

      this.repoPath = repoPath;

      this.ipc.watch(repoPath, (data) => {
        // data = { file: 'relative/path.js', modifiedAt: 1234567890000 }
        if (data && data.file && data.modifiedAt) {
          this._fileTimestamps.set(data.file, data.modifiedAt);
        }

        // Debounce full status refresh
        const now = Date.now();
        if (now - this.lastStatusRefresh < this.statusDebounce) return;
        this.lastStatusRefresh = now;

        // Fetch latest git status and trigger UI update
        this.getStatus().then(() => {
          if (onUpdate) onUpdate(this.gitManager.getState());
        }).catch(err => {
          console.warn('[GitCommandHandler] watcher status refresh error:', err);
        });
      });
    } catch (error) {
      console.error('Error starting file watcher:', error);
    }
  }

  /**
   * Stop file watching
   */
  stopWatching() {
    this._fileTimestamps.clear();
    if (this.ipc?.unwatch) {
      this.ipc.unwatch(this.repoPath);
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