let _overlay = null;
let _open = false;
let _globalRules = [];
let _repoRules = [];
let _filterType = 'all';
let _filterText = '';
let _dirty = false;

const ICON_FILE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h6l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="10 3 10 7 14 7"/></svg>';
const ICON_FOLDER = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>';
const ICON_GEAR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41"/></svg>';

function parseGlob(glob) {
  if (!glob || typeof glob !== 'string') return null;

  let type = 'file';
  let scope = 'specific';
  let name = glob;
  let path = '';

  if (glob.endsWith('/**')) {
    type = 'folder';
    name = glob.slice(0, -3);
  }

  if (name.startsWith('**/')) {
    scope = 'global';
    name = name.slice(3);
  }

  const lastSlash = name.lastIndexOf('/');
  if (lastSlash !== -1) {
    path = name.slice(0, lastSlash + 1);
    name = name.slice(lastSlash + 1);
  }

  if (type === 'file' && !name.includes('.') && !name.includes('*')) {
    type = 'folder';
  }

  return { glob, type, scope, name, path };
}

function buildGlob({ name, type, scope, path }) {
  let g = name;
  if (path) g = path + g;
  if (scope === 'global') g = '**/' + g;
  if (type === 'folder') g = g + '/**';
  return g;
}

function getAllEntries() {
  const entries = [];
  for (const rule of _globalRules) {
    const p = parseGlob(rule);
    if (p) entries.push({ ...p, source: 'global' });
  }
  for (const rule of _repoRules) {
    const p = parseGlob(rule);
    if (p) entries.push({ ...p, source: 'repo' });
  }
  return entries;
}

function getFilteredEntries() {
  const all = getAllEntries();
  return all.filter(e => {
    if (_filterType === 'file' && e.type !== 'file') return false;
    if (_filterType === 'folder' && e.type !== 'folder') return false;
    if (_filterText) {
      const ft = _filterText.toLowerCase();
      if (!e.name.toLowerCase().includes(ft) &&
          !e.path.toLowerCase().includes(ft) &&
          !e.glob.toLowerCase().includes(ft)) return false;
    }
    return true;
  });
}

function render() {
  const body = _overlay?.querySelector('.dm-body');
  const countEl = _overlay?.querySelector('.dm-count');
  if (!body) return;

  const filtered = getFilteredEntries();
  const total = getAllEntries().length;

  if (countEl) countEl.textContent = `${filtered.length} of ${total}`;

  if (filtered.length === 0) {
    body.innerHTML = '<div class="dm-empty">No ignore rules match your filter</div>';
    return;
  }

  let html = '';
  let lastSource = null;

  for (const entry of filtered) {
    if (entry.source !== lastSource) {
      lastSource = entry.source;
      if (html) html += '<div class="dm-divider"></div>';
      html += `<div style="font-size:11px;color:var(--text-faint);padding:4px 10px;font-weight:500;">${entry.source === 'global' ? 'Global Rules' : 'Repo Rules'}</div>`;
    }

    const icon = entry.type === 'file' ? ICON_FILE : ICON_FOLDER;
    const iconClass = entry.type === 'file' ? 'file' : 'folder';
    const scopeLabel = entry.scope === 'global' ? 'Global' : 'Specific';
    const scopeClass = entry.scope === 'global' ? 'global' : 'specific';
    const pathLabel = entry.path || (entry.scope === 'specific' ? '(root)' : '');

    html += `<div class="dm-entry" data-glob="${escAttr(entry.glob)}" data-source="${entry.source}">`;
    html += `<span class="dm-entry-icon ${iconClass}">${icon}</span>`;
    html += `<span class="dm-entry-name">${esc(entry.name)}</span>`;
    html += `<span class="dm-entry-scope ${scopeClass}">${scopeLabel}</span>`;
    if (pathLabel) html += `<span class="dm-entry-path">${esc(pathLabel)}</span>`;
    html += `<button class="dm-entry-delete" title="Remove">${ICON_CLOSE}</button>`;
    html += `</div>`;
  }

  body.innerHTML = html;

  body.querySelectorAll('.dm-entry-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = btn.closest('.dm-entry');
      const glob = entry.dataset.glob;
      const source = entry.dataset.source;
      removeRule(glob, source);
    });
  });
}

