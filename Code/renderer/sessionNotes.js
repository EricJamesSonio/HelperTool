const SAVE_DEBOUNCE = 500;

let _panelOpen = false;
let _unlocked = false;
let _repoLocked = false;
let _saveTimer = null;
let _saveStatusTimer = null;
let _notes = [];
let _activeNoteId = null;
let _dirty = false;

let _panel = null;
let _noteList = null;
let _editorWrap = null;
let _editorTitle = null;
let _editorText = null;
let _lockOverlay = null;
let _lockInput = null;
let _lockError = null;
let _lockBtn = null;
let _saveBtn = null;
let _saveStatus = null;
let _emptyState = null;
let _sidebarHeader = null;

const ICON_NOTE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h8l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="12,3 12,7 16,7"/><line x1="6" y1="10" x2="12" y2="10"/><line x1="6" y1="13" x2="11" y2="13"/><line x1="6" y1="16" x2="9" y2="16"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="10" cy="10" r="7"/><line x1="10" y1="6" x2="10" y2="14"/><line x1="6" y1="10" x2="14" y2="10"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3,5 5,5 17,5"/><path d="M6 5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M16 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3" y="9" width="14" height="8" rx="1.5"/><path d="M6 9V5.5A4 4 0 0 1 14 5.5V9"/><circle cx="10" cy="13" r="1.5" fill="currentColor"/></svg>';
const ICON_UNLOCK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3" y="9" width="14" height="8" rx="1.5"/><path d="M6 9V5.5A2 2 0 0 1 10 5.5V9"/><circle cx="10" cy="13" r="1.5" fill="currentColor"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>';
const ICON_SAVE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M17 3H3v14h14V3z"/><path d="M14 3v5H6V3"/><path d="M6 13h8v4H6z"/></svg>';

export function initSessionNotes() {}

export function openSessionNotes() {
  if (!_panel) _injectPanel();
  if (_panelOpen) { closeSessionNotes(); return; }
  _panel.classList.add('open');
  _panelOpen = true;
  _loadNotes();
}

export function closeSessionNotes() {
  if (!_panelOpen) return;
  _saveCurrentNote();
  _panel.classList.remove('open');
  _panelOpen = false;
  clearTimeout(_saveTimer);
  clearTimeout(_saveStatusTimer);
}

export function isSessionNotesOpen() {
  return _panelOpen;
}

