import state from './githubState.js';
import { buildTreeFromPaths, treeToFolderString, buildFilteredTree } from './githubTransformer.js';
import { renderTree } from './githubTreeRenderer.js';

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

export async function initUI(container) {
  state.recent = loadRecent();
  state.view = 'input';
  const result = await window.electronAPI.github.listSaved();
  state.savedTrees = result.success ? result.trees : [];
  container.innerHTML = getInputTemplate(state);
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

function getInputTemplate(st) {
  const recentHtml = st.recent.length > 0
    ? `<div class="ge-recent-label">Recent:</div>
       <div class="ge-recent-list">
         ${st.recent.map(r => `<div class="ge-recent-item" data-url="https://github.com/${r}">${r}</div>`).join('')}
       </div>`
    : '';

  const savedCount = st.savedTrees.length;
  const savedBtnLabel = savedCount > 0
    ? `<span>Saved Trees</span><span class="ge-saved-badge">${savedCount}</span>`
    : '<span>Saved Trees</span>';

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

        <button class="ge-btn" id="geSavedBtn">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h5l2 2h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>
          ${savedBtnLabel}
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
  const savedBtn = container.querySelector('#geSavedBtn');

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

      applyTreeResult(result, url);
      switchToTreeView(container);
    } catch (err) {
      showError(errorEl, err.message);
      state.loading = false;
      loadingEl.style.display = 'none';
    }
  });

  savedBtn.addEventListener('click', () => {
    showSavedTreesModal(container);
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
    showTreeViewer(text, state.repoName + ' (full tree)');
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
    showTreeViewer(text, state.repoName + ' (selected)');
  });
}

let _savedModal = null;

function closeSavedModal() {
  if (_savedModal) {
    if (_savedModal._keyHandler) {
      document.removeEventListener('keydown', _savedModal._keyHandler);
    }
    _savedModal.remove();
    _savedModal = null;
  }
}

function showSavedTreesModal(container) {
  closeSavedModal();

  const trees = state.savedTrees;
  const overlay = document.createElement('div');
  overlay.className = 'ge-saved-modal-overlay';
  overlay.innerHTML = `
    <div class="ge-saved-modal">
      <div class="ge-saved-modal-header">
        <div class="ge-saved-modal-title">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h5l2 2h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>
          Saved Trees
        </div>
        <span class="ge-saved-modal-count">${trees.length} repo${trees.length !== 1 ? 's' : ''}</span>
        <button class="ge-saved-modal-close-btn" title="Close (Esc)">✕</button>
      </div>
      <div class="ge-saved-modal-body">
        ${trees.length === 0
          ? '<div class="ge-saved-empty">No saved trees yet. Fetch a repository to save it automatically.</div>'
          : `<div class="ge-saved-list ge-saved-list--modal">
              ${trees.map(t => `
                <div class="ge-saved-item" data-url="${escapeAttr(t.repo_url)}">
                  <div class="ge-saved-item-info">
                    <div class="ge-saved-item-name">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h5l2 2h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>
                      ${escapeHtml(t.repo_name)}
                    </div>
                    <div class="ge-saved-item-meta">${t.total_files} files · ${escapeHtml(t.branch)} · ${escapeHtml(t.saved_at)}</div>
                  </div>
                  <div class="ge-saved-item-actions">
                    <button class="ge-saved-btn ge-saved-btn--load" data-action="load" title="Load from cache">Load</button>
                    <button class="ge-saved-btn ge-saved-btn--fetch" data-action="fetch" title="Fetch fresh from GitHub">Fetch Fresh</button>
                    <button class="ge-saved-btn ge-saved-btn--delete" data-action="delete" title="Delete from saved">
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M11 4v7.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4"/></svg>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>`}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _savedModal = overlay;

  overlay.querySelector('.ge-saved-modal-close-btn').addEventListener('click', closeSavedModal);

  const keyHandler = (e) => {
    if (e.key === 'Escape') closeSavedModal();
  };
  overlay._keyHandler = keyHandler;
  document.addEventListener('keydown', keyHandler);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSavedModal();
  });

  overlay.querySelectorAll('.ge-saved-item').forEach(item => {
    const url = item.dataset.url;

    item.querySelector('[data-action="load"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      closeSavedModal();
      const loadingEl = container.querySelector('#geLoading');
      loadingEl.style.display = 'flex';
      const result = await window.electronAPI.github.loadSaved(url);
      if (!result.success) {
        const errorEl = container.querySelector('#geError');
        showError(errorEl, result.error);
        loadingEl.style.display = 'none';
        return;
      }
      state.url = url;
      state.repoName = result.repo_name;
      state.branch = result.branch;
      state.description = result.description || '';
      state.tree = result.tree;
      state.totalFiles = result.total_files;
      state.truncated = result.truncated;
      state.loading = false;
      state.view = 'tree';
      addRecent(url);
      switchToTreeView(container);
    });

    item.querySelector('[data-action="fetch"]').addEventListener('click', (e) => {
      e.stopPropagation();
      closeSavedModal();
      const urlInput = container.querySelector('#geUrlInput');
      urlInput.value = url;
      state.url = url;
      container.querySelector('#geLoadBtn').click();
    });

    item.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.electronAPI.github.deleteSaved(url);
      state.savedTrees = state.savedTrees.filter(t => t.repo_url !== url);
      item.remove();
      const countEl = overlay.querySelector('.ge-saved-modal-count');
      if (countEl) countEl.textContent = state.savedTrees.length + ' repo' + (state.savedTrees.length !== 1 ? 's' : '');
      if (state.savedTrees.length === 0) {
        const body = overlay.querySelector('.ge-saved-modal-body');
        if (body) body.innerHTML = '<div class="ge-saved-empty">No saved trees yet. Fetch a repository to save it automatically.</div>';
      }
    });
  });
}

