/**
 * secretHolder.js
 * Password-protected local secret manager + notepad.
 * Appended to <body> as a fixed overlay.
 */

// ─── State ────────────────────────────────────────────────
let _unlocked    = false;
let _secrets     = [];
let _notes       = [];
let _editingId   = null;
let _editingNoteId = null;
let _initialized = false;
let _activeTab   = 'secrets'; // 'secrets' | 'notes'

// ─── DOM refs (set after inject) ─────────────────────────
let panel, lockScreen, mainScreen,
    pwInput, pwSubmitBtn, pwError, pwLabel, pwSubtitle,
    secretsList, addName, addValue, addBtn,
    editModal, editName, editValue, editSaveBtn, editCancelBtn,
    lockBtn, closeBtn, closeLockBtn,
    resetSection, resetOld, resetNew, resetBtn, resetErr, resetSuccess,
    togglePwBtn,
    // tabs
    tabSecrets, tabNotes, panelSecrets, panelNotes,
    // notes
    notesList, noteFormTitle, noteFormBody, noteFormDate,
    noteSaveBtn, noteCancelBtn, noteDeleteBtn, noteNewBtn,
    notesEditorEmpty, notesEditorForm;

/* ============================================================
   PUBLIC API
   ============================================================ */

export function initSecretHolder() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _setup);
    } else {
        _setup();
    }
}

export async function openSecretHolder() {
    _setup();
    panel.classList.add('sh-visible');
    if (!_unlocked) {
        _showLockScreen();
        await _updateLockLabel();
        setTimeout(() => pwInput?.focus(), 80);
    }
}

export function closeSecretHolder() {
    panel?.classList.remove('sh-visible');
}

export function isSecretHolderOpen() {
    return panel?.classList.contains('sh-visible') ?? false;
}

/* ============================================================
   INIT
   ============================================================ */

function _setup() {
    if (_initialized) return;
    _initialized = true;
    _injectHTML();
    _resolveRefs();
    _wireEvents();
}

