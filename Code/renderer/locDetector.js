/**
 * locDetector.js
 * Main integration module for LOC Detector.
 * Exposes open(folderPath, folderName) / close() / isOpen() so
 * toolsManager and the right-click context menu can drive it.
 */

import LocScanner  from './locDetector/locScanner.js';
import LocSettings from './locDetector/locSettings.js';
import LocToolUI   from './locDetector/locToolUI.js';

let _scanner  = null;
let _settings = null;
let _ui       = null;
let _panel    = null;   // the .loc-detector-panel overlay element

function _ensureInit() {
  if (_scanner) return;
  _scanner  = new LocScanner();
  _settings = new LocSettings().load();
}

function _ensurePanel() {
  if (_panel) return;
   _ensureInit();

  _panel = document.createElement('div');
  _panel.className = 'loc-detector-panel';
  _panel.innerHTML = `
    <div class="loc-detector-content">
      <div class="loc-detector-navbar">
        <h2 class="loc-detector-title">📏 LOC Detector</h2>
        <div class="loc-detector-navbar-right">
          <button class="loc-detector-close-btn" id="locDetectorCloseBtn">✕</button>
        </div>
      </div>
      <div class="loc-detector-body" id="locDetectorBody"></div>
    </div>`;

  document.body.appendChild(_panel);

  _panel.querySelector('#locDetectorCloseBtn').addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });

  const container = _panel.querySelector('#locDetectorBody');
  _ui = new LocToolUI(_scanner, _settings);
  _ui.render(container);
}

export function open(folderPath, folderName) {
  _ensureInit();
  _ensurePanel();
  _ui.setRootPath(folderPath, folderName || folderPath.split(/[\\/]/).pop());
  _panel.classList.add('open');
}

export function close() {
  _panel?.classList.remove('open');
}

export function isOpen() {
  return !!_panel?.classList.contains('open');
}

// Legacy named export kept for panelFactory / initLocDetector compatibility
export function initLocDetector(container) {
  _ensureInit();
  _ui = new LocToolUI(_scanner, _settings);
  _ui.render(container);
}

export default { open, close, isOpen, initLocDetector };