let _panel = null;
let _open = false;

let _categories = [];
let _blueprints = [];
let _selectedCategory = null;
let _selectedBlueprint = null;
let _editing = false;
let _searchQuery = '';
let _catFilter = 'code';

const CAT_FILTERS = [
  { id: 'code', label: 'Code' },
  { id: 'structure', label: 'Structure' },
  { id: 'setup-steps', label: 'Setup Steps' },
];

const STEP_COLORS = ['c-green', 'c-blue', 'c-purple', 'c-yellow', 'c-red'];

const BP_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h8l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="12,3 12,7 16,7"/><line x1="6" y1="10" x2="12" y2="10"/><line x1="6" y1="13" x2="11" y2="13"/><line x1="6" y1="16" x2="10" y2="16"/></svg>';
const BP_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>';

function _el(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'innerHTML') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  if (children) for (const c of [].concat(children)) el.appendChild(c);
  return el;
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function isOpen() { return _open; }

export async function open() {
  if (_open) return;
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _open = true;
  await _seedIfEmpty();
  _catFilter = 'code';
  _renderCatFilter();
  await _loadData();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
  _selectedCategory = null;
  _selectedBlueprint = null;
  _editing = false;
}

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.id = 'bpPanel';
  _panel.className = 'bp-overlay';
  _panel.innerHTML = `
    <div class="bp-container">
      <div class="bp-header">
        <h2>${BP_ICON} Blueprint Library</h2>
        <div class="bp-header-right">
          <button class="bp-btn-close" id="bpCloseBtn">${BP_CLOSE}</button>
        </div>
      </div>
      <div class="bp-body">
        <div class="bp-categories" id="bpCategories">
          <div class="bp-categories-header">
            <span>Categories</span>
            <button class="bp-cat-add-btn" id="bpCatAddBtn" title="New category">+</button>
          </div>
          <div class="bp-cat-filter" id="bpCatFilter"></div>
          <div class="bp-cat-list" id="bpCatList"></div>
        </div>
        <div class="bp-list" id="bpList">
          <div class="bp-list-header">
            <input type="text" class="bp-search" id="bpSearch" placeholder="Search blueprints\u2026">
            <button class="bp-blueprint-add-btn" id="bpAddBtn">+ New</button>
          </div>
          <div class="bp-blueprint-list" id="bpBlueprintList"></div>
        </div>
        <div class="bp-detail" id="bpDetail">
          <div class="bp-detail-empty">Select a blueprint to view</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(_panel);

  _panel.querySelector('#bpCloseBtn').addEventListener('click', close);
  _panel.querySelector('#bpCatAddBtn').addEventListener('click', _showNewCategoryModal);
  _panel.querySelector('#bpAddBtn').addEventListener('click', _createNewBlueprint);
  _panel.querySelector('#bpSearch').addEventListener('input', _onSearch);

  document.addEventListener('keydown', _escHandler);
}

function _escHandler(e) {
  if (e.key === 'Escape' && _open) {
    if (_editing) { _editing = false; _renderDetail(); return; }
    close();
  }
}

async function _seedIfEmpty() {
  try {
    await window.electronAPI.blueprint.seed();
  } catch (err) {
    console.warn('[Blueprint] Seed:', err.message);
  }
}

async function _loadData() {
  try {
    const { getPrefetchCache } = await import('./app_manager/prefetchManager.js');
    const cached = getPrefetchCache().get('blueprintCategories');
    if (cached) {
      _categories = cached;
    } else {
      _categories = await window.electronAPI.blueprint.getCategories() || [];
    }
    _renderCategories();
    if (_selectedCategory) {
      const stillExists = _categories.find(c => c.id === _selectedCategory.id);
      if (!stillExists) _selectedCategory = null;
    }
    if (!_selectedCategory && _categories.length) {
      const firstMatch = _categories.find(c => c.type === _catFilter);
      _selectedCategory = firstMatch || _categories[0];
      _panel.querySelector('#bpSearch').value = '';
      _searchQuery = '';
    }
    if (_selectedCategory) {
      await _loadBlueprints(_selectedCategory.id);
    } else {
      _blueprints = [];
      _renderBlueprintList();
      _renderDetailEmpty();
    }
  } catch (err) {
    console.error('[Blueprint] Load error:', err);
  }
}

// ── Categories ──

function _renderCatFilter() {
  const el = _panel.querySelector('#bpCatFilter');
  if (!el) return;
  el.innerHTML = CAT_FILTERS.map(f =>
    `<button class="bp-cat-filter-btn${_catFilter === f.id ? ' active' : ''}" data-filter="${f.id}">${f.label}</button>`
  ).join('');
  el.querySelectorAll('.bp-cat-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.filter;
      if (id === _catFilter) return;
      _catFilter = id;
      _renderCatFilter();
      _selectedCategory = null;
      const first = _categories.find(c => c.type === _catFilter);
      if (first) {
        _selectedCategory = first;
        _panel.querySelector('#bpSearch').value = '';
        _searchQuery = '';
      }
      _renderCategories();
      if (_selectedCategory) {
        _loadBlueprints(_selectedCategory.id);
      } else {
        _blueprints = [];
        _renderBlueprintList();
        _renderDetailEmpty();
      }
    });
  });
}

function _renderCategories() {
  const list = _panel.querySelector('#bpCatList');
  const filtered = _catFilter === 'all'
    ? _categories
    : _categories.filter(c => c.type === _catFilter);

  list.innerHTML = '';
  if (!filtered.length) {
    list.innerHTML = '<div class="bp-empty" style="height:auto;padding:20px 8px;font-size:11px">No categories</div>';
    return;
  }
  for (let i = 0; i < filtered.length; i++) _appendCatItem(list, filtered[i], i);
}

function _appendCatItem(list, cat, idx) {
  const active = _selectedCategory && _selectedCategory.id === cat.id;
  const colorClass = STEP_COLORS[idx % STEP_COLORS.length];
  const item = _el('div', { className: 'bp-cat-item' + (active ? ' active' : '') + ' ' + colorClass, dataset: { id: cat.id } });
  item.innerHTML = `
    <span class="bp-cat-item-name">${_esc(cat.name)}</span>
    <span class="bp-cat-item-count">${cat.blueprintCount}</span>
  `;
  item.addEventListener('click', () => _selectCategory(cat));
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    _showCatContextMenu(e.clientX, e.clientY, cat);
  });
  list.appendChild(item);
}

async function _selectCategory(cat) {
  _selectedCategory = cat;
  _selectedBlueprint = null;
  _editing = false;
  _panel.querySelector('#bpSearch').value = '';
  _searchQuery = '';
  _renderCategories();
  await _loadBlueprints(cat.id);
}

async function _loadBlueprints(categoryId) {
  try {
    _blueprints = await window.electronAPI.blueprint.getByCategory(categoryId) || [];
  } catch (err) {
    _blueprints = [];
  }
  _renderBlueprintList();
  _renderDetailEmpty();
}

// ── Blueprint list ──

function _renderBlueprintList() {
  const list = _panel.querySelector('#bpBlueprintList');
  let items = _blueprints;
  if (_searchQuery) {
    const q = _searchQuery.toLowerCase();
    items = items.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q) ||
      (b.tags || '').toLowerCase().includes(q)
    );
  }
  if (!items.length) {
    list.innerHTML = '<div class="bp-empty">' + (_searchQuery ? 'No blueprints match your search' : 'No blueprints yet') + '</div>';
    return;
  }
  list.innerHTML = '';
  for (const bp of items) {
    const active = _selectedBlueprint && _selectedBlueprint.id === bp.id;
    const bpCat = _categories.find(c => c.id === bp.categoryId);
    const typeClass = bpCat?.type === 'code' ? 'c-blue' : bpCat?.type === 'structure' ? 'c-purple' : bpCat?.type === 'setup-steps' ? 'c-green' : '';
    const card = _el('div', { className: 'bp-card' + (active ? ' active' : '') + (typeClass ? ' ' + typeClass : '') });
    const tags = (bp.tags || '').split(',').filter(Boolean);
    card.innerHTML = `
      <div class="bp-card-name">${_esc(bp.name)}</div>
      <div class="bp-card-desc">${_esc(bp.description || '')}</div>
      ${tags.length ? '<div class="bp-card-tags">' + tags.map(t => '<span class="bp-card-tag">' + _esc(t.trim()) + '</span>').join('') + '</div>' : ''}
    `;
    card.addEventListener('click', () => _selectBlueprint(bp));
    list.appendChild(card);
  }
}

async function _selectBlueprint(bp) {
  _selectedBlueprint = bp;
  _editing = false;
  _renderBlueprintList();
  try {
    const full = await window.electronAPI.blueprint.getOne(bp.id);
    if (full) _selectedBlueprint = full;
  } catch (_) {}
  _renderDetail();
}

function _onSearch() {
  _searchQuery = _panel.querySelector('#bpSearch').value;
  _renderBlueprintList();
}

// ── Detail view ──

function _renderDetailEmpty() {
  _panel.querySelector('#bpDetail').innerHTML = '<div class="bp-detail-empty">Select a blueprint to view</div>';
}

function _renderDetail() {
  const el = _panel.querySelector('#bpDetail');
  const bp = _selectedBlueprint;
  if (!bp) { _renderDetailEmpty(); return; }

  if (_editing) {
    _renderEditMode(el, bp);
    return;
  }

  const cat = _categories.find(c => c.id === bp.categoryId);
  if (cat?.type === 'setup-steps') { _renderSetupSteps(el, bp); return; }

  const isStructure = cat?.type === 'structure';
  const tags = (bp.tags || '').split(',').filter(Boolean);
  const typeLabel = isStructure ? 'Folder Structure' : 'Code Blueprint';

  el.innerHTML = `
    <div class="bp-detail-header">
      <span class="bp-detail-title">${_esc(bp.name)}</span>
      <span class="bp-detail-actions">
        <button class="bp-detail-btn primary" id="bpEditBtn">Edit</button>
        <button class="bp-detail-btn copy" id="bpCopyBtn">Copy Prompt &#8599;</button>
        <button class="bp-detail-btn danger" id="bpDeleteBtn">Delete</button>
      </span>
    </div>
    <div class="bp-detail-meta">
      <span><strong>${_esc(typeLabel)}</strong></span>
      ${tags.length ? '<span>Tags: ' + tags.map(t => _esc(t.trim())).join(', ') + '</span>' : ''}
    </div>
    <div class="bp-detail-content">${_esc(bp.pseudoCode || bp.pseudo_code || '')}</div>
  `;

  el.querySelector('#bpEditBtn').addEventListener('click', () => { _editing = true; _renderDetail(); });
  el.querySelector('#bpCopyBtn').addEventListener('click', _copyPrompt);
  el.querySelector('#bpDeleteBtn').addEventListener('click', _deleteBlueprint);

  // Copy prompt toast
  const toast = document.getElementById('bpToast');
  if (toast) toast.remove();
}

function _renderSetupSteps(el, bp) {
  const tags = (bp.tags || '').split(',').filter(Boolean);
  const content = bp.pseudoCode || bp.pseudo_code || '';

  const steps = [];
  let currentStep = null;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = new RegExp('##\\s*(?:Step\\s*(\\d+)[:\\s]*)?(.+)', 'i').exec(lines[i]);
    if (match) {
      if (currentStep) steps.push(currentStep);
      currentStep = { num: match[1] || String(steps.length + 1), title: match[2].trim(), items: [] };
    } else if (currentStep) {
      const codeMatch = lines[i].match(/^```(\w*)/);
      if (codeMatch) {
        const lang = codeMatch[1];
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        currentStep.items.push({ type: 'code', lang, code: codeLines.join('\n') });
      } else {
        currentStep.items.push({ type: 'text', text: lines[i] });
      }
    }
  }
  if (currentStep) steps.push(currentStep);

  el.innerHTML = `
    <div class="bp-detail-header">
      <span class="bp-detail-title">${_esc(bp.name)}</span>
      <span class="bp-detail-actions">
        <button class="bp-detail-btn primary" id="bpEditBtn">Edit</button>
        <button class="bp-detail-btn danger" id="bpDeleteBtn">Delete</button>
      </span>
    </div>
    <div class="bp-detail-meta">
      <span><strong>Setup Steps</strong></span>
      ${tags.length ? '<span>Tags: ' + tags.map(t => _esc(t.trim())).join(', ') + '</span>' : ''}
    </div>
    <div class="bp-steps-content" id="bpStepsContent"></div>
  `;

  el.querySelector('#bpEditBtn').addEventListener('click', () => { _editing = true; _renderDetail(); });
  el.querySelector('#bpDeleteBtn').addEventListener('click', _deleteBlueprint);

  const contentEl = el.querySelector('#bpStepsContent');
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    const colorClass = STEP_COLORS[si % STEP_COLORS.length];
    const card = _el('div', { className: 'bp-step-card ' + colorClass });
    let codeIdx = 0;
    let html = '<div class="bp-step-header"><span class="bp-step-num ' + colorClass + '">' + step.num + '</span><span class="bp-step-title">' + _esc(step.title) + '</span></div>';
    for (const item of step.items) {
      if (item.type === 'text') {
        if (item.text.trim()) html += '<div class="bp-step-text">' + _esc(item.text) + '</div>';
      } else {
        const codeId = 'bpStepCode_' + step.num + '_' + (codeIdx++);
        html += '<div class="bp-step-code-wrap"><div class="bp-step-code-header"><span>' + (item.lang ? _esc(item.lang) : '&#8203;') + '</span><button class="bp-step-copy-btn" data-codeid="' + codeId + '">Copy</button></div><pre class="bp-step-code" id="' + codeId + '">' + _esc(item.code) + '</pre></div>';
      }
    }
    card.innerHTML = html;
    contentEl.appendChild(card);
  }

  contentEl.querySelectorAll('.bp-step-copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const codeEl = document.getElementById(btn.dataset.codeid);
      if (!codeEl) return;
      try {
        await navigator.clipboard.writeText(codeEl.textContent);
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = orig, 1200);
      } catch {}
    });
  });
}

