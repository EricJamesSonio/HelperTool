/**
 * gitTool.js
 * Main integration module for Git Tool
 * Handles initialization and lifecycle
 */

import GitManager from './gitTool/gitManager.js';
import GitToolUI from './gitTool/gitToolUI.js';
import GitCommandHandler from './gitTool/gitCommandHandler.js';

class GitTool {
  constructor() {
    this.gitManager = new GitManager();
    this.gitCommandHandler = new GitCommandHandler(this.gitManager);
    this.gitToolUI = null;
    this.isInitialized = false;
    this.currentRepoPath = null;
  }

  /**
   * Initialize Git Tool with a repository path
   */
  async initialize(repoPath) {
    try {
      this.currentRepoPath = repoPath;

      const result = await this.gitCommandHandler.initialize(repoPath);

      if (result.error) {
        throw new Error(result.error);
      }

      this.isInitialized = true;

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