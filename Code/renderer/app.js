import { renderTree } from '../utils/treeView.js';
import {
  activeExtensions, ignoredExtensions,
  filterTree, renderFilterChips,
  renderIgnorePanel, renderFolderPanel,
  loadIgnoredExtensions, loadFolderFilters,
  setupFilterInput,
} from './filterManager.js';
import { setupSearch, invalidateFlatCache, selectSearchItem } from './searchManager.js';
import { initFeatures, getFeatures } from './featureManager.js';

let _secretHolder     = null;
let _apiTool          = null;
let _settingsManager  = null;

const selectRepoBtn      = document.getElementById('selectRepoBtn');
const activeRepoName     = document.getElementById('activeRepoName');
const treeContainer      = document.getElementById('treeContainer');
const structureBtn       = document.getElementById('structureBtn');
const codeBtn            = document.getElementById('codeBtn');
const generateBtn        = document.getElementById('generateBtn');
const progressBar        = document.getElementById('progressBar');
const progressText       = document.getElementById('progressText');
const editDocignoreBtn   = document.getElementById('editDocignoreBtn');
const selectionCount     = document.getElementById('selectionCount');
const clearSelectionBtn  = document.getElementById('clearSelectionBtn');
const refreshBtn         = document.getElementById('refreshBtn');
const secretHolderBtn    = document.getElementById('secretHolderBtn');
const viewModeBtn        = document.getElementById('viewModeBtn');
const themeToggleBtn     = document.getElementById('themeToggleBtn');
const themeIcon          = document.getElementById('themeIcon');
const themeLabel         = document.getElementById('themeLabel');
const settingsBtn        = document.getElementById('settingsBtn');
const generateSplitGroup = document.getElementById('generateSplitGroup');
const generateModeToggle = document.getElementById('generateModeToggle');
const generateModeLabel  = document.getElementById('generateModeLabel');
const rootJumper         = document.getElementById('rootJumper');

let selectedRepoPath = null;
let selectedItems    = [];
let actionType       = 'code';
let cachedTree       = null;
let viewMode         = localStorage.getItem('helpertool-viewmode') || 'list';
let generateMinified = false;

generateBtn.disabled = true;

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const debouncedSetLastSelected = debounce(
  (items) => window.electronAPI.setLastSelected(items),
  500
);

window.electronAPI.onProgressUpdate(percent => {
  progressBar.value        = percent;
  progressText.textContent = `${percent}%`;
});

// ── Root Jumper ────────────────────────────────────────────────────────────────
function renderRootJumper(tree) {
  if (!rootJumper) return;
  rootJumper.innerHTML = '';

  if (!tree || !tree.length) {
    rootJumper.style.display = 'none';
    return;
  }

  const roots = tree.filter(n => n.type === 'folder' || n.children);
  if (!roots.length) {
    rootJumper.style.display = 'none';
    return;
  }

  rootJumper.style.display = 'flex';

  const label = document.createElement('span');
  label.className   = 'root-jumper-label';
  label.textContent = 'Jump to:';
  rootJumper.appendChild(label);

  roots.forEach(node => {
    const btn = document.createElement('button');
    btn.className   = 'root-jumper-pill';
    btn.textContent = `📁 ${node.name}`;
    btn.title       = `Jump to ${node.name}`;
    btn.addEventListener('click', () => selectSearchItem(node.path));
    rootJumper.appendChild(btn);
  });
}
// ──────────────────────────────────────────────────────────────────────────────

function _applyFallbackTheme() {
  const saved = localStorage.getItem('helpertool-theme') || 'dark';
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    if (themeIcon)  themeIcon.textContent  = '🌙';
    if (themeLabel) themeLabel.textContent = 'Dark';
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (themeIcon)  themeIcon.textContent  = '☀️';
    if (themeLabel) themeLabel.textContent = 'Light';
  }
}

function _wireFallbackThemeToggle() {
  themeToggleBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next    = current === 'light' ? 'dark' : 'light';
    localStorage.setItem('helpertool-theme', next);
    _applyFallbackTheme();
  });
}

