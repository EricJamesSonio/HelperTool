import { U, panel, closeBtn, previewArea, renderBtn, copyBtn,
  presetsList, errorDisplay, vbCanvas, clearBtn, vbToolbar,
  exportBtn, importBtn, assignRefs } from './state.js';
import { getTemplate } from './template.js';
import { parseAndRender } from './dslParser.js';
import { PRESETS } from './presets.js';
import { renderVisualBuilder, loadDSL, getTree, toDSL, addNode, setOnChange, startPaletteDrag } from './visualBuilder.js';

let _initialized = false;

/* ── DOM Setup ───────────────────────────────────────────── */

function setup() {
  if (_initialized) return;
  _initialized = true;
  injectHTML();
  assignRefs();
  wireEvents();
  renderPresets();
  renderToolbar();
}

function injectHTML() {
  if (document.getElementById('ulhPanel')) return;
  const el = document.createElement('div');
  el.id = 'ulhPanel';
  el.className = 'ulh-panel';
  el.innerHTML = getTemplate();
  document.body.appendChild(el);
}

function wireEvents() {
  closeBtn.addEventListener('click', closeUI);
  panel.addEventListener('click', e => { if (e.target === panel) closeUI(); });

  renderBtn.addEventListener('click', handleRender);

  copyBtn.addEventListener('click', handleCopy);

  clearBtn.addEventListener('click', () => {
    loadDSL(null);
    previewArea.textContent = 'Visual builder ready — add components or load a preset, then click Render';
    errorDisplay.style.display = 'none';
    U.renderedOutput = '';
    U.currentDSL = null;
  });

  exportBtn.addEventListener('click', handleExport);
  importBtn.addEventListener('click', handleImport);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) closeUI();
  });
}

/* ── Palette (drag sources) ─────────────────────────────── */

function renderToolbar() {
  vbToolbar.innerHTML = '';
  const types = [
    { type: 'box', icon: '▣', label: 'Box', color: '#60a5fa' },
    { type: 'hsplit', icon: '⇔', label: 'HSplit', color: '#34d399' },
    { type: 'vsplit', icon: '⇕', label: 'VSplit', color: '#a78bfa' },
    { type: 'label', icon: 'Aa', label: 'Label', color: '#fbbf24' },
    { type: 'spacer', icon: '⋯', label: 'Spacer', color: '#6b7280' },
  ];
  types.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'ulh-vb-palette-btn';
    btn.draggable = true;
    btn.style.setProperty('--vb-color', t.color);
    btn.innerHTML = `<span class="ulh-vb-palette-icon" style="color:${t.color}">${t.icon}</span> ${t.label}`;

    btn.addEventListener('dragstart', (e) => {
      startPaletteDrag(t.type, e);
    });

    btn.addEventListener('click', () => {
      if (!getTree()) {
        loadDSL({ type: 'box', border: 'single', label: 'Root', minWidth: 40, children: [] });
      }
      const selId = _getSelectedId();
      addNode(t.type, selId || (getTree()?.id || null));
    });

    vbToolbar.appendChild(btn);
  });
}

function _getSelectedId() {
  const sel = document.querySelector('.vb-shape--sel');
  return sel ? sel.dataset.nid : null;
}

/* ── Presets ─────────────────────────────────────────────── */

function renderPresets() {
  presetsList.innerHTML = '';
  PRESETS.forEach(p => {
    const item = document.createElement('button');
    item.className = 'ulh-preset-item';
    item.innerHTML = `
      <div class="ulh-preset-name">${p.name}</div>
      <div class="ulh-preset-desc">${p.description}</div>
    `;
    item.addEventListener('click', () => loadPreset(p));
    presetsList.appendChild(item);
  });
}

function loadPreset(preset) {
  loadDSL(preset.dsl);
  U.selectedPreset = preset.name;
  previewArea.textContent = 'Rendering...';
  errorDisplay.style.display = 'none';
  U.renderedOutput = '';
  U.currentDSL = null;
  setTimeout(handleRender, 50);
}

/* ── Render ──────────────────────────────────────────────── */

function handleRender() {
  const dsl = toDSL();
  if (!dsl) {
    showError('Add at least one component to render');
    return;
  }

  const raw = JSON.stringify(dsl, null, 2);
  U.rawInput = raw;

  const result = parseAndRender(raw);
  if (!result.valid) {
    showError(result.error);
    return;
  }

  U.currentDSL = result.ast;
  U.renderedOutput = result.output;
  U.error = null;
  hideError();
  previewArea.textContent = result.output;
}

/* ── Import / Export ──────────────────────────────────────── */

function handleExport() {
  const dsl = toDSL();
  if (!dsl) { showError('Nothing to export'); return; }
  const json = JSON.stringify(dsl, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'layout.json';
  a.click();
  URL.revokeObjectURL(url);
}

function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const dsl = JSON.parse(e.target.result);
        if (!dsl || !dsl.type) throw new Error('Invalid DSL');
        loadDSL(dsl);
        previewArea.textContent = 'Layout imported — click Render to generate ASCII';
        errorDisplay.style.display = 'none';
        U.renderedOutput = '';
        U.currentDSL = null;
      } catch (err) {
        showError('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

/* ── Clipboard ───────────────────────────────────────────── */

function handleCopy() {
  const text = previewArea.textContent;
  if (!text || text.startsWith('Visual builder') || text.startsWith('Preset loaded')) return;

  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="7" y="7" width="11" height="11" rx="1.5"/><path d="M4 11V4h7"/></svg> Copy`;
    }, 1500);
  }).catch(() => {});
}

/* ── Error Display ───────────────────────────────────────── */

function showError(msg) {
  errorDisplay.textContent = msg;
  errorDisplay.style.display = 'block';
  previewArea.textContent = '';
}

function hideError() {
  errorDisplay.style.display = 'none';
}

/* ── Public API ──────────────────────────────────────────── */

export function initUI() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
}

export function openUI() {
  setup();
  panel.classList.add('ulh-visible');
  renderVisualBuilder(document.getElementById('ulhVbCanvas'));
  setOnChange(() => {
    previewArea.textContent = 'Modified — click Render to update';
    errorDisplay.style.display = 'none';
  });
}

export function closeUI() {
  panel?.classList.remove('ulh-visible');
}

export function isOpen() {
  return panel?.classList.contains('ulh-visible') ?? false;
}

export function getRenderedOutput() {
  return U.renderedOutput;
}
