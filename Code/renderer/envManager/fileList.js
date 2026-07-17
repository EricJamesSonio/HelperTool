import { state, setState } from './state.js';
import { escHtml } from './utils.js';
import { loadFile } from './index.js';
import { openCreateForm, closeCreateForm } from './createFlow.js';

const ICON_DOT_FILLED = '<svg viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="3.5"/></svg>';
const ICON_DOT_EMPTY = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="5" cy="5" r="3.5"/></svg>';
const ICON_WARN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L2 14h12L8 2z"/><line x1="8" y1="6" x2="8" y2="10"/><line x1="8" y1="12" x2="8" y2="12.01"/></svg>';

export function renderFileList() {
  const el = document.getElementById('envFileList');
  if (!el) return;

  if (!state.files.length) {
    el.innerHTML = '<div class="env-file-list-empty">No env files found</div>';
    return;
  }

  const rows = state.files.map(f => {
    const active = f === state.activeFile ? ' env-file-active' : '';
    const dot = f === state.activeFile ? ICON_DOT_FILLED : ICON_DOT_EMPTY;
    return `
      <div class="env-file-row${active}" data-file="${escHtml(f)}">
        <span class="env-file-dot">${dot}</span>
        <span class="env-file-name">${escHtml(f)}</span>
        ${state.dirty && f === state.activeFile ? `<span class="env-file-dirty-dot" title="Unsaved changes">${ICON_DOT_FILLED}</span>` : ''}
      </div>
    `;
  }).join('');

  el.innerHTML = rows;

  el.querySelectorAll('.env-file-row').forEach(row => {
    row.addEventListener('click', () => {
      const file = row.dataset.file;
      if (file === state.activeFile) return;

      if (state.dirty) {
        showUnsavedWarning(file);
      } else {
        loadFile(file);
      }
    });
  });
}

function showUnsavedWarning(targetFile) {
  const el = document.getElementById('envFileList');
  if (!el) return;

  const existing = el.querySelector('.env-unsaved-warning');
  if (existing) existing.remove();

  const warning = document.createElement('div');
  warning.className = 'env-unsaved-warning';
  warning.innerHTML = `
    <div class="env-unsaved-msg">${ICON_WARN} Unsaved changes in <strong>${escHtml(state.activeFile)}</strong></div>
    <div class="env-unsaved-actions">
      <button class="env-btn env-btn-sm env-btn-danger" id="envUnsavedDiscard">Discard & Switch</button>
      <button class="env-btn env-btn-sm" id="envUnsavedCancel">Cancel</button>
    </div>
  `;
  el.prepend(warning);

  document.getElementById('envUnsavedDiscard')?.addEventListener('click', () => {
    setState({ dirty: false });
    loadFile(targetFile);
  });

  document.getElementById('envUnsavedCancel')?.addEventListener('click', () => {
    warning.remove();
  });
}

export function renderLeftActions() {
  const el = document.getElementById('envNewFileBtn');
  if (!el) return;
  el.addEventListener('click', () => {
    if (state.creating) { closeCreateForm(); return; }
    openCreateForm();
  });
}
