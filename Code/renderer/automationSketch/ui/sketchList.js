export function renderSketchList(sketches, callbacks) {
  const listHtml = sketches.map(s => {
    const date = new Date(s.updatedAt || s.createdAt).toLocaleDateString();
    return `<div class="as-sketch-item" data-id="${s.id}">
      <div class="as-sketch-item-icon">${ICONS.flow}</div>
      <div class="as-sketch-item-info">
        <div class="as-sketch-item-name">${escapeHtml(s.name)}</div>
        <div class="as-sketch-item-date">${date}</div>
      </div>
      <button class="as-sketch-item-del" data-id="${s.id}" title="Delete">${ICONS.trash}</button>
    </div>`;
  }).join('');

  return `<div class="as-list-view">
    <div class="as-list-header">
      <h2>Automation Sketches</h2>
      <button class="as-btn as-btn-primary" id="asNewSketchBtn">${ICONS.plus} New Sketch</button>
    </div>
    <div class="as-list-grid">
      ${listHtml || '<div class="as-empty">No sketches yet. Click "New Sketch" to start.</div>'}
    </div>
  </div>`;
}

export function bindSketchList(container, callbacks) {
  container.querySelector('#asNewSketchBtn')?.addEventListener('click', () => callbacks.onNew?.());

  container.querySelectorAll('.as-sketch-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.as-sketch-item-del')) return;
      callbacks.onOpen?.(el.dataset.id);
    });
  });

  container.querySelectorAll('.as-sketch-item-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onDelete?.(btn.dataset.id);
    });
  });
}

const ICONS = {
  plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>',
  trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M2 4h12M5 4V2h6v2M3 4l1 10h8l1-10"/></svg>',
  flow: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><circle cx="10" cy="4" r="2"/><circle cx="4" cy="16" r="2"/><circle cx="16" cy="16" r="2"/><line x1="10" y1="6" x2="4" y2="14"/><line x1="10" y1="6" x2="16" y2="14"/></svg>',
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