function _renderEditMode(el, bp) {
  const cats = _categories;
  const currentCatId = bp.categoryId;

  el.innerHTML = `
    <div class="bp-detail-header">
      <span class="bp-detail-title">Edit: ${_esc(bp.name)}</span>
      <span class="bp-detail-actions">
        <button class="bp-detail-btn primary" id="bpSaveBtn">Save</button>
        <button class="bp-detail-btn" id="bpCancelBtn">Cancel</button>
      </span>
    </div>
    <div style="flex:1;overflow:auto;padding:16px">
      <div class="bp-edit-field">
        <label class="bp-edit-label">Name</label>
        <input class="bp-edit-input" id="bpEditName" value="${_esc(bp.name)}">
      </div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Category</label>
        <select class="bp-edit-select" id="bpEditCategory">${cats.map(c => `<option value="${c.id}" ${c.id === currentCatId ? 'selected' : ''}>${_esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Description</label>
        <input class="bp-edit-input" id="bpEditDesc" value="${_esc(bp.description || '')}">
      </div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Tags (comma-separated)</label>
        <input class="bp-edit-input" id="bpEditTags" value="${_esc(bp.tags || '')}">
      </div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Blueprint Content</label>
        <textarea class="bp-edit-textarea" id="bpEditCode">${_esc(bp.pseudoCode || bp.pseudo_code || '')}</textarea>
      </div>
      <div class="bp-edit-actions">
        <button class="bp-detail-btn primary" id="bpSaveBtn2">Save</button>
        <button class="bp-detail-btn" id="bpCancelBtn2">Cancel</button>
      </div>
    </div>
  `;

  el.querySelector('#bpSaveBtn').addEventListener('click', _saveEdit);
  el.querySelector('#bpSaveBtn2').addEventListener('click', _saveEdit);
  el.querySelector('#bpCancelBtn').addEventListener('click', () => { _editing = false; _renderDetail(); });
  el.querySelector('#bpCancelBtn2').addEventListener('click', () => { _editing = false; _renderDetail(); });
}

async function _saveEdit() {
  const bp = _selectedBlueprint;
  if (!bp) return;
  const name = _panel.querySelector('#bpEditName').value.trim();
  const categoryId = parseInt(_panel.querySelector('#bpEditCategory').value, 10);
  const description = _panel.querySelector('#bpEditDesc').value.trim();
  const tags = _panel.querySelector('#bpEditTags').value.trim();
  const pseudoCode = _panel.querySelector('#bpEditCode').value;

  if (!name || !pseudoCode) return;

  try {
    await window.electronAPI.blueprint.update({
      id: bp.id, name, description, pseudoCode, tags, categoryId,
    });
    _editing = false;
    await _loadData();
    _selectedBlueprint = { ...bp, name, description, tags, categoryId, pseudoCode };
    _renderDetail();
  } catch (err) {
    console.error('[Blueprint] Save error:', err);
  }
}

async function _deleteBlueprint() {
  const bp = _selectedBlueprint;
  if (!bp) return;
  if (!confirm('Delete "' + bp.name + '"?')) return;
  try {
    await window.electronAPI.blueprint.delete(bp.id);
    _selectedBlueprint = null;
    await _loadData();
  } catch (err) {
    console.error('[Blueprint] Delete error:', err);
  }
}

// ── Create new blueprint ──

async function _createNewBlueprint() {
  if (!_selectedCategory) { _showToast('Select a category first'); return; }
  try {
    const result = await window.electronAPI.blueprint.create({
      categoryId: _selectedCategory.id,
      name: 'New Blueprint',
      description: '',
      pseudoCode: '// Write your blueprint here',
      tags: '',
    });
    await _loadData();
    const newBp = _blueprints.find(b => b.id === result.id);
    if (newBp) _selectBlueprint(newBp);
  } catch (err) {
    console.error('[Blueprint] Create error:', err);
  }
}

// ── Copy prompt ──

async function _copyPrompt() {
  const bp = _selectedBlueprint;
  if (!bp) return;
  const catName = _categories.find(c => c.id === bp.categoryId)?.name || '';
  const isStructure = _categories.find(c => c.id === bp.categoryId)?.type === 'structure';
  const typeLabel = isStructure ? 'Folder Structure' : 'Blueprint';

  const prompt = `Use the following ${typeLabel.toLowerCase()} as the strict structure for your implementation.
Do not deviate from this structure. Follow the naming conventions, layers,
and flow exactly as defined. Adapt only the syntax to the target language
or framework.

${typeLabel}: ${bp.name}
Category: ${catName}

---

${bp.pseudoCode || bp.pseudo_code || ''}

---

Now build: `;

  try {
    await navigator.clipboard.writeText(prompt);
    _showToast('Prompt copied!');
  } catch {
    _showToast('Failed to copy');
  }
}

function _showToast(msg) {
  const existing = document.getElementById('bpToast');
  if (existing) existing.remove();
  const toast = _el('div', { id: 'bpToast', style: 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:8px;padding:10px 20px;font-size:12px;color:var(--text-primary);z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.3);animation:bpFadeIn 0.15s ease-out' });
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.2s'; setTimeout(() => toast.remove(), 250); }, 1500);
}

// ── New category modal ──

function _showNewCategoryModal() {
  const existing = document.getElementById('bpCatModal');
  if (existing) existing.remove();

  const modal = _el('div', { id: 'bpCatModal', className: 'bp-cat-modal' });
  modal.innerHTML = `
    <div class="bp-cat-modal-box">
      <div class="bp-cat-modal-title">New Category</div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Name</label>
        <input class="bp-edit-input" id="bpNewCatName" placeholder="e.g. Authentication">
      </div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Type</label>
        <select class="bp-cat-select" id="bpNewCatType">
          <option value="code">Code Blueprints</option>
          <option value="structure">Folder Structures</option>
          <option value="setup-steps">Setup Steps</option>
        </select>
      </div>
      <div class="bp-cat-modal-actions">
        <button class="bp-cat-modal-btn" id="bpCatModalCancel">Cancel</button>
        <button class="bp-cat-modal-btn primary" id="bpCatModalCreate">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#bpCatModalCancel').addEventListener('click', () => modal.remove());
  modal.querySelector('#bpCatModalCreate').addEventListener('click', async () => {
    const name = modal.querySelector('#bpNewCatName').value.trim();
    const type = modal.querySelector('#bpNewCatType').value;
    if (!name) return;
    try {
      await window.electronAPI.blueprint.createCategory(name, type);
      modal.remove();
      await _loadData();
    } catch (err) {
      console.error('[Blueprint] Create category error:', err);
    }
  });
  setTimeout(() => modal.querySelector('#bpNewCatName').focus(), 50);
}

// ── Category context menu ──

function _showCatContextMenu(x, y, cat) {
  const existing = document.querySelector('.bp-ctx-menu');
  if (existing) existing.remove();

  const menu = _el('div', { className: 'bp-ctx-menu' });
  menu.innerHTML = `
    <div class="bp-ctx-item" id="bpCtxRename">Rename</div>
    <div class="bp-ctx-item danger" id="bpCtxDelete">Delete</div>
  `;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  document.body.appendChild(menu);

  menu.querySelector('#bpCtxRename').addEventListener('click', () => { menu.remove(); _promptRenameCategory(cat); });
  menu.querySelector('#bpCtxDelete').addEventListener('click', () => { menu.remove(); _deleteCategory(cat); });

  const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

async function _promptRenameCategory(cat) {
  const name = prompt('Rename category:', cat.name);
  if (!name || name.trim() === cat.name) return;
  try {
    await window.electronAPI.blueprint.renameCategory(cat.id, name.trim());
    await _loadData();
  } catch (err) {
    console.error('[Blueprint] Rename error:', err);
  }
}

async function _deleteCategory(cat) {
  if (!confirm('Delete "' + cat.name + '" and all its blueprints?')) return;
  try {
    await window.electronAPI.blueprint.deleteCategory(cat.id);
    if (_selectedCategory && _selectedCategory.id === cat.id) {
      _selectedCategory = null;
      _selectedBlueprint = null;
    }
    await _loadData();
  } catch (err) {
    console.error('[Blueprint] Delete category error:', err);
  }
}
