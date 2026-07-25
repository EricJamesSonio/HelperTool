import { state } from './state.js';
import { getTemplate } from './template.js';
import { initHome } from './ui/home.js';
import { ensureBrowserView, destroyBrowserView, isSplitViewActive } from './ui/splitView.js';

let _initialized = false;

export function initResearcher() {
  if (_initialized) return;
  _initialized = true;

  const container = document.body;
  container.insertAdjacentHTML('beforeend', getTemplate());

  const closeBtn = document.getElementById('rsCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeResearcher);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.open) {
      closeResearcher();
    }
  });

  initHome();
}

export function openResearcher() {
  if (!_initialized) initResearcher();

  const panel = document.getElementById('rsPanel');
  if (panel) {
    panel.classList.add('open');
    state.open = true;

    // Restore BrowserView if split view was active
    if (state.selectedResearcher && isSplitViewActive()) {
      ensureBrowserView(state.activeUrl);
    }
  }
}

export function closeResearcher() {
  const panel = document.getElementById('rsPanel');
  if (panel) {
    panel.classList.remove('open');
    if (state.selectedResearcher) {
      destroyBrowserView();
    }
    state.open = false;
    // Keep selectedResearcher/activeUrl alive so we can restore on re-open
  }
}

export function isOpen() {
  return state.open;
}