function applyViewMode(mode) {
  viewMode = mode;
  localStorage.setItem('helpertool-viewmode', mode);
  if (mode === 'tree') {
    viewModeBtn.textContent = '🌳 Tree Mode';
    viewModeBtn.className   = 'view-mode-btn active-tree';
    viewModeBtn.title       = 'Switch to List mode';
  } else {
    viewModeBtn.textContent = '☰ Roof Mode';
    viewModeBtn.className   = 'view-mode-btn active-list';
    viewModeBtn.title       = 'Switch to Tree mode';
  }
  if (cachedTree) displayTree();
}

viewModeBtn.addEventListener('click', () => applyViewMode(viewMode === 'list' ? 'tree' : 'list'));

function updateActiveRepo(name) {
  activeRepoName.textContent = name || 'No repo selected';
}

function updateSelectionCounter() {
  const count = selectedItems.length;
  selectionCount.textContent = count;
  selectionCount.parentElement.classList.toggle('has-selections', count > 0);
}

function updateGenerateState() {
  generateBtn.disabled = selectedItems.length === 0;
  updateSelectionCounter();
}

function resetSelection() {
  selectedItems.length = 0;
  window.electronAPI.setLastSelected([]);
  updateGenerateState();
}

function displayTree() {
  if (!cachedTree) {
    treeContainer.textContent = 'No data available';
    return;
  }
  const visibleTree = filterTree(cachedTree);
  renderTree(visibleTree, treeContainer, selectedItems, actionType, onTreeSelectionChange, viewMode);
}

function onTreeSelectionChange() {
  updateGenerateState();
  debouncedSetLastSelected(selectedItems);
}

async function loadRepo(repoPath, resetSel = true) {
  selectedRepoPath = repoPath;
  if (resetSel) {
    selectedItems.length = 0;
    await window.electronAPI.setLastSelected([]);
  }
  updateActiveRepo(repoPath.split(/[/\\]/).pop());
  cachedTree = await window.electronAPI.getFolderTree(repoPath);
  activeExtensions.clear();
  renderFilterChips();
  invalidateFlatCache();
  const feats = getFeatures();
  if (cachedTree) {
    renderIgnorePanel(cachedTree);
    if (feats.folderFilters) renderFolderPanel(cachedTree);
  }
  renderRootJumper(cachedTree);
  displayTree();
  updateGenerateState();
}

async function loadLastActiveRepo() {
  try {
    const project = await window.electronAPI.getActiveProject();
    if (project?.repoPath) {
      selectedItems.length = 0;
      project.lastSelectedItems?.forEach(p => selectedItems.push(p));
      await loadRepo(project.repoPath, false);
    }
  } catch (err) {
    console.error('[Init] Failed to load last project:', err);
  }
}

generateModeToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  generateSplitGroup.classList.toggle('menu-open');
});

document.addEventListener('click', (e) => {
  if (!generateSplitGroup.contains(e.target)) generateSplitGroup.classList.remove('menu-open');
});

selectRepoBtn.addEventListener('click', async () => {
  try {
    const repoPath = await window.electronAPI.selectRepo();
    if (repoPath) await loadRepo(repoPath);
  } catch (err) {
    console.error('[UI] Repo selection failed:', err);
  }
});

settingsBtn.addEventListener('click', () => {
  _settingsManager ? _settingsManager.openSettings() : console.warn('[UI] Settings not loaded');
});

refreshBtn.addEventListener('click', async () => {
  if (!selectedRepoPath) return;
  refreshBtn.classList.add('spinning');
  refreshBtn.disabled = true;
  try {
    cachedTree = await window.electronAPI.getFolderTree(selectedRepoPath);
    invalidateFlatCache();
    renderFilterChips();
    const feats = getFeatures();
    if (cachedTree) {
      renderIgnorePanel(cachedTree);
      if (feats.folderFilters) renderFolderPanel(cachedTree);
    }
    renderRootJumper(cachedTree);
    displayTree();
  } catch (err) {
    console.error('[UI] Refresh failed:', err);
  } finally {
    refreshBtn.classList.remove('spinning');
    refreshBtn.disabled = false;
  }
});

clearSelectionBtn.addEventListener('click', () => {
  selectedItems.length = 0;
  window.electronAPI.setLastSelected([]);
  updateGenerateState();
  displayTree();
});

