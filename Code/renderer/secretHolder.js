/**
 * secretHolder.js
 * Password-protected local secret manager.
 * Renders into #secretHolderPanel (injected into index.html).
 * No external deps — plain JS + CSS vars from base.css.
 */

// ─── State ────────────────────────────────────────────────
let _unlocked   = false;
let _secrets    = [];
let _editingId  = null;   // id of secret being edited, or null

// ─── DOM refs (resolved after panel is injected) ──────────
let panel, lockScreen, mainScreen,
    pwInput, pwSubmitBtn, pwError, pwLabel,
    secretsList, addForm, addName, addValue, addBtn,
    editModal, editName, editValue, editSaveBtn, editCancelBtn,
    lockBtn, resetPwSection, resetOld, resetNew, resetBtn, resetErr,
    togglePwBtn;

// ─── Public API ───────────────────────────────────────────
export function initSecretHolder() {
    injectHTML();
    resolveRefs();
    wireEvents();
}

// ─── HTML Injection ───────────────────────────────────────
function injectHTML() {
    const el = document.createElement('div');
    el.id = 'secretHolderPanel';
    el.className = 'sh-panel';
    el.innerHTML = `
<!-- LOCK SCREEN -->
<div id="shLockScreen" class="sh-lock-screen">
  <div class="sh-lock-card">
    <div class="sh-lock-icon">🔐</div>
    <div class="sh-lock-title" id="shPwLabel">Enter password</div>
    <div class="sh-pw-wrap">
      <input id="shPwInput" type="password" class="sh-input" placeholder="Password…" autocomplete="off" />
      <button id="shTogglePw" class="sh-toggle-pw" title="Show/hide">👁</button>
    </div>
    <div id="shPwError" class="sh-error" style="display:none"></div>
    <button id="shPwSubmit" class="sh-btn sh-btn-primary">Unlock</button>
  </div>
</div>

<!-- MAIN SCREEN -->
<div id="shMainScreen" class="sh-main-screen" style="display:none">

  <!-- Header -->
  <div class="sh-header">
    <span class="sh-header-title">🔐 Secret Holder</span>
    <div class="sh-header-actions">
      <button id="shLockBtn" class="sh-btn sh-btn-ghost sh-btn-sm" title="Lock">🔒 Lock</button>
    </div>
  </div>

  <!-- Add secret form -->
  <div class="sh-add-form" id="shAddForm">
    <input id="shAddName"  class="sh-input sh-input-sm" placeholder="Name  (e.g. JWT_SECRET)" />
    <input id="shAddValue" class="sh-input sh-input-sm sh-input-mono" placeholder="Value" />
    <button id="shAddBtn"  class="sh-btn sh-btn-primary sh-btn-sm">＋ Add</button>
  </div>

  <!-- Secrets list -->
  <div id="shSecretsList" class="sh-secrets-list"></div>

  <!-- Reset password section -->
  <details class="sh-reset-section" id="shResetSection">
    <summary class="sh-reset-summary">Change password</summary>
    <div class="sh-reset-body">
      <input id="shResetOld" type="password" class="sh-input sh-input-sm" placeholder="Current password" />
      <input id="shResetNew" type="password" class="sh-input sh-input-sm" placeholder="New password" />
      <button id="shResetBtn" class="sh-btn sh-btn-sm sh-btn-warn">Update password</button>
      <div id="shResetErr" class="sh-error" style="display:none"></div>
    </div>
  </details>
</div>

<!-- Edit Modal -->
<div id="shEditModal" class="sh-modal-backdrop" style="display:none">
  <div class="sh-modal">
    <div class="sh-modal-title">Edit secret</div>
    <input id="shEditName"  class="sh-input" placeholder="Name" />
    <input id="shEditValue" class="sh-input sh-input-mono" placeholder="Value" />
    <div class="sh-modal-actions">
      <button id="shEditCancel" class="sh-btn sh-btn-ghost">Cancel</button>
      <button id="shEditSave"   class="sh-btn sh-btn-primary">Save</button>
    </div>
  </div>
</div>
`;
    document.getElementById('app').appendChild(el);
}

// ─── Resolve refs ─────────────────────────────────────────
function resolveRefs() {
    panel         = document.getElementById('secretHolderPanel');
    lockScreen    = document.getElementById('shLockScreen');
    mainScreen    = document.getElementById('shMainScreen');
    pwInput       = document.getElementById('shPwInput');
    pwSubmitBtn   = document.getElementById('shPwSubmit');
    pwError       = document.getElementById('shPwError');
    pwLabel       = document.getElementById('shPwLabel');
    secretsList   = document.getElementById('shSecretsList');
    addForm       = document.getElementById('shAddForm');
    addName       = document.getElementById('shAddName');
    addValue      = document.getElementById('shAddValue');
    addBtn        = document.getElementById('shAddBtn');
    editModal     = document.getElementById('shEditModal');
    editName      = document.getElementById('shEditName');
    editValue     = document.getElementById('shEditValue');
    editSaveBtn   = document.getElementById('shEditSave');
    editCancelBtn = document.getElementById('shEditCancel');
    lockBtn       = document.getElementById('shLockBtn');
    resetSection  = document.getElementById('shResetSection');
    resetOld      = document.getElementById('shResetOld');
    resetNew      = document.getElementById('shResetNew');
    resetBtn      = document.getElementById('shResetBtn');
    resetErr      = document.getElementById('shResetErr');
    togglePwBtn   = document.getElementById('shTogglePw');
}

