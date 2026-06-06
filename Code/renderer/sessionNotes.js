/**
 * sessionNotes.js
 * Per-repo scratchpad with password lock
 * Auto-saves to config via IPC
 */

let _panelOpen = false;
let _unlocked = false;
let _repoLocked = false;
let _saveTimer = null;
let _panel = null;
let _textarea = null;
let _lockOverlay = null;

const SAVE_DEBOUNCE = 500;

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
  _saveNow();
  _panel.classList.remove('open');
  _panelOpen = false;
  clearTimeout(_saveTimer);
}

export function isSessionNotesOpen() {
  return _panelOpen;
}

export async function handleRepoChange() {
  if (_panelOpen) {
    _saveNow();
    _loadNotes();
  }
}

async function _hashPassword(password) {
  const enc = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex;
}

async function _loadNotes() {
  const result = await window.electronAPI.getSessionNotes();
  _repoLocked = result.locked;
  _unlocked = !_repoLocked;

  if (_repoLocked) {
    _textarea.value = '';
    _textarea.disabled = true;
    _lockOverlay.style.display = 'flex';
  } else {
    _textarea.value = result.text || '';
    _textarea.disabled = false;
    _lockOverlay.style.display = 'none';
  }
}

async function _saveNow() {
  if (!_unlocked || !_textarea) return;
  await window.electronAPI.setSessionNotes(_textarea.value);
}

function _onTextInput() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_saveNow, SAVE_DEBOUNCE);
}

async function _handleUnlock() {
  const input = _lockOverlay.querySelector('.sn-password-input');
  const errEl = _lockOverlay.querySelector('.sn-lock-error');
  const pwd = input.value;
  if (!pwd) return;

  const hash = await _hashPassword(pwd);
  const stored = await window.electronAPI.getSessionNotesPassword();

  if (hash === stored) {
    errEl.textContent = '';
    input.value = '';
    _unlocked = true;
    _lockOverlay.style.display = 'none';
    _textarea.disabled = false;
    _loadNotes();
  } else {
    errEl.textContent = 'Wrong password';
    input.select();
  }
}

async function _handleSetPassword() {
  const input = _lockOverlay.querySelector('.sn-password-input');
  const errEl = _lockOverlay.querySelector('.sn-lock-error');
  const pwd = input.value;
  if (!pwd || pwd.length < 4) {
    errEl.textContent = 'Password must be at least 4 characters';
    return;
  }

  const hash = await _hashPassword(pwd);
  await window.electronAPI.setSessionNotesPassword(hash);
  _repoLocked = true;
  errEl.textContent = 'Password set!';
  input.value = '';
  _unlocked = true;
  _lockOverlay.style.display = 'none';
  _textarea.disabled = false;
}

async function _handleLock() {
  _saveNow();
  _unlocked = false;
  _textarea.value = '';
  _textarea.disabled = true;

  const input = _lockOverlay.querySelector('.sn-password-input');
  input.value = '';
  _lockOverlay.querySelector('.sn-lock-error').textContent = '';
  _lockOverlay.style.display = 'flex';
}

async function _handleRemovePassword() {
  await window.electronAPI.setSessionNotesPassword(null);
  _repoLocked = false;
  _lockOverlay.querySelector('.sn-lock-error').textContent = 'Password removed';
}

function _injectPanel() {
  if (document.getElementById('sessionNotesPanel')) return;

  const el = document.createElement('div');
  el.id = 'sessionNotesPanel';
  el.className = 'sn-panel';
  el.innerHTML = `
<div class="sn-backdrop"></div>
<div class="sn-container">
  <div class="sn-header">
    <div class="sn-header-title">
      <span class="sn-header-icon">📝</span> Session Notes
    </div>
    <div class="sn-header-actions">
      <button id="snLockBtn" class="sn-btn sn-btn-icon" title="Lock">🔒</button>
      <button id="snCloseBtn" class="sn-btn sn-btn-icon" title="Close">✕</button>
    </div>
  </div>
  <div class="sn-body">
    <div class="sn-lock-overlay" id="snLockOverlay">
      <div class="sn-lock-icon">🔒</div>
      <div class="sn-lock-title">Notes are locked</div>
      <div class="sn-lock-subtitle">Enter password to unlock, or set a new one</div>
      <div class="sn-lock-row">
        <input type="password" class="sn-password-input" placeholder="Password" />
        <button id="snUnlockBtn" class="sn-btn sn-btn-primary">Unlock</button>
      </div>
      <div class="sn-lock-row sn-lock-row--alt">
        <button id="snSetPasswordBtn" class="sn-btn sn-btn-ghost">Set Password</button>
        <button id="snRemovePasswordBtn" class="sn-btn sn-btn-ghost">Remove Password</button>
      </div>
      <div class="sn-lock-error"></div>
    </div>
    <textarea id="snTextarea" class="sn-textarea" placeholder="Paste notes here... (.env contents, setup steps, etc.)"></textarea>
  </div>
</div>`;
  document.body.appendChild(el);

  _panel = el;
  _textarea = el.querySelector('#snTextarea');
  _lockOverlay = el.querySelector('#snLockOverlay');

  el.querySelector('#snCloseBtn').addEventListener('click', closeSessionNotes);
  el.querySelector('.sn-backdrop').addEventListener('click', closeSessionNotes);
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape' && _panelOpen) closeSessionNotes();
  });
  el.querySelector('.sn-container').addEventListener('click', e => e.stopPropagation());

  _textarea.addEventListener('input', _onTextInput);

  el.querySelector('#snUnlockBtn').addEventListener('click', _handleUnlock);
  el.querySelector('#snSetPasswordBtn').addEventListener('click', _handleSetPassword);
  el.querySelector('#snRemovePasswordBtn').addEventListener('click', _handleRemovePassword);
  el.querySelector('#snLockBtn').addEventListener('click', _handleLock);

  const pwdInput = el.querySelector('.sn-password-input');
  pwdInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const unlockBtn = document.activeElement === pwdInput ? null : null;
      if (_repoLocked && !_unlocked) _handleUnlock();
      else _handleSetPassword();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (_panelOpen) _saveNow();
  });
}