editDocignoreBtn.addEventListener('click', async () => {
  try {
    const ok = await window.electronAPI.openGlobalDocignore();
    if (!ok) alert('Failed to open global ignore file.');
  } catch (err) {
    console.error('[UI] Error opening .docignore:', err);
  }
});

structureBtn.addEventListener('click', () => {
  actionType = 'structure';
  generateModeToggle.style.display = 'none';
  resetSelection();
  displayTree();
});

codeBtn.addEventListener('click', () => {
  actionType = 'code';
  generateModeToggle.style.display = '';
  resetSelection();
  displayTree();
});

generateBtn.addEventListener('click', async () => {
  try {
    if (!selectedRepoPath || !selectedItems.length) return alert('Select repo and items first!');
    const { filePath } = await window.electronAPI.saveFileDialog(actionType);
    if (!filePath) return;
    progressBar.value        = 0;
    progressText.textContent = '0%';
    const success = await window.electronAPI.generate(
      actionType, selectedRepoPath, selectedItems, filePath,
      actionType === 'code' ? generateMinified : false
    );
    if (!success) alert('Generation failed.');
    resetSelection();
    displayTree();
  } catch (err) {
    console.error('[Generate] Failed:', err);
    alert('Generation failed.');
  }
});

setupFilterInput(() => cachedTree, displayTree);
setupSearch(() => cachedTree, () => filterTree(cachedTree), treeContainer);

window.addEventListener('DOMContentLoaded', async () => {
  const feats = await initFeatures();
  console.log('[Init] Features:', feats);
  _applyFeatureVisibility(feats);

  if (feats.themeEngine) {
    _settingsManager = await import('./settingsManager.js');
    _settingsManager.initSettings();
    _settingsManager.hookLegacyThemeToggle();
  } else {
    _applyFallbackTheme();
    _wireFallbackThemeToggle();
    _settingsManager = { openSettings: _openLightSettings, hookLegacyThemeToggle: () => {} };
  }

  document.querySelectorAll('.generate-mode-item').forEach(item => {
    item.addEventListener('click', () => {
      const mode = item.dataset.mode;
      generateMinified = (mode === 'minified');
      generateModeLabel.textContent = generateMinified ? 'Minified' : 'Normal';
      document.querySelectorAll('.generate-mode-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      generateSplitGroup.dataset.mode = mode;
      generateSplitGroup.classList.remove('menu-open');
    });
  });

  if (feats.apiTool) {
    try {
      _apiTool = await import('./apiToolUI.js');
      await _apiTool.initApiToolUI();
      console.log('[Init] API Tool initialised');
    } catch (err) {
      console.error('[Init] API Tool failed:', err);
    }
  }

  const toolsTriggerBtn = document.getElementById('toolsTriggerBtn');
  const toolsMenu       = document.getElementById('toolsMenu');
  const apiToolBtn      = document.getElementById('apiToolBtn');

  if (feats.apiTool && toolsTriggerBtn) {
    const openToolsMenu  = () => { toolsMenu?.classList.add('open');    toolsTriggerBtn?.classList.add('open'); };
    const closeToolsMenu = () => { toolsMenu?.classList.remove('open'); toolsTriggerBtn?.classList.remove('open'); };

    toolsTriggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toolsMenu?.classList.contains('open') ? closeToolsMenu() : openToolsMenu();
    });

    document.addEventListener('click', (e) => {
      if (!document.getElementById('toolsDropdown')?.contains(e.target)) closeToolsMenu();
    });

    apiToolBtn?.addEventListener('click', () => {
      closeToolsMenu();
      if (_apiTool.isApiToolPanelOpen()) {
        _apiTool.closeApiToolPanel();
        apiToolBtn.classList.remove('active');
      } else {
        _apiTool.openApiToolPanel();
        apiToolBtn.classList.add('active');
      }
    });

    document.addEventListener('keydown', () => {
      if (!_apiTool?.isApiToolPanelOpen()) apiToolBtn?.classList.remove('active');
    });
  }

  if (feats.secretHolder) {
    try {
      _secretHolder = await import('./secretHolder.js');
      _secretHolder.initSecretHolder();
      secretHolderBtn?.addEventListener('click', async () => {
        if (_secretHolder.isSecretHolderOpen()) _secretHolder.closeSecretHolder();
        else await _secretHolder.openSecretHolder();
      });
    } catch (err) {
      console.error('[Init] Secret Holder failed:', err);
    }
  }

  await loadIgnoredExtensions();
  if (feats.folderFilters) await loadFolderFilters();
  applyViewMode(viewMode);
  await loadLastActiveRepo();
});

