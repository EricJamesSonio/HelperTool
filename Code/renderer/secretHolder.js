/**
 * secretHolder.js
 * Password-protected local secret manager.
 * Appended to <body> as a fixed overlay.
 */

// ─── State ────────────────────────────────────────────────
let _unlocked    = false;
let _secrets     = [];
let _editingId   = null;
let _initialized = false;

// ─── DOM refs (set after inject) ─────────────────────────
let panel, lockScreen, mainScreen,
    pwInput, pwSubmitBtn, pwError, pwLabel, pwSubtitle,
    secretsList, addName, addValue, addBtn,
    editModal, editName, editValue, editSaveBtn, editCancelBtn,
    lockBtn, closeBtn, closeLockBtn,
    resetSection, resetOld, resetNew, resetBtn, resetErr, resetSuccess,
    togglePwBtn;

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
    _setup(); // no-op if already done
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
    el.className = 'sh-panel'; // NOT sh-visible — hidden by default

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

    <button id="shPwSubmit" class="sh-btn sh-btn-primary sh-btn-block" type="button">
      Unlock
    </button>

    <button id="shCloseLock" class="sh-btn sh-btn-ghost sh-btn-block sh-btn-sm" type="button">
      ✕ Cancel
    </button>

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

  <!-- Add row -->
  <div class="sh-add-bar">
    <input id="shAddName"  class="sh-input sh-input-sm" placeholder="Name  (e.g. JWT_SECRET)" />
    <input id="shAddValue" class="sh-input sh-input-sm sh-mono" placeholder="Value" />
    <button id="shAddBtn"  class="sh-btn sh-btn-accent sh-btn-sm" type="button">＋ Add</button>
  </div>

  <!-- List -->
  <div id="shSecretsList" class="sh-list"></div>

  <!-- Change password -->
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

<!-- ══ EDIT MODAL ══ -->
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
}

function _wireEvents() {
    // Toggle pw visibility
    togglePwBtn.addEventListener('click', () => {
        const show = pwInput.type === 'password';
        pwInput.type = show ? 'text' : 'password';
        togglePwBtn.textContent = show ? '🙈' : '👁';
    });

    // Submit on button or Enter
    pwSubmitBtn.addEventListener('click', _handlePwSubmit);
    pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') _handlePwSubmit(); });

    // Close / lock
    closeLockBtn.addEventListener('click', closeSecretHolder);
    closeBtn.addEventListener('click', closeSecretHolder);
    lockBtn.addEventListener('click', _lockVault);

    // Add secret
    addBtn.addEventListener('click', _handleAdd);
    addValue.addEventListener('keydown', e => { if (e.key === 'Enter') _handleAdd(); });

    // Edit modal
    editSaveBtn.addEventListener('click', _handleEditSave);
    editCancelBtn.addEventListener('click', _closeEditModal);
    editModal.addEventListener('click', e => { if (e.target === editModal) _closeEditModal(); });

    // Change password
    resetBtn.addEventListener('click', _handleResetPassword);

    // Backdrop click → close panel
    panel.addEventListener('click', e => { if (e.target === panel) closeSecretHolder(); });

    // Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (editModal.style.display !== 'none') { _closeEditModal(); return; }
            if (isSecretHolderOpen()) closeSecretHolder();
        }
    });
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
            // First time — set password
            const ok = await window.electronAPI.secretsSetPassword(pw);
            if (ok) { await _openVault(); }
            else    { _showPwError('Could not save password. Try again.'); }
        } else {
            // Verify
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
    _unlocked   = true;
    pwInput.value = '';
    _hidePwError();
    lockScreen.style.display = 'none';
    mainScreen.style.display = 'flex';
    await _refreshSecrets();
}

function _lockVault() {
    _unlocked  = false;
    _secrets   = [];
    _editingId = null;
    _closeEditModal();
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

        // Info
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

        // Buttons
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
   HELPERS
   ============================================================ */

function _makeBtn(text, cls, title, onClick) {
    const b = document.createElement('button');
    b.type      = 'button';
    b.className = cls;
    b.title     = title;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
}

function _showPwError(msg) { pwError.textContent = msg; pwError.style.display = 'block'; }
function _hidePwError()    { pwError.style.display = 'none'; }
function _showResetErr(m)  { resetErr.textContent = m; resetErr.style.display = 'block'; }