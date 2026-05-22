import { getData, getSelectedCategoryId, getModal } from './state.js';
import { escapeHtml } from './utils.js';

export function renderPromptList() {
    const list = document.getElementById('promptList');
    const content = document.querySelector('.pt-content');
    if (!list || !content) return;
    list.innerHTML = '';

    const catId = getSelectedCategoryId();
    content.classList.toggle('has-cat', !!catId);
    clearEditor();

    if (!catId) return;

    const prompts = (getData().prompts || []).filter(p => p.categoryId === catId);

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

export function setSelectedPrompt(p) {
    document.getElementById('promptTitle').value = p.title || '';
    document.getElementById('promptBody').value = p.body || '';
    document.getElementById('promptSupports').value = p.supports || 'both';
    window.__promptToolSelectedPromptId = p.id;

    document.getElementById('promptDelete').style.display = 'inline-flex';
    document.getElementById('promptToggleFavorite').textContent = p.isFavorite ? '★ Favorited' : '☆ Favorite';
    document.getElementById('promptTogglePin').textContent = p.pinnedAt ? '📌 Pinned' : '📌 Pin';
}

export function clearEditor() {
    document.getElementById('promptTitle').value = '';
    document.getElementById('promptBody').value = '';
    document.getElementById('promptSupports').value = 'both';
    window.__promptToolSelectedPromptId = null;

    document.getElementById('promptDelete').style.display = 'none';
    document.getElementById('promptToggleFavorite').textContent = '☆ Favorite';
    document.getElementById('promptTogglePin').textContent = '📌 Pin';
}
