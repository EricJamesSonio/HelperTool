import { getCategories } from '../nodes/nodeRegistry.js';

function iconSvg(path, color) {
  const isClosed = path.includes('z') || path.includes('Z');
  const fill = isClosed ? 'currentColor' : 'none';
  const stroke = isClosed ? 'none' : 'currentColor';
  return `<svg viewBox="0 0 16 16" width="14" height="14" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:${color}">
    <path d="${path}"/>
  </svg>`;
}

export function renderSidebar() {
  const categories = getCategories();
  const catHtml = Object.entries(categories).map(([catName, nodes]) => {
    const itemsHtml = nodes.map(n => `
      <div class="as-pl-item" data-type="${n.key}" draggable="true">
        <span class="as-pl-item-icon" style="color:${n.color}">${iconSvg(n.iconPath, n.color)}</span>
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
