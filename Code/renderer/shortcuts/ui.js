import { S, loadShortcuts, saveShortcuts } from './state.js';
import { eventToString } from './parser.js';

const ICONS = {
  cli: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M6 8l3 2-3 2M11 12h3"/></svg>',
  api: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="10" y1="16" x2="10" y2="19"/><line x1="1" y1="10" x2="4" y2="10"/><line x1="16" y1="10" x2="19" y2="10"/></svg>',
  git: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="4" r="2"/><circle cx="14" cy="10" r="2"/><circle cx="6" cy="16" r="2"/><line x1="6" y1="6" x2="6" y2="14"/><line x1="8" y1="4" x2="12" y2="10"/></svg>',
  prompt: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"/></svg>',
  settings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41"/></svg>',
  secret: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="11" r="2"/><path d="M5 11V6a5 5 0 0 1 10 0v5"/><rect x="3" y="11" width="14" height="8" rx="1"/></svg>',
  workspace: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>',
  symbolIndex: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5"/><line x1="13" y1="13" x2="18" y2="18"/></svg>',
  canvas: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
  db: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="10" cy="4" rx="7" ry="2"/><path d="M3 4v6c0 1.1 3.13 2 7 2s7-.9 7-2V4"/><path d="M3 10v6c0 1.1 3.13 2 7 2s7-.9 7-2v-6"/></svg>',
  loc: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="9" x2="14" y2="9"/><line x1="3" y1="13" x2="17" y2="13"/><line x1="3" y1="17" x2="11" y2="17"/></svg>',
};

const FEATURES = [
  { id: 'shortcutTool',  icon: ICONS.cli,  name: 'CLI Tool' },
  { id: 'apiTool',       icon: ICONS.api,       name: 'API Tool' },
  { id: 'gitTool',       icon: ICONS.git,       name: 'Git Tool' },
  { id: 'promptTool',    icon: ICONS.prompt,    name: 'Prompt Tool' },
  { id: 'settings',      icon: ICONS.settings,  name: 'Settings' },
  { id: 'secretHolder',  icon: ICONS.secret,    name: 'Secret Holder' },
  { id: 'workspaceTool', icon: ICONS.workspace, name: 'Workspace' },
  { id: 'symbolIndex',   icon: ICONS.symbolIndex,name: 'Symbol Index' },
  { id: 'canvasTool',    icon: ICONS.canvas,    name: 'Canvas' },
  { id: 'dbInspector',   icon: ICONS.db,        name: 'DB Inspector' },
  { id: 'locDetector',   icon: ICONS.loc,       name: 'LOC Detector' },
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
        <h3 class="modal-title"><span class="modal-title-icon">${ICONS.cli}</span> CLI Tool — Keyboard Shortcuts</h3>
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
  row.setAttribute('data-feature', feature.id);
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
