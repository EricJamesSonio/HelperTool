/**
 * sidebarManager.js
 * Single responsibility: sidebar expand/collapse/pin behaviour
 * and populating the tools list items.
 */

export function initSidebar() {
  const sidebar = document.getElementById('toolsSidebar');
  if (!sidebar) return;

  sidebar.addEventListener('mouseenter', () => {
    if (!sidebar.classList.contains('pinned')) sidebar.classList.add('expanded');
  });

  sidebar.addEventListener('mouseleave', () => {
    if (!sidebar.classList.contains('pinned')) sidebar.classList.remove('expanded');
  });

  const pinBtn = document.getElementById('sidebarPinBtn');
  if (pinBtn) {
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pinned = sidebar.classList.toggle('pinned');
      if (pinned) {
        sidebar.classList.add('expanded');
        pinBtn.title = 'Unpin sidebar';
      } else {
        sidebar.classList.remove('expanded');
        pinBtn.title = 'Pin sidebar open';
      }
    });
  }
}

export function createSidebarItem(icon, name, desc, onClick) {
  const el = document.createElement('button');
  el.className = 'tools-sidebar-item';
  el.innerHTML =
    '<span class="tools-sidebar-item-icon">' + icon + '</span>' +
    '<div class="tools-sidebar-item-info">' +
      '<span class="tools-sidebar-item-name">' + name + '</span>' +
      '<span class="tools-sidebar-item-desc">' + desc + '</span>' +
    '</div>';
  el.addEventListener('click', onClick);
  return el;
}