export async function handleRepoChange() {
  if (_panelOpen) {
    _saveCurrentNote();
    _notes = [];
    _activeNoteId = null;
    _loadNotes();
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function _relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h';
  if (hours < 48) return 'yesterday';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd';
  const months = Math.floor(days / 30);
  if (months < 12) return months + 'mo';
  return Math.floor(months / 12) + 'y';
}

function _escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ── Panel injection ─────────────────────────────────────────────

function _injectPanel() {
  if (document.getElementById('snPanel')) return;

  const panel = document.createElement('div');
  panel.id = 'snPanel';
  panel.className = 'sn-panel';
  panel.innerHTML = `
<div class="sn-backdrop"></div>
<div class="sn-container">
  <div class="sn-header">
    <span class="sn-header-title">Notes</span>
    <div class="sn-header-actions">
      <button class="sn-btn sn-btn-icon" id="snLockBtn" title="Lock">${ICON_LOCK}</button>
      <button class="sn-btn sn-btn-icon" id="snCloseBtn" title="Close">${ICON_CLOSE}</button>
    </div>
  </div>
  <div class="sn-body">
    <div class="sn-sidebar">
      <div class="sn-sidebar-header" id="snSidebarHeader">
        <span class="sn-sidebar-label">Notes</span>
        <button class="sn-btn sn-btn-ghost sn-btn-add" id="snAddNoteBtn" title="New Note">
          <span class="sn-btn-add-label">New Note</span>
          ${ICON_PLUS}
        </button>
      </div>
      <div class="sn-note-list" id="snNoteList"></div>
    </div>
    <div class="sn-editor" id="snEditor">
      <div class="sn-editor-empty" id="snEditorEmpty">
        <div class="sn-editor-empty-icon">${ICON_NOTE}</div>
        <div class="sn-editor-empty-text">No notes yet</div>
        <div class="sn-editor-empty-sub">Click the New Note button to create one</div>
      </div>
      <div class="sn-editor-active" id="snEditorActive">
        <input class="sn-editor-title" id="snEditorTitle" type="text" placeholder="Note title" />
        <div class="sn-editor-toolbar">
          <button class="sn-btn sn-btn-primary sn-btn-save" id="snSaveBtn">${ICON_SAVE} Save</button>
          <span class="sn-save-status" id="snSaveStatus"></span>
        </div>
        <textarea class="sn-editor-textarea" id="snEditorText" placeholder="Start writing..."></textarea>
      </div>
    </div>
    <div class="sn-lock-overlay" id="snLockOverlay">
      <div class="sn-lock-icon">${ICON_LOCK}</div>
      <div class="sn-lock-title">Notes are locked</div>
      <div class="sn-lock-subtitle">Enter password to unlock</div>
      <div class="sn-lock-row">
        <input type="password" class="sn-password-input" id="snLockInput" placeholder="Password" />
        <button class="sn-btn sn-btn-primary" id="snUnlockBtn">Unlock</button>
      </div>
      <div class="sn-lock-row sn-lock-row--alt">
        <button class="sn-btn sn-btn-ghost" id="snSetPasswordBtn">Set Password</button>
        <button class="sn-btn sn-btn-ghost" id="snRemovePasswordBtn">Remove Password</button>
      </div>
      <div class="sn-lock-error" id="snLockError"></div>
    </div>
  </div>
</div>`;

  document.body.appendChild(panel);

  _panel = panel;
  _noteList = panel.querySelector('#snNoteList');
  _editorWrap = panel.querySelector('#snEditor');
  _editorTitle = panel.querySelector('#snEditorTitle');
  _editorText = panel.querySelector('#snEditorText');
  _lockOverlay = panel.querySelector('#snLockOverlay');
  _lockInput = panel.querySelector('#snLockInput');
  _lockError = panel.querySelector('#snLockError');
  _lockBtn = panel.querySelector('#snLockBtn');
  _saveBtn = panel.querySelector('#snSaveBtn');
  _saveStatus = panel.querySelector('#snSaveStatus');
  _emptyState = panel.querySelector('#snEditorEmpty');
  _sidebarHeader = panel.querySelector('#snSidebarHeader');

  panel.querySelector('#snCloseBtn').addEventListener('click', closeSessionNotes);
  panel.querySelector('.sn-backdrop').addEventListener('click', closeSessionNotes);
  panel.querySelector('.sn-container').addEventListener('click', e => e.stopPropagation());
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape' && _panelOpen) closeSessionNotes();
  });

  panel.querySelector('#snAddNoteBtn').addEventListener('click', _addNote);
  _editorTitle.addEventListener('input', _onEditorInput);
  _editorText.addEventListener('input', _onEditorInput);
  _saveBtn.addEventListener('click', _handleSave);

  panel.querySelector('#snUnlockBtn').addEventListener('click', _handleUnlock);
  panel.querySelector('#snSetPasswordBtn').addEventListener('click', _handleSetPassword);
  panel.querySelector('#snRemovePasswordBtn').addEventListener('click', _handleRemovePassword);
  _lockBtn.addEventListener('click', _handleLockBtn);

  _lockInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') _handleUnlock();
  });

  window.addEventListener('beforeunload', () => {
    if (_panelOpen && _unlocked) _saveCurrentNote();
  });
}

// ── Data operations ────────────────────────────────────────────

async function _loadNotes() {
  const result = await window.electronAPI.getSessionNotes();
  _notes = Array.isArray(result.notes) ? result.notes : [];
  _repoLocked = !!result.locked;

  if (_repoLocked && !_unlocked) {
    _lockOverlay.style.display = 'flex';
    _editorTitle.disabled = true;
    _editorText.disabled = true;
    _editorTitle.value = '';
    _editorText.value = '';
    _noteList.innerHTML = '';
    _lockBtn.style.display = '';
    _lockBtn.innerHTML = ICON_LOCK;
    _showEmptyEditor(false);
    _activeNoteId = null;
    return;
  }

  _unlocked = true;
  _lockOverlay.style.display = 'none';
  _editorTitle.disabled = false;
  _editorText.disabled = false;
  _lockBtn.style.display = _repoLocked ? '' : 'none';
  _lockBtn.innerHTML = ICON_UNLOCK;

  if (_notes.length > 0) {
    _activeNoteId = _notes[_notes.length - 1].id;
    _selectNote(_activeNoteId);
  } else {
    _activeNoteId = null;
    _showEmptyEditor(true);
    _showActiveEditor(false);
  }
}

