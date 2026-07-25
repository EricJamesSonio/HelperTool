import { state } from '../state.js';
import { initPromptEditor } from './left/promptEditor.js';

let _resizeObserver = null;
let _windowResizeHandler = null;

export function openSplitView(researcher) {
  state.activeUrl = researcher.url;

  document.getElementById('rsHome').classList.add('rs-hidden');
  document.getElementById('rsSplitView').classList.remove('rs-hidden');

  const titleEl = document.getElementById('rsLeftTitle');
  if (titleEl) titleEl.textContent = researcher.name;

  initPromptEditor();

  const backBtn = document.getElementById('rsBackBtn');
  if (backBtn) backBtn.addEventListener('click', goBack);

  ensureBrowserView(researcher.url);
  startBoundsSync();
}

function goBack() {
  destroyBrowserView();
  stopBoundsSync();

  document.getElementById('rsSplitView').classList.add('rs-hidden');
  document.getElementById('rsHome').classList.remove('rs-hidden');

  state.selectedResearcher = null;
  state.activeUrl = null;
}

function getBrowserBounds() {
  const rightPanel = document.getElementById('rsRightPanel');
  if (!rightPanel) return null;

  const rect = rightPanel.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

async function createBrowserView(url) {
  const bounds = getBrowserBounds();
  if (!bounds) return;
  await window.electronAPI.researcher.createBrowserView(url, bounds);
}

export function ensureBrowserView(url) {
  createBrowserView(url);
}

export function isSplitViewActive() {
  const splitView = document.getElementById('rsSplitView');
  return splitView && !splitView.classList.contains('rs-hidden');
}

export function resizeBrowserView() {
  const bounds = getBrowserBounds();
  if (!bounds) return Promise.resolve();
  return window.electronAPI.researcher.resizeBrowserView(bounds);
}

export function destroyBrowserView() {
  return window.electronAPI.researcher.destroyBrowserView();
}

function startBoundsSync() {
  stopBoundsSync();

  const rightPanel = document.getElementById('rsRightPanel');
  if (!rightPanel) return;

  const sync = () => resizeBrowserView().catch(console.error);

  _resizeObserver = new ResizeObserver(sync);
  _resizeObserver.observe(rightPanel);

  const leftPanel = document.getElementById('rsLeftPanel');
  if (leftPanel) _resizeObserver.observe(leftPanel);

  _windowResizeHandler = sync;
  window.addEventListener('resize', _windowResizeHandler);

  requestAnimationFrame(sync);
}

function stopBoundsSync() {
  if (_resizeObserver) {
    _resizeObserver.disconnect();
    _resizeObserver = null;
  }
  if (_windowResizeHandler) {
    window.removeEventListener('resize', _windowResizeHandler);
    _windowResizeHandler = null;
  }
}