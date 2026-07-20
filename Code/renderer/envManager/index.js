import { state, setState } from './state.js';
import { getModalShell } from './template.js';
import { renderAllPanels, renderPanel, loadFileForSection, loadSectionFiles } from './renderPanel.js';
import { openCreateForm } from './createFlow.js';

const SECTION_PALETTE = [
  '#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
  '#f472b6', '#fb923c', '#2dd4bf', '#e879f9', '#38bdf8',
];

const MAX_SECTIONS = 5;
let _container = null;

export function open(repoPath) {
  if (!repoPath) return;
  _container = document.getElementById('app') || document.body;

  const defaultSections = [
    {
      id: 'sec_env',
      pattern: '.env*',
      label: 'Env Files',
      type: 'env',
      color: SECTION_PALETTE[0],
      files: [],
      activeFile: null,
      entries: [],
      dirty: false,
      editing: false,
      creating: false,
      loading: false,
      error: null,
      searchQuery: '',
    },
    {
      id: 'sec_gitignore',
      pattern: '.gitignore',
      label: '.gitignore',
      type: 'file',
      color: SECTION_PALETTE[1],
      files: [],
      activeFile: null,
      entries: [],
      dirty: false,
      editing: false,
      creating: false,
      loading: false,
      error: null,
      searchQuery: '',
    },
  ];

  setState({ open: true, repoPath, sections: defaultSections });

  _render();
  wireOverlayEvents();

  Promise.all(state.sections.map((_, i) => loadSectionFiles(i)))
    .then(() => {
      renderAllPanels();
      state.sections.forEach((sec, i) => {
        if (sec.files.length && !sec.activeFile) {
          loadFileForSection(i, sec.files[0]);
        }
      });
    });
}

export function close() {
  const hasDirty = state.sections.some(s => s.dirty);
  if (hasDirty && !confirm('You have unsaved changes. Discard them?')) return;
  const overlay = document.getElementById('envOverlay');
  if (overlay) overlay.remove();
  setState({ open: false, repoPath: null, sections: [] });
  _container = null;
}

function _render() {
  if (!_container) return;
  const existing = document.getElementById('envOverlay');
  if (existing) existing.remove();

  const shell = document.createElement('div');
  shell.innerHTML = getModalShell();
  _container.appendChild(shell.firstElementChild);

  const repoEl = document.getElementById('envHeaderRepo');
  if (repoEl) {
    const repoName = state.repoPath?.split(/[\\/]/).pop() || '';
    repoEl.textContent = repoName;
  }
}

function _onKeyDown(e) {
  if (e.key === 'Escape') {
    if (document.getElementById('envAddSection')?.style.display !== 'none') { closeAddSection(); return; }
    const hasDirty = state.sections.some(s => s.dirty);
    if (!hasDirty || confirm('You have unsaved changes. Discard them?')) close();
  }
}

function wireOverlayEvents() {
  document.getElementById('envOverlay')?.addEventListener('mousedown', e => {
    if (e.target === e.currentTarget) {
      const hasDirty = state.sections.some(s => s.dirty);
      if (!hasDirty || confirm('You have unsaved changes. Discard them?')) close();
    }
  });

  document.getElementById('envCloseBtn')?.addEventListener('click', close);
  document.getElementById('envHeaderAddBtn')?.addEventListener('click', openAddSection);
  document.getElementById('envAddSectionConfirm')?.addEventListener('click', confirmAddSection);
  document.getElementById('envAddSectionCancel')?.addEventListener('click', closeAddSection);
  document.getElementById('envAddSectionInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmAddSection();
    if (e.key === 'Escape') closeAddSection();
  });
  document.getElementById('envAddSectionOverlay')?.addEventListener('click', closeAddSection);

  document.getElementById('envPanels')?.addEventListener('click', handlePanelClick);
  document.getElementById('envPanels')?.addEventListener('input', handlePanelInput);
  document.getElementById('envPanels')?.addEventListener('keydown', handlePanelKeyDown);

  document.addEventListener('keydown', _onKeyDown);
}

// ─── Helpers ───────────────────────────────────────────────────

function getSectionIdx(el) {
  const panel = el.closest('.env-panel');
  if (!panel) return -1;
  return parseInt(panel.dataset.section);
}

// ─── Event Delegation ─────────────────────────────────────────