function _saveCurrentNote() {
  if (!_unlocked) return;
  const note = _notes.find(n => n.id === _activeNoteId);
  if (!note) return;
  note.title = _editorTitle.value;
  note.content = _editorText.value;
  note.updatedAt = Date.now();
  _persistNotes();
  _dirty = false;
  _showSaveStatus('Saved', 'saved');
}

function _persistNotes() {
  window.electronAPI.setSessionNotes(_notes).catch(err => {
    console.error('[SessionNotes] save error:', err);
  });
}

function _scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_saveCurrentNote, SAVE_DEBOUNCE);
}

function _onEditorInput() {
  const note = _notes.find(n => n.id === _activeNoteId);
  if (!note) return;
  note.title = _editorTitle.value;
  note.content = _editorText.value;
  note.updatedAt = Date.now();
  _dirty = true;
  _showSaveStatus('Unsaved changes', 'dirty');
  _scheduleSave();
}

function _handleSave() {
  _saveBtn.disabled = true;
  _showSaveStatus('Saving...', 'saving');
  _saveCurrentNote();
  _saveBtn.disabled = false;
  clearTimeout(_saveTimer);
  clearTimeout(_saveStatusTimer);
  _saveStatusTimer = setTimeout(() => {
    _showSaveStatus('', '');
  }, 2000);
}

function _showSaveStatus(text, cls) {
  _saveStatus.textContent = text;
  _saveStatus.className = 'sn-save-status' + (cls ? ' sn-save-status--' + cls : '');
}

function _showEmptyEditor(show) {
  _emptyState.style.display = show ? 'flex' : 'none';
}

function _showActiveEditor(show) {
  const active = _editorWrap.querySelector('#snEditorActive');
  if (active) active.style.display = show ? 'flex' : 'none';
}

// ── Note CRUD ──────────────────────────────────────────────────

