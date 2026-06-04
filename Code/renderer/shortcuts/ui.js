import { S, loadShortcuts, saveShortcuts } from './state.js';
import { eventToString } from './parser.js';

const FEATURES = [
  { id: 'shortcutTool',  icon: '\u2328\uFE0F', name: 'CLI Tool' },
  { id: 'apiTool',       icon: '\uD83D\uDD0C', name: 'API Tool' },
  { id: 'gitTool',       icon: '\uD83D\uDD00', name: 'Git Tool' },
  { id: 'promptTool',    icon: '\uD83E\uDDE9', name: 'Prompt Tool' },
  { id: 'settings',      icon: '\uD83C\uDFA8', name: 'Settings' },
  { id: 'secretHolder',  icon: '\uD83D\uDD10', name: 'Secret Holder' },
  { id: 'workspaceTool', icon: '\uD83D\uDC65', name: 'Workspace' },
  { id: 'symbolIndex',   icon: '\uD83D\uDD0D', name: 'Symbol Index' },
  { id: 'canvasTool',    icon: '\uD83C\uDFA8', name: 'Canvas' },
  { id: 'dbInspector',   icon: '\uD83D\uDDC3\uFE0F', name: 'DB Inspector' },
  { id: 'locDetector',   icon: '\uD83D\uDCCF', name: 'LOC Detector' },
];

let _modal = null;
let _capturingId = null;
let _docListener = null;

function openConfig(enabledFeats) {
  if (_modal) { _modal.remove(); _modal = null; return; }
  loadShortcuts();

  _modal = document.createElement('div');
  _modal.className = 'modal-overlay shortcuts-modal-overlay';
  _modal.innerHTML = `
    <div class="modal-content shortcuts-modal">
      <div class="modal-header">
        <h3 class="modal-title">\u2328\uFE0F CLI Tool — Keyboard Shortcuts</h3>
        <button class="modal-close-btn" id="shortcutsCloseBtn">\u00D7</button>
      </div>
      <div class="modal-body">
        <p class="shortcuts-hint">Click a shortcut field and press the key combination you want to assign.</p>
        <div class="shortcuts-table" id="shortcutsTable"></div>
        <div class="shortcuts-error" id="shortcutsGlobalError"></div>
      </div>
      <div class="shortcuts-modal-footer">
        <button class="modal-btn modal-btn-primary" id="shortcutsDoneBtn">Done</button>
      </div>
    </div>
  `;

  document.body.appendChild(_modal);

  const table = _modal.querySelector('#shortcutsTable');
  const enabled = enabledFeats || {};
  FEATURES.forEach(function (f) {
    if (enabled.hasOwnProperty(f.id) && !enabled[f.id]) return;
    table.appendChild(buildRow(f));
  });

  _docListener = function (e) {
    if (!_capturingId) return;
    if (e.key === 'Escape') { stopCapture(); return; }
    const combo = eventToString(e);
    if (!combo) return;
    for (const [id, sc] of Object.entries(S.shortcuts)) {
      if (id !== _capturingId && sc === combo) {
        const conflictName = FEATURES.find(function (f) { return f.id === id; });
        const errEl = document.getElementById('shortcutError_' + _capturingId);
        if (errEl) { errEl.textContent = '"' + combo + '" is already assigned to ' + (conflictName ? conflictName.name : id); errEl.style.display = 'block'; }
        stopCapture();
        return;
      }
    }
    setPending(_capturingId, combo);
  };
  document.addEventListener('keydown', _docListener);

  function doClose() {
    flushPending();
    document.removeEventListener('keydown', _docListener);
    _docListener = null;
    _capturingId = null;
    _modal.remove();
    _modal = null;
  }

  _modal.querySelector('#shortcutsCloseBtn').addEventListener('click', doClose);
  _modal.querySelector('#shortcutsDoneBtn').addEventListener('click', doClose);
  _modal.addEventListener('click', function (e) { if (e.target === _modal) doClose(); });

  requestAnimationFrame(function () { _modal.classList.add('open'); });
}

function stopCapture() {
  if (!_capturingId) return;
  const inputBtn = document.getElementById('shortcutInput_' + _capturingId);
  if (inputBtn) {
    inputBtn.textContent = S.shortcuts[_capturingId] || 'None';
    inputBtn.classList.remove('capturing');
  }
  _capturingId = null;
}

function setPending(featureId, combo) {
  const inputBtn = document.getElementById('shortcutInput_' + featureId);
  if (inputBtn) {
    inputBtn.textContent = combo;
    inputBtn.classList.remove('capturing');
  }
  const errEl = document.getElementById('shortcutError_' + featureId);
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  _capturingId = null;
  S.shortcuts[featureId] = combo;
}

function flushPending() {
  saveShortcuts();
}

function buildRow(feature) {
  const row = document.createElement('div');
  row.className = 'shortcut-row';
  const current = S.shortcuts[feature.id] || 'None';
  row.innerHTML =
    '<div class="shortcut-row-info">' +
      '<span class="shortcut-row-icon">' + feature.icon + '</span>' +
      '<span class="shortcut-row-name">' + feature.name + '</span>' +
    '</div>' +
    '<div class="shortcut-row-controls">' +
      '<button class="shortcut-input-btn" id="shortcutInput_' + feature.id + '">' + current + '</button>' +
      '<button class="shortcut-btn-clear" id="shortcutClear_' + feature.id + '">Clear</button>' +
    '</div>' +
    '<div class="shortcut-row-error" id="shortcutError_' + feature.id + '"></div>';

  const inputBtn = row.querySelector('#shortcutInput_' + feature.id);
  const clearBtn = row.querySelector('#shortcutClear_' + feature.id);
  const errEl    = row.querySelector('#shortcutError_' + feature.id);

  inputBtn.addEventListener('click', function () {
    if (_capturingId) stopCapture();
    _capturingId = feature.id;
    inputBtn.textContent = 'Press shortcut\u2026';
    inputBtn.classList.add('capturing');
    errEl.textContent = '';
    errEl.style.display = 'none';
  });

  inputBtn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && _capturingId === feature.id) {
      const combo = S.shortcuts[feature.id];
      if (combo) { flushPending(); showSaved(inputBtn); }
    }
  });

  clearBtn.addEventListener('click', function () {
    S.shortcuts[feature.id] = null;
    saveShortcuts();
    inputBtn.textContent = 'None';
    if (_capturingId === feature.id) _capturingId = null;
    errEl.textContent = '';
    errEl.style.display = 'none';
  });

  return row;
}

function showSaved(btn) {
  var orig = btn.textContent;
  btn.textContent = '\u2713 Saved';
  btn.style.color = 'var(--green)';
  setTimeout(function () { btn.textContent = orig; btn.style.color = ''; }, 1200);
}

function isConfigOpen() {
  return !!_modal;
}

export { openConfig, isConfigOpen };