function _injectHTML() {
    if (document.getElementById('secretHolderPanel')) return;

    const el = document.createElement('div');
    el.id        = 'secretHolderPanel';
    el.className = 'sh-panel';

    el.innerHTML = `

<!-- ══ LOCK SCREEN ══ -->
<div id="shLockScreen" class="sh-lock-screen">
  <div class="sh-lock-card">
    <div class="sh-lock-icon">🔐</div>
    <h2 class="sh-lock-title" id="shPwLabel">Secret Holder</h2>
    <p  class="sh-lock-subtitle" id="shPwSubtitle"></p>
    <div class="sh-pw-wrap">
      <input id="shPwInput" type="password" class="sh-input"
             placeholder="Enter password…" autocomplete="off" />
      <button id="shTogglePw" class="sh-toggle-pw" type="button" title="Show / hide">👁</button>
    </div>
    <div id="shPwError" class="sh-msg sh-msg-error" style="display:none"></div>
    <button id="shPwSubmit" class="sh-btn sh-btn-primary sh-btn-block" type="button">Unlock</button>
    <button id="shCloseLock" class="sh-btn sh-btn-ghost sh-btn-block sh-btn-sm" type="button">✕ Cancel</button>
  </div>
</div>

<!-- ══ MAIN SCREEN ══ -->
<div id="shMainScreen" class="sh-main-screen" style="display:none">

  <div class="sh-header">
    <span class="sh-header-title">🔐 Secret Holder</span>
    <div class="sh-header-btns">
      <button id="shLockBtn"  class="sh-btn sh-btn-ghost sh-btn-sm" type="button">🔒 Lock</button>
      <button id="shCloseBtn" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">✕ Close</button>
    </div>
  </div>

  <!-- TABS -->
  <div class="sh-tabs">
    <button id="shTabSecrets" class="sh-tab sh-tab-active" type="button">🔑 Secrets</button>
    <button id="shTabNotes"   class="sh-tab"               type="button">📝 Notes</button>
  </div>

  <!-- ══ SECRETS PANEL ══ -->
  <div id="shPanelSecrets" class="sh-tab-panel">
    <div class="sh-add-bar">
      <input id="shAddName"  class="sh-input sh-input-sm" placeholder="Name  (e.g. JWT_SECRET)" />
      <input id="shAddValue" class="sh-input sh-input-sm sh-mono" placeholder="Value" />
      <button id="shAddBtn"  class="sh-btn sh-btn-accent sh-btn-sm" type="button">＋ Add</button>
    </div>
    <div id="shSecretsList" class="sh-list"></div>
    <details class="sh-settings" id="shResetSection">
      <summary class="sh-settings-summary">⚙️ Change password</summary>
      <div class="sh-settings-body">
        <label class="sh-label">Current password</label>
        <input id="shResetOld" type="password" class="sh-input sh-input-sm" placeholder="Current password" />
        <label class="sh-label">New password</label>
        <input id="shResetNew" type="password" class="sh-input sh-input-sm" placeholder="New password" />
        <button id="shResetBtn" class="sh-btn sh-btn-warn sh-btn-sm" type="button">Update password</button>
        <div id="shResetErr"     class="sh-msg sh-msg-error"   style="display:none"></div>
        <div id="shResetSuccess" class="sh-msg sh-msg-success" style="display:none">✓ Password updated!</div>
      </div>
    </details>
  </div>

  <!-- ══ NOTES PANEL ══ -->
  <div id="shPanelNotes" class="sh-tab-panel sh-notes-layout" style="display:none">

    <!-- LEFT: sidebar list -->
    <div class="sh-notes-sidebar">
      <div class="sh-notes-sidebar-header">
        <span class="sh-notes-sidebar-title">📝 Notes</span>
        <button id="shNoteNewBtn" class="sh-btn sh-btn-accent sh-btn-xs" type="button">＋ New</button>
      </div>
      <div id="shNotesList" class="sh-notes-sidebar-list"></div>
    </div>

    <!-- RIGHT: editor -->
    <div class="sh-notes-editor">
      <div id="shNotesEditorEmpty" class="sh-notes-editor-empty">
        <div class="sh-notes-empty-icon">📝</div>
        <div class="sh-notes-empty-text">Select a note or create a new one.</div>
      </div>
      <div id="shNotesEditorForm" class="sh-notes-editor-form" style="display:none">
        <div class="sh-notes-editor-topbar">
          <input id="shNoteFormTitle" class="sh-input sh-notes-editor-title-input" placeholder="Note title…" maxlength="120" />
          <input id="shNoteFormDate"  class="sh-input sh-input-sm sh-mono sh-note-date-input" type="date" title="Date for this note" />
        </div>
        <textarea id="shNoteFormBody" class="sh-input sh-notes-editor-textarea" placeholder="Write your note here…"></textarea>
        <div class="sh-notes-editor-actions">
          <button id="shNoteDeleteBtn" class="sh-btn sh-btn-danger  sh-btn-sm" type="button" style="display:none">🗑 Delete</button>
          <div style="flex:1"></div>
          <button id="shNoteCancelBtn" class="sh-btn sh-btn-ghost   sh-btn-sm" type="button">✕ Discard</button>
          <button id="shNoteSaveBtn"   class="sh-btn sh-btn-accent  sh-btn-sm" type="button">💾 Save</button>
        </div>
      </div>
    </div>

  </div>

</div>

<!-- ══ SECRET EDIT MODAL ══ -->
<div id="shEditModal" class="sh-modal-back" style="display:none">
  <div class="sh-modal">
    <div class="sh-modal-title">✏️ Edit secret</div>
    <label class="sh-label">Name</label>
    <input id="shEditName"  class="sh-input" />
    <label class="sh-label">Value</label>
    <input id="shEditValue" class="sh-input sh-mono" />
    <div class="sh-modal-foot">
      <button id="shEditCancel" class="sh-btn sh-btn-ghost"   type="button">Cancel</button>
      <button id="shEditSave"   class="sh-btn sh-btn-primary" type="button">Save</button>
    </div>
  </div>
</div>

`;

    document.body.appendChild(el);
}