function applyTreeResult(result, url) {
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

  window.electronAPI.github.saveTree({
    repo_url: url,
    repo_name: result.repoName,
    branch: result.branch,
    description: result.description || '',
    total_files: result.totalFiles,
    truncated: result.truncated,
    tree_data: result.tree,
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

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let _treeViewerOverlay = null;

function closeTreeViewer() {
  if (_treeViewerOverlay) {
    if (_treeViewerOverlay._keyHandler) {
      document.removeEventListener('keydown', _treeViewerOverlay._keyHandler);
    }
    _treeViewerOverlay.remove();
    _treeViewerOverlay = null;
  }
}

function showTreeViewer(content, title) {
  closeTreeViewer();
  const overlay = document.createElement('div');
  overlay.className = 'ge-viewer-overlay';
  overlay.innerHTML = `
    <div class="ge-viewer">
      <div class="ge-viewer-header">
        <span class="ge-viewer-title">${escapeHtml(title)}</span>
        <div class="ge-viewer-actions">
          <button class="ge-viewer-btn ge-viewer-copy-btn" title="Copy to clipboard">Copy to Clipboard</button>
          <button class="ge-viewer-btn ge-viewer-close-btn" title="Close (Esc)">✕</button>
        </div>
      </div>
      <div class="ge-viewer-body">
        <textarea class="ge-viewer-content" readonly spellcheck="false" wrap="off"></textarea>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _treeViewerOverlay = overlay;
  const textarea = overlay.querySelector('.ge-viewer-content');
  textarea.value = content;
  requestAnimationFrame(() => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
  overlay.querySelector('.ge-viewer-copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(content);
      const btn = overlay.querySelector('.ge-viewer-copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 1500);
    } catch {
      textarea.select();
      document.execCommand('copy');
    }
  });
  overlay.querySelector('.ge-viewer-close-btn').addEventListener('click', closeTreeViewer);
  const keyHandler = (e) => {
    if (e.key === 'Escape') closeTreeViewer();
  };
  overlay._keyHandler = keyHandler;
  document.addEventListener('keydown', keyHandler);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeTreeViewer();
  });
}
