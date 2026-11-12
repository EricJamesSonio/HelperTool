/**
 * gitToolUI.js
 * Handles all UI rendering and event binding for the Git Tool
 * Manages the top navigation (Git | Branches | Inspect) and the 3-panel Git view:
 * Working Tree | Staged | History
 */

import * as branchManager from './branchManager.js';
import * as inspectPanel from './inspectPanel.js';
import { mountPushChecksToggle } from './pushChecks.js';


const ICON_GIT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="4" r="2"/><circle cx="15" cy="16" r="2"/><path d="M5 6v8a4 4 0 0 0 4 4h6"/></svg>';
const ICON_FILE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4a2 2 0 0 1 2-2h4.5L15 7.5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M10.5 2v5.5H16"/></svg>';
const ICON_STAGED = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="12" height="15" rx="2"/><path d="M8 1v4h4V1"/><path d="m7 11 2 2 4-4"/></svg>';
const ICON_HISTORY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l3 3"/></svg>';
const ICON_FOLDER = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10 4 4 8-8"/></svg>';
const ICON_ARROW_RIGHT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10h10"/><path d="m10 5 5 5-5 5"/></svg>';
const ICON_ARROW_LEFT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10H5"/><path d="m10 5-5 5 5 5"/></svg>';
const ICON_ARROW_UP = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15V5"/><path d="m5 10 5-5 5 5"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12"/><path d="M4 10h12"/><path d="M4 14h12"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v12"/><path d="M4 10h12"/></svg>';
const ICON_BRANCH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="6" y2="16"/><line x1="14" y1="4" x2="14" y2="16"/><polyline points="6,4 14,4"/><polyline points="6,16 14,16"/></svg>';
const ICON_INSPECT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 4 4"/></svg>';

const VIEW_ORDER = ['git', 'branches', 'inspect'];

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
};

let activeUI = null;

if (typeof document !== 'undefined') {
  inspectPanel.ensureStyles();
}

class GitToolUI {
  constructor(gitManager, gitCommandHandler) {
    this.gitManager = gitManager;
    this.gitHandler = gitCommandHandler;
    this.container = null;
    this.selectedFiles = new Set();
    this.setupComplete = false;
    this.historyViewMode = 'unpushed';
    this._view = 'git';
    this._savedContent = null;
    this._savedForm = null;
    this._suppressClose = false;
  }

  /**
   * Initialize and render the Git Tool UI
   */
  async render(containerElement) {
    activeUI = this;
    this._resetViews();
    this.container = containerElement;
    this.container.innerHTML = this.getTemplate();
    this.setupEventListeners();
    this.refreshUI();
    this._syncNav();
    this.setupComplete = true;
    mountPushChecksToggle(this.container);
    // When connectivity data finishes loading from symbols.json, re-render with smart splits
    this.gitHandler._onConnectivityReady = () => this.refreshUI();
  }

