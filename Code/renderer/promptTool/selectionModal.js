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
        document.removeEventListener('keydown', escapeHandler);
    }

    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    function escapeHandler(e) {
        if (e.key === 'Escape' && document.getElementById('promptSelectionModal')) {
            close();
        }
    }
    document.addEventListener('keydown', escapeHandler);

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

        const colorPalette = ['#60a5fa','#f87171','#34d399','#fbbf24','#a78bfa','#f472b6','#2dd4bf','#e879f9'];

        let total = 0;
        for (const [catId, ps] of byCat.entries()) {
            if (!ps.length) continue;
            total += ps.length;
            const cat = categories.find(c => c.id === catId);
            const catColor = colorPalette[categories.indexOf(cat) % colorPalette.length];

            ps.forEach(p => {
                const card = document.createElement('div');
                card.className = 'pt-prompt-card';
                card.style.setProperty('--pt-color', catColor);
                const isSelected = selectedIds.includes(p.id);
                if (isSelected) card.classList.add('active');

                const preview = (p.body || '').slice(0, 200);

                card.innerHTML = `
                  <div class="pt-prompt-card-title">${escapeHtml(p.title || '(Untitled)')}</div>
                  <div class="pt-prompt-card-preview">${escapeHtml(preview)}${p.body && p.body.length > 200 ? '...' : ''}</div>
                `;

                function toggle() {
                    const isCurrentlySelected = selectedIds.includes(p.id);

                    // Clear all others
                    listEl.querySelectorAll('.pt-prompt-card').forEach(el => {
                        el.classList.remove('active');
                    });

                    if (!isCurrentlySelected) {
                        selectedIds = [p.id];
                        card.classList.add('active');
                    } else {
                        selectedIds = [];
                    }

                    loadAndRenderPreviewOnly();
                }

                card.addEventListener('click', toggle);
                listEl.appendChild(card);
            });
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

    confirmBtn?.addEventListener('click', async () => {
        const textToUse = state.selectedPromptText;
        
        // Close modal and initiate generation
        close();
        
        const genBtn = document.getElementById('generateBtn');
        if (genBtn && !genBtn.disabled) {
            // We need to ensure the generator uses the captured text 
            // since we are about to reset the state.
            // But wait, the generator button logic itself uses `state.selectedPromptText`.
            // If I reset it here, it will be empty by the time the click handler runs.
            // Instead, let's keep the state, and let the generator reset it itself.
            genBtn.click();
            
            // To fulfill the user's requirement to reset:
            // We can reset the state after a short delay or have the generator do it.
            // Let's reset it after a delay to ensure the click has been processed.
            setTimeout(() => {
                state.selectedPromptIds = [];
                state.selectedPromptText = '';
            }, 100);
        }
    });

    // Initial render
    await loadAndRender();
}
