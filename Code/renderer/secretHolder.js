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
    notesList, noteFormTitle, noteFormBody, noteFormDate, noteSaveBtn, noteCancelBtn,
    noteEditModal, noteEditTitle, noteEditBody, noteEditDate,
    noteEditSaveBtn, noteEditCancelBtn, noteEditModalBack;

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
  <div id="shPanelNotes" class="sh-tab-panel" style="display:none">

    <!-- Quick-add note form -->
    <div class="sh-note-add-bar">
      <div class="sh-note-add-row">
        <input id="shNoteFormTitle" class="sh-input sh-input-sm" placeholder="Note title…" maxlength="120" style="flex:1" />
        <input id="shNoteFormDate"  class="sh-input sh-input-sm sh-mono sh-note-date-input" type="date" title="Date for this note" />
      </div>
      <textarea id="shNoteFormBody" class="sh-input sh-note-textarea" placeholder="Write your note here…" rows="3"></textarea>
      <div class="sh-note-add-actions">
        <button id="shNoteSaveBtn"   class="sh-btn sh-btn-accent sh-btn-sm"  type="button">＋ Save Note</button>
        <button id="shNoteCancelBtn" class="sh-btn sh-btn-ghost  sh-btn-sm"  type="button" style="display:none">✕ Clear</button>
      </div>
    </div>

    <!-- Notes list -->
    <div id="shNotesList" class="sh-list sh-notes-list"></div>

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

