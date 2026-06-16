import state from './githubState.js';
import { buildTreeFromPaths, treeToFolderString, buildFilteredTree } from './githubTransformer.js';
import { renderTree, updateFooter } from './githubTreeRenderer.js';

const RECENT_KEY = 'githubExplorer.recent';

function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecent(repos) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(repos.slice(0, 10))); } catch {}
}

function addRecent(url) {
  const recent = loadRecent();
  const match = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (!match) return;
  const key = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
  const filtered = recent.filter(r => r !== key);
  filtered.unshift(key);
  saveRecent(filtered);
  state.recent = filtered;
}

export function initUI(container) {
  state.recent = loadRecent();
  container.innerHTML = getInputTemplate(state.recent);

  bindInputEvents(container);
  container.querySelector('#geUrlInput')?.focus();
}

export function switchToTreeView(container) {
  state.builtTree = buildTreeFromPaths(state.tree);
  state.expandedPaths = new Set();

  if (state.selectedPaths.size > 0) {
    state.selectedPaths = new Set();
  }

  container.innerHTML = getTreeTemplate(state);
  bindTreeEvents(container);
  const treeContainer = container.querySelector('#geTreeContainer');
  if (treeContainer) renderTree(treeContainer);
}

function getInputTemplate(recent) {
  const recentHtml = recent.length > 0
    ? `<div class="ge-recent-label">Recent:</div>
       <div class="ge-recent-list">
         ${recent.map(r => `<div class="ge-recent-item" data-url="https://github.com/${r}">${r}</div>`).join('')}
       </div>`
    : '';

  return `
    <div class="ge-input-view">
      <div class="ge-hero">
        <div class="ge-hero-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        </div>
        <div class="ge-hero-title">GitHub Explorer</div>
        <div class="ge-hero-sub">Paste a GitHub repo URL to browse its file tree</div>
      </div>

      <div class="ge-input-form">
        <label class="ge-field">
          <span class="ge-field-label">Repository URL</span>
          <input type="text" class="ge-input" id="geUrlInput" placeholder="https://github.com/user/repo" value="${state.url}">
        </label>

        <label class="ge-field">
          <span class="ge-field-label">GitHub Token <span class="ge-optional">(optional, for private repos)</span></span>
          <input type="password" class="ge-input" id="geTokenInput" placeholder="ghp_xxxxxxxxxxxx" value="${state.token}">
        </label>

        <button class="ge-btn ge-btn--primary" id="geLoadBtn">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h12M8 2v12"/></svg>
          Load Repository
        </button>

        <div class="ge-error" id="geError" style="display:none"></div>
        <div class="ge-loading" id="geLoading" style="display:none">
          <div class="ge-spinner"></div>
          <span>Fetching repository tree...</span>
        </div>

        ${recentHtml ? `<div class="ge-recent">${recentHtml}</div>` : ''}
      </div>
    </div>
  `;
}

function getTreeTemplate(st) {
  return `
    <div class="ge-tree-view">
      <div class="ge-tree-header">
        <button class="ge-btn ge-btn--back" id="geBackBtn">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l-5 5 5 5"/></svg>
          Back
        </button>
        <div class="ge-tree-header-info">
          <div class="ge-tree-repo-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
            ${st.repoName}
          </div>
          <div class="ge-tree-stats">${st.totalFiles} files · ${st.branch} branch</div>
        </div>
        <button class="ge-icon-btn" id="geCopyStructureBtn" title="Copy folder structure to clipboard">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="10" height="11" rx="1.5"/><path d="M7 4V3a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1"/></svg>
        </button>
      </div>

      ${st.truncated ? '<div class="ge-warning">⚠ This repository is very large. The tree may be incomplete (>100k files).</div>' : ''}

      <div class="ge-tree-toolbar">
        <input type="text" class="ge-search-input" id="geSearchInput" placeholder="Search files..." value="${st.searchQuery}">
        <button class="ge-btn ge-btn--small" id="geSelectAllBtn">Select All</button>
      </div>

      <div class="ge-tree-scroll" id="geTreeContainer"></div>

      <div class="ge-tree-footer">
        <span id="geSelectedCount">${st.selectedPaths.size} selected</span>
        <button class="ge-btn ge-btn--primary" id="geGenerateBtn" ${st.selectedPaths.size === 0 ? 'disabled' : ''}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>
          Copy Folder Structure
        </button>
      </div>
    </div>
  `;
}