function removeRule(glob, source) {
  if (source === 'global') {
    const idx = _globalRules.indexOf(glob);
    if (idx !== -1) _globalRules.splice(idx, 1);
  } else {
    const idx = _repoRules.indexOf(glob);
    if (idx !== -1) _repoRules.splice(idx, 1);
  }
  _dirty = true;
  render();
}

function addRule(data) {
  const glob = buildGlob(data);
  if (!glob) return;

  if (data.source === 'repo') {
    if (!_repoRules.includes(glob)) _repoRules.push(glob);
  } else {
    if (!_globalRules.includes(glob)) _globalRules.push(glob);
  }
  _dirty = true;
  render();
}

async function save() {
  try {
    const gResult = await window.electronAPI.setGlobalDocignore({ rules: _globalRules });
    if (!gResult.success) {
      showToast('Failed to save global rules: ' + (gResult.error || 'unknown'), 'error');
      return;
    }

    const repo = _overlay?.dataset.repoPath;
    if (repo) {
      const rResult = await window.electronAPI.setRepoDocignore({ repoPath: repo, rules: _repoRules });
      if (!rResult.success) {
        showToast('Failed to save repo rules: ' + (rResult.error || 'unknown'), 'error');
        return;
      }
    }

    _dirty = false;
    showToast('Ignore rules saved successfully', 'success');
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

async function load() {
  try {
    _globalRules = await window.electronAPI.getGlobalDocignore();
    if (!Array.isArray(_globalRules)) _globalRules = [];

    const repo = _overlay?.dataset.repoPath;
    if (repo) {
      _repoRules = await window.electronAPI.getRepoDocignore({ repoPath: repo });
      if (!Array.isArray(_repoRules)) _repoRules = [];
    } else {
      _repoRules = [];
    }

    _dirty = false;
  } catch (err) {
    console.error('[Docignore] Load failed:', err);
    _globalRules = [];
    _repoRules = [];
  }
}

function showToast(msg, type) {
  const existing = _overlay?.querySelector('.dm-toast');
  if (existing) existing.remove();

  const el = document.createElement('span');
  el.className = 'dm-toast ' + type;
  el.textContent = msg;
  const left = _overlay?.querySelector('.dm-footer-left');
  if (left) {
    left.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'dm-overlay';
  overlay.id = 'docignoreManagerOverlay';
  overlay.innerHTML = `
    <div class="dm-backdrop"></div>
    <div class="dm-container">
      <div class="dm-header">
        <h2>${ICON_GEAR} Ignore Settings</h2>
        <div class="dm-header-right">
          <span class="dm-repo-label" id="dmRepoLabel"></span>
          <button class="dm-btn-close" id="dmCloseBtn" title="Close">${ICON_CLOSE}</button>
        </div>
      </div>
      <div class="dm-toolbar">
        <div class="dm-tabs">
          <button class="dm-tab active" data-type="all">All</button>
          <button class="dm-tab" data-type="file">Files</button>
          <button class="dm-tab" data-type="folder">Folders</button>
        </div>
        <input type="text" class="dm-filter" id="dmFilter" placeholder="Filter rules\u2026">
        <span class="dm-count"></span>
      </div>
      <div class="dm-body"></div>
      <div class="dm-add-form" id="dmAddForm">
        <div class="dm-add-row">
          <input type="text" class="dm-add-name" id="dmAddName" placeholder="Name or path (e.g. .env, dist, backend/.env)" spellcheck="false">
          <div class="dm-add-type-group">
            <button class="dm-add-type-btn active" data-type="file">File</button>
            <button class="dm-add-type-btn" data-type="folder">Folder</button>
          </div>
          <div class="dm-add-scope-group">
            <button class="dm-add-scope-btn active" data-scope="global">Global</button>
            <button class="dm-add-scope-btn" data-scope="specific">Specific</button>
          </div>
          <input type="text" class="dm-add-specific-path" id="dmAddPath" placeholder="e.g. backend/" spellcheck="false">
          <span class="dm-add-preview" id="dmAddPreview"></span>
          <div class="dm-add-actions">
            <button class="dm-add-cancel" id="dmAddCancel">Cancel</button>
            <button class="dm-add-submit" id="dmAddSubmit" disabled>Add</button>
          </div>
        </div>
      </div>
      <div class="dm-footer">
        <div class="dm-footer-left"></div>
        <div class="dm-footer-right">
          <button class="dm-btn dm-btn-secondary" id="dmRevertBtn">Revert</button>
          <button class="dm-btn dm-btn-primary" id="dmSaveBtn">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function getAddFormData() {
  const nameInput = _overlay.querySelector('#dmAddName');
  const typeBtn = _overlay.querySelector('.dm-add-type-btn.active');
  const scopeBtn = _overlay.querySelector('.dm-add-scope-btn.active');
  const pathInput = _overlay.querySelector('#dmAddPath');

  const name = nameInput.value.trim();
  if (!name) return null;

  return {
    name,
    type: typeBtn?.dataset.type || 'file',
    scope: scopeBtn?.dataset.scope || 'global',
    path: scopeBtn?.dataset.scope === 'specific' ? pathInput.value.trim() : '',
    source: 'global',
  };
}

function updatePreview() {
  const data = getAddFormData();
  const preview = _overlay.querySelector('#dmAddPreview');
  const submit = _overlay.querySelector('#dmAddSubmit');

  if (!data) {
    preview.textContent = '';
    submit.disabled = true;
    return;
  }

  const glob = buildGlob(data);
  preview.textContent = glob;
  submit.disabled = false;
}

function wireEvents() {
  const backdrop = _overlay.querySelector('.dm-backdrop');
  backdrop.addEventListener('click', closeDocignoreManager);

  _overlay.querySelector('#dmCloseBtn').addEventListener('click', closeDocignoreManager);

  _overlay.querySelector('#dmSaveBtn').addEventListener('click', save);

  _overlay.querySelector('#dmRevertBtn').addEventListener('click', async () => {
    await load();
    render();
    showToast('Changes reverted', 'success');
  });

  _overlay.querySelectorAll('.dm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _overlay.querySelectorAll('.dm-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _filterType = tab.dataset.type;
      render();
    });
  });

  const filterInput = _overlay.querySelector('#dmFilter');
  filterInput.addEventListener('input', () => {
    _filterText = filterInput.value;
    render();
  });

  const addBtn = _overlay.querySelector('#dmAddSubmit');
  addBtn.addEventListener('click', () => {
    const data = getAddFormData();
    if (!data) return;
    addRule(data);
    _overlay.querySelector('#dmAddName').value = '';
    _overlay.querySelector('#dmAddPath').value = '';
    updatePreview();
  });

  _overlay.querySelector('#dmAddCancel').addEventListener('click', () => {
    _overlay.querySelector('#dmAddName').value = '';
    _overlay.querySelector('#dmAddPath').value = '';
    updatePreview();
  });

  _overlay.querySelector('#dmAddName').addEventListener('input', updatePreview);
  _overlay.querySelector('#dmAddPath').addEventListener('input', updatePreview);

  _overlay.querySelectorAll('.dm-add-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _overlay.querySelectorAll('.dm-add-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updatePreview();
    });
  });

  _overlay.querySelectorAll('.dm-add-scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _overlay.querySelectorAll('.dm-add-scope-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const pathInput = _overlay.querySelector('#dmAddPath');
      pathInput.classList.toggle('show', btn.dataset.scope === 'specific');
      updatePreview();
    });
  });

  document.addEventListener('keydown', function dmEsc(e) {
    if (e.key === 'Escape' && _open) {
      closeDocignoreManager();
    }
  });
}

export async function openDocignoreManager(repoPath) {
  if (_open) return;

  if (!_overlay) {
    _overlay = createOverlay();
    wireEvents();
  }

  _overlay.dataset.repoPath = repoPath || '';
  const label = _overlay.querySelector('#dmRepoLabel');
  label.textContent = repoPath ? `Repo: ${repoPath}` : 'Global rules only';

  await load();
  render();

  _open = true;
  _overlay.classList.add('dm-open');

  _overlay.querySelector('#dmAddName').focus();
}

export function closeDocignoreManager() {
  if (!_open) return;

  if (_dirty) {
    const msg = 'You have unsaved changes. Discard them?';
    if (!confirm(msg)) return;
  }

  _open = false;
  _overlay?.classList.remove('dm-open');
}

export function isDocignoreManagerOpen() {
  return _open;
}