function _resolveRefs() {
    panel          = document.getElementById('secretHolderPanel');
    lockScreen     = document.getElementById('shLockScreen');
    mainScreen     = document.getElementById('shMainScreen');
    pwInput        = document.getElementById('shPwInput');
    pwSubmitBtn    = document.getElementById('shPwSubmit');
    pwError        = document.getElementById('shPwError');
    pwLabel        = document.getElementById('shPwLabel');
    pwSubtitle     = document.getElementById('shPwSubtitle');
    secretsList    = document.getElementById('shSecretsList');
    addName        = document.getElementById('shAddName');
    addValue       = document.getElementById('shAddValue');
    addBtn         = document.getElementById('shAddBtn');
    editModal      = document.getElementById('shEditModal');
    editName       = document.getElementById('shEditName');
    editValue      = document.getElementById('shEditValue');
    editSaveBtn    = document.getElementById('shEditSave');
    editCancelBtn  = document.getElementById('shEditCancel');
    lockBtn        = document.getElementById('shLockBtn');
    closeBtn       = document.getElementById('shCloseBtn');
    closeLockBtn   = document.getElementById('shCloseLock');
    resetSection   = document.getElementById('shResetSection');
    resetOld       = document.getElementById('shResetOld');
    resetNew       = document.getElementById('shResetNew');
    resetBtn       = document.getElementById('shResetBtn');
    resetErr       = document.getElementById('shResetErr');
    resetSuccess   = document.getElementById('shResetSuccess');
    togglePwBtn    = document.getElementById('shTogglePw');
    // tabs
    tabSecrets     = document.getElementById('shTabSecrets');
    tabNotes       = document.getElementById('shTabNotes');
    panelSecrets   = document.getElementById('shPanelSecrets');
    panelNotes     = document.getElementById('shPanelNotes');
    // notes
    notesList          = document.getElementById('shNotesList');
    noteFormTitle      = document.getElementById('shNoteFormTitle');
    noteFormBody       = document.getElementById('shNoteFormBody');
    noteFormDate       = document.getElementById('shNoteFormDate');
    noteSaveBtn        = document.getElementById('shNoteSaveBtn');
    noteCancelBtn      = document.getElementById('shNoteCancelBtn');
    noteDeleteBtn      = document.getElementById('shNoteDeleteBtn');
    noteNewBtn         = document.getElementById('shNoteNewBtn');
    notesEditorEmpty   = document.getElementById('shNotesEditorEmpty');
    notesEditorForm    = document.getElementById('shNotesEditorForm');
}

function _wireEvents() {
    // pw toggle
    togglePwBtn.addEventListener('click', () => {
        const show = pwInput.type === 'password';
        pwInput.type = show ? 'text' : 'password';
        togglePwBtn.textContent = show ? '🙈' : '👁';
    });

    pwSubmitBtn.addEventListener('click', _handlePwSubmit);
    pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') _handlePwSubmit(); });

    closeLockBtn.addEventListener('click', closeSecretHolder);
    closeBtn.addEventListener('click', closeSecretHolder);
    lockBtn.addEventListener('click', _lockVault);

    // secrets
    addBtn.addEventListener('click', _handleAdd);
    addValue.addEventListener('keydown', e => { if (e.key === 'Enter') _handleAdd(); });
    editSaveBtn.addEventListener('click', _handleEditSave);
    editCancelBtn.addEventListener('click', _closeEditModal);
    editModal.addEventListener('click', e => { if (e.target === editModal) _closeEditModal(); });
    resetBtn.addEventListener('click', _handleResetPassword);

    // tabs
    tabSecrets.addEventListener('click', () => _switchTab('secrets'));
    tabNotes.addEventListener('click',   () => _switchTab('notes'));

    // notes
    noteNewBtn.addEventListener('click',    () => _openEditorForNew());
    noteSaveBtn.addEventListener('click',   _handleNoteSave);
    noteCancelBtn.addEventListener('click', _closeEditor);
    noteDeleteBtn.addEventListener('click', _handleNoteDeleteCurrent);

    // backdrop + escape
    panel.addEventListener('click', e => { if (e.target === panel) closeSecretHolder(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (editModal?.style.display !== 'none') { _closeEditModal(); return; }
            if (isSecretHolderOpen()) closeSecretHolder();
        }
    });
}

/* ============================================================
   TABS
   ============================================================ */

function _switchTab(tab) {
    _activeTab = tab;
    if (tab === 'secrets') {
        tabSecrets.classList.add('sh-tab-active');
        tabNotes.classList.remove('sh-tab-active');
        panelSecrets.style.display = 'flex';
        panelNotes.style.display   = 'none';
    } else {
        tabNotes.classList.add('sh-tab-active');
        tabSecrets.classList.remove('sh-tab-active');
        panelNotes.style.display   = 'flex';
        panelSecrets.style.display = 'none';
        if (noteFormDate && !noteFormDate.value) noteFormDate.value = _todayISO();
        _refreshNotes();
    }
}

