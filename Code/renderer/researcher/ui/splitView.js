import { state, addAccount, findAccountByEmail } from '../state.js';
import { initPromptEditor } from './left/promptEditor.js';
import { renderAccountList } from './home.js';

let _resizeObserver = null;
let _windowResizeHandler = null;

export function openSplitView(researcher, accountId) {
  state.activeUrl = researcher.url;
  state.selectedAccount = { url: researcher.url, name: researcher.name, type: researcher.type, id: accountId };

  document.getElementById('rsHome').classList.add('rs-hidden');
  const splitView = document.getElementById('rsSplitView');
  splitView.classList.remove('rs-hidden');
  splitView.style.display = 'flex';

  const titleEl = document.getElementById('rsLeftTitle');
  if (titleEl) titleEl.textContent = researcher.name;

  // Show save form for new accounts, account info for saved ones
  const saveSection = document.getElementById('rsSaveAccount');
  const accountInfo = document.getElementById('rsAccountInfo');
  const isNew = !accountId || !state.accounts.some(a => a.id === accountId);
  if (isNew) {
    if (saveSection) saveSection.classList.remove('rs-hidden');
    if (accountInfo) accountInfo.classList.add('rs-hidden');

    // Reset any leftover input/error from a previous "add account" attempt
    const input = document.getElementById('rsSaveInput');
    const errorEl = document.getElementById('rsSaveError');
    if (input) input.value = '';
    if (errorEl) errorEl.textContent = '';

    setupSaveAccount(researcher, accountId);
  } else {
    if (saveSection) saveSection.classList.add('rs-hidden');
    if (accountInfo) {
      accountInfo.classList.remove('rs-hidden');
      const badge = document.getElementById('rsAccountBadge');
      if (badge) badge.textContent = researcher.name;
    }
  }

  initPromptEditor();

  const backBtn = document.getElementById('rsBackBtn');
  if (backBtn) backBtn.addEventListener('click', goBack);

  ensureBrowserView(researcher.url, accountId);
  startLayoutSync();
}

/**
 * Wires the "Save Account" form. Rebinds the button via cloneNode so
 * repeated openSplitView() calls (e.g. reopening "Add Account") don't
 * stack duplicate click listeners on the same DOM node.
 */
function setupSaveAccount(researcher, accountId) {
  const saveBtn = document.getElementById('rsSaveBtn');
  const input = document.getElementById('rsSaveInput');
  const errorEl = document.getElementById('rsSaveError');
  if (!saveBtn || !input) return;

  const freshBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(freshBtn, saveBtn);

  const doSave = () => {
    if (errorEl) errorEl.textContent = '';
    const email = input.value.trim();

    if (!email) {
      if (errorEl) errorEl.textContent = 'Please enter an email or label.';
      return;
    }

    const duplicate = findAccountByEmail(email, researcher.type);
    if (duplicate) {
      if (errorEl) errorEl.textContent = 'An account with that email is already saved.';
      return;
    }

    addAccount({
      id: accountId,
      email,
      type: researcher.type,
      url: researcher.url,
      saved: true,
    });

    // Switch the left panel from the save form to the saved-account badge
    const saveSection = document.getElementById('rsSaveAccount');
    const accountInfo = document.getElementById('rsAccountInfo');
    if (saveSection) saveSection.classList.add('rs-hidden');
    if (accountInfo) {
      accountInfo.classList.remove('rs-hidden');
      const badge = document.getElementById('rsAccountBadge');
      if (badge) badge.textContent = email;
    }

    // Refresh the home list in the background so it's up to date when the
    // user clicks Back.
    renderAccountList();
  };

  freshBtn.addEventListener('click', doSave);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSave();
  });
}

function goBack() {
  destroyBrowserView();
  stopLayoutSync();

  document.getElementById('rsSplitView').classList.add('rs-hidden');
  document.getElementById('rsSplitView').style.display = 'none';
  document.getElementById('rsHome').classList.remove('rs-hidden');
  document.getElementById('rsHome').style.display = 'flex';

  state.selectedAccount = null;
  state.activeUrl = null;
}

export { goBack as goHome };

/**
 * We deliberately do NOT compute x/y/width/height here anymore.
 * Main process derives the real BrowserView bounds from the window's
 * actual content bounds (win.getContentBounds()), which can never
 * drift out of sync or overflow the window the way independently
 * measured renderer coordinates could.
 *
 * The ONLY things the renderer knows better than main: pure layout
 * choices — how wide the left panel is, and how far down the header
 * pushes the split view. Those two numbers are all we send.
 */
function getLayoutHints() {
  const rightPanel = document.getElementById('rsRightPanel');
  const leftPanel = document.getElementById('rsLeftPanel');
  if (!rightPanel || !leftPanel) return null;

  const rightRect = rightPanel.getBoundingClientRect();
  const leftRect = leftPanel.getBoundingClientRect();

  if (rightRect.width <= 0 || rightRect.height <= 0) return null;

  return {
    leftPanelWidth: Math.round(leftRect.width),
    topOffset: Math.round(rightRect.top),
  };
}

async function createBrowserView(url, accountId) {
  const layout = getLayoutHints();
  await window.electronAPI.researcher.createBrowserView(url, layout, accountId);
}

export function ensureBrowserView(url, accountId) {
  createBrowserView(url, accountId);
}

export function isSplitViewActive() {
  const splitView = document.getElementById('rsSplitView');
  return splitView && !splitView.classList.contains('rs-hidden');
}

export function resizeBrowserView() {
  const layout = getLayoutHints();
  if (!layout) return Promise.resolve();
  return window.electronAPI.researcher.resizeBrowserView(layout);
}

export function destroyBrowserView() {
  return window.electronAPI.researcher.destroyBrowserView();
}

/**
 * Only needed to catch LAYOUT changes (left panel width changing),
 * not window resizes — main now self-heals on window resize/maximize
 * on its own. This just tells main when the left-panel-width /
 * top-offset numbers themselves change.
 */
function startLayoutSync() {
  stopLayoutSync();

  const rightPanel = document.getElementById('rsRightPanel');
  const leftPanel = document.getElementById('rsLeftPanel');
  if (!rightPanel || !leftPanel) return;

  const sync = () => resizeBrowserView().catch(console.error);

  _resizeObserver = new ResizeObserver(sync);
  _resizeObserver.observe(rightPanel);
  _resizeObserver.observe(leftPanel);

  _windowResizeHandler = sync;
  window.addEventListener('resize', _windowResizeHandler);

  requestAnimationFrame(sync);
}

function stopLayoutSync() {
  if (_resizeObserver) {
    _resizeObserver.disconnect();
    _resizeObserver = null;
  }
  if (_windowResizeHandler) {
    window.removeEventListener('resize', _windowResizeHandler);
    _windowResizeHandler = null;
  }
}