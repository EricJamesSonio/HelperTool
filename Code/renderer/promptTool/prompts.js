import { getData, getSelectedCategoryId, getSelectedCategoryColor } from './state.js';
import { escapeHtml } from './utils.js';
import { ICON_STAR, ICON_STAR_FILLED, ICON_PIN } from './template.js';

export function renderPromptList() {
    const grid = document.getElementById('ptPromptGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const catId = getSelectedCategoryId();
    clearEditor();

    if (!catId) return;

    const color = getSelectedCategoryColor() || '#60a5fa';
    const prompts = (getData().prompts || []).filter(p => p.categoryId === catId);

    if (!prompts.length) {
        grid.innerHTML = '<div class="pt-empty-list">No prompts in this category yet.</div>';
        return;
    }

    prompts.sort((a, b) => {
        const ap = a.pinnedAt ? 1 : 0;
        const bp = b.pinnedAt ? 1 : 0;
        if (ap !== bp) return bp - ap;
        if (!!b.isFavorite !== !!a.isFavorite) return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
        return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
    });

    prompts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'pt-prompt-card';
        card.dataset.promptId = p.id;
        card.style.setProperty('--pt-color', color);
        card.innerHTML = `
          <div class="pt-prompt-card-title">${escapeHtml(p.title || '(Untitled)')}</div>
          <div class="pt-prompt-card-preview">${escapeHtml((p.body || '').trim()) || '<span class="pt-empty-inline">(empty)</span>'}</div>
        `;
        card.addEventListener('click', () => {
            document.querySelectorAll('.pt-prompt-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            setSelectedPrompt(p);
        });
        grid.appendChild(card);
    });
}

export function setSelectedPrompt(p) {
    document.getElementById('promptTitle').value = p.title || '';
    document.getElementById('promptBody').value = p.body || '';
    document.getElementById('promptSupports').value = p.supports || 'both';
    window.__promptToolSelectedPromptId = p.id;

    document.getElementById('promptDelete').style.display = 'inline-flex';
    document.getElementById('promptToggleFavorite').innerHTML = p.isFavorite ? `${ICON_STAR_FILLED} Favorited` : `${ICON_STAR} Favorite`;
    document.getElementById('promptTogglePin').innerHTML = p.pinnedAt ? `${ICON_PIN} Pinned` : `${ICON_PIN} Pin`;
}

export function clearEditor() {
    document.getElementById('promptTitle').value = '';
    document.getElementById('promptBody').value = '';
    document.getElementById('promptSupports').value = 'both';
    window.__promptToolSelectedPromptId = null;

    const delBtn = document.getElementById('promptDelete');
    if (delBtn) delBtn.style.display = 'none';
    const favBtn = document.getElementById('promptToggleFavorite');
    if (favBtn) favBtn.innerHTML = `${ICON_STAR} Favorite`;
    const pinBtn = document.getElementById('promptTogglePin');
    if (pinBtn) pinBtn.innerHTML = `${ICON_PIN} Pin`;
    const cards = document.querySelectorAll('.pt-prompt-card');
    cards.forEach(c => c.classList.remove('active'));
}