/* ============================================================
   LOCK SCREEN
   ============================================================ */

function _showLockScreen() {
    lockScreen.style.display = 'flex';
    mainScreen.style.display = 'none';
}

async function _updateLockLabel() {
    try {
        const has = await window.electronAPI.secretsHasPassword();
        if (has) {
            pwLabel.textContent    = 'Enter password';
            pwSubtitle.textContent = 'Your secrets are locked.';
        } else {
            pwLabel.textContent    = 'Create a password';
            pwSubtitle.textContent = 'First time? Set a password to protect your secrets.';
        }
    } catch {
        pwLabel.textContent = 'Secret Holder';
    }
}

/* ============================================================
   PASSWORD FLOW
   ============================================================ */

async function _handlePwSubmit() {
    const pw = pwInput.value.trim();
    if (!pw) { _showPwError('Please enter a password.'); return; }
    _hidePwError();
    pwSubmitBtn.disabled    = true;
    pwSubmitBtn.textContent = '…';

    try {
        const has = await window.electronAPI.secretsHasPassword();
        if (!has) {
            const ok = await window.electronAPI.secretsSetPassword(pw);
            if (ok) { await _openVault(); }
            else    { _showPwError('Could not save password. Try again.'); }
        } else {
            const ok = await window.electronAPI.secretsVerifyPassword(pw);
            if (ok) { await _openVault(); }
            else {
                _showPwError('Incorrect password.');
                pwInput.value = '';
                pwInput.focus();
            }
        }
    } catch (err) {
        console.error('[SecretHolder]', err);
        _showPwError('Unexpected error — check console.');
    } finally {
        pwSubmitBtn.disabled    = false;
        pwSubmitBtn.textContent = 'Unlock';
    }
}

async function _openVault() {
    _unlocked     = true;
    pwInput.value = '';
    _hidePwError();
    lockScreen.style.display = 'none';
    mainScreen.style.display = 'flex';
    await _refreshSecrets();
    _refreshNotes();
}

function _lockVault() {
    _unlocked  = false;
    _secrets   = [];
    _notes     = [];
    _editingId = null;
    _editingNoteId = null;
    _closeEditModal();
    _closeEditor();
    _showLockScreen();
    pwInput.value = '';
    _hidePwError();
}

/* ============================================================
   SECRETS CRUD
   ============================================================ */

async function _refreshSecrets() {
    try { _secrets = await window.electronAPI.secretsGetAll(); }
    catch { _secrets = []; }
    _renderSecrets();
}

function _renderSecrets() {
    secretsList.innerHTML = '';
    if (_secrets.length === 0) {
        secretsList.innerHTML = '<div class="sh-empty">No secrets yet — add one above.</div>';
        return;
    }

    _secrets.forEach(s => {
        const row = document.createElement('div');
        row.className = 'sh-row';

        const info = document.createElement('div');
        info.className = 'sh-row-info';

        const nm = document.createElement('div');
        nm.className   = 'sh-row-name';
        nm.textContent = s.name;

        const vl = document.createElement('div');
        vl.className   = 'sh-row-val';
        vl.textContent = s.value;

        info.appendChild(nm);
        info.appendChild(vl);

        const acts = document.createElement('div');
        acts.className = 'sh-row-acts';

        const cpBtn = _makeBtn('📋', 'sh-btn sh-btn-ghost sh-btn-xs', 'Copy', () => {
            navigator.clipboard.writeText(s.value).then(() => {
                cpBtn.textContent  = '✓';
                cpBtn.style.color  = 'var(--green)';
                setTimeout(() => { cpBtn.textContent = '📋'; cpBtn.style.color = ''; }, 1400);
            });
        });

        const edBtn = _makeBtn('✏️', 'sh-btn sh-btn-ghost sh-btn-xs', 'Edit',
            () => _openEditModal(s));

        const dlBtn = _makeBtn('🗑', 'sh-btn sh-btn-danger sh-btn-xs', 'Delete',
            () => _handleDelete(s.id, row));

        acts.appendChild(cpBtn);
        acts.appendChild(edBtn);
        acts.appendChild(dlBtn);

        row.appendChild(info);
        row.appendChild(acts);
        secretsList.appendChild(row);
    });
}

