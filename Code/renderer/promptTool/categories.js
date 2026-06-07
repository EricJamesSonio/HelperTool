import { getData, getSelectedCategoryId, setSelectedCategoryId } from './state.js';
import { renderPromptList } from './prompts.js';
import { escapeHtml } from './utils.js';
import { ICON_EDIT } from './template.js';

export function renderCategories(onRefresh) {
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
        
        btn.innerHTML = `
            <span style="flex:1; text-align:left;">${escapeHtml(c.name)}</span>
            <span class="pt-cat-rename" style="opacity:0.5;">${ICON_EDIT}</span>
        `;
        
        btn.addEventListener('click', () => {
            setSelectedCategoryId(c.id);
            renderPromptList();
        });

        const renameBtn = btn.querySelector('.pt-cat-rename');
        renameBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            const span = btn.querySelector('span');
            const originalText = c.name;
            const input = document.createElement('input');
            input.value = originalText;
            input.style.width = '100%';
            input.style.color = 'var(--text-primary)';
            input.style.background = 'var(--bg-elevated)';
            input.style.border = '1px solid var(--border-default)';
            input.style.borderRadius = 'var(--r-sm)';
            
            btn.replaceChild(input, span);
            input.focus();
            input.select();

            let isFinished = false;
            const finishRename = async () => {
                if (isFinished) return;
                isFinished = true;

                const newName = input.value.trim();
                if (newName && newName !== originalText) {
                    await window.electronAPI.prompts.updateCategory({ id: c.id, name: newName });
                    if (onRefresh) await onRefresh();
                } else {
                    renderCategories(onRefresh);
                }
            };

            input.addEventListener('blur', finishRename);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') finishRename();
                else if (e.key === 'Escape') {
                    isFinished = true;
                    renderCategories(onRefresh);
                }
            });
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
