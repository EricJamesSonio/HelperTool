import { getData, getSelectedCategoryId, setSelectedCategoryId, setSelectedCategoryColor } from './state.js';
import { renderPromptList } from './prompts.js';
import { escapeHtml } from './utils.js';

const CAT_PALETTE = [
  '#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
  '#f472b6', '#fb923c', '#2dd4bf', '#e879f9', '#38bdf8',
];

export function renderCategories(onRefresh) {
    const grid = document.getElementById('ptCatGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const cats = getData().categories || [];
    if (!cats.length) {
        grid.innerHTML = '<div class="pt-empty-list">No categories yet.</div>';
        return;
    }

    cats.forEach((c, i) => {
        const color = CAT_PALETTE[i % CAT_PALETTE.length];
        const count = (getData().prompts || []).filter(p => p.categoryId === c.id).length;
        const card = document.createElement('div');
        card.className = 'pt-cat-card';
        card.style.setProperty('--pt-color', color);
        card.innerHTML = `
          <div class="pt-cat-gem">
            <svg viewBox="0 0 40 40" width="28" height="28">
              <polygon points="20,4 36,14 36,26 20,36 4,26 4,14" fill="${color}22" stroke="${color}" stroke-width="1.5"/>
              <polygon points="20,4 36,14 20,18" fill="${color}44"/>
              <polygon points="20,18 36,14 36,26 20,36" fill="${color}33"/>
            </svg>
          </div>
          <div class="pt-cat-label">${escapeHtml(c.name)}</div>
          <div class="pt-cat-count">${count} prompt${count !== 1 ? 's' : ''}</div>
        `;
        card.addEventListener('click', () => {
            setSelectedCategoryId(c.id);
            setSelectedCategoryColor(color);
            renderPromptList();
            document.getElementById('ptPhaseCats').style.display = 'none';
            document.getElementById('ptPhasePrompts').style.display = 'flex';
            const titleEl = document.getElementById('ptPhaseTitle');
            if (titleEl) { titleEl.textContent = c.name; titleEl.style.color = color; }
        });
        grid.appendChild(card);
    });
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