async function _handleAdd() {
    const name  = addName.value.trim();
    const value = addValue.value.trim();

    if (!name || !value) {
        if (!name)  { addName.classList.add('sh-err-border');  setTimeout(() => addName.classList.remove('sh-err-border'),  1200); }
        if (!value) { addValue.classList.add('sh-err-border'); setTimeout(() => addValue.classList.remove('sh-err-border'), 1200); }
        return;
    }

    await window.electronAPI.secretsAdd(name, value);
    addName.value  = '';
    addValue.value = '';
    addName.focus();
    await _refreshSecrets();
}

async function _handleDelete(id, rowEl) {
    rowEl.style.transition = 'opacity 0.18s';
    rowEl.style.opacity    = '0.3';
    await new Promise(r => setTimeout(r, 200));
    await window.electronAPI.secretsDelete(id);
    await _refreshSecrets();
}

function _openEditModal(s) {
    _editingId      = s.id;
    editName.value  = s.name;
    editValue.value = s.value;
    editModal.style.display = 'flex';
    setTimeout(() => editName.focus(), 40);
}

function _closeEditModal() {
    _editingId = null;
    editModal.style.display = 'none';
}

async function _handleEditSave() {
    if (!_editingId) return;
    const name  = editName.value.trim();
    const value = editValue.value.trim();
    if (!name || !value) return;
    await window.electronAPI.secretsUpdate(_editingId, name, value);
    _closeEditModal();
    await _refreshSecrets();
}

/* ============================================================
   CHANGE PASSWORD
   ============================================================ */

async function _handleResetPassword() {
    resetErr.style.display     = 'none';
    resetSuccess.style.display = 'none';
    const old = resetOld.value.trim();
    const nw  = resetNew.value.trim();
    if (!old || !nw) { _showResetErr('Fill in both fields.'); return; }
    const ok = await window.electronAPI.secretsResetPassword(old, nw);
    if (ok) {
        resetOld.value = '';
        resetNew.value = '';
        resetSuccess.style.display = 'block';
        setTimeout(() => { resetSuccess.style.display = 'none'; }, 3500);
    } else {
        _showResetErr('Current password is incorrect.');
    }
}

/* ============================================================
   NOTES — storage helpers
   ============================================================ */

const NOTES_KEY = 'sh_notes_v1';

