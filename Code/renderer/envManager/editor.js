import { state, setState } from './state.js';
import { maskValue, serializeEnv, escHtml } from './utils.js';
import { renderFileList } from './fileList.js';

export function renderEditor() {
  const editorEl = document.getElementById('envEditor');
  const emptyEl = document.getElementById('envRightEmpty');
  if (!editorEl || !emptyEl) return;

  if (!state.activeFile) {
    editorEl.style.display = 'none';
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display = 'none';
  editorEl.style.display = '';

  const fileLabel = state.dirty ? `${escHtml(state.activeFile)} \u25CF` : escHtml(state.activeFile);
  const saveDisabled = !state.dirty ? 'disabled' : '';

  let rowsHtml = '';
  const filtered = state.entries.filter(e => {
    if (!state.searchQuery) return true;
    if (e.key === null) return true;
    return e.key.toLowerCase().includes(state.searchQuery.toLowerCase());
  });

  filtered.forEach((entry, displayIdx) => {
    const realIdx = state.entries.indexOf(entry);
    if (entry.comment !== null && entry.comment !== undefined) {
      rowsHtml += `
        <div class="env-entry env-entry-comment" data-idx="${realIdx}">
          <span class="env-entry-comment-text">${escHtml(entry.comment || ' ')}</span>
          <button class="env-entry-action env-entry-del" data-idx="${realIdx}" title="Delete row">&times; Del</button>
        </div>
      `;
      return;
    }
    const revealed = entry.revealed || false;
    const displayValue = revealed ? escHtml(entry.value) : maskValue(entry.value);
    rowsHtml += `
      <div class="env-entry" data-idx="${realIdx}">
        <span class="env-entry-key">${escHtml(entry.key)}</span>
        <span class="env-entry-value">${displayValue}</span>
        <div class="env-entry-actions">
          <button class="env-entry-action env-entry-reveal" data-idx="${realIdx}" title="${revealed ? 'Hide' : 'Reveal'}">${revealed ? '\uD83D\uDC41' : '\uD83D\uDC41'} ${revealed ? 'Hide' : 'Show'}</button>
          <button class="env-entry-action env-entry-edit" data-idx="${realIdx}" title="Edit">\u270F\uFE0F Edit</button>
          <button class="env-entry-action env-entry-del" data-idx="${realIdx}" title="Delete">&times; Del</button>
        </div>
      </div>
    `;
  });

  editorEl.innerHTML = `
    <div class="env-editor-header">
      <span class="env-editor-filename">${fileLabel}</span>
      <div class="env-editor-header-actions">
        <button class="env-btn env-btn-sm" id="envCopyBtn" title="Copy contents to clipboard">Copy</button>
        <button class="env-btn env-btn-sm env-btn-primary" id="envSaveBtn" ${saveDisabled}>Save</button>
      </div>
    </div>
    ${state.error ? `<div class="env-editor-error">${escHtml(state.error)}</div>` : ''}
    <div class="env-editor-search">
      <input class="env-search-input" id="envSearchInput" placeholder="Search keys\u2026" value="${escHtml(state.searchQuery)}">
    </div>
    <div class="env-editor-rows" id="envEditorRows">
      <div class="env-entry env-entry-header">
        <span class="env-entry-key">KEY</span>
        <span class="env-entry-value">VALUE</span>
        <div class="env-entry-actions"><span class="env-entry-action-label">ACTIONS</span></div>
      </div>
      ${rowsHtml || '<div class="env-empty-rows">No matching entries</div>'}
    </div>
    <div class="env-editor-add">
      <button class="env-btn env-btn-sm" id="envAddKeyBtn">+ Add Key</button>
    </div>
  `;

  wireEditorEvents();
}

function wireEditorEvents() {
  document.getElementById('envCloseBtn')?.addEventListener('click', () => import('./index.js').then(m => m.close()));

  document.getElementById('envCopyBtn')?.addEventListener('click', () => {
    const text = serializeEnv(state.entries);
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard');
    });
  });

  document.getElementById('envSaveBtn')?.addEventListener('click', saveFile);

  document.getElementById('envSearchInput')?.addEventListener('input', (e) => {
    setState({ searchQuery: e.target.value });
    renderEditor();
  });

  document.querySelectorAll('.env-entry-reveal').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      toggleReveal(idx);
    });
  });

  document.querySelectorAll('.env-entry-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      enterEditMode(idx);
    });
  });

  document.querySelectorAll('.env-entry-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      deleteEntry(idx);
    });
  });

  document.getElementById('envAddKeyBtn')?.addEventListener('click', showAddKeyRow);
}

function toggleReveal(idx) {
  const entries = [...state.entries];
  if (idx < 0 || idx >= entries.length) return;
  const entry = { ...entries[idx] };
  entry.revealed = !entry.revealed;
  entries[idx] = entry;
  setState({ entries });
  renderEditor();
}

