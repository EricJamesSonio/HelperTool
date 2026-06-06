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
    this.historyViewMode = 'unpushed';
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
              <div class="stage-all-row" id="stageAllRow" style="display:none">
                <button id="stageAllBtn" class="btn btn-primary stage-all-btn">
                  <span>+</span> Stage All
                </button>
              </div>
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
              
              <!-- Commit Template Box -->
              <div class="commit-box">
                <div class="commit-form-row">
                  <label class="commit-form-label">Type</label>
                  <select id="commitType" class="commit-select">
                    <option value="">Select type…</option>
                    <option value="Feature">Feature</option>
                    <option value="Fix">Fix</option>
                    <option value="Refactor">Refactor</option>
                    <option value="Performance">Performance</option>
                    <option value="Docs">Docs</option>
                    <option value="Test">Test</option>
                    <option value="Build">Build</option>
                  </select>
                </div>
                <div class="commit-form-row">
                  <label class="commit-form-label">Module</label>
                  <input type="text" id="commitModule" class="commit-input-text" placeholder="e.g. Authentication" />
                </div>
                <div class="commit-form-row">
                  <label class="commit-form-label">Description</label>
                  <textarea id="commitDescription" class="commit-description" placeholder="- Describe your changes&#10;- Use bullet points for multiple items" rows="3"></textarea>
                </div>
                <div class="commit-files-section" id="commitFilesSection" style="display:none">
                  <div class="commit-form-label">Files Included</div>
                  <div id="commitFilesList" class="commit-files-list"></div>
                </div>
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
              <div class="panel-title-row">
                <h3 class="panel-title">
                  <span class="panel-icon">🟢</span> Commits
                </h3>
                <div class="history-view-switcher">
                  <button class="view-tab" data-view="history">History</button>
                  <button class="view-tab active" data-view="unpushed">Unpushed</button>
                </div>
              </div>
              <span class="panel-count" id="historyCount">0 commits</span>
            </div>
            <div class="panel-body">
              <div class="push-all-row" id="pushAllRow" style="display:none">
                <button id="pushAllBtn" class="btn btn-primary push-all-btn">
                  <span>↑</span> Push All Unpushed
                </button>
              </div>
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
      if (e.target.closest('.view-files-btn')) {
        this.handleViewFiles(e);
      }
      if (e.target.closest('.view-tab')) {
        this.handleViewSwitch(e);
      }
    });

    // Commit actions
    const commitBtn = this.container.querySelector('#commitBtn');
    const typeSelect = this.container.querySelector('#commitType');
    const descInput = this.container.querySelector('#commitDescription');

    const updateCommitBtn = () => {
      const hasType = typeSelect.value.trim().length > 0;
      const hasDesc = descInput.value.trim().length > 0;
      const hasStaged = this.gitManager.stagedFiles.length > 0;
      commitBtn.disabled = !(hasType && hasDesc && hasStaged);
    };

    typeSelect?.addEventListener('change', updateCommitBtn);
    descInput?.addEventListener('input', updateCommitBtn);

    commitBtn?.addEventListener('click', () => this.handleCommit());
    descInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!commitBtn.disabled) this.handleCommit();
      }
    });

    const pushAllBtn = this.container.querySelector('#pushAllBtn');
    pushAllBtn?.addEventListener('click', () => this.handlePushAll());

    const stageAllBtn = this.container.querySelector('#stageAllBtn');
    stageAllBtn?.addEventListener('click', () => this.handleStageAll());
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
   * Stage all working tree files
   */
  async handleStageAll() {
    const state = this.gitManager.getState();
    const allPaths = (state.workingTree || []).map(f => f.file);
    if (allPaths.length === 0) return;

    const btn = this.container.querySelector('#stageAllBtn');
    this.setButtonLoading(btn, true);

    const result = await this.gitHandler.stageFiles(allPaths);

    this.setButtonLoading(btn, false);

    if (result.success) {
      this.refreshUI();
      this.showSuccess(`Staged ${allPaths.length} file${allPaths.length !== 1 ? 's' : ''}`);
    } else {
      this.showError(result.error || 'Failed to stage files');
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

  setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn._origHTML = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('btn-loading');
      btn.innerHTML = '<span class="spinner"></span> ' + btn._origHTML.replace(/<span[^>]*>.*?<\/span>\s*/, '').trim();
    } else {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
      if (btn._origHTML) btn.innerHTML = btn._origHTML;
    }
  }

  /**
   * Create a commit
   */
  async handleCommit() {
    const commitBtn = this.container.querySelector('#commitBtn');
    const typeSelect = this.container.querySelector('#commitType');
    const moduleInput = this.container.querySelector('#commitModule');
    const descInput = this.container.querySelector('#commitDescription');
    const pushCheckbox = this.container.querySelector('#pushAfterCommit');
    const stagedFiles = this.gitManager.stagedFiles;

    const type = typeSelect.value.trim();
    const module = moduleInput.value.trim();
    const description = descInput.value.trim();

    if (!type) {
      this.showError('Please select a commit type');
      return;
    }
    if (!description) {
      this.showError('Please enter a description');
      return;
    }

    let message = `Type: ${type}\n`;
    if (module) message += `Module: ${module}\n`;
    message += `\nDescription:\n${description}\n\n`;
    message += `Files Included:\n`;
    stagedFiles.forEach(f => {
      message += `- ${f.file}\n`;
    });
    message = message.trim();

    this.setButtonLoading(commitBtn, true);

    const result = await this.gitHandler.createCommit(message, {
      pushAfter: pushCheckbox?.checked || false
    });

    this.setButtonLoading(commitBtn, false);

    if (result.success) {
      typeSelect.value = '';
      moduleInput.value = '';
      descInput.value = '';
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
    const btn = event.target.closest('.push-btn');
    if (!btn) return;
    const commitId = btn.dataset.commitId;
    if (!commitId) return;

    this.setButtonLoading(btn, true);

    const result = await this.gitHandler.pushCommit(commitId);

    this.setButtonLoading(btn, false);

    if (result.success) {
      this.refreshUI();
      this.showSuccess('Commit pushed successfully!');
    } else {
      this.showError(result.error || 'Failed to push commit');
    }
  }

  async handlePushAll() {
    const btn = this.container.querySelector('#pushAllBtn');
    if (!btn) return;

    this.setButtonLoading(btn, true);

    const result = await this.gitHandler.pushAll();

    this.setButtonLoading(btn, false);

    if (result.success) {
      this.refreshUI();
      this.showSuccess(`Pushed ${result.count} commit${result.count !== 1 ? 's' : ''}!`);
    } else {
      this.showError(result.error || 'Failed to push');
    }
  }

  syncViewTabs() {
    const tabs = this.container.querySelectorAll('.view-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.view === this.historyViewMode));
  }

  handleViewSwitch(event) {
    const btn = event.target.closest('.view-tab');
    if (!btn) return;
    const view = btn.dataset.view;
    if (!view || view === this.historyViewMode) return;
    this.historyViewMode = view;
    const tabs = btn.closest('.history-view-switcher').querySelectorAll('.view-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.view === view));
    this.refreshUI();
  }

  handleViewFiles(event) {
    const btn = event.target.closest('.view-files-btn');
    if (!btn) return;

    const card = btn.closest('.commit-card');
    if (!card) return;

    const filesDiv = card.querySelector('.commit-files');
    if (!filesDiv) return;

    const isHidden = filesDiv.style.display === 'none';
    filesDiv.style.display = isHidden ? 'block' : 'none';
    btn.innerHTML = isHidden ? '<span>📁</span> Hide Files' : '<span>📁</span> View Files';
  }

  /**
   * Refresh all UI panels
   */
  refreshUI() {
    const state = this.gitManager.getState();
    
    console.debug('[GitToolUI] refreshUI:', {
      historyViewMode: this.historyViewMode,
      totalCommits: state.history.length,
      unpushedCommits: state.stats.unpushed
    });
    this.syncViewTabs();
    
    // Update stats
    this.updateStats(state.stats);
    
    // Update panels
    this.renderWorkingTree(state.workingTree);
    this.renderStagedFiles(state.staged);
    this.renderCommitHistory(state.history);

    // Update commit button state
    const commitBtn = this.container.querySelector('#commitBtn');
    const typeSelect = this.container.querySelector('#commitType');
    const descInput = this.container.querySelector('#commitDescription');
    if (commitBtn && typeSelect && descInput) {
      commitBtn.disabled = !(
        typeSelect.value.trim().length > 0 &&
        descInput.value.trim().length > 0 &&
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
  const stageAllRow = this.container.querySelector('#stageAllRow');

  if (files.length === 0) {
    list.innerHTML = '<div class="empty-state">No changes</div>';
    count.textContent = '0 files';
    if (stageAllRow) stageAllRow.style.display = 'none';
    return;
  }

  count.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
  if (stageAllRow) stageAllRow.style.display = '';

  const groups = this.gitManager.getWorkingTreeGroupedByTime();

  list.innerHTML = groups.map(group => `
    <div class="time-group">
      <div class="time-group-header">
        <span class="time-group-label">${this.escapeHtml(group.label)}</span>
        <span class="time-group-count">${group.files.length} file${group.files.length !== 1 ? 's' : ''}</span>
      </div>
      ${group.files.map(file => `
        <div class="file-item working-file-item" data-file="${file.file}">
          <input type="checkbox" class="file-checkbox" data-file="${file.file}" />
          <span class="file-status-badge status-${this.getStatusClass(file.status)}">
            ${this.getStatusLabel(file.status)}
          </span>
          <span class="file-path" title="${file.file}">${this.getFileName(file.file)}</span>
          <button class="stage-btn btn-icon-small" data-file="${file.file}" title="Stage file">
            <span>→</span>
          </button>
        </div>
      `).join('')}
    </div>
  `).join('');
}

  /**
   * Render staged files
   */
  renderStagedFiles(files) {
    const list = this.container.querySelector('#stagedFilesList');
    const count = this.container.querySelector('#stagedCount');
    const filesSection = this.container.querySelector('#commitFilesSection');
    const filesList = this.container.querySelector('#commitFilesList');

    if (files.length === 0) {
      list.innerHTML = '<div class="empty-state">Select files to stage</div>';
      count.textContent = '0 files';
      if (filesSection) filesSection.style.display = 'none';
      return;
    }

    count.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    
    list.innerHTML = files.map(file => `
      <div class="file-item staged-file-item" data-file="${file.file}">
        <span class="file-status-badge status-${this.getStatusClass(file.status)}">
          ${this.getStatusLabel(file.status)}
        </span>
        <span class="file-path" title="${file.file}">${this.getFileName(file.file)}</span>
        <button class="unstage-btn btn-icon-small" data-file="${file.file}" title="Unstage file">
          <span>←</span>
        </button>
      </div>
    `).join('');

    if (filesSection && filesList) {
      filesSection.style.display = '';
      filesList.innerHTML = files.map(f => `
        <div class="commit-file-entry" title="${this.escapeHtml(f.file)}">
          <span class="file-status-badge status-${this.getStatusClass(f.status)}">${this.getStatusLabel(f.status)}</span>
          <span class="file-path">${this.escapeHtml(f.file)}</span>
        </div>
      `).join('');
    }
  }

  /**
   * Render commit history
   */
  renderCommitHistory(commits) {
    const list = this.container.querySelector('#commitHistoryList');
    const count = this.container.querySelector('#historyCount');
    const pushAllRow = this.container.querySelector('#pushAllRow');

    const isHistory = this.historyViewMode === 'history';
    const filtered = commits.filter(c => isHistory ? c.pushed : !c.pushed);
    console.debug('[GitToolUI] renderCommitHistory:', {
      total: commits.length,
      filtered: filtered.length,
      viewMode: this.historyViewMode,
      isHistory
    });

    if (pushAllRow) {
      pushAllRow.style.display = (!isHistory && filtered.length > 0) ? '' : 'none';
    }

    if (filtered.length === 0) {
      const msg = isHistory ? 'No pushed commits yet' : 'All commits are pushed';
      list.innerHTML = `<div class="empty-state">${msg}</div>`;
      count.textContent = `0 ${isHistory ? 'pushed' : 'unpushed'}`;
      return;
    }

    count.textContent = `${filtered.length} ${isHistory ? 'pushed' : 'unpushed'} commit${filtered.length !== 1 ? 's' : ''}`;
    
    list.innerHTML = filtered.map(commit => `
      <div class="commit-card" data-commit-id="${commit.id}">
        <div class="commit-header">
          <span class="commit-id">${this.getShortCommitId(commit.id)}</span>
          <span class="commit-time">${this.formatTime(commit.timestamp)}</span>
        </div>
        <div class="commit-message">${this.escapeHtml(commit.message)}</div>
        <div class="commit-actions">
          <button class="view-files-btn btn btn-small" data-commit-id="${commit.id}" title="View files">
            <span>📁</span> View Files
          </button>
          ${!commit.pushed && !isHistory ? `
            <button class="push-btn btn btn-small" data-commit-id="${commit.id}" title="Push commit">
              <span>↑</span> Push
            </button>
          ` : ''}
        </div>
        <div class="commit-files" style="display:none">
          <div class="files-count">${commit.files.length} file${commit.files.length !== 1 ? 's' : ''}</div>
          <ul class="commit-file-list">
            ${commit.files.map(f => `
              <li class="commit-file-item">
                <span class="file-status-badge status-${this.getStatusClass(f.status)}">${this.getStatusLabel(f.status)}</span>
                <span class="file-path" title="${f.file}">${this.getFileName(f.file)}</span>
              </li>
            `).join('')}
          </ul>
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
      'U': 'Unmerged',
      '?': 'Untracked'
    };
    return labels[status] || status || 'Unknown';
  }

  getStatusClass(status) {
    const s = (status || '').toLowerCase().trim();
    if (!s) return 'u';
    return s === '?' ? 'u' : s;
  }

  /**
   * Helper: Extract file name from path
   */
  getFileName(filePath) {
    if (!filePath) return '';
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

  getShortCommitId(id) {
    if (!id) return '';
    if (id.startsWith('commit_')) {
      return '#' + id.slice(-9);
    }
    return id.substring(0, 7);
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

export default GitToolUI;