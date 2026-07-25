import { state, loadAccounts, saveAccounts } from './state.js';
import { getTemplate } from './template.js';
import { initHome, renderAccountList } from './ui/home.js';
import { ensureBrowserView, destroyBrowserView, isSplitViewActive, goHome } from './ui/splitView.js';

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

    // If split view was showing when we closed, restore the BrowserView
    if (state.selectedAccount && isSplitViewActive()) {
      ensureBrowserView(state.selectedAccount.url);
    }
  }
}

export function closeResearcher() {
  console.log('[RS] closeResearcher, accounts:', state.accounts.length);
  // Always return to home view on close
  if (isSplitViewActive()) {
    goHome();
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
