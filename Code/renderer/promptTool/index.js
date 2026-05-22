import { setModal, getModal, setData } from './state.js';
import { getMainTemplate } from './template.js';
import { renderCategories } from './categories.js';
import { renderPromptList } from './prompts.js';
import { wireCategoryAdd } from './categories.js';
import { wirePromptSave, wirePromptDelete, wirePromptFavoritePin, wireBackButton } from './wiring.js';
import { openPromptSelectionModal } from './selectionModal.js';

async function refresh() {
    try {
        setData(await window.electronAPI.prompts.load());
    } catch {
        setData({ categories: [], prompts: [] });
    }
    renderCategories();
    renderPromptList();
}

export function openPromptToolModal() {
    const existing = getModal();
    if (existing) {
        existing.style.display = 'flex';
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'promptToolModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = getMainTemplate();
    document.body.appendChild(modal);
    setModal(modal);

    modal.querySelector('#promptToolCloseBtn').addEventListener('click', closePromptToolModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closePromptToolModal();
    });

    wireCategoryAdd(refresh);
    wirePromptSave(refresh);
    wirePromptDelete(refresh);
    wirePromptFavoritePin(refresh);
    wireBackButton();

    refresh();
    modal.style.display = 'flex';
}

export function closePromptToolModal() {
    const modal = getModal();
    if (modal) modal.style.display = 'none';
}

export { openPromptSelectionModal };