function handlePanelClick(e) {
  const t = e.target;
  const sectionIdx = getSectionIdx(t);
  if (sectionIdx < 0) return;

  const sec = state.sections[sectionIdx];
  if (!sec) return;

  // File row
  const fileRow = t.closest('.env-file-row');
  if (fileRow) {
    e.preventDefault();
    const fileName = fileRow.dataset.file;
    if (fileName && fileName !== sec.activeFile) {
      if (sec.dirty && !confirm(`Discard unsaved changes in "${sec.activeFile}"?`)) return;
      loadFileForSection(sectionIdx, fileName);
    }
    return;
  }

  // Delete entry
  const delBtn = t.closest('.env-entry-del');
  if (delBtn) {
    const idx = parseInt(delBtn.dataset.idx);
    if (idx >= 0 && idx < sec.entries.length) {
      sec.entries.splice(idx, 1);
      sec.dirty = true;
      renderPanel(sectionIdx);
    }
    return;
  }

  // Copy
  if (t.closest('.env-editor-copy')) {
    const text = sec.entries.map(e => {
      if (e.comment !== null && e.comment !== undefined) return e.comment;
      const v = e.value.includes(' ') || e.value.includes('"') || e.value.includes("'") ? `"${e.value}"` : e.value;
      return `${e.key}=${v}`;
    }).join('\n');
    navigator.clipboard.writeText(text);
    return;
  }

  // Save
  if (t.closest('.env-editor-save')) {
    if (!sec.dirty) return;
    window.envAPI.saveFile(state.repoPath, sec.activeFile, sec.entries).then(r => {
      if (r.success) { sec.dirty = false; sec.error = null; }
      else { sec.error = r.error; }
      renderPanel(sectionIdx);
    }).catch(err => {
      sec.error = err.message;
      renderPanel(sectionIdx);
    });
    return;
  }

  // Add key button
  if (t.closest('.env-editor-add-key')) {
    const rowsEl = document.querySelector(`.env-panel[data-section="${sectionIdx}"] .env-editor-rows`);
    if (!rowsEl) return;
    const existing = rowsEl.querySelector('.env-add-key-row');
    if (existing) { existing.remove(); return; }
    const row = document.createElement('div');
    row.className = 'env-entry env-add-key-row';
    row.innerHTML = `
      <div class="env-entry-edit-form">
        <input class="env-edit-input env-edit-key" placeholder="NEW_KEY" spellcheck="false">
        <input class="env-edit-input env-edit-val" placeholder="value" spellcheck="false">
        <button class="env-btn env-btn-sm env-btn-primary env-add-confirm">Add</button>
        <button class="env-btn env-btn-sm env-add-cancel">Cancel</button>
      </div>
    `;
    rowsEl.appendChild(row);
    row.querySelector('.env-edit-key')?.focus();
    return;
  }

  // Add key confirm
  if (t.closest('.env-add-confirm')) {
    const form = t.closest('.env-entry-edit-form');
    const key = form.querySelector('.env-edit-key').value.trim().toUpperCase();
    const val = form.querySelector('.env-edit-val').value;
    if (!key) return;
    sec.entries.push({ key, value: val, revealed: true, comment: null });
    sec.dirty = true;
    renderPanel(sectionIdx);
    return;
  }

  // Add key cancel
  if (t.closest('.env-add-cancel')) { t.closest('.env-add-key-row')?.remove(); return; }

  // Delete section
  if (t.closest('.env-panel-del-btn')) { deleteSection(sectionIdx); return; }

  // New file
  if (t.closest('.env-panel-new-btn')) { openCreateForm(sectionIdx); return; }

  // Edit mode
  if (t.closest('.env-editor-edit-btn')) {
    sec.editing = true;
    renderPanel(sectionIdx);
    return;
  }
  // Done editing
  if (t.closest('.env-editor-done-btn')) {
    const panel = document.querySelector(`.env-panel[data-section="${sectionIdx}"]`);
    if (panel) {
      panel.querySelectorAll('.env-entry[data-idx]').forEach(row => {
        const idx = parseInt(row.dataset.idx);
        if (isNaN(idx) || idx >= sec.entries.length) return;
        if (sec.entries[idx].comment !== null) return;
        const keyInput = row.querySelector('.env-edit-key');
        const valInput = row.querySelector('.env-edit-val');
        if (keyInput) {
          const key = keyInput.value.trim().toUpperCase();
          if (key) sec.entries[idx].key = key;
        }
        if (valInput) sec.entries[idx].value = valInput.value;
      });
    }
    sec.editing = false;
    sec.dirty = true;
    renderPanel(sectionIdx);
    return;
  }
  // Cancel editing
  if (t.closest('.env-editor-cancel-btn')) {
    sec.editing = false;
    loadFileForSection(sectionIdx, sec.activeFile);
    return;
  }
}

function handlePanelInput(e) {
  const t = e.target;
  if (!t.classList.contains('env-search-input')) return;
  const sectionIdx = getSectionIdx(t);
  if (sectionIdx < 0) return;
  const sec = state.sections[sectionIdx];
  if (!sec) return;
  sec.searchQuery = t.value;
  renderPanel(sectionIdx);
}

function handlePanelKeyDown(e) {
  const t = e.target;
  const form = t.closest('.env-entry-edit-form');
  if (!form) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    const btn = form.querySelector('.env-edit-confirm, .env-add-confirm');
    if (btn) btn.click();
  }
  if (e.key === 'Escape') {
    const btn = form.querySelector('.env-edit-cancel');
    if (btn) { btn.click(); return; }
    t.closest('.env-add-key-row')?.remove();
  }
}

// ─── Section CRUD ─────────────────────────────────────────────

function openAddSection() {
  document.getElementById('envAddSection').style.display = '';
  const input = document.getElementById('envAddSectionInput');
  if (input) { input.value = ''; input.focus(); }
  document.getElementById('envAddSectionError').textContent = '';
}

function closeAddSection() {
  document.getElementById('envAddSection').style.display = 'none';
}

function confirmAddSection() {
  const input = document.getElementById('envAddSectionInput');
  const errorEl = document.getElementById('envAddSectionError');
  const pattern = input?.value?.trim();
  if (!pattern) { errorEl.textContent = 'Please enter a file pattern'; return; }
  if (state.sections.some(s => s.pattern === pattern)) { errorEl.textContent = `Section "${pattern}" already exists`; return; }
  if (state.sections.length >= MAX_SECTIONS) { errorEl.textContent = `Maximum ${MAX_SECTIONS} sections allowed`; return; }

  const colorIdx = state.sections.length % SECTION_PALETTE.length;
  const ns = {
    id: 'sec_' + Date.now(), pattern, label: pattern, type: 'file',
    color: SECTION_PALETTE[colorIdx],
    files: [], activeFile: null, entries: [], dirty: false,
    editing: false, creating: false, loading: false, error: null, searchQuery: '',
  };

  state.sections.push(ns);
  closeAddSection();
  renderAllPanels();
  loadSectionFiles(state.sections.length - 1).then(() => renderAllPanels());
}

function deleteSection(idx) {
  if (state.sections.length <= 1) return;
  state.sections.splice(idx, 1);
  renderAllPanels();
}
