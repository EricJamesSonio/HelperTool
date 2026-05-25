const STORAGE_KEY = 'helpertool-canvas-shortcuts';

import { eventToString } from '../shortcuts/parser.js';

const CANVAS_FEATURES = [
  { id: 'selectTool',    icon: '\u261F', name: 'Select' },
  { id: 'penTool',       icon: '\u270F', name: 'Freehand' },
  { id: 'rectTool',      icon: '\u25AD', name: 'Rectangle' },
  { id: 'ellipseTool',   icon: '\u25CB', name: 'Ellipse' },
  { id: 'lineTool',      icon: '\u2571', name: 'Line' },
  { id: 'arrowTool',     icon: '\u27A1', name: 'Arrow' },
  { id: 'textTool',      icon: '\uD83D\uDCDD', name: 'Text' },
  { id: 'panTool',       icon: '\uD83D\uDDAB', name: 'Pan' },
  { id: 'shapeTerminator',   icon: '\u2B58', name: 'Terminator' },
  { id: 'shapeDiamond',      icon: '\u25C7', name: 'Diamond' },
  { id: 'shapeParallelogram', icon: '\u25B1', name: 'Parallelogram' },
  { id: 'shapeDoubleRect',   icon: '\u25AD', name: 'Predefined' },
  { id: 'shapeCircle',       icon: '\u25EF', name: 'Connector' },
];

const DEFAULTS = {
  selectTool: 'V',
  penTool: 'P',
  rectTool: 'R',
  ellipseTool: 'E',
  lineTool: 'L',
  arrowTool: 'A',
  textTool: 'T',
  panTool: 'H',
  shapeTerminator: null,
  shapeDiamond: null,
  shapeParallelogram: null,
  shapeDoubleRect: null,
  shapeCircle: null,
};

let _shortcuts = {};
let _modal = null;
let _capturingId = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _shortcuts = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    _shortcuts = { ...DEFAULTS };
  }
  return _shortcuts;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_shortcuts));
}

function get(id) {
  return _shortcuts[id] || null;
}

function getAll() {
  return _shortcuts;
}

function openConfig() {
  if (_modal) { close(); return; }
  load();

  _modal = document.createElement('div');
  _modal.className = 'canvas-modal-overlay canvas-sc-overlay';
  _modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center';
  _modal.innerHTML = `
    <div class="canvas-modal" style="max-width:520px;width:90%">
      <div class="canvas-modal-header">
        <span class="canvas-modal-title">⌨️ Canvas Shortcuts</span>
        <button class="canvas-btn canvas-btn-icon canvas-modal-close-btn" id="canvasScClose">✕</button>
      </div>
      <div class="canvas-modal-body" style="padding:12px">
        <p style="margin:0 0 12px;font-size:13px;color:#b1bac4">Click a shortcut and press the key combo you want.</p>
        <div id="canvasScTable" style="display:flex;flex-direction:column;gap:6px"></div>
      </div>
      <div class="canvas-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:8px 16px">
        <button class="canvas-btn" id="canvasScResetBtn">Reset All</button>
        <button class="canvas-btn canvas-btn-primary" id="canvasScDoneBtn">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(_modal);

  const table = _modal.querySelector('#canvasScTable');
  CANVAS_FEATURES.forEach(f => table.appendChild(buildRow(f)));

  const docKeydown = (e) => {
    if (!_capturingId) return;
    if (e.key === 'Escape') { stopCapture(); return; }
    const combo = eventToString(e);
    if (!combo) return;
    for (const [id, sc] of Object.entries(_shortcuts)) {
      if (id !== _capturingId && sc === combo) {
        const conflict = CANVAS_FEATURES.find(f => f.id === id);
        const errEl = document.getElementById('canvasScError_' + _capturingId);
        if (errEl) {
          errEl.textContent = '"' + combo + '" is already assigned to ' + (conflict ? conflict.name : id);
          errEl.style.display = 'block';
        }
        stopCapture();
        return;
      }
    }
    setPending(_capturingId, combo);
  };
  document.addEventListener('keydown', docKeydown);

  _modal.querySelector('#canvasScClose').addEventListener('click', close);
  _modal.querySelector('#canvasScDoneBtn').addEventListener('click', close);
  _modal.querySelector('#canvasScResetBtn').addEventListener('click', resetAll);
  _modal.addEventListener('click', (e) => { if (e.target === _modal) close(); });

  requestAnimationFrame(() => _modal.classList.add('open'));
}

function close() {
  if (_capturingId) { stopCapture(); }
  save();
  if (_modal) { _modal.remove(); _modal = null; }
}

function resetAll() {
  _shortcuts = { ...DEFAULTS };
  save();
  if (_modal) {
    const table = _modal.querySelector('#canvasScTable');
    table.innerHTML = '';
    CANVAS_FEATURES.forEach(f => table.appendChild(buildRow(f)));
  }
}

function stopCapture() {
  if (!_capturingId) return;
  const btn = document.getElementById('canvasScInput_' + _capturingId);
  if (btn) {
    btn.textContent = _shortcuts[_capturingId] || 'None';
    btn.classList.remove('capturing');
  }
  _capturingId = null;
}

function setPending(id, combo) {
  const btn = document.getElementById('canvasScInput_' + id);
  if (btn) {
    btn.textContent = combo;
    btn.classList.remove('capturing');
  }
  const errEl = document.getElementById('canvasScError_' + id);
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  _capturingId = null;
  _shortcuts[id] = combo;
}

function buildRow(feature) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:6px;background:#0a0c10';
  const current = _shortcuts[feature.id] || 'None';
  row.innerHTML =
    '<span style="flex:0 0 24px;font-size:16px;text-align:center">' + feature.icon + '</span>' +
    '<span style="flex:1;font-size:13px;color:#f0f6fc">' + feature.name + '</span>' +
    '<button class="shortcut-input-btn" id="canvasScInput_' + feature.id + '" style="min-width:100px">' + current + '</button>' +
    '<button class="shortcut-btn-clear" id="canvasScClear_' + feature.id + '">Clear</button>' +
    '<div class="shortcut-row-error" id="canvasScError_' + feature.id + '" style="display:none;font-size:11px;color:#f85149;max-width:150px"></div>';

  const inputBtn = row.querySelector('#canvasScInput_' + feature.id);
  const clearBtn = row.querySelector('#canvasScClear_' + feature.id);

  inputBtn.addEventListener('click', () => {
    if (_capturingId) stopCapture();
    _capturingId = feature.id;
    inputBtn.textContent = 'Press shortcut\u2026';
    inputBtn.classList.add('capturing');
    const errEl = document.getElementById('canvasScError_' + feature.id);
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  });

  clearBtn.addEventListener('click', () => {
    _shortcuts[feature.id] = null;
    save();
    inputBtn.textContent = 'None';
    if (_capturingId === feature.id) _capturingId = null;
    const errEl = document.getElementById('canvasScError_' + feature.id);
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  });

  return row;
}

export { load as loadCanvasShortcuts, get as getCanvasShortcut, getAll as getCanvasShortcuts, openConfig as openCanvasShortcutConfig, DEFAULTS };
