let _panel = null;
let _open = false;

let _categories = [];
let _blueprints = [];
let _selectedCategory = null;
let _selectedBlueprint = null;
let _editing = false;
let _searchQuery = '';
let _catFilter = 'code';
let _kitView = false;
let _kitItems = { starter: [], medium: [], large: [] };
let _motherBoxView = false;
let _motherBoxData = null;
let _detailModal = null;

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

function _removeModal(m) {
  if (m && m.parentNode) m.parentNode.removeChild(m);
}

function _closeDetailModal() {
  if (_detailModal) { _removeModal(_detailModal); _detailModal = null; }
}

export function isOpen() { return _open; }

export async function open() {
  if (_open) return;
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _panel.classList.remove('bp-mbox-active', 'bp-kits-active');
  _open = true;
  await _seedIfEmpty();
  _catFilter = 'code';
  _renderCatFilter();
  await _loadData();
}

export function close() {
  if (!_open) return;
  _closeDetailModal();
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
        <div class="bp-list" id="bpList">
          <div class="bp-cat-bar" id="bpCatBar">
            <div class="bp-cat-bar-filter" id="bpCatFilter"></div>
            <div class="bp-cat-bar-list" id="bpCatList"></div>
            <button class="bp-cat-add-btn" id="bpCatAddBtn" title="New category">+</button>
          </div>
          <div class="bp-list-header">
            <input type="text" class="bp-search" id="bpSearch" placeholder="Search blueprints\u2026">
            <button class="bp-blueprint-add-btn" id="bpAddBtn">+ New</button>
          </div>
          <div class="bp-view-tabs" id="bpViewTabs">
            <button class="bp-view-tab active" data-view="blueprints">Blueprints</button>
            <button class="bp-view-tab" data-view="kits">Building Kits</button>
            <button class="bp-view-tab" data-view="motherbox">Mother Box</button>
          </div>
          <div class="bp-blueprint-list" id="bpBlueprintList"></div>
          <div class="bp-kit-grid" id="bpKitGrid" style="display:none"></div>
          <div class="bp-motherbox" id="bpMotherBox" style="display:none"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(_panel);

  _panel.querySelector('#bpCloseBtn').addEventListener('click', close);
  _panel.querySelector('#bpCatAddBtn').addEventListener('click', _showNewCategoryModal);
  _panel.querySelector('#bpAddBtn').addEventListener('click', _createNewBlueprint);
  _panel.querySelector('#bpSearch').addEventListener('input', _onSearch);
  _panel.querySelector('#bpViewTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.bp-view-tab');
    if (!tab) return;
    _switchView(tab.dataset.view);
  });

  document.addEventListener('keydown', _escHandler);
}

function _escHandler(e) {
  if (e.key === 'Escape') {
    if (_detailModal) { _closeDetailModal(); return; }
    if (_open) {
      if (_editing) { _editing = false; _showDetailModal(); return; }
      close();
    }
  }
}