function _applyFeatureVisibility(feats) {
  const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
  if (!feats.apiTool)      { hide('toolsTriggerBtn'); hide('toolsDropdown'); }
  if (!feats.secretHolder) { hide('secretHolderBtn'); }
  if (!feats.folderFilters){ hide('folderToggleBtn'); hide('folderPanel'); }
}

function _openLightSettings() {
  import('./featureManager.js').then(({ getFeatures, saveFeatures }) => {
    _ensureLightSettingsModal(getFeatures, saveFeatures);
    document.getElementById('lightSettingsOverlay')?.classList.add('open');
  });
}

function _ensureLightSettingsModal(getFeatures, saveFeatures) {
  if (document.getElementById('lightSettingsOverlay')) return;

  const FEATURES_META = [
    { id: 'apiTool',       icon: '🔌', label: 'API Tool',           desc: 'Built-in API tester + Swagger import' },
    { id: 'secretHolder',  icon: '🔐', label: 'Secret Holder',      desc: 'Password-protected vault for keys & notes' },
    { id: 'themeEngine',   icon: '🎨', label: 'Full Theme Engine',   desc: '20 themes + accent pickers (reload required)' },
    { id: 'folderFilters', icon: '📁', label: 'Folder Filters',      desc: 'Ignore / Focus folder panels' },
    { id: 'swagger',       icon: '⚡', label: 'Swagger Import',      desc: 'Auto-import from OpenAPI specs' },
  ];

  const el = document.createElement('div');
  el.id = 'lightSettingsOverlay';
  el.className = 'settings-overlay';
  el.innerHTML = `
    <div class="settings-modal" role="dialog">
      <div class="settings-header">
        <span class="settings-title"><span class="settings-title-icon">⚙️</span> Manage Features</span>
        <button class="settings-close-btn" id="lsCloseBtn">✕</button>
      </div>
      <div class="settings-body">
        <div class="settings-section">
          <div class="settings-section-label">Active Features</div>
          <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 12px">
            Changes take effect on next launch. Reload the app after saving.
          </p>
          <div id="lsFeatureList" style="display:flex;flex-direction:column;gap:8px"></div>
        </div>
      </div>
      <div class="settings-footer">
        <span class="settings-saved-badge" id="lsSavedBadge">✓ Saved</span>
        <button style="margin-left:auto;padding:8px 18px;border:none;border-radius:7px;
          background:var(--accent);color:#000;font-weight:700;cursor:pointer;font-size:0.82rem"
          id="lsSaveBtn">Save &amp; Reload</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  const list = el.querySelector('#lsFeatureList');

  function renderList() {
    const current = getFeatures();
    list.innerHTML = '';
    FEATURES_META.forEach(f => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid var(--border-subtle)';
      row.innerHTML = `
        <span style="font-size:1.1rem">${f.icon}</span>
        <span style="flex:1">
          <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);display:block">${f.label}</span>
          <span style="font-size:0.74rem;color:var(--text-muted)">${f.desc}</span>
        </span>
        <input type="checkbox" id="ls-${f.id}" ${current[f.id] ? 'checked' : ''}
          style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)"/>
      `;
      list.appendChild(row);
    });
  }
  renderList();

  el.querySelector('#lsCloseBtn').addEventListener('click', () => el.classList.remove('open'));
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });

  el.querySelector('#lsSaveBtn').addEventListener('click', async () => {
    const updated = {};
    FEATURES_META.forEach(f => {
      updated[f.id] = !!el.querySelector(`#ls-${f.id}`)?.checked;
    });
    await saveFeatures(updated);
    const badge = el.querySelector('#lsSavedBadge');
    badge.classList.add('visible');
    setTimeout(() => { badge.classList.remove('visible'); location.reload(); }, 900);
  });
}