function bindInputEvents(container) {
  const urlInput = container.querySelector('#geUrlInput');
  const tokenInput = container.querySelector('#geTokenInput');
  const loadBtn = container.querySelector('#geLoadBtn');
  const errorEl = container.querySelector('#geError');
  const loadingEl = container.querySelector('#geLoading');

  urlInput.addEventListener('input', () => { state.url = urlInput.value; });
  tokenInput.addEventListener('input', () => { state.token = tokenInput.value; });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadBtn.click();
  });

  loadBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      showError(errorEl, 'Please enter a GitHub repository URL');
      return;
    }

    state.loading = true;
    state.error = null;
    loadingEl.style.display = 'flex';
    errorEl.style.display = 'none';

    try {
      const result = await window.electronAPI.github.loadTree({ url, token: tokenInput.value.trim() || undefined });
      if (!result.success) {
        showError(errorEl, result.error);
        state.loading = false;
        loadingEl.style.display = 'none';
        return;
      }

      state.url = url;
      state.repoName = result.repoName;
      state.branch = result.branch;
      state.description = result.description || '';
      state.tree = result.tree;
      state.totalFiles = result.totalFiles;
      state.truncated = result.truncated;
      state.loading = false;
      state.view = 'tree';

      addRecent(url);
      switchToTreeView(container);
    } catch (err) {
      showError(errorEl, err.message);
      state.loading = false;
      loadingEl.style.display = 'none';
    }
  });

  container.querySelectorAll('.ge-recent-item').forEach(item => {
    item.addEventListener('click', () => {
      urlInput.value = item.dataset.url;
      state.url = item.dataset.url;
      loadBtn.click();
    });
  });
}

function bindTreeEvents(container) {
  container.querySelector('#geBackBtn').addEventListener('click', () => {
    state.view = 'input';
    state.tree = [];
    state.builtTree = null;
    state.selectedPaths = new Set();
    initUI(container);
  });

  container.querySelector('#geCopyStructureBtn').addEventListener('click', () => {
    const root = buildTreeFromPaths(state.tree.filter(i => i.type === 'blob'));
    const text = treeToFolderString(root, state.repoName);
    navigator.clipboard.writeText(text).then(() => {
      const btn = container.querySelector('#geCopyStructureBtn');
      const original = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4 4 8-8"/></svg>';
      setTimeout(() => { btn.innerHTML = original; }, 2000);
    });
  });

  const searchInput = container.querySelector('#geSearchInput');
  searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    filterTree(container);
  });

  container.querySelector('#geSelectAllBtn').addEventListener('click', () => {
    const visible = container.querySelectorAll('.ge-tree-row--visible, .ge-tree-row:not(.ge-tree-row--hidden)');
    fileSelectToggleAll(container, true);
  });

  container.querySelector('#geGenerateBtn').addEventListener('click', () => {
    const selected = state.selectedPaths;
    if (selected.size === 0) return;
    const root = buildFilteredTree(state.tree, selected);
    const text = treeToFolderString(root, state.repoName);
    navigator.clipboard.writeText(text).then(() => {
      const btn = container.querySelector('#geGenerateBtn');
      const original = btn.innerHTML;
      btn.innerHTML = 'Copied!';
      setTimeout(() => { btn.innerHTML = original; }, 2000);
    });
  });
}

function fileSelectToggleAll(container, select) {
  const allBlobs = state.tree.filter(i => i.type === 'blob');
  if (select) {
    for (const item of allBlobs) state.selectedPaths.add(item.path);
  } else {
    state.selectedPaths.clear();
  }
  const treeContainer = container.querySelector('#geTreeContainer');
  if (treeContainer) renderTree(treeContainer);
}

function filterTree(container) {
  const q = state.searchQuery.toLowerCase();
  const allRows = container.querySelectorAll('.ge-tree-row');
  for (const row of allRows) {
    const label = row.querySelector('.ge-tree-label');
    if (!label) continue;
    const text = label.textContent.toLowerCase();
    if (!q || text.includes(q)) {
      row.classList.remove('ge-tree-row--hidden');
      row.classList.add('ge-tree-row--visible');
    } else {
      row.classList.add('ge-tree-row--hidden');
      row.classList.remove('ge-tree-row--visible');
    }
  }
}

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}
