/**
 * promptTool.js
 * Prompt Management UI (categories + prompts) and prompt selection modal.
 */

import { state } from './app_manager/appState.js';

let _data = null;
let _modal = null;
let _selectedCategoryId = null;

export function openPromptToolModal() {
    if (_modal) {
        _modal.style.display = 'flex';
        return;
    }

    _modal = document.createElement('div');
    _modal.id = 'promptToolModal';
    _modal.className = 'modal-overlay';
    _modal.innerHTML = `
      <div class="modal-content pt-modal">
        <div class="modal-header pt-header">
          <h3 class="modal-title pt-title">🧩 Prompt Tool</h3>
          <button class="modal-close-btn" id="promptToolCloseBtn">×</button>
        </div>
        <div class="modal-body pt-main">
          <div class="pt-sidebar">
            <div class="pt-sidebar-header">
              <div class="pt-sidebar-title">Categories</div>
            </div>
            <div id="promptCats" class="pt-cat-list"></div>
            <div class="pt-add-cat">
              <input id="promptCatName" class="sh-input sh-input-sm pt-input" placeholder="New category name" />
              <button id="promptCatAdd" class="sh-btn sh-btn-accent sh-btn-sm" type="button">＋ Add</button>
            </div>
          </div>

          <div class="pt-content">
            <div class="pt-no-cat-message">
              <div class="pt-no-cat-icon">📂</div>
              <div class="pt-no-cat-text">Select a category to manage prompts</div>
            </div>
            <div class="pt-prompt-list-wrap">
              <div class="pt-sidebar-header">
                <button class="pt-back-btn" id="promptBackToCats" type="button">← Back</button>
                <div class="pt-sidebar-title">Prompts</div>
              </div>
              <div id="promptList" class="pt-prompt-list"></div>
            </div>

            <div class="pt-editor">
              <div class="pt-editor-row">
                <div class="pt-editor-label">Applies to:</div>
                <select id="promptSupports" class="sh-input sh-input-sm pt-input">
                  <option value="code">Code Mode</option>
                  <option value="structure">Structure Mode</option>
                  <option value="both" selected>Both</option>
                </select>
                <button id="promptResetEditor" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">New Prompt</button>
              </div>
              <input id="promptTitle" class="sh-input pt-input" placeholder="Prompt title" />
              <textarea id="promptBody" class="sh-input pt-textarea" placeholder="Prompt text..."></textarea>
              <div class="pt-actions">
                <button id="promptSave" class="sh-btn sh-btn-primary sh-btn-sm" type="button">💾 Save</button>
                <button id="promptDelete" class="sh-btn sh-btn-danger sh-btn-sm" type="button" style="display:none;">🗑 Delete</button>
                <div style="flex:1"></div>
                <button id="promptToggleFavorite" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">☆ Favorite</button>
                <button id="promptTogglePin" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">📌 Pin</button>
              </div>
              <div style="font-size:12px; opacity:0.75;">Tip: Pins are per prompt and appear first in applicable results.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(_modal);

    _modal.querySelector('#promptToolCloseBtn').addEventListener('click', closePromptToolModal);
    _modal.addEventListener('click', (e) => {
        if (e.target === _modal) closePromptToolModal();
    });

    wireCategoryAdd();
    wirePromptSave();
    wirePromptDelete();
    wirePromptFavoritePin();
    wireBackButton();

    refresh();
    _modal.style.display = 'flex';
}

export function closePromptToolModal() {
    if (_modal) _modal.style.display = 'none';
}

async function refresh() {
    try {
        _data = await window.electronAPI.prompts.load();
    } catch {
        _data = { categories: [], prompts: [] };
    }


    renderCategories();
    renderPromptList();
}

function getSelectedCategoryId() {
    return _selectedCategoryId;
}

function setSelectedCategoryId(catId) {
    _selectedCategoryId = catId;
    document.querySelectorAll('.prompt-cat-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`promptCatBtn_${catId}`);
    if (btn) btn.classList.add('active');
}

function restoreSelectedCategory() {
    if (_selectedCategoryId) {
        const btn = document.getElementById(`promptCatBtn_${_selectedCategoryId}`);
        if (btn) {
            document.querySelectorAll('.prompt-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        } else {
            _selectedCategoryId = null;
        }
    }
}

function renderCategories() {
    const wrap = document.getElementById('promptCats');
    if (!wrap) return;
    wrap.innerHTML = '';

    const cats = _data.categories || [];
    if (!cats.length) {
        wrap.innerHTML = '<div class="pt-empty-list">No categories yet.</div>';
        return;
    }

    cats.forEach(c => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `promptCatBtn_${c.id}`;
        btn.dataset.catId = c.id;
        btn.className = 'pt-cat-item prompt-cat-btn';
        btn.textContent = c.name;
        btn.addEventListener('click', () => {
            setSelectedCategoryId(c.id);
            renderPromptList();
        });
        wrap.appendChild(btn);
    });

    restoreSelectedCategory();
}


function renderPromptList() {
    const list = document.getElementById('promptList');
    const content = document.querySelector('.pt-content');
    if (!list || !content) return;
    list.innerHTML = '';

    const catId = getSelectedCategoryId();
    content.classList.toggle('has-cat', !!catId);
    clearEditor();

    if (!catId) return;

    const prompts = (_data.prompts || []).filter(p => p.categoryId === catId);

    if (!prompts.length) {
        list.innerHTML = '<div class="pt-empty-list">No prompts in this category yet.</div>';
        return;
    }

    // Sort pinned first, then favorites, then newest
    prompts.sort((a, b) => {
        const ap = a.pinnedAt ? 1 : 0;
        const bp = b.pinnedAt ? 1 : 0;
        if (ap !== bp) return bp - ap;
        if (!!b.isFavorite !== !!a.isFavorite) return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
        return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
    });

    prompts.forEach(p => {
        const row = document.createElement('div');
        row.className = 'pt-prompt-item';
        row.dataset.promptId = p.id;
        const supportsClass = `pt-badge-${p.supports || 'both'}`;

        row.innerHTML = `
          <div class="pt-prompt-item-header">
            <div class="pt-prompt-item-title">${escapeHtml(p.title || '(Untitled)')}</div>
            <div class="pt-prompt-item-meta">
              <span class="pt-badge ${supportsClass}">${escapeHtml(p.supports || 'both')}</span>
              ${p.isFavorite ? '★' : ''} ${p.pinnedAt ? '📌' : ''}
            </div>
          </div>
          <div class="pt-prompt-item-body">${escapeHtml((p.body || '').slice(0, 120))}${(p.body || '').length > 120 ? '…' : ''}</div>
        `;

        row.addEventListener('click', () => {
            setSelectedPrompt(p);
        });

        list.appendChild(row);
      });
}

function setSelectedPrompt(p) {
    document.getElementById('promptTitle').value = p.title || '';
    document.getElementById('promptBody').value = p.body || '';
    document.getElementById('promptSupports').value = p.supports || 'both';
    window.__promptToolSelectedPromptId = p.id;

    document.getElementById('promptDelete').style.display = 'inline-flex';
    document.getElementById('promptToggleFavorite').textContent = p.isFavorite ? '★ Favorited' : '☆ Favorite';
    document.getElementById('promptTogglePin').textContent = p.pinnedAt ? '📌 Pinned' : '📌 Pin';
}

function clearEditor() {
    document.getElementById('promptTitle').value = '';
    document.getElementById('promptBody').value = '';
    document.getElementById('promptSupports').value = 'both';
    window.__promptToolSelectedPromptId = null;

    document.getElementById('promptDelete').style.display = 'none';
    document.getElementById('promptToggleFavorite').textContent = '☆ Favorite';
    document.getElementById('promptTogglePin').textContent = '📌 Pin';
}

function wireCategoryAdd() {
    const addBtn = document.getElementById('promptCatAdd');
    const nameEl = document.getElementById('promptCatName');
    if (!addBtn || !nameEl) return;

    addBtn.addEventListener('click', async () => {
        const name = nameEl.value.trim();
        if (!name) return;
        await window.electronAPI.prompts.createCategory({ name });
        nameEl.value = '';
        await refresh();
    });
}

function wirePromptSave() {
    const saveBtn = document.getElementById('promptSave');
    if (!saveBtn) return;

    const resetBtn = document.getElementById('promptResetEditor');
    resetBtn?.addEventListener('click', () => clearEditor());

    saveBtn.addEventListener('click', async () => {
        const catId = getSelectedCategoryId();
        if (!catId) return;

        const selectedId = window.__promptToolSelectedPromptId || null;
        const title = document.getElementById('promptTitle').value;
        const body = document.getElementById('promptBody').value;
        const supports = document.getElementById('promptSupports').value;

        // Preserve favorite/pin from currently selected prompt if editing
        let isFavorite = false;
        let pinnedAt = null;
        if (selectedId) {
            const existing = (_data.prompts || []).find(p => p.id === selectedId);
            isFavorite = !!existing?.isFavorite;
            pinnedAt = existing?.pinnedAt || null;
        }

        await window.electronAPI.prompts.upsertPrompt({
            id: selectedId,
            categoryId: catId,
            title,
            body,
            supports,
            isFavorite,
            pinnedAt,
        });

        await refresh();

        // reselect editor prompt if editing
        const pid = selectedId;
        if (pid) {
            const p = (_data.prompts || []).find(x => x.id === pid);
            if (p) setSelectedPrompt(p);
        }
    });
}

function wirePromptDelete() {
    const delBtn = document.getElementById('promptDelete');
    if (!delBtn) return;

    delBtn.addEventListener('click', async () => {
        const id = window.__promptToolSelectedPromptId;
        if (!id) return;
        await window.electronAPI.prompts.deletePrompt({ id });
        clearEditor();
        await refresh();
    });
}

function wirePromptFavoritePin() {
    const favBtn = document.getElementById('promptToggleFavorite');
    const pinBtn = document.getElementById('promptTogglePin');
    if (!favBtn || !pinBtn) return;

    favBtn.addEventListener('click', async () => {
        const id = window.__promptToolSelectedPromptId;
        if (!id) return;
        const p = await window.electronAPI.prompts.toggleFavorite({ id });
        // update button text
        favBtn.textContent = p.isFavorite ? '★ Favorited' : '☆ Favorite';
    });

    pinBtn.addEventListener('click', async () => {
        const id = window.__promptToolSelectedPromptId;
        if (!id) return;
        const p = await window.electronAPI.prompts.togglePin({ id });
        pinBtn.textContent = p.pinnedAt ? '📌 Pinned' : '📌 Pin';
        await refresh();
    });
}

function wireBackButton() {
    const btn = document.getElementById('promptBackToCats');
    if (!btn) return;
    btn.addEventListener('click', () => {
        _selectedCategoryId = null;
        document.querySelectorAll('.prompt-cat-btn').forEach(b => b.classList.remove('active'));
        renderPromptList();
    });
}

function escapeHtml(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '<')
        .replaceAll('>', '>')
        .replaceAll('"', '"')
        .replaceAll("'", '&#039;');
}

// --- Prompt selection modal (generator picker) ---
// For now, generator flow uses state.selectedPromptText set by another modal.
// This function exists to satisfy the generator button hook.

export async function openPromptSelectionModal() {
    console.debug('[PromptTool] openPromptSelectionModal called');

    // Mode-filtered prompt picker for generator flow.
    // Selects 0..N prompts and concatenates their bodies into state.selectedPromptText.

    // Remove any existing selection modal

    const existing = document.getElementById('promptSelectionModal');
    if (existing) existing.remove();

    // Ensure visible above other overlays
    document.body.style.position = document.body.style.position || 'relative';



    const modal = document.createElement('div');
    modal.id = 'promptSelectionModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content pt-selection-modal">
        <div class="modal-header pt-header">
          <h3 class="modal-title pt-title">🧩 Select Prompt(s)</h3>
          <button class="modal-close-btn" id="promptSelectionCloseBtn">×</button>
        </div>

        <div class="modal-body pt-selection-body">
          <div class="pt-selection-list">
            <div class="pt-editor-row">
              <div class="pt-editor-label">Filtered by: <b>${escapeHtml(state.actionType || '')}</b></div>
              <button id="promptSelectionClearBtn" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">Clear selected</button>
            </div>
            <div id="promptSelectionList" class="pt-prompt-list"></div>
          </div>

          <div class="pt-selection-preview">
            <div class="pt-sidebar-title">Selected Prompt Text</div>
            <textarea id="promptSelectionPreview" class="sh-input pt-textarea" readonly></textarea>
            <div style="font-size:12px; opacity:0.75; line-height:1.3;">
              Your selected prompt text will be prepended at the top of generated output.
            </div>
          </div>
        </div>

        <div class="modal-actions pt-actions">
          <button class="modal-btn modal-btn-secondary" id="promptSelectionCancelBtn" type="button">Cancel</button>
          <div style="flex:1"></div>
          <button class="modal-btn modal-btn-primary" id="promptSelectionConfirmBtn" type="button">✅ Apply & Continue</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Force-visibility override (in case CSS has conflicting rules)
    modal.style.display = 'flex';
    modal.style.position = 'fixed';
    modal.style.zIndex = '99999';


    const closeBtn = modal.querySelector('#promptSelectionCloseBtn');
    const cancelBtn = modal.querySelector('#promptSelectionCancelBtn');
    const clearBtn = modal.querySelector('#promptSelectionClearBtn');
    const confirmBtn = modal.querySelector('#promptSelectionConfirmBtn');
    const listEl = modal.querySelector('#promptSelectionList');
    const previewEl = modal.querySelector('#promptSelectionPreview');

    function close() {
        modal.remove();
    }

    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    let selectedIds = Array.isArray(state.selectedPromptIds) ? [...state.selectedPromptIds] : [];

    async function loadAndRender() {
        listEl.innerHTML = '';
        previewEl.value = '';

        const mode = state.actionType === 'structure' ? 'structure' : 'code';
        console.debug('[PromptTool] fetching applicable prompts for mode:', mode);
        const applicable = await window.electronAPI.prompts.getApplicable(mode);
        console.debug('[PromptTool] applicable result received:', applicable);

        const categories = applicable.categories || [];
        const prompts = applicable.prompts || [];

        // Group by categoryId (but display category header, no category clicking)
        const byCat = new Map();
        for (const c of categories) byCat.set(c.id, []);
        for (const p of prompts) {
            if (!byCat.has(p.categoryId)) byCat.set(p.categoryId, []);
            byCat.get(p.categoryId).push(p);
        }

        let total = 0;
        for (const [catId, ps] of byCat.entries()) {
            if (!ps.length) continue;
            total += ps.length;
            const cat = categories.find(c => c.id === catId);
            const catName = cat?.name || '(Uncategorized)';

            const catWrap = document.createElement('div');
            catWrap.className = 'pt-cat-wrap';
            catWrap.innerHTML = `<div class="pt-cat-header">📁 ${escapeHtml(catName)} <span class="pt-cat-count">${ps.length} prompt(s)</span></div>`;

            ps.forEach(p => {
                const row = document.createElement('div');
                row.className = 'pt-select-item';
                const isSelected = selectedIds.includes(p.id);
                if (isSelected) row.classList.add('selected');

                const supportsClass = `pt-badge-${p.supports || 'both'}`;

                row.innerHTML = `
                  <input type="checkbox" class="pt-checkbox" ${isSelected ? 'checked' : ''} />
                  <div class="pt-select-item-info">
                    <div class="pt-select-item-title">${escapeHtml(p.title || '(Untitled)')}</div>
                    <div class="pt-select-item-meta">
                      <span class="pt-badge ${supportsClass}">${escapeHtml(p.supports || 'both')}</span>
                      ${p.isFavorite ? '★' : ''} ${p.pinnedAt ? '📌' : ''}
                    </div>
                    <div class="pt-select-item-body">${escapeHtml((p.body || '').slice(0, 100))}${(p.body || '').length > 100 ? '…' : ''}</div>
                  </div>
                `;

                function toggle() {
                    const idx = selectedIds.indexOf(p.id);
                    if (idx === -1) selectedIds.push(p.id);
                    else selectedIds.splice(idx, 1);
                    loadAndRenderPreviewOnly();
                    row.classList.toggle('selected', selectedIds.includes(p.id));
                    const cb = row.querySelector('input[type="checkbox"]');
                    if (cb) cb.checked = selectedIds.includes(p.id);
                }

                row.addEventListener('click', toggle);
                const cb = row.querySelector('input[type="checkbox"]');
                cb?.addEventListener('click', (e) => e.stopPropagation());

                catWrap.appendChild(row);
            });

            listEl.appendChild(catWrap);
        }

        if (total === 0) {
            listEl.innerHTML = '<div class="pt-empty-list">No prompts applicable for this mode.</div>';
        }

        await loadAndRenderPreviewOnly();
    }

    async function loadAndRenderPreviewOnly() {
        const mode = state.actionType === 'structure' ? 'structure' : 'code';
        const applicable = await window.electronAPI.prompts.getApplicable(mode);
        const prompts = applicable.prompts || [];
        const byId = new Map(prompts.map(p => [p.id, p]));

        const texts = selectedIds.map(id => byId.get(id)?.body || '').filter(Boolean);
        // Join multiple prompts in deterministic order: pinned->favorite->newest already from main list.
        state.selectedPromptIds = [...selectedIds];
        state.selectedPromptText = texts.length ? texts.join('\n\n') : '';
        previewEl.value = state.selectedPromptText;
    }

    clearBtn?.addEventListener('click', () => {
        selectedIds = [];
        state.selectedPromptIds = [];
        state.selectedPromptText = '';
        previewEl.value = '';
        // rerender whole
        loadAndRender();
    });

    confirmBtn?.addEventListener('click', () => {
        // already set on preview update
        close();
        const genBtn = document.getElementById('generateBtn');
        if (genBtn && !genBtn.disabled) genBtn.click();
    });

    // Initial render
    await loadAndRender();
}


