import { S, panel, lockBtn, closeBtn, closeLockBtn, togglePwBtn, pwInput,
    pwSubmitBtn, addBtn, addValue, editSaveBtn, editCancelBtn, editModal,
    resetBtn, tabSecrets, tabNotes, noteNewBtn, noteSaveBtn, noteCancelBtn, noteDeleteBtn,
    searchSecretsInput, searchNotesInput,
    assignRefs } from './state.js';
import { getTemplate } from './template.js';
import { updateLockLabel, showLockScreen, handlePwSubmit, lockVault } from './lock.js';
import { handleAdd, handleEditSave, closeEditModal } from './secrets.js';
import { renderSecrets } from './secrets.js';
import { openEditorForNew, handleNoteSave, closeEditor, handleNoteDeleteCurrent, renderSidebar } from './notes.js';
import { handleResetPassword } from './reset.js';
import { switchTab } from './tabs.js';

let _initialized = false;

function setup() {
    if (_initialized) return;
    _initialized = true;
    injectHTML();
    assignRefs();
    wireEvents();
}

function injectHTML() {
    if (document.getElementById('secretHolderPanel')) return;
    const el = document.createElement('div');
    el.id        = 'secretHolderPanel';
    el.className = 'sh-panel';
    el.innerHTML = getTemplate();
    document.body.appendChild(el);
}

function wireEvents() {
    togglePwBtn.addEventListener('click', () => {
        const show = pwInput.type === 'password';
        pwInput.type        = show ? 'text' : 'password';
        togglePwBtn.textContent = show ? '🙈' : '👁';
    });
    pwSubmitBtn.addEventListener('click', handlePwSubmit);
    pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') handlePwSubmit(); });
    closeLockBtn.addEventListener('click', closeSecretHolder);
    closeBtn.addEventListener('click', closeSecretHolder);
    lockBtn.addEventListener('click', lockVault);
    addBtn.addEventListener('click', handleAdd);
    addValue.addEventListener('keydown', e => { if (e.key === 'Enter') handleAdd(); });
    editSaveBtn.addEventListener('click', handleEditSave);
    editCancelBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', e => { if (e.target === editModal) closeEditModal(); });
    resetBtn.addEventListener('click', handleResetPassword);
    tabSecrets.addEventListener('click', () => switchTab('secrets'));
    tabNotes.addEventListener('click',   () => switchTab('notes'));
    noteNewBtn.addEventListener('click',    () => openEditorForNew());
    noteSaveBtn.addEventListener('click',   handleNoteSave);
    noteCancelBtn.addEventListener('click', closeEditor);
    noteDeleteBtn.addEventListener('click', handleNoteDeleteCurrent);
    panel.addEventListener('click', e => { if (e.target === panel) closeSecretHolder(); });

    // ── Search: secrets (name + value) ──────────────────────────
    searchSecretsInput.addEventListener('input', () => {
        S.searchSecrets = searchSecretsInput.value;
        renderSecrets();
    });
    searchSecretsInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            searchSecretsInput.value = '';
            S.searchSecrets = '';
            renderSecrets();
        }
    });

    // ── Search: notes (title + body) ─────────────────────────────
    searchNotesInput.addEventListener('input', () => {
        S.searchNotes = searchNotesInput.value;
        renderSidebar();
    });
    searchNotesInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            searchNotesInput.value = '';
            S.searchNotes = '';
            renderSidebar();
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (editModal?.style.display !== 'none') { closeEditModal(); return; }
            if (isSecretHolderOpen()) closeSecretHolder();
        }
    });
}

/* ── Public API ──────────────────────────────────────────── */
export function initSecretHolder() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
}

export async function openSecretHolder() {
    setup();
    panel.classList.add('sh-visible');
    if (!S.unlocked) {
        showLockScreen();
        await updateLockLabel();
    }
}

export function closeSecretHolder() {
    panel?.classList.remove('sh-visible');
}

export function isSecretHolderOpen() {
    return panel?.classList.contains('sh-visible') ?? false;
}