function _addNote() {
  _saveCurrentNote();

  const note = {
    id: _uid(),
    title: 'Note ' + (_notes.length + 1),
    content: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  _notes.push(note);
  _activeNoteId = note.id;
  _showEmptyEditor(false);
  _showActiveEditor(true);
  _editorTitle.value = note.title;
  _editorText.value = '';
  _editorTitle.disabled = false;
  _editorText.disabled = false;
  _dirty = true;
  _showSaveStatus('Unsaved changes', 'dirty');
  _renderNoteList();
  _editorTitle.focus();
  _editorTitle.select();
  _persistNotes();
}

function _selectNote(noteId) {
  _saveCurrentNote();
  _activeNoteId = noteId;
  const note = _notes.find(n => n.id === noteId);
  if (note) {
    _showEmptyEditor(false);
    _showActiveEditor(true);
    _editorTitle.value = note.title || '';
    _editorText.value = note.content || '';
    _editorTitle.disabled = false;
    _editorText.disabled = false;
    _dirty = false;
    _showSaveStatus('Saved', 'saved');
  }
  _renderNoteList();
  _editorTitle.focus();
}

function _deleteNote(noteId) {
  _notes = _notes.filter(n => n.id !== noteId);

  if (_activeNoteId === noteId) {
    _activeNoteId = _notes.length > 0 ? _notes[_notes.length - 1].id : null;
  }

  if (_activeNoteId) {
    const note = _notes.find(n => n.id === _activeNoteId);
    _editorTitle.value = note ? note.title || '' : '';
    _editorText.value = note ? note.content || '' : '';
    _editorTitle.disabled = false;
    _editorText.disabled = false;
    _showEmptyEditor(false);
    _showActiveEditor(true);
    _dirty = false;
    _showSaveStatus('Saved', 'saved');
  } else {
    _showEmptyEditor(true);
    _showActiveEditor(false);
    _editorTitle.value = '';
    _editorText.value = '';
    _dirty = false;
    _showSaveStatus('', '');
  }

  _renderNoteList();
  _persistNotes();
}

function _confirmDeleteNote(noteId) {
  const item = _noteList.querySelector(`[data-note-id="${noteId}"]`);
  if (!item) return;

  item.classList.add('sn-note-item--confirming');
  item.innerHTML = `
    <span class="sn-confirm-text">Delete this note?</span>
    <div class="sn-confirm-actions">
      <button class="sn-btn sn-btn-sm sn-btn-danger" id="snConfirmDeleteYes">Delete</button>
      <button class="sn-btn sn-btn-sm" id="snConfirmDeleteNo">Cancel</button>
    </div>
  `;

  item.querySelector('#snConfirmDeleteYes').addEventListener('click', e => {
    e.stopPropagation();
    _deleteNote(noteId);
  });

  item.querySelector('#snConfirmDeleteNo').addEventListener('click', e => {
    e.stopPropagation();
    _renderNoteList();
  });
}

function _renderNoteList() {
  _noteList.innerHTML = '';

  for (const note of _notes) {
    const item = document.createElement('div');
    item.className = 'sn-note-item' + (note.id === _activeNoteId ? ' active' : '');
    item.dataset.noteId = note.id;

    item.innerHTML = `
      <span class="sn-note-item-icon">${ICON_NOTE}</span>
      <div class="sn-note-item-info">
        <div class="sn-note-item-title">${_escapeHtml(note.title || 'Untitled')}</div>
        <div class="sn-note-item-time">${_relativeTime(note.updatedAt)}</div>
      </div>
      <button class="sn-note-item-delete" title="Delete note">${ICON_TRASH}</button>
    `;

    item.addEventListener('click', e => {
      if (e.target.closest('.sn-note-item-delete')) return;
      _selectNote(note.id);
    });

    const delBtn = item.querySelector('.sn-note-item-delete');
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      _confirmDeleteNote(note.id);
    });

    _noteList.appendChild(item);
  }
}

// ── Lock handlers ──────────────────────────────────────────────

async function _handleUnlock() {
  const pwd = _lockInput.value;
  if (!pwd) return;

  const result = await window.electronAPI.verifySessionNotesPassword(pwd);

  if (result.ok) {
    _lockError.textContent = '';
    _lockInput.value = '';
    _unlocked = true;
    _lockOverlay.style.display = 'none';
    _lockBtn.innerHTML = ICON_UNLOCK;
    _editorTitle.disabled = false;
    _editorText.disabled = false;
    _loadNotes();
  } else {
    _lockError.textContent = 'Wrong password';
    _lockInput.select();
  }
}

async function _handleSetPassword() {
  const pwd = _lockInput.value;
  if (!pwd || pwd.length < 4) {
    _lockError.textContent = 'Password must be at least 4 characters';
    return;
  }

  await window.electronAPI.setSessionNotesPassword(pwd);
  _repoLocked = true;
  _unlocked = true;
  _lockBtn.style.display = '';
  _lockBtn.innerHTML = ICON_UNLOCK;
  _lockError.textContent = 'Password set';
  _lockInput.value = '';
  _lockOverlay.style.display = 'none';
  _editorTitle.disabled = false;
  _editorText.disabled = false;
  _loadNotes();
}

async function _handleRemovePassword() {
  await window.electronAPI.setSessionNotesPassword(null);
  _repoLocked = false;
  _unlocked = true;
  _lockBtn.style.display = 'none';
  _lockBtn.innerHTML = ICON_UNLOCK;
  _lockError.textContent = 'Password removed';
  _lockOverlay.style.display = 'none';
  _editorTitle.disabled = false;
  _editorText.disabled = false;
}

function _handleLockBtn() {
  if (!_unlocked) return;
  _saveCurrentNote();
  _unlocked = false;
  _lockOverlay.style.display = 'flex';
  _editorTitle.disabled = true;
  _editorText.disabled = true;
  _lockInput.value = '';
  _lockError.textContent = '';
  _lockInput.focus();
}