<!-- ══ NOTE EDIT MODAL ══ -->
<div id="shNoteEditModal" class="sh-modal-back" style="display:none">
  <div class="sh-modal sh-note-modal">
    <div class="sh-modal-title">📝 Edit Note</div>
    <label class="sh-label">Title</label>
    <input id="shNoteEditTitle" class="sh-input" maxlength="120" />
    <label class="sh-label">Date</label>
    <input id="shNoteEditDate"  class="sh-input sh-input-sm sh-mono" type="date" />
    <label class="sh-label">Note</label>
    <textarea id="shNoteEditBody" class="sh-input sh-note-textarea sh-note-textarea--tall" rows="7"></textarea>
    <div class="sh-modal-foot">
      <button id="shNoteEditCancel" class="sh-btn sh-btn-ghost"   type="button">Cancel</button>
      <button id="shNoteEditSave"   class="sh-btn sh-btn-primary" type="button">Save</button>
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
    noteEditModal      = document.getElementById('shNoteEditModal');
    noteEditTitle      = document.getElementById('shNoteEditTitle');
    noteEditBody       = document.getElementById('shNoteEditBody');
    noteEditDate       = document.getElementById('shNoteEditDate');
    noteEditSaveBtn    = document.getElementById('shNoteEditSave');
    noteEditCancelBtn  = document.getElementById('shNoteEditCancel');
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

    // notes add form
    noteFormTitle.addEventListener('input', _updateNoteCancelBtn);
    noteFormBody.addEventListener('input',  _updateNoteCancelBtn);
    noteSaveBtn.addEventListener('click',   _handleNoteSave);
    noteCancelBtn.addEventListener('click', _clearNoteForm);

    // note edit modal
    noteEditSaveBtn.addEventListener('click',   _handleNoteEditSave);
    noteEditCancelBtn.addEventListener('click', _closeNoteEditModal);
    noteEditModal.addEventListener('click', e => { if (e.target === noteEditModal) _closeNoteEditModal(); });

    // backdrop + escape
    panel.addEventListener('click', e => { if (e.target === panel) closeSecretHolder(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (noteEditModal?.style.display !== 'none') { _closeNoteEditModal(); return; }
            if (editModal?.style.display !== 'none')     { _closeEditModal();     return; }
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
    _closeNoteEditModal();
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
   NOTES — storage helpers (localStorage under the hood;
   notes are not sensitive so no extra encryption needed,
   but they're only accessible after vault unlock)
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
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function _formatDisplayDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
}

/* ============================================================
   NOTES CRUD
   ============================================================ */

function _refreshNotes() {
    _notes = _loadNotesFromStorage();
    _renderNotes();
}

function _renderNotes() {
    notesList.innerHTML = '';

    if (_notes.length === 0) {
        notesList.innerHTML = `
          <div class="sh-notes-empty">
            <div class="sh-notes-empty-icon">📝</div>
            <div class="sh-notes-empty-text">No notes yet.<br>Write something above.</div>
          </div>`;
        return;
    }

    // Sort: newest first (by updatedAt or createdAt)
    const sorted = [..._notes].sort((a, b) =>
        (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
    );

    sorted.forEach(note => {
        const card = document.createElement('div');
        card.className = 'sh-note-card';

        const cardTop = document.createElement('div');
        cardTop.className = 'sh-note-card-top';

        const title = document.createElement('div');
        title.className = 'sh-note-card-title';
        title.textContent = note.title || '(Untitled)';

        const date = document.createElement('div');
        date.className   = 'sh-note-card-date';
        date.textContent = _formatDisplayDate(note.date || note.createdAt?.slice(0,10));

        cardTop.appendChild(title);
        cardTop.appendChild(date);

        const body = document.createElement('div');
        body.className   = 'sh-note-card-body';
        body.textContent = note.body || '';

        const footer = document.createElement('div');
        footer.className = 'sh-note-card-footer';

        const updLbl = document.createElement('span');
        updLbl.className   = 'sh-note-card-upd';
        updLbl.textContent = note.updatedAt
            ? `Updated ${_formatDisplayDate(note.updatedAt.slice(0,10))}`
            : `Added ${_formatDisplayDate(note.createdAt?.slice(0,10))}`;

        const acts = document.createElement('div');
        acts.className = 'sh-note-card-acts';

        const edBtn = _makeBtn('✏️ Edit', 'sh-btn sh-btn-ghost sh-btn-xs', 'Edit note',
            () => _openNoteEditModal(note));

        const dlBtn = _makeBtn('🗑', 'sh-btn sh-btn-danger sh-btn-xs', 'Delete note',
            () => _handleNoteDelete(note.id, card));

        acts.appendChild(edBtn);
        acts.appendChild(dlBtn);
        footer.appendChild(updLbl);
        footer.appendChild(acts);

        card.appendChild(cardTop);
        card.appendChild(body);
        card.appendChild(footer);
        notesList.appendChild(card);
    });
}

function _updateNoteCancelBtn() {
    const hasContent = noteFormTitle.value.trim() || noteFormBody.value.trim();
    noteCancelBtn.style.display = hasContent ? 'inline-flex' : 'none';
}

function _clearNoteForm() {
    noteFormTitle.value = '';
    noteFormBody.value  = '';
    noteFormDate.value  = _todayISO();
    noteCancelBtn.style.display = 'none';
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
    notes.unshift({
        id:        _newNoteId(),
        title:     title || '(Untitled)',
        body:      body,
        date:      noteFormDate.value || _todayISO(),
        createdAt: new Date().toISOString(),
        updatedAt: null,
    });
    _saveNotesToStorage(notes);
    _clearNoteForm();
    _refreshNotes();
    noteFormTitle.focus();
}

function _handleNoteDelete(id, cardEl) {
    cardEl.style.transition = 'opacity 0.18s, transform 0.18s';
    cardEl.style.opacity    = '0';
    cardEl.style.transform  = 'translateX(8px)';
    setTimeout(() => {
        const notes = _loadNotesFromStorage().filter(n => n.id !== id);
        _saveNotesToStorage(notes);
        _refreshNotes();
    }, 200);
}

function _openNoteEditModal(note) {
    _editingNoteId         = note.id;
    noteEditTitle.value    = note.title || '';
    noteEditBody.value     = note.body  || '';
    noteEditDate.value     = note.date  || note.createdAt?.slice(0,10) || _todayISO();
    noteEditModal.style.display = 'flex';
    setTimeout(() => noteEditTitle.focus(), 40);
}

function _closeNoteEditModal() {
    _editingNoteId = null;
    noteEditModal.style.display = 'none';
}

function _handleNoteEditSave() {
    if (!_editingNoteId) return;
    const title = noteEditTitle.value.trim();
    const body  = noteEditBody.value.trim();
    const date  = noteEditDate.value;

    const notes = _loadNotesFromStorage();
    const idx   = notes.findIndex(n => n.id === _editingNoteId);
    if (idx === -1) { _closeNoteEditModal(); return; }

    notes[idx] = {
        ...notes[idx],
        title:     title || '(Untitled)',
        body:      body,
        date:      date,
        updatedAt: new Date().toISOString(),
    };
    _saveNotesToStorage(notes);
    _closeNoteEditModal();
    _refreshNotes();
}

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