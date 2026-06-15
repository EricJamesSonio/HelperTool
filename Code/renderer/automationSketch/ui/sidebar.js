import { getCategories } from '../nodes/nodeRegistry.js';

export function renderSidebar() {
  const categories = getCategories();
  const catHtml = Object.entries(categories).map(([catName, nodes]) => {
    const itemsHtml = nodes.map(n => `
      <div class="as-pl-item" data-type="${n.key}" draggable="true">
        <span class="as-pl-item-icon" style="color:${n.color}">${n.icon}</span>
        <span class="as-pl-item-label">${n.label}</span>
      </div>
    `).join('');
    return `<div class="as-pl-category">
      <div class="as-pl-cat-title">${catName}</div>
      ${itemsHtml}
    </div>`;
  }).join('');

  return `<div class="as-sidebar">
    <div class="as-sidebar-title">Node Palette</div>
    <div class="as-pl-list">${catHtml}</div>
  </div>`;
}

export function bindSidebar(container, callbacks) {
  container.querySelectorAll('.as-pl-item').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', el.dataset.type);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });
}