function _loadNotesFromStorage() {
    try {
        const raw = localStorage.getItem(NOTES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function _saveNotesToStorage(notes) {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch {}
}

function _newNoteId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function _todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function _formatDisplayDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
}

/* ============================================================
   NOTES CRUD + EDITOR
   ============================================================ */

function _refreshNotes() {
    _notes = _loadNotesFromStorage();
    _renderSidebar();
    // If currently editing a note, re-highlight its sidebar item
    if (_editingNoteId) _highlightSidebarItem(_editingNoteId);
}

function _renderSidebar() {
    notesList.innerHTML = '';

    const sorted = [..._notes].sort((a, b) =>
        (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
    );

    if (sorted.length === 0) {
        notesList.innerHTML = `
          <div class="sh-notes-sidebar-empty">
            <div>No notes yet.</div>
            <div>Hit ＋ New to start.</div>
          </div>`;
        return;
    }

    sorted.forEach(note => {
        const item = document.createElement('div');
        item.className = 'sh-notes-sidebar-item';
        item.dataset.noteId = note.id;
        if (note.id === _editingNoteId) item.classList.add('active');

        const itemTitle = document.createElement('div');
        itemTitle.className   = 'sh-notes-sidebar-item-title';
        itemTitle.textContent = note.title || '(Untitled)';

        const itemMeta = document.createElement('div');
        itemMeta.className   = 'sh-notes-sidebar-item-meta';
        itemMeta.textContent = _formatDisplayDate(note.date || note.createdAt?.slice(0,10));

        const itemPreview = document.createElement('div');
        itemPreview.className   = 'sh-notes-sidebar-item-preview';
        itemPreview.textContent = (note.body || '').slice(0, 80);

        item.appendChild(itemTitle);
        item.appendChild(itemMeta);
        item.appendChild(itemPreview);

        item.addEventListener('click', () => _openEditorForNote(note));
        notesList.appendChild(item);
    });
}

function _highlightSidebarItem(id) {
    notesList.querySelectorAll('.sh-notes-sidebar-item').forEach(el => {
        el.classList.toggle('active', el.dataset.noteId === id);
    });
}

function _openEditorForNew() {
    _editingNoteId = null;
    noteFormTitle.value  = '';
    noteFormBody.value   = '';
    noteFormDate.value   = _todayISO();
    noteDeleteBtn.style.display = 'none';
    _showEditor();
    _highlightSidebarItem(null);
    setTimeout(() => noteFormTitle.focus(), 40);
}

function _openEditorForNote(note) {
    _editingNoteId       = note.id;
    noteFormTitle.value  = note.title || '';
    noteFormBody.value   = note.body  || '';
    noteFormDate.value   = note.date  || note.createdAt?.slice(0,10) || _todayISO();
    noteDeleteBtn.style.display = 'inline-flex';
    _showEditor();
    _highlightSidebarItem(note.id);
    setTimeout(() => noteFormBody.focus(), 40);
}

function _showEditor() {
    notesEditorEmpty.style.display = 'none';
    notesEditorForm.style.display  = 'flex';
}

function _closeEditor() {
    _editingNoteId = null;
    notesEditorEmpty.style.display = 'flex';
    notesEditorForm.style.display  = 'none';
    _highlightSidebarItem(null);
}

function _handleNoteSave() {
    const title = noteFormTitle.value.trim();
    const body  = noteFormBody.value.trim();

    if (!title && !body) {
        noteFormTitle.classList.add('sh-err-border');
        setTimeout(() => noteFormTitle.classList.remove('sh-err-border'), 1200);
        return;
    }

    const notes = _loadNotesFromStorage();

    if (_editingNoteId) {
        // Update existing
        const idx = notes.findIndex(n => n.id === _editingNoteId);
        if (idx !== -1) {
            notes[idx] = {
                ...notes[idx],
                title:     title || '(Untitled)',
                body,
                date:      noteFormDate.value || _todayISO(),
                updatedAt: new Date().toISOString(),
            };
        }
    } else {
        // Create new
        const newNote = {
            id:        _newNoteId(),
            title:     title || '(Untitled)',
            body,
            date:      noteFormDate.value || _todayISO(),
            createdAt: new Date().toISOString(),
            updatedAt: null,
        };
        notes.unshift(newNote);
        _editingNoteId = newNote.id;
        noteDeleteBtn.style.display = 'inline-flex';
    }

    _saveNotesToStorage(notes);
    _refreshNotes();

    // Flash save button to confirm
    noteSaveBtn.textContent = '✓ Saved';
    noteSaveBtn.style.background = 'var(--green-dim)';
    noteSaveBtn.style.borderColor = 'var(--green)';
    noteSaveBtn.style.color = 'var(--green)';
    setTimeout(() => {
        noteSaveBtn.textContent = '💾 Save';
        noteSaveBtn.style.background = '';
        noteSaveBtn.style.borderColor = '';
        noteSaveBtn.style.color = '';
    }, 1400);
}

function _handleNoteDeleteCurrent() {
    if (!_editingNoteId) return;
    const notes = _loadNotesFromStorage().filter(n => n.id !== _editingNoteId);
    _saveNotesToStorage(notes);
    _closeEditor();
    _refreshNotes();
}

// kept for legacy compat (sidebar delete) — not used in new layout
function _handleNoteDelete(id) {
    const notes = _loadNotesFromStorage().filter(n => n.id !== id);
    _saveNotesToStorage(notes);
    if (_editingNoteId === id) _closeEditor();
    _refreshNotes();
}

// no-ops for removed modal
function _updateNoteCancelBtn() {}
function _clearNoteForm() { _closeEditor(); }
function _openNoteEditModal() {}
function _closeNoteEditModal() {}

/* ============================================================
   HELPERS
   ============================================================ */

function _makeBtn(text, cls, title, onClick) {
    const b = document.createElement('button');
    b.type        = 'button';
    b.className   = cls;
    b.title       = title;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
}

function _showPwError(msg) { pwError.textContent = msg; pwError.style.display = 'block'; }
function _hidePwError()    { pwError.style.display = 'none'; }
function _showResetErr(m)  { resetErr.textContent = m; resetErr.style.display = 'block'; }