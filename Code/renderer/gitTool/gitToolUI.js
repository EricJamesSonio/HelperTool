/**
 * gitToolUI.js
 * Handles all UI rendering and event binding for the Git Tool
 * Manages the 3-panel interface: Working Tree | Staged | History
 */

class GitToolUI {
  constructor(gitManager, gitCommandHandler) {
    this.gitManager = gitManager;
    this.gitHandler = gitCommandHandler;
    this.container = null;
    this.selectedFiles = new Set();
    this.setupComplete = false;
  }

  /**
   * Initialize and render the Git Tool UI
   */
  async render(containerElement) {
    this.container = containerElement;
    this.container.innerHTML = this.getTemplate();
    this.setupEventListeners();
    this.refreshUI();
    this.setupComplete = true;
  }

  /**
   * HTML template for the 3-panel Git Tool
   */
  getTemplate() {
    return `
      <div class="git-tool-wrapper">
        <!-- Header -->
        <div class="git-header">
          <h2 class="git-title">
            <span class="git-icon">🔀</span> Git Tool
          </h2>
          <div class="git-stats">
            <span class="stat-item">
              <span class="stat-label">Working:</span>
              <span class="stat-value" id="statWorking">0</span>
            </span>
            <span class="stat-item">
              <span class="stat-label">Staged:</span>
              <span class="stat-value" id="statStaged">0</span>
            </span>
            <span class="stat-item">
              <span class="stat-label">Commits:</span>
              <span class="stat-value" id="statCommits">0</span>
            </span>
            <span class="stat-item unpushed">
              <span class="stat-label">Unpushed:</span>
              <span class="stat-value" id="statUnpushed">0</span>
            </span>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="git-content">
          <!-- LEFT PANEL: Working Tree -->
          <div class="git-panel git-panel-working">
            <div class="panel-header">
              <h3 class="panel-title">
                <span class="panel-icon">🔴</span> Working Tree
              </h3>
              <span class="panel-count" id="workingCount">0 files</span>
            </div>
            <div class="panel-body">
              <div id="workingTreeList" class="file-list">
                <div class="empty-state">No changes</div>
              </div>
            </div>
          </div>

          <!-- MIDDLE PANEL: Staged + Commit -->
          <div class="git-panel git-panel-staged">
            <div class="panel-header">
              <h3 class="panel-title">
                <span class="panel-icon">🟡</span> Staged & Commit
              </h3>
              <span class="panel-count" id="stagedCount">0 files</span>
            </div>
            <div class="panel-body">
              <div id="stagedFilesList" class="file-list">
                <div class="empty-state">Select files to stage</div>
              </div>
              
              <!-- Commit Message Box -->
              <div class="commit-box">
                <textarea
                  id="commitMessageInput"
                  class="commit-input"
                  placeholder="Type commit message…"
                  rows="4"
                ></textarea>
                <div class="commit-actions">
                  <label class="push-toggle">
                    <input type="checkbox" id="pushAfterCommit" />
                    <span>Push after commit</span>
                  </label>
                  <button id="commitBtn" class="btn btn-primary commit-btn" disabled>
                    <span class="btn-icon">✓</span> Commit
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT PANEL: Commit History -->
          <div class="git-panel git-panel-history">
            <div class="panel-header">
              <h3 class="panel-title">
                <span class="panel-icon">🟢</span> Commit History
              </h3>
              <span class="panel-count" id="historyCount">0 commits</span>
            </div>
            <div class="panel-body">
              <div id="commitHistoryList" class="commit-list">
                <div class="empty-state">No commits yet</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Working tree file selection
    this.container.addEventListener('click', (e) => {
      if (e.target.closest('.working-file-item')) {
        this.handleFileSelection(e);
      }
      if (e.target.closest('.stage-btn')) {
        this.handleStageFile(e);
      }
      if (e.target.closest('.unstage-btn')) {
        this.handleUnstageFile(e);
      }
      if (e.target.closest('.push-btn')) {
        this.handlePushCommit(e);
      }
    });

    // Commit actions
    const commitBtn = this.container.querySelector('#commitBtn');
    const commitInput = this.container.querySelector('#commitMessageInput');

    commitInput?.addEventListener('input', () => {
      const hasMessage = commitInput.value.trim().length > 0;
      const hasStaged = this.gitManager.stagedFiles.length > 0;
      commitBtn.disabled = !(hasMessage && hasStaged);
    });

    commitBtn?.addEventListener('click', () => this.handleCommit());
    commitInput?.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') this.handleCommit();
    });
  }

  /**
   * Handle file selection in working tree
   */
  handleFileSelection(event) {
    const checkbox = event.target.closest('.file-checkbox');
    if (!checkbox) return;

    const filePath = checkbox.dataset.file;
    if (checkbox.checked) {
      this.selectedFiles.add(filePath);
    } else {
      this.selectedFiles.delete(filePath);
    }
  }

  /**
   * Stage selected files
   */
  async handleStageFile(event) {
    const filePath = event.target.closest('.stage-btn').dataset.file;
    if (!filePath) return;

    const result = await this.gitHandler.stageFiles([filePath]);
    if (result.success) {
      this.refreshUI();
    } else {
      this.showError(result.error);
    }
  }

  /**
   * Unstage a file
   */
  async handleUnstageFile(event) {
    const filePath = event.target.closest('.unstage-btn').dataset.file;
    if (!filePath) return;

    const result = await this.gitHandler.unstageFiles([filePath]);
    if (result.success) {
      this.refreshUI();
    } else {
      this.showError(result.error);
    }
  }

  /**
   * Create a commit
   */
  async handleCommit() {
    const messageInput = this.container.querySelector('#commitMessageInput');
    const pushCheckbox = this.container.querySelector('#pushAfterCommit');
    const message = messageInput.value.trim();

    if (!message) {
      this.showError('Please enter a commit message');
      return;
    }

    const result = await this.gitHandler.createCommit(message, {
      pushAfter: pushCheckbox?.checked || false
    });

    if (result.success) {
      messageInput.value = '';
      pushCheckbox.checked = false;
      this.refreshUI();
      this.showSuccess('Commit created successfully!');
    } else {
      this.showError(result.error || 'Failed to create commit');
    }
  }

  /**
   * Push a specific commit
   */
  async handlePushCommit(event) {
    const commitId = event.target.closest('.push-btn').dataset.commitId;
    if (!commitId) return;

    const result = await this.gitHandler.pushCommit(commitId);
    if (result.success) {
      this.refreshUI();
      this.showSuccess('Commit pushed successfully!');
    } else {
      this.showError(result.error || 'Failed to push commit');
    }
  }

  /**
   * Refresh all UI panels
   */
  refreshUI() {
    const state = this.gitManager.getState();
    
    // Update stats
    this.updateStats(state.stats);
    
    // Update panels
    this.renderWorkingTree(state.workingTree);
    this.renderStagedFiles(state.staged);
    this.renderCommitHistory(state.history);

    // Update commit button state
    const commitBtn = this.container.querySelector('#commitBtn');
    const messageInput = this.container.querySelector('#commitMessageInput');
    if (commitBtn && messageInput) {
      commitBtn.disabled = !(
        messageInput.value.trim().length > 0 &&
        state.staged.length > 0
      );
    }
  }

  /**
   * Update header stats
   */
  updateStats(stats) {
    this.container.querySelector('#statWorking').textContent = stats.working;
    this.container.querySelector('#statStaged').textContent = stats.staged;
    this.container.querySelector('#statCommits').textContent = stats.commits;
    this.container.querySelector('#statUnpushed').textContent = stats.unpushed;
  }

  /**
   * Render working tree files
   */
  renderWorkingTree(files) {
    const list = this.container.querySelector('#workingTreeList');
    const count = this.container.querySelector('#workingCount');

    if (files.length === 0) {
      list.innerHTML = '<div class="empty-state">No changes</div>';
      count.textContent = '0 files';
      return;
    }

    count.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    
    list.innerHTML = files.map(file => `
      <div class="file-item working-file-item" data-file="${file.file}">
        <input type="checkbox" class="file-checkbox" data-file="${file.file}" />
        <span class="file-status-badge status-${file.status.toLowerCase()}">
          ${this.getStatusLabel(file.status)}
        </span>
        <span class="file-path" title="${file.file}">${this.getFileName(file.file)}</span>
        <button class="stage-btn btn-icon-small" data-file="${file.file}" title="Stage file">
          <span>→</span>
        </button>
      </div>
    `).join('');
  }

  /**
   * Render staged files
   */
  renderStagedFiles(files) {
    const list = this.container.querySelector('#stagedFilesList');
    const count = this.container.querySelector('#stagedCount');

    if (files.length === 0) {
      list.innerHTML = '<div class="empty-state">Select files to stage</div>';
      count.textContent = '0 files';
      return;
    }

    count.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    
    list.innerHTML = files.map(file => `
      <div class="file-item staged-file-item" data-file="${file.file}">
        <span class="file-status-badge status-${file.status.toLowerCase()}">
          ${this.getStatusLabel(file.status)}
        </span>
        <span class="file-path" title="${file.file}">${this.getFileName(file.file)}</span>
        <button class="unstage-btn btn-icon-small" data-file="${file.file}" title="Unstage file">
          <span>←</span>
        </button>
      </div>
    `).join('');
  }

  /**
   * Render commit history
   */
  renderCommitHistory(commits) {
    const list = this.container.querySelector('#commitHistoryList');
    const count = this.container.querySelector('#historyCount');

    if (commits.length === 0) {
      list.innerHTML = '<div class="empty-state">No commits yet</div>';
      count.textContent = '0 commits';
      return;
    }

    count.textContent = `${commits.length} commit${commits.length !== 1 ? 's' : ''}`;
    
    list.innerHTML = commits.map(commit => `
      <div class="commit-card" data-commit-id="${commit.id}">
        <div class="commit-header">
          <span class="commit-status ${commit.pushed ? 'pushed' : 'unpushed'}">
            ${commit.pushed ? '✓ Pushed' : '○ Unpushed'}
          </span>
          <span class="commit-time">${this.formatTime(commit.timestamp)}</span>
        </div>
        <div class="commit-message">${this.escapeHtml(commit.message)}</div>
        <div class="commit-files">
          <span class="files-count">${commit.files.length} file${commit.files.length !== 1 ? 's' : ''} changed</span>
        </div>
        <div class="commit-actions">
          ${!commit.pushed ? `
            <button class="push-btn btn btn-small" data-commit-id="${commit.id}" title="Push commit">
              <span>↑</span> Push
            </button>
          ` : ''}
          <button class="view-diff-btn btn btn-small" data-commit-id="${commit.id}" title="View changes">
            <span>📊</span> Diff
          </button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Helper: Get status label from git status code
   */
  getStatusLabel(status) {
    const labels = {
      'M': 'Modified',
      'A': 'Added',
      'D': 'Deleted',
      'R': 'Renamed',
      'C': 'Copied',
      'U': 'Unmerged'
    };
    return labels[status] || status;
  }

  /**
   * Helper: Extract file name from path
   */
  getFileName(filePath) {
    return filePath.split('/').pop() || filePath;
  }

  /**
   * Helper: Format timestamp to readable time
   */
  formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Helper: Escape HTML for safe rendering
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Show error notification
   */
  showError(message) {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.className = 'git-toast git-toast-error';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  /**
   * Show success notification
   */
  showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'git-toast git-toast-success';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}

module.exports = GitToolUI;