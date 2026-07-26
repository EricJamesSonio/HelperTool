import { state, loadAccounts, saveAccounts } from './state.js';
import { getTemplate } from './template.js';
import { initHome, renderAccountList } from './ui/home.js';
import { ensureBrowserView, destroyBrowserView, isSplitViewActive, goHome, resizeBrowserView } from './ui/splitView.js';

let _initialized = false;

export function initResearcher() {
  if (_initialized) return;
  _initialized = true;

  loadAccounts();

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
  console.log('[RS] openResearcher, accounts in memory:', state.accounts.length);
  // Reload accounts from localStorage each time the panel opens
  loadAccounts();
  console.log('[RS] openResearcher after reload, accounts:', state.accounts.length);

  const panel = document.getElementById('rsPanel');
  if (panel) {
    panel.classList.add('open');
    state.open = true;
    renderAccountList();

    // If split view was left open when the panel was closed, restore it
    // instead of resetting to the account list. The BrowserView itself
    // was never destroyed on close (see closeResearcher) — just hidden —
    // so we only need to re-sync its bounds and show it again.
    if (isSplitViewActive()) {
      resizeBrowserView()
        .then(() => window.electronAPI.researcher.showBrowserView())
        .catch(console.error);
    }
  }
}

export function closeResearcher() {
  console.log('[RS] closeResearcher, accounts:', state.accounts.length);

  // Don't reset to home view — just hide the floating BrowserView so it
  // doesn't render over other UI while the panel is closed. The split
  // view DOM, textarea contents, and active URL all stay exactly as-is,
  // so reopening restores the same state instead of starting over.
  if (isSplitViewActive()) {
    window.electronAPI.researcher.hideBrowserView();
  }

  const panel = document.getElementById('rsPanel');
  if (panel) {
    panel.classList.remove('open');
    state.open = false;
    saveAccounts();
  }
}

export function isOpen() {
  return state.open;
}