function _switchView(view) {
  _kitView = view === 'kits';
  _motherBoxView = view === 'motherbox';
  const tabs = _panel.querySelectorAll('.bp-view-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.view === view));

  const bpList = _panel.querySelector('#bpBlueprintList');
  const grid = _panel.querySelector('#bpKitGrid');
  const motherBox = _panel.querySelector('#bpMotherBox');
  const search = _panel.querySelector('#bpSearch');
  const addBtn = _panel.querySelector('#bpAddBtn');
  const catBar = _panel.querySelector('#bpCatBar');

  _panel.classList.toggle('bp-mbox-active', _motherBoxView);
  _panel.classList.toggle('bp-kits-active', _kitView);

  if (_motherBoxView) {
    bpList.style.display = 'none';
    grid.style.display = 'none';
    motherBox.style.display = '';
    _loadMotherBox();
  } else if (_kitView) {
    motherBox.style.display = 'none';
    bpList.style.display = 'none';
    grid.style.display = '';
    catBar.style.display = '';
    search.style.display = 'none';
    addBtn.style.display = 'none';
    _loadKits();
  } else {
    motherBox.style.display = 'none';
    grid.style.display = 'none';
    bpList.style.display = '';
    catBar.style.display = '';
    search.style.display = '';
    addBtn.style.display = '';
    search.placeholder = 'Search blueprints\u2026';
    _loadBlueprints(_selectedCategory?.id);
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
    list.innerHTML = '<div class="bp-empty" style="height:auto;padding:8px 4px;font-size:10px;color:var(--text-faint)">No categories</div>';
    return;
  }
  for (let i = 0; i < filtered.length; i++) _appendCatItem(list, filtered[i], i);
}

function _appendCatItem(list, cat, idx) {
  const active = _selectedCategory && _selectedCategory.id === cat.id;
  const colorClass = STEP_COLORS[idx % STEP_COLORS.length];
  const item = _el('div', { className: 'bp-cat-chip' + (active ? ' active' : '') + ' ' + colorClass, dataset: { id: cat.id } });
  item.innerHTML = `<span class="bp-cat-chip-name">${_esc(cat.name)}</span><span class="bp-cat-chip-count">${cat.blueprintCount}</span>`;
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
  if (_kitView) {
    await _loadKits();
  } else {
    await _loadBlueprints(cat.id);
  }
}

async function _loadBlueprints(categoryId) {
  try {
    _blueprints = await window.electronAPI.blueprint.getByCategory(categoryId) || [];
  } catch (err) {
    _blueprints = [];
  }
  _renderBlueprintList();
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
    const bpCat = _categories.find(c => c.id === bp.categoryId);
    const typeClass = bpCat?.type === 'code' ? 'c-blue' : bpCat?.type === 'structure' ? 'c-purple' : bpCat?.type === 'setup-steps' ? 'c-green' : '';
    const card = _el('div', { className: 'bp-card' + (typeClass ? ' ' + typeClass : '') });
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
  _showDetailModal();
}

function _onSearch() {
  _searchQuery = _panel.querySelector('#bpSearch').value;
  _renderBlueprintList();
}

// ── Detail Modal ──

function _showDetailModal() {
  _closeDetailModal();
  const bp = _selectedBlueprint;
  if (!bp) return;

  if (_editing) { _showEditModal(bp); return; }

  const cat = _categories.find(c => c.id === bp.categoryId);
  const isSetupSteps = cat?.type === 'setup-steps';
  const isStructure = cat?.type === 'structure';
  const tags = (bp.tags || '').split(',').filter(Boolean);
  const typeLabel = isSetupSteps ? 'Setup Steps' : isStructure ? 'Folder Structure' : 'Code Blueprint';

  const modal = _el('div', { className: 'bp-view-modal' });
  modal.innerHTML = `
    <div class="bp-view-modal-box">
      <div class="bp-view-modal-header">
        <span class="bp-view-modal-title">${_esc(bp.name)}</span>
        <div class="bp-view-modal-actions">
          ${!isSetupSteps ? '<button class="bp-detail-btn primary" data-action="edit">Edit</button>' : ''}
          ${!isSetupSteps ? '<button class="bp-detail-btn copy" data-action="copy">Copy Prompt &#8599;</button>' : ''}
          <button class="bp-detail-btn danger" data-action="delete">Delete</button>
          <button class="bp-detail-btn" data-action="close">&#10005;</button>
        </div>
      </div>
      <div class="bp-view-modal-meta">
        <span><strong>${_esc(typeLabel)}</strong></span>
        ${tags.length ? '<span>Tags: ' + tags.map(t => _esc(t.trim())).join(', ') + '</span>' : ''}
      </div>
      <div class="bp-view-modal-body${isSetupSteps ? ' bp-steps-content' : ''}">${isSetupSteps ? '' : '<pre class="bp-view-modal-code">' + _esc(bp.pseudoCode || bp.pseudo_code || '') + '</pre>'}</div>
    </div>
  `;

  modal.addEventListener('click', (e) => { if (e.target === modal) _closeDetailModal(); });

  modal.querySelector('[data-action="close"]').addEventListener('click', _closeDetailModal);
  if (!isSetupSteps) {
    modal.querySelector('[data-action="edit"]').addEventListener('click', () => { _editing = true; _showDetailModal(); });
    modal.querySelector('[data-action="copy"]').addEventListener('click', _copyPrompt);
  }
  modal.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    _closeDetailModal();
    await _deleteBlueprint();
  });

  if (isSetupSteps) {
    const body = modal.querySelector('.bp-view-modal-body');
    _renderSetupStepsContent(body, bp);
  }

  document.body.appendChild(modal);
  _detailModal = modal;
}

