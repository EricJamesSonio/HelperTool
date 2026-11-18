import { mountStorageInspector } from './storageInspector/ui.js';

let _panel = null;
let _ui = null;
let _cssReady = false;
let _keyBound = false;

function ensureCss() {
  if (_cssReady || document.getElementById('siStylesheet')) {
    _cssReady = true;
    return;
  }
  const link = document.createElement('link');
  link.id = 'siStylesheet';
  link.rel = 'stylesheet';
  link.href = './styles/storage-inspector.css';
  document.head.appendChild(link);
  _cssReady = true;
}

function onKey(e) {
  if (e.key === 'Escape' && isOpen()) close();
}

function build() {
  const panel = document.createElement('div');
  panel.id = 'siPanel';
  panel.className = 'si-panel';
  document.body.appendChild(panel);
  _panel = panel;
  _ui = mountStorageInspector(panel, { onClose: close });
  if (!_keyBound) {
    document.addEventListener('keydown', onKey);
    _keyBound = true;
  }
}

export async function open() {
  ensureCss();
  if (!_panel) build();
  _panel.classList.add('open');
  await _ui.refresh();
}

export function close() {
  if (_panel) _panel.classList.remove('open');
}

export function isOpen() {
  return !!_panel && _panel.classList.contains('open');
}

export function getPanel() {
  return _panel;
}