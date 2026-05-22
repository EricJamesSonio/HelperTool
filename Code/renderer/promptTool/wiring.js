import { getData, getSelectedCategoryId, setSelectedCategoryId } from './state.js';
import { clearEditor, setSelectedPrompt, renderPromptList } from './prompts.js';

export function wirePromptSave(onRefresh) {
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
            const existing = (getData().prompts || []).find(p => p.id === selectedId);
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

        await onRefresh();

        // reselect editor prompt if editing
        const pid = selectedId;
        if (pid) {
            const p = (getData().prompts || []).find(x => x.id === pid);
            if (p) setSelectedPrompt(p);
        }
    });
}

export function wirePromptDelete(onRefresh) {
    const delBtn = document.getElementById('promptDelete');
    if (!delBtn) return;

    delBtn.addEventListener('click', async () => {
        const id = window.__promptToolSelectedPromptId;
        if (!id) return;
        await window.electronAPI.prompts.deletePrompt({ id });
        clearEditor();
        await onRefresh();
    });
}

export function wirePromptFavoritePin(onRefresh) {
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
        await onRefresh();
    });
}

export function wireBackButton() {
    const btn = document.getElementById('promptBackToCats');
    if (!btn) return;
    btn.addEventListener('click', () => {
        setSelectedCategoryId(null);
        renderPromptList();
    });
}
