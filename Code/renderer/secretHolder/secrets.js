import { S, secretsList, addName, addValue, editModal, editName, editValue } from './state.js';
import { _makeBtn } from './utils.js';

export async function refreshSecrets() {
    try { S.secrets = await window.electronAPI.secretsGetAll(); }
    catch { S.secrets = []; }
    renderSecrets();
}

function renderSecrets() {
    secretsList.innerHTML = '';
    if (S.secrets.length === 0) {
        secretsList.innerHTML = '<div class="sh-empty">No secrets yet — add one above.</div>';
        return;
    }
    S.secrets.forEach(s => {
        const row  = document.createElement('div');
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
                cpBtn.textContent = '✓';
                cpBtn.style.color = 'var(--green)';
                setTimeout(() => { cpBtn.textContent = '📋'; cpBtn.style.color = ''; }, 1400);
            });
        });
        const edBtn = _makeBtn('✏️', 'sh-btn sh-btn-ghost sh-btn-xs', 'Edit', () => openEditModal(s));
        const dlBtn = _makeBtn('🗑', 'sh-btn sh-btn-danger sh-btn-xs', 'Delete', () => handleDelete(s.id, row));
        acts.appendChild(cpBtn); acts.appendChild(edBtn); acts.appendChild(dlBtn);
        row.appendChild(info); row.appendChild(acts);
        secretsList.appendChild(row);
    });
}

export async function handleAdd() {
    const name  = addName.value.trim();
    const value = addValue.value.trim();
    if (!name || !value) {
        if (!name)  { addName.classList.add('sh-err-border');  setTimeout(() => addName.classList.remove('sh-err-border'),  1200); }
        if (!value) { addValue.classList.add('sh-err-border'); setTimeout(() => addValue.classList.remove('sh-err-border'), 1200); }
        return;
    }
    await window.electronAPI.secretsAdd(name, value);
    addName.value = ''; addValue.value = '';
    addName.focus();
    await refreshSecrets();
}

export async function handleDelete(id, rowEl) {
    rowEl.style.transition = 'opacity 0.18s';
    rowEl.style.opacity    = '0.3';
    await new Promise(r => setTimeout(r, 200));
    await window.electronAPI.secretsDelete(id);
    await refreshSecrets();
}

export function openEditModal(s) {
    S.editingId      = s.id;
    editName.value  = s.name;
    editValue.value = s.value;
    editModal.style.display = 'flex';
    setTimeout(() => editName.focus(), 40);
}

export function closeEditModal() {
    S.editingId = null;
    editModal.style.display = 'none';
}

export async function handleEditSave() {
    if (!S.editingId) return;
    const name  = editName.value.trim();
    const value = editValue.value.trim();
    if (!name || !value) return;
    await window.electronAPI.secretsUpdate(S.editingId, name, value);
    closeEditModal();
    await refreshSecrets();
}
