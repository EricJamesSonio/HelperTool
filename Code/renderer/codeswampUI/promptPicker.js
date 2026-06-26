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
  overlay.className = 'oc-prompt-picker-overlay';
  overlay.innerHTML = `
    <div class="oc-prompt-picker">
      <div class="oc-prompt-picker-header">
        <span class="oc-prompt-picker-title">Select a Prompt</span>
        <button class="oc-prompt-picker-close" id="ocPromptPickerClose">✕</button>
      </div>
      <div class="oc-prompt-picker-list" id="ocPromptPickerList"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#ocPromptPickerClose').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function ppEscape(e) {
    if (e.key === 'Escape' && document.getElementById('ocPromptPickerModal')) {
      overlay.remove();
      document.removeEventListener('keydown', ppEscape);
    }
  });

  const list = overlay.querySelector('#ocPromptPickerList');
  let total = 0;

  for (const [catId, ps] of byCat.entries()) {
    if (!ps.length) continue;
    total += ps.length;
    const cat = categories.find(c => c.id === catId);
    const catName = cat?.name || 'Uncategorized';

    const group = document.createElement('div');
    group.className = 'oc-pp-group';
    group.innerHTML = `<div class="oc-pp-cat-name">${_esc(catName)}</div>`;

    ps.forEach(p => {
      const item = document.createElement('div');
      item.className = 'oc-pp-item';
      item.innerHTML = `<div class="oc-pp-item-title">${_esc(p.title || '(Untitled)')}</div>`;
      item.addEventListener('click', () => {
        const input = document.getElementById('ocInput');
        if (input) {
          input.value = p.body || '';
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 200) + 'px';
          input.focus();
        }
        overlay.remove();
      });
      group.appendChild(item);
    });

    list.appendChild(group);
  }

  if (total === 0) {
    list.innerHTML = '<div class="oc-pp-empty">No prompts found. Create one in the Prompts tool first.</div>';
  }
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
