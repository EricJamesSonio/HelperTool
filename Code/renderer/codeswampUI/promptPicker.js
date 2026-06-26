const CAT_PALETTE = [
  '#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
  '#f472b6', '#fb923c', '#2dd4bf', '#e879f9', '#38bdf8',
];

export async function openPromptPicker() {
  const existing = document.getElementById('ocPromptPickerModal');
  if (existing) existing.remove();

  const data = await window.electronAPI.prompts.load();
  const categories = data.categories || [];
  const prompts = data.prompts || [];

  const byCat = new Map();
  for (const c of categories) byCat.set(c.id, []);
  for (const p of prompts) {
    if (!byCat.has(p.categoryId)) byCat.set(p.categoryId, []);
    byCat.get(p.categoryId).push(p);
  }

  const overlay = document.createElement('div');
  overlay.id = 'ocPromptPickerModal';
  overlay.className = 'oc-pp-overlay';
  document.body.appendChild(overlay);

  const modal = document.createElement('div');
  modal.className = 'oc-pp-modal';
  overlay.appendChild(modal);

  function close() { overlay.remove(); }
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function ppEscape(e) {
    if (e.key === 'Escape' && document.getElementById('ocPromptPickerModal')) { close(); document.removeEventListener('keydown', ppEscape); }
  });

  function renderCategories() {
    modal.innerHTML = `
      <div class="oc-pp-header">
        <span class="oc-pp-title">Select a Category</span>
        <button class="oc-pp-close" id="ocPpClose">✕</button>
      </div>
      <div class="oc-pp-body" id="ocPpBody">
        <div class="oc-pp-cat-grid" id="ocPpCatGrid"></div>
      </div>
    `;
    modal.querySelector('#ocPpClose').addEventListener('click', close);

    const grid = modal.querySelector('#ocPpCatGrid');
    categories.forEach((cat, i) => {
      const color = CAT_PALETTE[i % CAT_PALETTE.length];
      const count = (byCat.get(cat.id) || []).length;
      const card = document.createElement('div');
      card.className = 'oc-pp-cat-card';
      card.style.setProperty('--pp-color', color);
      card.innerHTML = `
        <div class="oc-pp-cat-gem">
          <svg viewBox="0 0 40 40" width="28" height="28">
            <polygon points="20,4 36,14 36,26 20,36 4,26 4,14" fill="${color}22" stroke="${color}" stroke-width="1.5"/>
            <polygon points="20,4 36,14 20,18" fill="${color}44"/>
            <polygon points="20,18 36,14 36,26 20,36" fill="${color}33"/>
          </svg>
        </div>
        <div class="oc-pp-cat-label">${_esc(cat.name)}</div>
        <div class="oc-pp-cat-count">${count} prompt${count !== 1 ? 's' : ''}</div>
      `;
      card.addEventListener('click', () => renderPrompts(cat.id, color, categories, prompts, byCat));
      grid.appendChild(card);
    });
  }

  function renderPrompts(catId, color, categories, prompts, byCat) {
    const cat = categories.find(c => c.id === catId);
    const catName = cat?.name || 'Category';
    const list = byCat.get(catId) || [];

    modal.innerHTML = `
      <div class="oc-pp-header">
        <button class="oc-pp-back" id="ocPpBack">← Back</button>
        <span class="oc-pp-title" style="color:${color}">${_esc(catName)}</span>
        <button class="oc-pp-close" id="ocPpClose">✕</button>
      </div>
      <div class="oc-pp-body" id="ocPpBody">
        <div class="oc-pp-prompt-grid" id="ocPpPromptGrid"></div>
      </div>
    `;
    modal.querySelector('#ocPpClose').addEventListener('click', close);
    modal.querySelector('#ocPpBack').addEventListener('click', renderCategories);

    const grid = modal.querySelector('#ocPpPromptGrid');
    if (!list.length) {
      grid.innerHTML = '<div class="oc-pp-empty">No prompts in this category.</div>';
      return;
    }

    list.forEach(p => {
      const card = document.createElement('div');
      card.className = 'oc-pp-prompt-card';
      card.style.setProperty('--pp-color', color);
      card.innerHTML = `
        <div class="oc-pp-prompt-title">${_esc(p.title || '(Untitled)')}</div>
        <div class="oc-pp-prompt-preview">${_esc((p.body || '').trim()) || '<span class="oc-pp-empty-inline">(empty)</span>'}</div>
      `;
      card.addEventListener('click', () => {
        const input = document.getElementById('ocInput');
        if (input) {
          input.value = p.body || '';
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 200) + 'px';
          input.focus();
        }
        close();
      });
      grid.appendChild(card);
    });
  }

  renderCategories();
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