// ─── Wire events ──────────────────────────────────────────
function wireEvents() {
    // Toggle password visibility
    togglePwBtn.addEventListener('click', () => {
        pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
    });

    // Submit password
    pwSubmitBtn.addEventListener('click', handlePasswordSubmit);
    pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') handlePasswordSubmit(); });

    // Lock
    lockBtn.addEventListener('click', lockVault);

    // Add secret
    addBtn.addEventListener('click', handleAdd);
    addValue.addEventListener('keydown', e => { if (e.key === 'Enter') handleAdd(); });

    // Edit modal
    editSaveBtn.addEventListener('click', handleEditSave);
    editCancelBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', e => { if (e.target === editModal) closeEditModal(); });

    // Reset password
    resetBtn.addEventListener('click', handleResetPassword);
}

// ─── Password flow ────────────────────────────────────────
async function handlePasswordSubmit() {
    const pw = pwInput.value.trim();
    if (!pw) return showPwError('Enter a password.');

    const hasPassword = await window.electronAPI.secretsHasPassword();

    if (!hasPassword) {
        // First time — set password
        const ok = await window.electronAPI.secretsSetPassword(pw);
        if (ok) { await openVault(); }
        else showPwError('Failed to set password.');
    } else {
        const ok = await window.electronAPI.secretsVerifyPassword(pw);
        if (ok) { await openVault(); }
        else showPwError('Incorrect password.');
    }
}

async function openVault() {
    _unlocked = true;
    hidePwError();
    pwInput.value = '';
    lockScreen.style.display = 'none';
    mainScreen.style.display = 'flex';

    const hasPassword = await window.electronAPI.secretsHasPassword();
    pwLabel.textContent = hasPassword ? 'Enter password' : 'Set a password';

    await refreshSecrets();
}

function lockVault() {
    _unlocked = false;
    _secrets = [];
    mainScreen.style.display = 'none';
    lockScreen.style.display = 'flex';
    pwInput.value = '';
    hidePwError();
}

// ─── Secrets CRUD ─────────────────────────────────────────
async function refreshSecrets() {
    _secrets = await window.electronAPI.secretsGetAll();
    renderSecrets();
}

function renderSecrets() {
    secretsList.innerHTML = '';

    if (_secrets.length === 0) {
        secretsList.innerHTML = '<div class="sh-empty">No secrets yet. Add one above.</div>';
        return;
    }

    _secrets.forEach(s => {
        const row = document.createElement('div');
        row.className = 'sh-secret-row';
        row.dataset.id = s.id;

        const info = document.createElement('div');
        info.className = 'sh-secret-info';

        const name = document.createElement('div');
        name.className = 'sh-secret-name';
        name.textContent = s.name;

        const val = document.createElement('div');
        val.className = 'sh-secret-value';
        val.textContent = s.value;

        info.appendChild(name);
        info.appendChild(val);

        const actions = document.createElement('div');
        actions.className = 'sh-secret-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'sh-btn sh-btn-ghost sh-btn-xs sh-copy-btn';
        copyBtn.textContent = '📋';
        copyBtn.title = 'Copy value';
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(s.value).then(() => {
                copyBtn.textContent = '✓';
                setTimeout(() => copyBtn.textContent = '📋', 1200);
            });
        });

        const editBtn = document.createElement('button');
        editBtn.className = 'sh-btn sh-btn-ghost sh-btn-xs';
        editBtn.textContent = '✏️';
        editBtn.title = 'Edit';
        editBtn.addEventListener('click', () => openEditModal(s));

        const delBtn = document.createElement('button');
        delBtn.className = 'sh-btn sh-btn-danger sh-btn-xs';
        delBtn.textContent = '🗑';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', () => handleDelete(s.id));

        actions.appendChild(copyBtn);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        row.appendChild(info);
        row.appendChild(actions);
        secretsList.appendChild(row);
    });
}

async function handleAdd() {
    const name  = addName.value.trim();
    const value = addValue.value.trim();
    if (!name || !value) return;

    await window.electronAPI.secretsAdd(name, value);
    addName.value  = '';
    addValue.value = '';
    addName.focus();
    await refreshSecrets();
}

async function handleDelete(id) {
    await window.electronAPI.secretsDelete(id);
    await refreshSecrets();
}

function openEditModal(s) {
    _editingId      = s.id;
    editName.value  = s.name;
    editValue.value = s.value;
    editModal.style.display = 'flex';
    editName.focus();
}

function closeEditModal() {
    _editingId = null;
    editModal.style.display = 'none';
}

async function handleEditSave() {
    if (!_editingId) return;
    const name  = editName.value.trim();
    const value = editValue.value.trim();
    if (!name || !value) return;

    await window.electronAPI.secretsUpdate(_editingId, name, value);
    closeEditModal();
    await refreshSecrets();
}

// ─── Reset password ───────────────────────────────────────
async function handleResetPassword() {
    const old = resetOld.value.trim();
    const nw  = resetNew.value.trim();
    if (!old || !nw) { showResetErr('Fill both fields.'); return; }

    const ok = await window.electronAPI.secretsResetPassword(old, nw);
    if (ok) {
        resetOld.value = '';
        resetNew.value = '';
        resetErr.style.display = 'none';
        resetSection.open = false;
    } else {
        showResetErr('Current password incorrect.');
    }
}

// ─── Helpers ──────────────────────────────────────────────
function showPwError(msg) { pwError.textContent = msg; pwError.style.display = 'block'; }
function hidePwError()    { pwError.style.display = 'none'; }
function showResetErr(m)  { resetErr.textContent = m; resetErr.style.display = 'block'; }

// ─── Panel open/close (called from app.js) ────────────────
export function openSecretHolder() {
    panel.style.display = 'flex';
}
export function closeSecretHolder() {
    panel.style.display = 'none';
}
export function isSecretHolderOpen() {
    return panel.style.display !== 'none';
}