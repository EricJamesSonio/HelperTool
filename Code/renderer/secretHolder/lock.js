import { S, lockScreen, mainScreen, pwInput, pwSubmitBtn, pwError, pwLabel, pwSubtitle } from './state.js';
import { _showPwError, _hidePwError } from './utils.js';
import { refreshSecrets, closeEditModal } from './secrets.js';
import { loadNotesFromStorage, renderSidebar, closeEditor } from './notes.js';

export function showLockScreen() {
    lockScreen.style.display = 'flex';
    mainScreen.style.display = 'none';
}

export async function updateLockLabel() {
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

export async function handlePwSubmit() {
    const pw = pwInput.value.trim();
    if (!pw) { _showPwError(pwError, 'Please enter a password.'); return; }
    _hidePwError(pwError);
    pwSubmitBtn.disabled    = true;
    pwSubmitBtn.textContent = '…';
    try {
        const has = await window.electronAPI.secretsHasPassword();
        if (!has) {
            const ok = await window.electronAPI.secretsSetPassword(pw);
            if (ok) await openVault();
            else _showPwError(pwError, 'Could not save password. Try again.');
        } else {
            const ok = await window.electronAPI.secretsVerifyPassword(pw);
            if (ok) await openVault();
            else { _showPwError(pwError, 'Incorrect password.'); pwInput.value = ''; pwInput.focus(); }
        }
    } catch (err) {
        console.error('[SecretHolder]', err);
        _showPwError(pwError, 'Unexpected error — check console.');
    } finally {
        pwSubmitBtn.disabled    = false;
        pwSubmitBtn.textContent = 'Unlock';
    }
}

export async function openVault() {
    S.unlocked     = true;
    pwInput.value = '';
    _hidePwError(pwError);
    lockScreen.style.display = 'none';
    mainScreen.style.display = 'flex';
    await refreshSecrets();
    S.notes = loadNotesFromStorage();
    renderSidebar();
}

export function lockVault() {
    S.unlocked      = false;
    S.secrets       = [];
    S.notes         = [];
    S.editingId     = null;
    S.editingNoteId = null;
    closeEditModal();
    closeEditor();
    showLockScreen();
    pwInput.value = '';
    _hidePwError(pwError);
}
