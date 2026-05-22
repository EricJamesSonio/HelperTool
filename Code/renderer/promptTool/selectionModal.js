import { state } from '../app_manager/appState.js';
import { escapeHtml } from './utils.js';
import { getSelectionModalTemplate } from './template.js';

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
    modal.innerHTML = getSelectionModalTemplate();

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
