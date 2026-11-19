/**
 * gitTool.js
 * Main integration module for Git Tool
 * Handles initialization and lifecycle
 */

import GitManager from './gitTool/gitManager.js';
import GitToolUI from './gitTool/gitToolUI.js';
import GitCommandHandler from './gitTool/gitCommandHandler.js';
import { installPushChecks } from './gitTool/pushChecks.js';
import { installDeployTab } from './gitTool/deployTab.js';

installDeployTab(GitToolUI);

class GitTool {
  constructor() {
    this.gitManager = new GitManager();
    this.gitCommandHandler = new GitCommandHandler(this.gitManager);
    installPushChecks(this.gitCommandHandler);
    this.gitToolUI = null;
    this.isInitialized = false;
    this.currentRepoPath = null;
  }

  /**
   * Initialize Git Tool with a repository path.
   * Returns right away (from the cached snapshot when there is one);
   * the real git status loads in the background.
   */
  async initialize(repoPath) {
    try {
      this.currentRepoPath = repoPath;

      const result = await this.gitCommandHandler.initialize(repoPath);

      if (result.error) {
        throw new Error(result.error);
      }

      this.isInitialized = true;
      this._loadInitialStatus();

      console.log('Git Tool initialized for:', repoPath);

      return {
        success: true,
        state: result.state
      };

    } catch (error) {
      console.error('Error initializing Git Tool:', error);

      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Load the real git status without blocking the UI
   */
  _loadInitialStatus() {
    this.gitCommandHandler.getStatus().then((result) => {
      this.gitToolUI?.refreshUI();
      if (result && result.error) {
        this.gitToolUI?.showError(result.error);
      }
    }).catch((err) => {
      console.warn('[GitTool] initial status failed:', err);
    });
  }

  /**
   * Show loading placeholders while the first status is still on its way
   */
  _syncLoadingState(containerElement) {
    const handler = this.gitCommandHandler;
    if (handler.statusLoaded) return;
    if (handler.statusError) {
      this.gitToolUI?.showError(handler.statusError);
      return;
    }
    if (handler.fromCache) return;

    const working = containerElement.querySelector('#workingTreeList');
    if (working) working.innerHTML = '<div class="empty-state">Loading changes…</div>';
    const staged = containerElement.querySelector('#stagedFilesList');
    if (staged) staged.innerHTML = '<div class="empty-state">Loading…</div>';
  }

  /**
   * Render the Git Tool UI into a container element
   */
  async render(containerElement) {
    try {
      if (!this.isInitialized) {
        throw new Error('Git Tool not initialized. Call initialize() first.');
      }

      this.gitToolUI = new GitToolUI(
        this.gitManager,
        this.gitCommandHandler
      );

      await this.gitToolUI.render(containerElement);

      this._syncLoadingState(containerElement);
      this.startWatching();

      console.log('Git Tool UI rendered');

      return { success: true };

    } catch (error) {
      console.error('Error rendering Git Tool UI:', error);

      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Start watching the repo for file changes
   */
  startWatching() {
    if (!this.currentRepoPath) return;

    this.gitCommandHandler.startWatching(
      this.currentRepoPath,
      () => {
        this.gitToolUI?.refreshUI();
      }
    );
  }

  /**
   * Stop watching for file changes
   */
  stopWatching() {
    this.gitCommandHandler.stopWatching();
  }

  /**
   * Manually refresh git status
   */
  async refresh() {
    const result = await this.gitCommandHandler.getStatus();

    if (!result.error) {
      this.gitToolUI?.refreshUI();
    }

    return result;
  }

  /**
   * Get current git state
   */
  getState() {
    return this.gitManager.getState();
  }

  /**
   * Reset state (e.g. when switching repos)
   */
  reset() {
    this.stopWatching();

    this.gitManager.reset();

    this.isInitialized = false;
    this.currentRepoPath = null;
  }

  /**
   * Tear down the tool completely
   */
  destroy() {
    this.reset();
    this.gitToolUI = null;
  }
}

export default GitTool;