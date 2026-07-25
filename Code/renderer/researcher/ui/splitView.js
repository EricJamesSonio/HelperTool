import { state } from '../state.js';
import { initPromptEditor } from './left/promptEditor.js';

let _resizeObserver = null;
let _windowResizeHandler = null;

export function openSplitView(researcher, accountId) {
  state.activeUrl = researcher.url;

  document.getElementById('rsHome').classList.add('rs-hidden');
  const splitView = document.getElementById('rsSplitView');
  splitView.classList.remove('rs-hidden');
  splitView.style.display = 'flex';

  const titleEl = document.getElementById('rsLeftTitle');
  if (titleEl) titleEl.textContent = researcher.name;

  // Show save form for new accounts, account info for saved ones
  const saveSection = document.getElementById('rsSaveAccount');
  const accountInfo = document.getElementById('rsAccountInfo');
  if (accountId) {
    if (saveSection) saveSection.classList.add('rs-hidden');
    if (accountInfo) {
      accountInfo.classList.remove('rs-hidden');
      const badge = document.getElementById('rsAccountBadge');
      if (badge) badge.textContent = researcher.name;
    }
  } else {
    if (saveSection) saveSection.classList.remove('rs-hidden');
    if (accountInfo) accountInfo.classList.add('rs-hidden');
  }

  initPromptEditor();

  const backBtn = document.getElementById('rsBackBtn');
  if (backBtn) backBtn.addEventListener('click', goBack);

  ensureBrowserView(researcher.url, accountId);
  startLayoutSync();
}

function goBack() {
  destroyBrowserView();
  stopLayoutSync();

  document.getElementById('rsSplitView').classList.add('rs-hidden');
  document.getElementById('rsSplitView').style.display = 'none';
  document.getElementById('rsHome').classList.remove('rs-hidden');
  document.getElementById('rsHome').style.display = 'flex';

  state.selectedResearcher = null;
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