function enterEditMode(idx) {
  const entry = state.entries[idx];
  if (!entry || entry.comment !== null) return;

  const row = document.querySelector(`.env-entry[data-idx="${idx}"]`);
  if (!row) return;

  row.innerHTML = `
    <div class="env-entry-edit-form">
      <input class="env-edit-input env-edit-key" value="${escHtml(entry.key)}" placeholder="KEY" spellcheck="false">
      <input class="env-edit-input env-edit-val" value="${escHtml(entry.value)}" placeholder="value" spellcheck="false">
      <button class="env-btn env-btn-sm env-btn-primary env-edit-confirm" data-idx="${idx}" title="Confirm">\u2713 Ok</button>
      <button class="env-btn env-btn-sm env-edit-cancel" data-idx="${idx}" title="Cancel">\u2715 Cancel</button>
    </div>
  `;

  const keyInput = row.querySelector('.env-edit-key');
  const valInput = row.querySelector('.env-edit-val');

  row.querySelector('.env-edit-confirm')?.addEventListener('click', () => {
    confirmEdit(idx, keyInput.value, valInput.value);
  });

  row.querySelector('.env-edit-cancel')?.addEventListener('click', () => {
    renderEditor();
  });

  keyInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') valInput?.focus();
    if (e.key === 'Escape') renderEditor();
  });

  valInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmEdit(idx, keyInput.value, valInput.value);
    if (e.key === 'Escape') renderEditor();
  });

  valInput?.focus();
}

function confirmEdit(idx, newKey, newValue) {
  const entries = [...state.entries];
  if (idx < 0 || idx >= entries.length) return;
  const trimmedKey = newKey.trim().toUpperCase();
  if (!trimmedKey) { showToast('Key is required'); return; }
  entries[idx] = { ...entries[idx], key: trimmedKey, value: newValue, revealed: true, comment: null };
  setState({ entries, dirty: true });
  renderEditor();
  renderFileList();
}

function deleteEntry(idx) {
  const entries = [...state.entries];
  if (idx < 0 || idx >= entries.length) return;
  entries.splice(idx, 1);
  setState({ entries, dirty: true });
  renderEditor();
  renderFileList();
}

function showAddKeyRow() {
  const addEl = document.getElementById('envEditorRows');
  if (!addEl) return;

  const existing = addEl.querySelector('.env-add-key-row');
  if (existing) { existing.remove(); return; }

  const row = document.createElement('div');
  row.className = 'env-entry env-add-key-row';
  row.innerHTML = `
    <div class="env-entry-edit-form">
      <input class="env-edit-input env-edit-key env-add-key-input" placeholder="NEW_KEY" spellcheck="false">
      <input class="env-edit-input env-edit-val env-add-val-input" placeholder="value" spellcheck="false">
      <button class="env-btn env-btn-sm env-btn-primary" id="envAddConfirm">Add</button>
      <button class="env-btn env-btn-sm" id="envAddCancel">Cancel</button>
    </div>
  `;
  addEl.appendChild(row);

  const keyInput = row.querySelector('.env-add-key-input');
  const valInput = row.querySelector('.env-add-val-input');

  document.getElementById('envAddConfirm')?.addEventListener('click', () => {
    addNewKey(keyInput.value, valInput.value);
  });

  document.getElementById('envAddCancel')?.addEventListener('click', () => {
    row.remove();
  });

  keyInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') valInput?.focus();
    if (e.key === 'Escape') row.remove();
  });

  valInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNewKey(keyInput.value, valInput.value);
    if (e.key === 'Escape') row.remove();
  });

  keyInput?.focus();
}

function addNewKey(rawKey, rawValue) {
  const trimmedKey = rawKey.trim().toUpperCase();
  if (!trimmedKey) { showToast('Key is required'); return; }
  const entries = [...state.entries, { key: trimmedKey, value: rawValue, revealed: true, comment: null }];
  setState({ entries, dirty: true });
  renderEditor();
  renderFileList();
}

async function saveFile() {
  try {
    const r = await window.envAPI.saveFile(state.repoPath, state.activeFile, state.entries);
    if (r.success) {
      setState({ dirty: false, error: null });
      showToast('Saved');
      renderEditor();
      renderFileList();
    } else {
      setState({ error: r.error });
      renderEditor();
    }
  } catch (err) {
    setState({ error: err.message });
    renderEditor();
  }
}

function showToast(msg) {
  const existing = document.querySelector('.env-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'env-toast';
  toast.textContent = msg;
  document.getElementById('envModal')?.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('env-toast-show'));
  setTimeout(() => toast.remove(), 2000);
}