function _renderSetupStepsContent(container, bp) {
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
    container.appendChild(card);
  }

  container.querySelectorAll('.bp-step-copy-btn').forEach(btn => {
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

function _showEditModal(bp) {
  _closeDetailModal();
  const cats = _categories;
  const currentCatId = bp.categoryId;

  const modal = _el('div', { className: 'bp-view-modal' });
  modal.innerHTML = `
    <div class="bp-view-modal-box" style="max-width:700px">
      <div class="bp-view-modal-header">
        <span class="bp-view-modal-title">Edit: ${_esc(bp.name)}</span>
        <div class="bp-view-modal-actions">
          <button class="bp-detail-btn primary" data-action="save">Save</button>
          <button class="bp-detail-btn" data-action="cancel">Cancel</button>
        </div>
      </div>
      <div class="bp-view-modal-body">
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
      </div>
    </div>
  `;

  modal.addEventListener('click', (e) => { if (e.target === modal) { _editing = false; _closeDetailModal(); } });
  modal.querySelector('[data-action="save"]').addEventListener('click', () => _saveEdit(modal));
  modal.querySelector('[data-action="cancel"]').addEventListener('click', () => { _editing = false; _closeDetailModal(); });

  document.body.appendChild(modal);
  _detailModal = modal;
}

async function _saveEdit(modal) {
  const bp = _selectedBlueprint;
  if (!bp) return;
  const name = modal.querySelector('#bpEditName').value.trim();
  const categoryId = parseInt(modal.querySelector('#bpEditCategory').value, 10);
  const description = modal.querySelector('#bpEditDesc').value.trim();
  const tags = modal.querySelector('#bpEditTags').value.trim();
  const pseudoCode = modal.querySelector('#bpEditCode').value;

  if (!name || !pseudoCode) return;

  try {
    await window.electronAPI.blueprint.update({
      id: bp.id, name, description, pseudoCode, tags, categoryId,
    });
    _editing = false;
    _closeDetailModal();
    await _loadData();
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

// ── Mother Box Detail Modal ──

function _showMotherBoxDetail(item, tierColor) {
  _closeDetailModal();
  const tagHtml = item.tags && item.tags.length
    ? '<div class="bp-view-modal-meta" style="gap:4px;flex-wrap:wrap">' + item.tags.map(t => '<span class="bp-mbox-tag" style="font-size:10px">' + _esc(t) + '</span>').join('') + '</div>'
    : '';

  const modal = _el('div', { className: 'bp-view-modal' });
  modal.innerHTML = `
    <div class="bp-view-modal-box" style="max-width:600px">
      <div class="bp-view-modal-header">
        <span class="bp-view-modal-title">${_esc(item.name)}</span>
        <div class="bp-view-modal-actions">
          <button class="bp-detail-btn copy" data-action="copy-detail">Copy</button>
          <button class="bp-detail-btn" data-action="close">&#10005;</button>
        </div>
      </div>
      <div class="bp-view-modal-body">
        <div class="bp-mbox-detail-desc">${_esc(item.description)}</div>
        ${tagHtml}
      </div>
    </div>
  `;

  modal.addEventListener('click', (e) => { if (e.target === modal) _closeDetailModal(); });
  modal.querySelector('[data-action="close"]').addEventListener('click', _closeDetailModal);
  modal.querySelector('[data-action="copy-detail"]').addEventListener('click', async () => {
    const text = item.name + '\n' + item.description + (item.tags?.length ? '\nTags: ' + item.tags.join(', ') : '');
    try {
      await navigator.clipboard.writeText(text);
      const btn = modal.querySelector('[data-action="copy-detail"]');
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = orig, 1200);
    } catch {}
  });

  document.body.appendChild(modal);
  _detailModal = modal;
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

// ── Building Kits ──

const KIT_LABELS = { starter: 'Starter', medium: 'Medium', large: 'Large' };
const KIT_COLORS = { starter: 'c-green', medium: 'c-blue', large: 'c-purple' };

async function _loadKits() {
  if (!_selectedCategory) {
    _kitItems = { starter: [], medium: [], large: [] };
    _renderKitGrid();
    return;
  }
  try {
    const grouped = await window.electronAPI.kit.getByCategory(_selectedCategory.id);
    _kitItems = grouped || { starter: [], medium: [], large: [] };
  } catch {
    _kitItems = { starter: [], medium: [], large: [] };
  }
  _renderKitGrid();
}

function _renderKitGrid() {
  const grid = _panel.querySelector('#bpKitGrid');
  if (!grid) return;
  if (!_selectedCategory) {
    grid.innerHTML = '<div class="bp-empty">Select a category to view its building kits</div>';
    return;
  }
  grid.innerHTML = '';
  const row = _el('div', { className: 'bp-kit-row' });
  for (const level of ['starter', 'medium', 'large']) {
    const items = _kitItems[level] || [];
    const col = _el('div', { className: 'bp-kit-col ' + KIT_COLORS[level] });
    const types = _groupByType(items);
    col.innerHTML = `
      <div class="bp-kit-col-header ${KIT_COLORS[level]}">
        <span class="bp-kit-col-title">${KIT_LABELS[level]}</span>
        <span class="bp-kit-col-count">${items.length}</span>
      </div>
      <div class="bp-kit-col-body">
        ${types.map(t => `
          <div class="bp-kit-type-group">
            <div class="bp-kit-type-label">${_esc(t.type)}</div>
            ${t.items.map(item => _buildKitItemHtml(item, level)).join('')}
          </div>
        `).join('')}
        <div class="bp-kit-col-footer">
          <button class="bp-kit-add-btn" data-level="${level}">+ Add item</button>
        </div>
      </div>
    `;
    col.querySelector('.bp-kit-add-btn').addEventListener('click', () => _showAddKitItem(level));
    col.querySelectorAll('.bp-kit-item').forEach(el => {
      const id = parseInt(el.dataset.id, 10);
      el.querySelector('.bp-kit-item-edit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        _showEditKitItem(id);
      });
      el.querySelector('.bp-kit-item-del')?.addEventListener('click', (e) => {
        e.stopPropagation();
        _deleteKitItem(id);
      });
    });
    row.appendChild(col);
  }
  grid.appendChild(row);
}

function _groupByType(items) {
  const map = {};
  for (const item of items) {
    const t = item.itemType || 'other';
    if (!map[t]) map[t] = [];
    map[t].push(item);
  }
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([type, items]) => ({ type, items }));
}

function _buildKitItemHtml(item, level) {
  const color = KIT_COLORS[level];
  return `<div class="bp-kit-item ${color}" data-id="${item.id}">
    <span class="bp-kit-item-type ${color}">${_esc(item.itemType)}</span>
    <span class="bp-kit-item-name">${_esc(item.name)}</span>
    ${item.description ? '<span class="bp-kit-item-desc">' + _esc(item.description) + '</span>' : ''}
    <span class="bp-kit-item-actions">
      <button class="bp-kit-item-edit" title="Edit">&#9998;</button>
      <button class="bp-kit-item-del" title="Delete">&#10005;</button>
    </span>
  </div>`;
}

// ── Mother Box ──

const TIER_CSS = {
  bronze: 'c-bronze',
  silver: 'c-silver',
  gold: 'c-gold',
  platinum: 'c-platinum',
};

async function _loadMotherBox() {
  try {
    _motherBoxData = await window.electronAPI.motherbox.get() || [];
  } catch {
    _motherBoxData = [];
  }
  _renderMotherBox();
}

function _renderMotherBox() {
  const el = _panel.querySelector('#bpMotherBox');
  if (!el) return;
  if (!_motherBoxData || !_motherBoxData.length) {
    el.innerHTML = '<div class="bp-empty">No mother box data</div>';
    return;
  }
  el.innerHTML = '';
  const row = _el('div', { className: 'bp-mbox-row' });
  for (let ti = 0; ti < _motherBoxData.length; ti++) {
    const tier = _motherBoxData[ti];
    const cc = TIER_CSS[tier.color] || 'c-bronze';
    const col = _el('div', { className: 'bp-mbox-col ' + cc });
    let totalItems = 0;
    for (const cat of tier.categories) totalItems += cat.items.length;
    let catHtml = '';
    for (const cat of tier.categories) {
      let itemsHtml = '';
      for (const item of cat.items) {
        const tagHtml = item.tags && item.tags.length
          ? '<span class="bp-mbox-item-tags">' + item.tags.map(t => '<span class="bp-mbox-tag">' + _esc(t) + '</span>').join('') + '</span>'
          : '';
        itemsHtml += '<div class="bp-mbox-item ' + cc + '" data-tier="' + _esc(tier.color) + '" data-cat="' + _esc(cat.name) + '" data-idx="' + _esc(item.name) + '">'
          + '<span class="bp-mbox-item-name">' + _esc(item.name) + '</span>'
          + '<span class="bp-mbox-item-desc">' + _esc(item.description) + '</span>'
          + tagHtml
          + '</div>';
      }
      catHtml += '<div class="bp-mbox-cat">'
        + '<div class="bp-mbox-cat-header">' + _esc(cat.name) + '</div>'
        + itemsHtml
        + '</div>';
    }
    col.innerHTML = '<div class="bp-mbox-col-header ' + cc + '">'
      + '<span class="bp-mbox-col-title">' + _esc(tier.label) + '</span>'
      + '<span class="bp-mbox-col-subtitle">' + _esc(tier.subtitle || '') + '</span>'
      + '<span class="bp-mbox-col-count">' + totalItems + '</span>'
      + '</div>'
      + '<div class="bp-mbox-col-body">' + catHtml + '</div>';
    row.appendChild(col);
  }
  el.appendChild(row);

  el.querySelectorAll('.bp-mbox-item').forEach(itemEl => {
    itemEl.addEventListener('click', () => {
      const tierColor = itemEl.dataset.tier;
      const catName = itemEl.dataset.cat;
      const itemName = itemEl.dataset.idx;
      for (const tier of _motherBoxData) {
        if (tier.color !== tierColor) continue;
        for (const cat of tier.categories) {
          if (cat.name !== catName) continue;
          const found = cat.items.find(i => i.name === itemName);
          if (found) { _showMotherBoxDetail(found, tierColor); return; }
        }
      }
    });
  });
}

// ── Add Kit Item ──

let _addKitModal = null;

function _showAddKitItem(level) {
  _removeKitModal();
  const modal = _el('div', { className: 'bp-cat-modal' });
  modal.innerHTML = `
    <div class="bp-cat-modal-box" style="width:420px">
      <div class="bp-cat-modal-title">Add to ${KIT_LABELS[level]} Kit</div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Name</label>
        <input class="bp-edit-input" id="bpKitAddName" placeholder="e.g. JWT Authentication">
      </div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Type</label>
        <select class="bp-edit-select" id="bpKitAddType"></select>
      </div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Description (optional)</label>
        <input class="bp-edit-input" id="bpKitAddDesc" placeholder="Brief note about this item">
      </div>
      <div class="bp-cat-modal-actions">
        <button class="bp-cat-modal-btn" id="bpKitAddCancel">Cancel</button>
        <button class="bp-cat-modal-btn primary" id="bpKitAddCreate">Add</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  _addKitModal = { modal, level };

  (async () => {
    let types = [];
    try { types = await window.electronAPI.kit.getTypes(); } catch {}
    const select = modal.querySelector('#bpKitAddType');
    select.innerHTML = types.map(t => `<option value="${t}">${_esc(t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</option>`).join('');
  })();

  modal.addEventListener('click', (e) => { if (e.target === modal) _removeKitModal(); });
  modal.querySelector('#bpKitAddCancel').addEventListener('click', _removeKitModal);
  modal.querySelector('#bpKitAddCreate').addEventListener('click', async () => {
    const name = modal.querySelector('#bpKitAddName').value.trim();
    const itemType = modal.querySelector('#bpKitAddType').value;
    const description = modal.querySelector('#bpKitAddDesc').value.trim();
    if (!name) return;
    try {
      await window.electronAPI.kit.create({
        categoryId: _selectedCategory.id,
        kitLevel: level,
        itemType,
        name,
        description,
      });
      _removeKitModal();
      await _loadKits();
    } catch (err) {
      console.error('[Kit] Create error:', err);
    }
  });
  setTimeout(() => modal.querySelector('#bpKitAddName').focus(), 50);
}

function _removeKitModal() {
  if (_addKitModal) {
    _addKitModal.modal.remove();
    _addKitModal = null;
  }
}

// ── Edit Kit Item ──

function _showEditKitItem(id) {
  const allItems = [...(_kitItems.starter || []), ...(_kitItems.medium || []), ...(_kitItems.large || [])];
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  const modal = _el('div', { className: 'bp-cat-modal' });
  modal.innerHTML = `
    <div class="bp-cat-modal-box" style="width:420px">
      <div class="bp-cat-modal-title">Edit Kit Item</div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Name</label>
        <input class="bp-edit-input" id="bpKitEditName" value="${_esc(item.name)}">
      </div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Type</label>
        <select class="bp-edit-select" id="bpKitEditType"></select>
      </div>
      <div class="bp-edit-field">
        <label class="bp-edit-label">Description</label>
        <input class="bp-edit-input" id="bpKitEditDesc" value="${_esc(item.description || '')}">
      </div>
      <div class="bp-cat-modal-actions">
        <button class="bp-cat-modal-btn" id="bpKitEditCancel">Cancel</button>
        <button class="bp-cat-modal-btn primary" id="bpKitEditSave">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  (async () => {
    let types = [];
    try { types = await window.electronAPI.kit.getTypes(); } catch {}
    const select = modal.querySelector('#bpKitEditType');
    select.innerHTML = types.map(t =>
      `<option value="${t}" ${t === item.itemType ? 'selected' : ''}>${_esc(t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</option>`
    ).join('');
  })();

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#bpKitEditCancel').addEventListener('click', () => modal.remove());
  modal.querySelector('#bpKitEditSave').addEventListener('click', async () => {
    const name = modal.querySelector('#bpKitEditName').value.trim();
    const itemType = modal.querySelector('#bpKitEditType').value;
    const description = modal.querySelector('#bpKitEditDesc').value.trim();
    if (!name) return;
    try {
      await window.electronAPI.kit.update({ id, itemType, name, description });
      modal.remove();
      await _loadKits();
    } catch (err) {
      console.error('[Kit] Update error:', err);
    }
  });
  setTimeout(() => modal.querySelector('#bpKitEditName').focus(), 50);
}

// ── Delete Kit Item ──

async function _deleteKitItem(id) {
  if (!confirm('Delete this kit item?')) return;
  try {
    await window.electronAPI.kit.delete(id);
    await _loadKits();
  } catch (err) {
    console.error('[Kit] Delete error:', err);
  }
}