  /**
   * HTML template: top navigation + the 3-panel Git view
   */
  getTemplate() {
    return `
      <div class="git-tool-wrapper">
        <!-- Header: stats | navigation | session -->
        <div class="git-header git-topbar">
          <div class="git-topbar-left">
            <span class="git-stats-compact" id="gitStatsCompact"></span>
          </div>

          <nav class="git-nav" id="gitNav" data-active="git" role="tablist" aria-label="Git Tool sections">
            <button type="button" class="git-nav-tab active" role="tab" aria-selected="true" tabindex="0" data-view="git" title="Working tree, staging and commits">
              <span class="git-nav-icon">${ICON_GIT}</span>
              <span class="git-nav-label">Git</span>
            </button>
            <button type="button" class="git-nav-tab" role="tab" aria-selected="false" tabindex="-1" data-view="branches" title="Manage branches">
              <span class="git-nav-icon">${ICON_BRANCH}</span>
              <span class="git-nav-label">Branches</span>
            </button>
            <button type="button" class="git-nav-tab" role="tab" aria-selected="false" tabindex="-1" data-view="inspect" title="Browse the history of a branch and copy files as they were at a commit">
              <span class="git-nav-icon">${ICON_INSPECT}</span>
              <span class="git-nav-label">Inspect</span>
            </button>
          </nav>

          <div class="git-topbar-right">
            <span class="gap-selector-wrapper" id="gapSelectorWrap" title="Session threshold - inactivity gap creates a new group">
              <span class="gap-label">Session:</span>
              <select id="gapSelector" class="gap-selector">
                <option value="60000">1m</option>
                <option value="180000">3m</option>
                <option value="300000" selected>5m</option>
                <option value="600000">10m</option>
                <option value="900000">15m</option>
              </select>
            </span>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="git-content">
          <!-- LEFT PANEL: Working Tree -->
          <div class="git-panel git-panel-working">
            <div class="panel-header">
              <h3 class="panel-title">
                <span class="panel-icon">${ICON_FILE}</span> Working Tree
              </h3>
              <span class="panel-count" id="workingCount">0 files</span>
            </div>
            <div class="panel-body">
              <div class="stage-all-row" id="stageAllRow" style="display:none">
                <button id="stageAllBtn" class="btn btn-primary stage-all-btn">
                  <span class="btn-icon">${ICON_PLUS}</span> Stage All
                </button>
                <button id="commitAllBtn" class="btn btn-primary stage-all-btn" style="margin-top:4px">
                  <span class="btn-icon">${ICON_CHECK}</span> Commit All Groups
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
                <span class="panel-icon">${ICON_STAGED}</span> Staged & Commit
              </h3>
              <span class="panel-count" id="stagedCount">0 files</span>
            </div>
            <div class="panel-body">
              <div class="unstage-all-row" id="unstageAllRow" style="display:none">
                <button id="unstageAllBtn" class="btn btn-primary unstage-all-btn">
                  <span class="btn-icon">${ICON_ARROW_LEFT}</span> Unstage All
                </button>
              </div>
              <div id="stagedFilesList" class="file-list">
                <div class="empty-state">Select files to stage</div>
              </div>

              <!-- Commit Template Box -->
              <div class="commit-box">
                <div class="commit-template-toggle">
                  <button id="useTemplateBtn" class="commit-toggle-btn" title="Toggle commit template">
                    <span class="toggle-icon">${ICON_MENU}</span>
                    <span class="toggle-label">Use Template</span>
                  </button>
                </div>

                <!-- Free-form commit message -->
                <div id="commitFreeForm" class="commit-free-form">
                  <textarea
                    id="commitMessageInput"
                    class="commit-input"
                    placeholder="Type commit message…"
                    rows="4"
                  ></textarea>
                </div>

                <!-- Structured template form -->
                <div id="commitTemplateForm" class="commit-template-form" style="display:none">
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
                </div>

                <div class="commit-actions">
                  <label class="push-toggle">
                    <input type="checkbox" id="pushAfterCommit" />
                    <span>Push after commit</span>
                  </label>
                  <button id="commitBtn" class="btn btn-primary commit-btn" disabled>
                    <span class="btn-icon">${ICON_CHECK}</span> Commit
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
                  <span class="panel-icon">${ICON_HISTORY}</span> Commits
                </h3>
                <div class="history-view-switcher">
                  <button class="view-tab" data-view="history">History</button>
                  <button class="view-tab active" data-view="unpushed">Unpushed</button>
                </div>
                <span class="git-current-branch" id="currentBranchLabel"></span>
              </div>
              <span class="panel-count" id="historyCount">0 commits</span>
            </div>
            <div class="panel-body">
              <div class="set-upstream-row" id="setUpstreamRow" style="display:none">
                <button id="setUpstreamBtn" class="btn btn-primary push-all-btn">
                  <span class="btn-icon">${ICON_ARROW_UP}</span> Set upstream
                </button>
              </div>
              <div class="push-all-row" id="pushAllRow" style="display:none">
                <button id="pushAllBtn" class="btn btn-primary push-all-btn">
                  <span class="btn-icon">${ICON_ARROW_UP}</span> Push All Unpushed
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
    this.container.addEventListener('click', (e) => {
      const navTab = e.target.closest('.git-nav-tab');
      if (navTab) {
        if (activeUI === this) this.setView(navTab.dataset.view);
        return;
      }
      if (e.target.closest('.working-file-item')) {
        this.handleFileSelection(e);
      }
      if (e.target.closest('.stage-btn')) {
        this.handleStageFile(e);
      }
      if (e.target.closest('.stage-group-btn')) {
        this.handleStageGroup(e);
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

    this.container.addEventListener('keydown', (e) => {
      if (activeUI !== this) return;
      const tab = e.target.closest ? e.target.closest('.git-nav-tab') : null;
      if (!tab) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const index = VIEW_ORDER.indexOf(this._view);
      const step = e.key === 'ArrowRight' ? 1 : VIEW_ORDER.length - 1;
      const next = VIEW_ORDER[(index + step) % VIEW_ORDER.length];
      this.setView(next);
      const selector = '.git-nav-tab[data-view=' + next + ']';
      const target = this.container.querySelector(selector);
      if (target) target.focus();
    });

    // Gap threshold selector
    const gapSelector = this.container.querySelector('#gapSelector');
    gapSelector?.addEventListener('change', () => {
      const val = parseInt(gapSelector.value);
      if (!isNaN(val)) {
        this.gitManager.setGroupThreshold(val);
        this.refreshUI();
      }
    });

    this._bindDirectListeners();
  }

  _bindDirectListeners() {
    const commitBtn = this.container.querySelector('#commitBtn');
    const freeForm = this.container.querySelector('#commitFreeForm');
    const templateForm = this.container.querySelector('#commitTemplateForm');
    const toggleBtn = this.container.querySelector('#useTemplateBtn');
    const messageInput = this.container.querySelector('#commitMessageInput');
    const typeSelect = this.container.querySelector('#commitType');
    const descInput = this.container.querySelector('#commitDescription');

    let useTemplate = toggleBtn?.classList.contains('active') || false;

    const updateCommitBtn = () => {
      const hasStaged = this.gitManager.stagedFiles.length > 0;
      const btn = this.container.querySelector('#commitBtn');
      if (!btn) return;
      if (useTemplate) {
        const typeEl = this.container.querySelector('#commitType');
        const descEl = this.container.querySelector('#commitDescription');
        const hasType = (typeEl?.value || '').trim().length > 0;
        const hasDesc = (descEl?.value || '').trim().length > 0;
        btn.disabled = !(hasType && hasDesc && hasStaged);
      } else {
        const msgEl = this.container.querySelector('#commitMessageInput');
        const hasMessage = (msgEl?.value || '').trim().length > 0;
        btn.disabled = !(hasMessage && hasStaged);
      }
    };

    toggleBtn?.addEventListener('click', () => {
      useTemplate = !useTemplate;
      toggleBtn.classList.toggle('active', useTemplate);
      if (freeForm && templateForm) {
        freeForm.style.display = useTemplate ? 'none' : '';
        templateForm.style.display = useTemplate ? '' : 'none';
      }
      updateCommitBtn();
    });

    messageInput?.addEventListener('input', updateCommitBtn);
    typeSelect?.addEventListener('change', updateCommitBtn);
    descInput?.addEventListener('input', updateCommitBtn);

    commitBtn?.addEventListener('click', () => this.handleCommit());

    const pushAllBtn = this.container.querySelector('#pushAllBtn');
    pushAllBtn?.addEventListener('click', () => this.handlePushAll());

    const setUpstreamBtn = this.container.querySelector('#setUpstreamBtn');
    setUpstreamBtn?.addEventListener('click', () => this.handleSetUpstream());

    const stageAllBtn = this.container.querySelector('#stageAllBtn');
    stageAllBtn?.addEventListener('click', () => this.handleStageAll());

    const commitAllBtn = this.container.querySelector('#commitAllBtn');
    commitAllBtn?.addEventListener('click', () => this.handleCommitAll());

    const unstageAllBtn = this.container.querySelector('#unstageAllBtn');
    unstageAllBtn?.addEventListener('click', () => this.handleUnstageAll());
  }

  /**
   * Switch between Git, Branches and Inspect
   */
  setView(view) {
    if (!this.container || !VIEW_ORDER.includes(view)) return;
    if (view === this._view) return;

    const bodyEl = this.container.querySelector('.git-content');
    if (!bodyEl) return;

    const previous = this._view;

    if (previous === 'branches') {
      if (branchManager.isOpen()) {
        this._suppressClose = true;
        try {
          branchManager.close();
        } finally {
          this._suppressClose = false;
        }
      }
    } else if (previous === 'inspect') {
      inspectPanel.close();
    } else if (previous === 'git') {
      this._savedForm = this._captureFormState();
      this._savedContent = bodyEl.innerHTML;
    }

    this._view = view;

    if (view === 'git') {
      if (this._savedContent !== null) {
        bodyEl.innerHTML = this._savedContent;
        this._savedContent = null;
      }
      this._bindDirectListeners();
      this._restoreFormState(this._savedForm);
      this._savedForm = null;
      this._syncNav();
      this.refreshUI();
      return;
    }

    if (view === 'branches') {
      branchManager.open(bodyEl, this.gitHandler.repoPath, () => {
        if (activeUI !== this || this._suppressClose || this._view !== 'branches') return;
        this.setView('git');
      });
    } else {
      inspectPanel.open(bodyEl, this.gitHandler.repoPath);
    }

    this._syncNav();
  }

  _resetViews() {
    this._suppressClose = true;
    try {
      if (inspectPanel.isOpen()) inspectPanel.close();
      if (branchManager.isOpen()) branchManager.close();
    } finally {
      this._suppressClose = false;
    }
    this._view = 'git';
    this._savedContent = null;
    this._savedForm = null;
  }

  _syncNav() {
    if (!this.container) return;
    const nav = this.container.querySelector('#gitNav');
    if (nav) nav.dataset.active = this._view;

    this.container.querySelectorAll('.git-nav-tab').forEach((tab) => {
      const on = tab.dataset.view === this._view;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });

    const gapWrap = this.container.querySelector('#gapSelectorWrap');
    if (gapWrap) gapWrap.classList.toggle('git-topbar-faded', this._view !== 'git');
  }

  _captureFormState() {
    const read = (selector, prop) => {
      const el = this.container.querySelector(selector);
      return el ? el[prop] : null;
    };
    return {
      message: read('#commitMessageInput', 'value'),
      type: read('#commitType', 'value'),
      module: read('#commitModule', 'value'),
      description: read('#commitDescription', 'value'),
      push: read('#pushAfterCommit', 'checked'),
    };
  }

  _restoreFormState(form) {
    if (!form) return;
    const write = (selector, prop, value) => {
      const el = this.container.querySelector(selector);
      if (el && value !== null && value !== undefined) el[prop] = value;
    };
    write('#commitMessageInput', 'value', form.message);
    write('#commitType', 'value', form.type);
    write('#commitModule', 'value', form.module);
    write('#commitDescription', 'value', form.description);
    write('#pushAfterCommit', 'checked', form.push);
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
    console.debug('[GitToolUI] Stage All:', { workingCount: state.workingTree.length, paths: allPaths });
    if (allPaths.length === 0) return;

    const btn = this.container.querySelector('#stageAllBtn');
    this.setButtonLoading(btn, true);

    const result = await this.gitHandler.stageFiles(allPaths);

    this.setButtonLoading(btn, false);

    if (result.success) {
      this.refreshUI();
      this.showSuccess('Staged ' + allPaths.length + ' file' + (allPaths.length !== 1 ? 's' : ''));
    } else {
      console.debug('[GitToolUI] Stage All failed:', result.error);
      this.showError(result.error || 'Failed to stage files');
    }
  }

  /**
   * Commit all smart groups - one commit per group with auto-generated messages
   */
  async handleCommitAll() {
    const btn = this.container.querySelector('#commitAllBtn');
    if (!btn) return;

    this.setButtonLoading(btn, true);

    const result = await this.gitHandler.commitAllGroups();

    this.setButtonLoading(btn, false);

    if (result.error) {
      this.showError(result.error);
      return;
    }

    this.refreshUI();

    if (result.failed > 0) {
      this.showError('Committed ' + result.succeeded + '/' + result.total + ' groups (' + result.failed + ' failed)');
    } else {
      this.showSuccess('Committed ' + result.succeeded + ' group' + (result.succeeded !== 1 ? 's' : ''));
    }
  }

  /**
   * Stage all files in a smart group
   */
  async handleStageGroup(event) {
    const btn = event.target.closest('.stage-group-btn');
    if (!btn) return;
    const groupIndex = parseInt(btn.dataset.groupIndex);
    if (isNaN(groupIndex)) return;

    const groups = this.gitManager.getSmartGroups();
    const group = groups[groupIndex];
    if (!group) return;

    const filePaths = group.files.map(f => f.file);
    if (filePaths.length === 0) return;

    this.setButtonLoading(btn, true);
    const result = await this.gitHandler.stageFiles(filePaths);
    this.setButtonLoading(btn, false);

    if (result.success) {
      this.refreshUI();
      this.showSuccess('Staged ' + filePaths.length + ' file' + (filePaths.length !== 1 ? 's' : '') + ' from group');
    } else {
      this.showError(result.error || 'Failed to stage group');
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

  async handleUnstageAll() {
    const state = this.gitManager.getState();
    const allPaths = (state.staged || []).map(f => f.file);
    if (allPaths.length === 0) return;

    const btn = this.container.querySelector('#unstageAllBtn');
    this.setButtonLoading(btn, true);

    const result = await this.gitHandler.unstageFiles(allPaths);

    this.setButtonLoading(btn, false);

    if (result.success) {
      this.refreshUI();
      this.showSuccess('Unstaged ' + allPaths.length + ' file' + (allPaths.length !== 1 ? 's' : ''));
    } else {
      this.showError(result.error || 'Failed to unstage files');
    }
  }

  setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn._origHTML = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('btn-loading');
      const label = btn._origHTML.replace(/<span[^>]*>.*?<\/span>\s*/, '').trim();
      btn.innerHTML = '<span class="spinner"></span> ' + label;
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
    const toggleBtn = this.container.querySelector('#useTemplateBtn');
    const messageInput = this.container.querySelector('#commitMessageInput');
    const typeSelect = this.container.querySelector('#commitType');
    const moduleInput = this.container.querySelector('#commitModule');
    const descInput = this.container.querySelector('#commitDescription');
    const pushCheckbox = this.container.querySelector('#pushAfterCommit');
    const stagedFiles = this.gitManager.stagedFiles;
    const useTemplate = toggleBtn?.classList.contains('active');

    let message;

    if (useTemplate) {
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

      message = 'Type: ' + type + '\n';
      if (module) message += 'Module: ' + module + '\n';
      message += '\nDescription:\n' + description + '\n\n';
      message += 'Files Included:\n';
      stagedFiles.forEach(f => {
        message += '- ' + f.file + '\n';
      });
      message = message.trim();
    } else {
      message = messageInput.value.trim();
      if (!message) {
        this.showError('Please enter a commit message');
        return;
      }
    }

    this.setButtonLoading(commitBtn, true);

    const result = await this.gitHandler.createCommit(message, {
      pushAfter: pushCheckbox?.checked || false
    });

    this.setButtonLoading(commitBtn, false);

    if (result.success) {
      if (useTemplate) {
        typeSelect.value = '';
        moduleInput.value = '';
        descInput.value = '';
      } else {
        messageInput.value = '';
      }
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
      this.showSuccess('Pushed ' + result.count + ' commit' + (result.count !== 1 ? 's' : '') + '!');
    } else {
      this.showError(result.error || 'Failed to push');
    }
  }

  async handleSetUpstream() {
    const btn = this.container.querySelector('#setUpstreamBtn');
    if (!btn) return;

    this.setButtonLoading(btn, true);

    const result = await this.gitHandler.pushSetUpstream();

    this.setButtonLoading(btn, false);

    if (result.success) {
      this.refreshUI();
      this.showSuccess('Upstream set for origin/' + this.gitHandler.currentBranch + ' - pushed successfully!');
    } else {
      this.showError(result.error || 'Failed to set upstream');
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
    const folderIcon = '<span class="btn-icon">' + ICON_FOLDER + '</span>';
    btn.innerHTML = isHidden ? folderIcon + ' Hide Files' : folderIcon + ' View Files';
  }

  /**
   * Refresh all UI panels
   */
  refreshUI() {
    if (!this.container) return;
    const state = this.gitManager.getState();

    // Sync gap selector value with manager state
    const gapSelector = this.container.querySelector('#gapSelector');
    if (gapSelector) {
      gapSelector.value = String(this.gitManager.groupThresholdMs);
    }

    // Update stats
    this.updateStats(state.stats);

    if (this._view !== 'git') return;

    console.debug('[GitToolUI] refreshUI:', {
      historyViewMode: this.historyViewMode,
      totalCommits: state.history.length,
      unpushedCommits: state.stats.unpushed
    });

    this.syncViewTabs();

    // Update panels
    this.renderWorkingTree(state.workingTree);
    this.renderStagedFiles(state.staged);
    this.renderCommitHistory(state.history);

    // Update commit button state
    const commitBtn = this.container.querySelector('#commitBtn');
    const toggleBtn = this.container.querySelector('#useTemplateBtn');
    const messageInput = this.container.querySelector('#commitMessageInput');
    const typeSelect = this.container.querySelector('#commitType');
    const descInput = this.container.querySelector('#commitDescription');
    if (commitBtn) {
      const useTemplate = toggleBtn?.classList.contains('active');
      const hasStaged = state.staged.length > 0;
      if (useTemplate) {
        const hasType = typeSelect.value.trim().length > 0;
        const hasDesc = descInput.value.trim().length > 0;
        commitBtn.disabled = !(hasType && hasDesc && hasStaged);
      } else {
        const hasMessage = messageInput.value.trim().length > 0;
        commitBtn.disabled = !(hasMessage && hasStaged);
      }
    }

    // Update branch label and upstream button
    const branchLabel = this.container.querySelector('#currentBranchLabel');
    const setUpstreamRow = this.container.querySelector('#setUpstreamRow');
    if (branchLabel) {
      branchLabel.textContent = this.gitHandler.currentBranch || '';
    }
    if (setUpstreamRow && this.gitHandler.currentBranch) {
      const setUpstreamBtn = this.container.querySelector('#setUpstreamBtn');
      if (setUpstreamBtn) {
        setUpstreamBtn.innerHTML = '<span class="btn-icon">' + ICON_ARROW_UP + '</span> Set upstream origin/' + this.escapeHtml(this.gitHandler.currentBranch);
      }
      this.gitHandler.checkUpstream().then(result => {
        setUpstreamRow.style.display = !result.hasUpstream ? '' : 'none';
      }).catch(() => {
        setUpstreamRow.style.display = '';
      });
    } else if (setUpstreamRow) {
      setUpstreamRow.style.display = 'none';
    }
  }

  /**
   * Update header stats (compact inline format)
   */
  updateStats(stats) {
    const el = this.container.querySelector('#gitStatsCompact');
    if (!el) return;
    const parts = [];
    if (stats.working) parts.push(stats.working + ' working');
    if (stats.staged) parts.push(stats.staged + ' staged');
    parts.push(stats.commits + ' commits');
    if (stats.unpushed) parts.push(stats.unpushed + ' unpushed');
    el.textContent = parts.join(' · ');
  }

  /**
   * One file row of the working tree
   */
  _workingFileHtml(file) {
    const status = this.getStatusClass(file.status);
    const label = this.getStatusLabel(file.status);
    return (
      '<div class="file-item working-file-item" data-file="' + file.file + '">' +
      '<input type="checkbox" class="file-checkbox" data-file="' + file.file + '" />' +
      '<span class="file-status-badge status-' + status + '">' + label + '</span>' +
      '<span class="file-path" title="' + file.file + '">' + this.escapeHtml(file.file) + '</span>' +
      '<button class="stage-btn btn-icon-small" data-file="' + file.file + '" title="Stage file">' + ICON_ARROW_RIGHT + '</button>' +
      '</div>'
    );
  }

  /**
   * One smart group of the working tree
   */
  _workingGroupHtml(group, idx) {
    const count = group.files.length;
    const countText = count + ' file' + (count !== 1 ? 's' : '');
    const rows = group.files.map((file) => this._workingFileHtml(file)).join('');
    return (
      '<div class="smart-group">' +
      '<div class="smart-group-header">' +
      '<span class="smart-group-label">' + this.escapeHtml(group.label) + '</span>' +
      '<div class="smart-group-actions">' +
      '<span class="smart-group-count">' + countText + '</span>' +
      '<button class="stage-group-btn" data-group-index="' + idx + '" title="Stage all files in this group">' +
      ICON_PLUS + ' Stage All</button>' +
      '</div>' +
      '</div>' +
      rows +
      '</div>'
    );
  }

  /**
   * Render working tree files
   */
  renderWorkingTree(files) {
    const list = this.container.querySelector('#workingTreeList');
    const count = this.container.querySelector('#workingCount');
    const stageAllRow = this.container.querySelector('#stageAllRow');

    if (!list || !count) return;

    if (files.length === 0) {
      list.innerHTML = '<div class="empty-state">No changes</div>';
      count.textContent = '0 files';
      if (stageAllRow) stageAllRow.style.display = 'none';
      return;
    }

    count.textContent = files.length + ' file' + (files.length !== 1 ? 's' : '');
    if (stageAllRow) stageAllRow.style.display = '';

    const groups = this.gitManager.getSmartGroups();
    list.innerHTML = groups.map((group, idx) => this._workingGroupHtml(group, idx)).join('');
  }

  /**
   * Render staged files
   */
  renderStagedFiles(files) {
    const list = this.container.querySelector('#stagedFilesList');
    const count = this.container.querySelector('#stagedCount');
    const filesSection = this.container.querySelector('#commitFilesSection');
    const filesList = this.container.querySelector('#commitFilesList');
    const unstageAllRow = this.container.querySelector('#unstageAllRow');

    if (!list || !count) return;

    if (files.length === 0) {
      list.innerHTML = '<div class="empty-state">Select files to stage</div>';
      count.textContent = '0 files';
      if (filesSection) filesSection.style.display = 'none';
      if (unstageAllRow) unstageAllRow.style.display = 'none';
      return;
    }

    count.textContent = files.length + ' file' + (files.length !== 1 ? 's' : '');
    if (unstageAllRow) unstageAllRow.style.display = '';

    list.innerHTML = files.map((file) => {
      return (
        '<div class="file-item staged-file-item" data-file="' + file.file + '">' +
        '<span class="file-status-badge status-' + this.getStatusClass(file.status) + '">' + this.getStatusLabel(file.status) + '</span>' +
        '<span class="file-path" title="' + file.file + '">' + this.getFileName(file.file) + '</span>' +
        '<button class="unstage-btn btn-icon-small" data-file="' + file.file + '" title="Unstage file">' + ICON_ARROW_LEFT + '</button>' +
        '</div>'
      );
    }).join('');

    if (filesSection && filesList) {
      filesSection.style.display = '';
      filesList.innerHTML = files.map((f) => {
        return (
          '<div class="commit-file-entry" title="' + this.escapeHtml(f.file) + '">' +
          '<span class="file-status-badge status-' + this.getStatusClass(f.status) + '">' + this.getStatusLabel(f.status) + '</span>' +
          '<span class="file-path">' + this.escapeHtml(f.file) + '</span>' +
          '</div>'
        );
      }).join('');
    }
  }

  /**
   * One file line inside a commit card
   */
  _commitFileHtml(f) {
    return (
      '<li class="commit-file-item">' +
      '<span class="file-status-badge status-' + this.getStatusClass(f.status) + '">' + this.getStatusLabel(f.status) + '</span>' +
      '<span class="file-path" title="' + f.file + '">' + this.getFileName(f.file) + '</span>' +
      '</li>'
    );
  }

  /**
   * One commit card
   */
  _commitCardHtml(commit, isHistory) {
    const fileCount = commit.files.length;
    const fileCountText = fileCount + ' file' + (fileCount !== 1 ? 's' : '');
    const showPush = !commit.pushed && !isHistory;
    const pushButton = showPush
      ? '<button class="push-btn btn btn-small" data-commit-id="' + commit.id + '" title="Push commit">' +
        '<span class="btn-icon">' + ICON_ARROW_UP + '</span> Push</button>'
      : '';
    const fileRows = commit.files.map((f) => this._commitFileHtml(f)).join('');
    return (
      '<div class="commit-card" data-commit-id="' + commit.id + '">' +
      '<div class="commit-header">' +
      '<span class="commit-id">' + this.getShortCommitId(commit.id) + '</span>' +
      '<span class="commit-time">' + this.formatTime(commit.timestamp) + '</span>' +
      '</div>' +
      '<div class="commit-message">' + this.escapeHtml(commit.message) + '</div>' +
      '<div class="commit-actions">' +
      '<button class="view-files-btn btn btn-small" data-commit-id="' + commit.id + '" title="View files">' +
      '<span class="btn-icon">' + ICON_FOLDER + '</span> View Files</button>' +
      pushButton +
      '</div>' +
      '<div class="commit-files" style="display:none">' +
      '<div class="files-count">' + fileCountText + '</div>' +
      '<ul class="commit-file-list">' + fileRows + '</ul>' +
      '</div>' +
      '</div>'
    );
  }

  /**
   * Render commit history
   */
  renderCommitHistory(commits) {
    const list = this.container.querySelector('#commitHistoryList');
    const count = this.container.querySelector('#historyCount');
    const pushAllRow = this.container.querySelector('#pushAllRow');

    if (!list || !count) return;

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

    const kind = isHistory ? 'pushed' : 'unpushed';

    if (filtered.length === 0) {
      const msg = isHistory ? 'No pushed commits yet' : 'All commits are pushed';
      list.innerHTML = '<div class="empty-state">' + msg + '</div>';
      count.textContent = '0 ' + kind;
      return;
    }

    count.textContent = filtered.length + ' ' + kind + ' commit' + (filtered.length !== 1 ? 's' : '');
    list.innerHTML = filtered.map((commit) => this._commitCardHtml(commit, isHistory)).join('');
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
    return String(text === null || text === undefined ? '' : text).replace(/[&<>"']/g, (m) => HTML_ESCAPES[m]);
  }

  restoreContent() {
    this.setView('git');
  }

  /**
   * Show error notification
   */
  showError(message) {
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