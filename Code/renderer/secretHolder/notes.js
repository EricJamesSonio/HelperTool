import { S, notesList, noteFormTitle, noteFormBody, noteFormDate,
    noteSaveBtn, noteDeleteBtn, notesEditorEmpty, notesEditorForm } from './state.js';
import { _newNoteId, _todayISO, _formatDisplayDate } from './utils.js';

const NOTES_KEY = 'sh_notes_v1';

export function loadNotesFromStorage() {
    try {
        const raw = localStorage.getItem(NOTES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveNotesToStorage() {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(S.notes)); } catch {}
}

export function renderSidebar() {
    notesList.innerHTML = '';

    const q = (S.searchNotes || '').toLowerCase().trim();
    const sorted = [...S.notes].sort((a, b) =>
        (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
    );
    const filtered = q
        ? sorted.filter(n =>
            (n.title || '').toLowerCase().includes(q) ||
            (n.body  || '').toLowerCase().includes(q)
          )
        : sorted;

    if (filtered.length === 0) {
        notesList.innerHTML = q
            ? `<div class="sh-notes-sidebar-empty"><div>No notes match</div><div>"${q}"</div></div>`
            : `<div class="sh-notes-sidebar-empty"><div>No notes yet.</div><div>Hit ＋ New to start.</div></div>`;
        return;
    }

    filtered.forEach(note => {
        const item = document.createElement('div');
        item.className  = 'sh-notes-sidebar-item';
        item.dataset.noteId = note.id;
        if (note.id === S.editingNoteId) item.classList.add('active');
        const t = document.createElement('div');
        t.className   = 'sh-notes-sidebar-item-title';
        t.textContent = note.title || '(Untitled)';
        const m = document.createElement('div');
        m.className   = 'sh-notes-sidebar-item-meta';
        m.textContent = _formatDisplayDate(note.date || note.createdAt?.slice(0,10));
        const p = document.createElement('div');
        p.className   = 'sh-notes-sidebar-item-preview';
        p.textContent = (note.body || '').slice(0, 80);
        item.appendChild(t); item.appendChild(m); item.appendChild(p);
        item.addEventListener('click', () => openEditorForNote(note));
        notesList.appendChild(item);
    });
}

function highlightSidebarItem(id) {
    notesList.querySelectorAll('.sh-notes-sidebar-item').forEach(el => {
        el.classList.toggle('active', el.dataset.noteId === id);
    });
}

export function openEditorForNew() {
    S.editingNoteId = null;
    noteFormTitle.value = ''; noteFormBody.value = '';
    noteFormDate.value  = _todayISO();
    noteDeleteBtn.style.display = 'none';
    showEditor();
    highlightSidebarItem(null);
    setTimeout(() => noteFormTitle.focus(), 40);
}

export function openEditorForNote(note) {
    S.editingNoteId      = note.id;
    noteFormTitle.value = note.title || '';
    noteFormBody.value  = note.body  || '';
    noteFormDate.value  = note.date  || note.createdAt?.slice(0,10) || _todayISO();
    noteDeleteBtn.style.display = 'inline-flex';
    showEditor();
    highlightSidebarItem(note.id);
    setTimeout(() => noteFormBody.focus(), 40);
}

function showEditor() {
    notesEditorEmpty.style.display = 'none';
    notesEditorForm.style.display  = 'flex';
}

export function closeEditor() {
    S.editingNoteId = null;
    notesEditorEmpty.style.display = 'flex';
    notesEditorForm.style.display  = 'none';
    highlightSidebarItem(null);
}

export function handleNoteSave() {
    const title = noteFormTitle.value.trim();
    const body  = noteFormBody.value.trim();
    if (!title && !body) {
        noteFormTitle.classList.add('sh-err-border');
        setTimeout(() => noteFormTitle.classList.remove('sh-err-border'), 1200);
        return;
    }
    if (S.editingNoteId) {
        const idx = S.notes.findIndex(n => n.id === S.editingNoteId);
        if (idx !== -1) {
            S.notes[idx] = { ...S.notes[idx], title: title || '(Untitled)', body,
                date: noteFormDate.value || _todayISO(), updatedAt: new Date().toISOString() };
        }
    } else {
        const newNote = { id: _newNoteId(), title: title || '(Untitled)', body,
            date: noteFormDate.value || _todayISO(),
            createdAt: new Date().toISOString(), updatedAt: null };
        S.notes.unshift(newNote);
        S.editingNoteId = newNote.id;
        noteDeleteBtn.style.display = 'inline-flex';
    }
    saveNotesToStorage();
    renderSidebar();
    highlightSidebarItem(S.editingNoteId);
    noteSaveBtn.textContent          = '✓ Saved';
    noteSaveBtn.style.background     = 'var(--green-dim)';
    noteSaveBtn.style.borderColor    = 'var(--green)';
    noteSaveBtn.style.color          = 'var(--green)';
    setTimeout(() => {
        noteSaveBtn.textContent       = '💾 Save';
        noteSaveBtn.style.background  = '';
        noteSaveBtn.style.borderColor = '';
        noteSaveBtn.style.color       = '';
    }, 1400);
}

export function handleNoteDeleteCurrent() {
    if (!S.editingNoteId) return;
    S.notes = S.notes.filter(n => n.id !== S.editingNoteId);
    saveNotesToStorage();
    closeEditor();
    renderSidebar();
}