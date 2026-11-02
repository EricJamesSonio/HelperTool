import { S, secretsList, addName, addValue, addModal, addError,
    editModal, editName, editValue } from './state.js';
import { _makeBtn } from './utils.js';

const ICONS = {
  copy:  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="11" height="11" rx="1.5"/><path d="M4 11V4h7"/></svg>',
  edit:  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2l4 4-10 10H4v-4L14 2z"/></svg>',
  trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h14"/><path d="M6 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M8 9v5"/><path d="M12 9v5"/><path d="M5 6l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/></svg>',
  check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4 4 8-8"/></svg>',
};

let _adding = false;

function updateCounts(shown, filtering) {
    const total = S.secrets.length;
    const tab = document.getElementById('shTabSecretsCount');
    if (tab) tab.textContent = String(total);
    const match = document.getElementById('shSecretsMatch');
    if (match) match.textContent = filtering ? `${shown} of ${total}` : `${total} total`;
}

export async function refreshSecrets() {
    try { S.secrets = await window.electronAPI.secretsGetAll(); }
    catch { S.secrets = []; }
    renderSecrets();
}

export function renderSecrets() {
    secretsList.innerHTML = '';

    const q = (S.searchSecrets || '').toLowerCase().trim();
    const list = q
        ? S.secrets.filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.value.toLowerCase().includes(q)
          )
        : S.secrets;

    updateCounts(list.length, !!q);

    if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'sh-empty';
        empty.textContent = q
            ? 'No secrets match "' + (S.searchSecrets || '').trim() + '".'
            : 'No secrets yet - press Add to create one.';
        secretsList.appendChild(empty);
        return;
    }

    list.forEach(s => {
        const row = document.createElement('div');
        row.className = 'sh-row';

        const head = document.createElement('div');
        head.className = 'sh-row-head';

        const nm = document.createElement('div');
        nm.className   = 'sh-row-name';
        nm.textContent = s.name;
        nm.title       = s.name;

        const acts = document.createElement('div');
        acts.className = 'sh-row-acts';
        const cpBtn = _makeBtn(ICONS.copy, 'sh-btn sh-btn-ghost sh-btn-xs', 'Copy', () => {
            navigator.clipboard.writeText(s.value).then(() => {
                cpBtn.innerHTML = ICONS.check;
                cpBtn.style.color = 'var(--green)';
                setTimeout(() => { cpBtn.innerHTML = ICONS.copy; cpBtn.style.color = ''; }, 1400);
            });
        });
        const edBtn = _makeBtn(ICONS.edit, 'sh-btn sh-btn-ghost sh-btn-xs', 'Edit', () => openEditModal(s));
        const dlBtn = _makeBtn(ICONS.trash, 'sh-btn sh-btn-danger sh-btn-xs', 'Delete', () => handleDelete(s.id, row));
        acts.appendChild(cpBtn);
        acts.appendChild(edBtn);
        acts.appendChild(dlBtn);

        head.appendChild(nm);
        head.appendChild(acts);

        const vl = document.createElement('div');
        vl.className   = 'sh-row-val';
        vl.textContent = s.value;
        vl.title       = s.value;

        row.appendChild(head);
        row.appendChild(vl);
        secretsList.appendChild(row);
    });
}

function showAddError(msg) {
    if (!addError) return;
    addError.textContent = msg;
    addError.style.display = msg ? 'block' : 'none';
}

export function isAddModalOpen() {
    return !!addModal && addModal.style.display !== 'none';
}

export function openAddModal() {
    addName.value  = '';
    addValue.value = '';
    addName.classList.remove('sh-err-border');
    addValue.classList.remove('sh-err-border');
    showAddError('');
    addModal.style.display = 'flex';
    setTimeout(() => addName.focus(), 40);
}

export function closeAddModal() {
    if (!addModal) return;
    addModal.style.display = 'none';
    addName.value  = '';
    addValue.value = '';
    showAddError('');
}

export async function handleAdd() {
    if (_adding) return;
    const name  = addName.value.trim();
    const value = addValue.value.trim();
    if (!name || !value) {
        if (!name)  { addName.classList.add('sh-err-border');  setTimeout(() => addName.classList.remove('sh-err-border'),  1200); }
        if (!value) { addValue.classList.add('sh-err-border'); setTimeout(() => addValue.classList.remove('sh-err-border'), 1200); }
        showAddError(!name && !value ? 'Enter a name and a value.' : (!name ? 'Enter a name.' : 'Enter a value.'));
        (!name ? addName : addValue).focus();
        return;
    }
    _adding = true;
    try {
        await window.electronAPI.secretsAdd(name, value);
        closeAddModal();
        await refreshSecrets();
    } catch (err) {
        showAddError('Could not save the secret. Try again.');
    } finally {
        _adding = false;
    }
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