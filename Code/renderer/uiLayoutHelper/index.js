import { U, panel, closeBtn, inputArea, previewArea, renderBtn, copyBtn,
  presetsList, errorDisplay, charCount, assignRefs } from './state.js';
import { getTemplate } from './template.js';
import { parseAndRender } from './dslParser.js';
import { PRESETS } from './presets.js';

let _initialized = false;

/* ── DOM Setup ───────────────────────────────────────────── */

function setup() {
  if (_initialized) return;
  _initialized = true;
  injectHTML();
  assignRefs();
  wireEvents();
  renderPresets();
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

  inputArea.addEventListener('input', () => {
    U.rawInput = inputArea.value;
    charCount.textContent = `${inputArea.value.length} chars`;
  });

  inputArea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRender();
    }
  });

  copyBtn.addEventListener('click', handleCopy);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) closeUI();
  });
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
  const json = JSON.stringify(preset.dsl, null, 2);
  inputArea.value = json;
  U.rawInput = json;
  charCount.textContent = `${json.length} chars`;
  U.selectedPreset = preset.name;
  handleRender();
}

/* ── Render ──────────────────────────────────────────────── */

function handleRender() {
  const raw = inputArea.value.trim();
  if (!raw) {
    showError('Enter a layout definition to render');
    return;
  }

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

/* ── Clipboard ───────────────────────────────────────────── */

function handleCopy() {
  const text = previewArea.textContent;
  if (!text || text === 'Render a layout to see it here...') return;

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
  if (!U.rawInput) {
    inputArea.value = '';
    charCount.textContent = '0 chars';
  }
  inputArea.focus();
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
