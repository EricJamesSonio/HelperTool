import { getData, getSelectedCategoryId, setSelectedCategoryId } from './state.js';
import { renderPromptList } from './prompts.js';

export function renderCategories() {
    const wrap = document.getElementById('promptCats');
    if (!wrap) return;
    wrap.innerHTML = '';

    const cats = getData().categories || [];
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

export function restoreSelectedCategory() {
    const catId = getSelectedCategoryId();
    if (catId) {
        const btn = document.getElementById(`promptCatBtn_${catId}`);
        if (btn) {
            document.querySelectorAll('.prompt-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        } else {
            // category no longer exists
            setSelectedCategoryId(null);
        }
    }
}

export function wireCategoryAdd(onRefresh) {
    const addBtn = document.getElementById('promptCatAdd');
    const nameEl = document.getElementById('promptCatName');
    if (!addBtn || !nameEl) return;

    addBtn.addEventListener('click', async () => {
        const name = nameEl.value.trim();
        if (!name) return;
        await window.electronAPI.prompts.createCategory({ name });
        nameEl.value = '';
        await onRefresh();
    });
}
