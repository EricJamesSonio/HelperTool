import { S, notesList, noteFormTitle, noteFormBody, noteFormDate, tabStudy,
    noteSaveBtn, noteDeleteBtn, noteMoveBtn, notesEditorEmpty, notesEditorForm,
    notePreview, noteToolbar, noteModeBar, noteSaveStatus, noteSmartBtn } from './state.js';
import { _newNoteId, _todayISO, _formatDisplayDate } from './utils.js';
import { renderMarkdown } from '../ideMode/markdownPreview.js';
import { smartFormat, structureNote } from './smartFormat.js';
import { switchTab } from './tabs.js';

const NOTES_KEY = 'sh_notes_v1';
const SAVE_DEBOUNCE = 800;
const FENCE = '`'.repeat(3);
const SAVE_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M12 2v4h4"/><path d="M6 10h8"/><path d="M6 14h8"/><path d="M6 6h2"/></svg> Save';

let saveTimer = 0;
let newNoteCat = 'general';
let writeChain = Promise.resolve();

export async function loadNotesFromStorage() {
    let local = [];
    try {
        const raw = localStorage.getItem(NOTES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        local = Array.isArray(parsed) ? parsed : [];
    } catch { local = []; }
    try {
        const disk = await window.electronAPI.notesLoad();
        if (Array.isArray(disk)) return disk;
        if (local.length) await window.electronAPI.notesSave(local);
        return local;
    } catch (err) {
        console.error('[SecretHolder] could not read notes file:', err);
        return local;
    }
}

function saveNotesToStorage() {
    const snapshot = JSON.parse(JSON.stringify(S.notes));
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(snapshot)); } catch {}
    writeChain = writeChain
        .then(() => window.electronAPI.notesSave(snapshot))
        .then((ok) => {
            if (!ok) throw new Error('notes-save returned false');
            if (!S.noteDirty && !saveTimer && S.editingNoteId) setStatus('Saved', 'saved');
        })
        .catch((err) => {
            console.error('[SecretHolder] could not write notes:', err);
            setStatus('Save failed - disk error', 'error');
        });
    return true;
}

function catOf(note) {
    return note && note.category === 'study' ? 'study' : 'general';
}

function currentCat() {
    return S.activeTab === 'study' ? 'study' : 'general';
}

function byRecent(a, b) {
    return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setStatus(text, state) {
    if (!noteSaveStatus) return;
    noteSaveStatus.textContent = text || '';
    noteSaveStatus.dataset.state = state || '';
}

function updateCounts() {
    const c = { study: 0, general: 0 };
    S.notes.forEach((n) => { c[catOf(n)]++; });
    setText('shTabGeneralCount', String(c.general));
    setText('shTabStudyCount', String(c.study));
}

function updateSidebarTitle() {
    setText('shNotesSidebarTitleText', currentCat() === 'study' ? 'Study notes' : 'General notes');
}

function syncMoveBtn() {
    if (!noteMoveBtn) return;
    const note = S.editingNoteId ? S.notes.find((n) => n.id === S.editingNoteId) : null;
    noteMoveBtn.style.display = note ? 'inline-flex' : 'none';
    if (note) {
        noteMoveBtn.lastChild.textContent = catOf(note) === 'study' ? ' Move to General notes' : ' Move to Study notes';
    }
}

function emptyMessage(lines) {
    const wrap = document.createElement('div');
    wrap.className = 'sh-notes-sidebar-empty';
    lines.forEach((text) => {
        const d = document.createElement('div');
        d.textContent = text;
        wrap.appendChild(d);
    });
    return wrap;
}

function plainPreview(body) {
    return String(body || '')
        .replace(/^\s*[-+]\s+/gm, '')
        .replace(/[#*`>_~\[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}

function buildItem(note) {
    const item = document.createElement('div');
    item.className = 'sh-notes-sidebar-item';
    item.dataset.noteId = note.id;
    if (note.id === S.editingNoteId) item.classList.add('active');
    const t = document.createElement('div');
    t.className = 'sh-notes-sidebar-item-title';
    t.textContent = note.title || '(Untitled)';
    const m = document.createElement('div');
    m.className = 'sh-notes-sidebar-item-meta';
    m.textContent = _formatDisplayDate(note.date || note.createdAt?.slice(0, 10));
    const p = document.createElement('div');
    p.className = 'sh-notes-sidebar-item-preview';
    p.textContent = plainPreview(note.body);
    item.appendChild(t);
    item.appendChild(m);
    item.appendChild(p);
    item.addEventListener('click', () => openEditorForNote(note));
    return item;
}

export function renderSidebar() {
    notesList.innerHTML = '';
    updateCounts();
    updateSidebarTitle();

    const cat = currentCat();
    const rawQ = (S.searchNotes || '').trim();
    const q = rawQ.toLowerCase();
    const filtered = [...S.notes].sort(byRecent).filter((n) => {
        if (catOf(n) !== cat) return false;
        if (!q) return true;
        return (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
        if (q) notesList.appendChild(emptyMessage(['No notes match', '"' + rawQ + '"']));
        else if (cat === 'study') notesList.appendChild(emptyMessage(['No study notes yet.', 'Hit + New to start.']));
        else notesList.appendChild(emptyMessage(['No general notes yet.', 'Hit + New to start.']));
        return;
    }
    filtered.forEach((n) => notesList.appendChild(buildItem(n)));
}

function highlightSidebarItem(id) {
    notesList.querySelectorAll('.sh-notes-sidebar-item').forEach(el => {
        el.classList.toggle('active', el.dataset.noteId === id);
    });
    refreshStructureBtn();
}

function renderPreview() {
    const text = noteFormBody.value;
    if (!text.trim()) {
        notePreview.innerHTML = '<div class="sh-md-empty">Nothing to preview yet. Switch to Edit and start typing.</div>';
    } else {
        let src = text;
        try {
            src = smartFormat(text, { tablesOnly: true });
        } catch (err) {
            console.error('[SecretHolder] table conversion failed:', err);
            src = text;
        }
        notePreview.innerHTML = renderMarkdown(src);
    }
    notePreview.scrollTop = 0;
}

function setMode(mode, focus) {
    S.noteMode = mode === 'edit' ? 'edit' : 'view';
    const edit = S.noteMode === 'edit';
    noteFormBody.style.display = edit ? '' : 'none';
    noteToolbar.style.display  = edit ? '' : 'none';
    notePreview.style.display  = edit ? 'none' : '';
    noteModeBar.querySelectorAll('.sh-notes-mode-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.mode === S.noteMode);
    });
    if (edit) {
        if (focus) setTimeout(() => noteFormBody.focus(), 20);
    } else {
        renderPreview();
    }
}

function saveNow(manual) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!S.unlocked || !noteFormTitle) return false;
    const title = noteFormTitle.value.trim();
    const body = noteFormBody.value.replace(/\s+$/, '');
    if (!title && !body.trim()) {
        S.noteDirty = false;
        if (manual) {
            noteFormTitle.classList.add('sh-err-border');
            setTimeout(() => noteFormTitle.classList.remove('sh-err-border'), 1200);
        }
        setStatus('');
        return false;
    }
    const date = noteFormDate.value || _todayISO();
    const finalTitle = title || '(Untitled)';
    const now = new Date().toISOString();
    if (S.editingNoteId) {
        const idx = S.notes.findIndex((n) => n.id === S.editingNoteId);
        if (idx === -1) return false;
        const prev = S.notes[idx];
        if (prev.title === finalTitle && prev.body === body && prev.date === date) {
            S.noteDirty = false;
            setStatus('Saved', 'saved');
            return true;
        }
        S.notes[idx] = { ...prev, title: finalTitle, body, category: catOf(prev), date, updatedAt: now };
    } else {
        const created = { id: _newNoteId(), title: finalTitle, body, category: newNoteCat, date,
            createdAt: now, updatedAt: null };
        S.notes.unshift(created);
        S.editingNoteId = created.id;
        noteDeleteBtn.style.display = 'inline-flex';
    }
    S.noteDirty = false;
    setStatus('Saving...', 'pending');
    saveNotesToStorage();
    renderSidebar();
    syncMoveBtn();
    highlightSidebarItem(S.editingNoteId);
    return true;
}

export function flushNoteSave() {
    if (saveTimer || S.noteDirty) saveNow(false);
}
window.addEventListener('pagehide', flushNoteSave);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushNoteSave();
});
document.addEventListener('focusout', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('#shNotesEditorForm')) flushNoteSave();
});

function scheduleAutoSave() {
    if (!S.unlocked) return;
    S.noteDirty = true;
    setStatus('Unsaved changes...', 'pending');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(false), SAVE_DEBOUNCE);
}

function showEditor() {
    notesEditorEmpty.style.display = 'none';
    notesEditorForm.style.display  = 'flex';
}

export function openEditorForNew() {
    flushNoteSave();
    newNoteCat = currentCat();
    S.editingNoteId = null;
    noteFormTitle.value = '';
    noteFormBody.value = '';
    noteFormDate.value = _todayISO();
    noteDeleteBtn.style.display = 'none';
    syncMoveBtn();
    setStatus('');
    showEditor();
    highlightSidebarItem(null);
    setMode('edit', false);
    setTimeout(() => noteFormTitle.focus(), 40);
}

export function openEditorForNote(note) {
    flushNoteSave();
    const cur = S.notes.find((n) => n.id === note.id) || note;
    S.editingNoteId = cur.id;
    noteFormTitle.value = cur.title || '';
    noteFormBody.value = cur.body || '';
    noteFormDate.value = cur.date || cur.createdAt?.slice(0, 10) || _todayISO();
    noteDeleteBtn.style.display = 'inline-flex';
    syncMoveBtn();
    setStatus('');
    showEditor();
    highlightSidebarItem(cur.id);
    setMode('view', false);
}

export function openMostRecent() {
    if (!S.unlocked || S.activeTab === 'secrets') return;
    const cat = currentCat();
    const cur = S.editingNoteId ? S.notes.find((n) => n.id === S.editingNoteId) : null;
    if (cur && catOf(cur) === cat) return;
    const list = S.notes.filter((n) => catOf(n) === cat).sort(byRecent);
    if (list.length) openEditorForNote(list[0]);
    else closeEditor();
}

export function closeEditor() {
    if (S.unlocked) flushNoteSave();
    clearTimeout(saveTimer);
    saveTimer = 0;
    S.editingNoteId = null;
    noteFormTitle.value = '';
    noteFormBody.value = '';
    notePreview.innerHTML = '';
    syncMoveBtn();
    setStatus('');
    notesEditorEmpty.style.display = 'flex';
    notesEditorForm.style.display  = 'none';
    highlightSidebarItem(null);
}

export function handleNoteSave() {
    if (!saveNow(true)) return;
    noteSaveBtn.textContent       = 'Saved';
    noteSaveBtn.style.background  = 'var(--green-dim)';
    noteSaveBtn.style.borderColor = 'var(--green)';
    noteSaveBtn.style.color       = 'var(--green)';
    setTimeout(() => {
        noteSaveBtn.innerHTML         = SAVE_ICON;
        noteSaveBtn.style.background  = '';
        noteSaveBtn.style.borderColor = '';
        noteSaveBtn.style.color       = '';
    }, 1400);
}

export function handleNoteDeleteCurrent() {
    if (!S.editingNoteId) return;
    clearTimeout(saveTimer);
    saveTimer = 0;
    S.notes = S.notes.filter(n => n.id !== S.editingNoteId);
    saveNotesToStorage();
    closeEditor();
    renderSidebar();
    openMostRecent();
}

function handleNoteMove() {
    if (!S.editingNoteId) return;
    flushNoteSave();
    const idx = S.notes.findIndex(n => n.id === S.editingNoteId);
    if (idx === -1) return;
    const to = catOf(S.notes[idx]) === 'study' ? 'general' : 'study';
    S.notes[idx] = { ...S.notes[idx], category: to };
    saveNotesToStorage();
    closeEditor();
    renderSidebar();
    openMostRecent();
}

function insertText(text) {
    noteFormBody.focus();
    if (!document.execCommand('insertText', false, text)) {
        const ta = noteFormBody;
        ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
    }
}

function lineRange() {
    const ta = noteFormBody;
    const v = ta.value;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const bs = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
    const eEff = e > s && v[e - 1] === '\n' ? e - 1 : e;
    let be = v.indexOf('\n', eEff);
    if (be === -1) be = v.length;
    return { bs, be, v };
}

function wrapSelection(mark, placeholder) {
    const ta = noteFormBody;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const v = ta.value;
    const L = mark.length;
    const sel = v.slice(s, e);
    ta.focus();
    if (sel && s >= L && v.slice(s - L, s) === mark && v.slice(e, e + L) === mark) {
        ta.setSelectionRange(s - L, e + L);
        insertText(sel);
        ta.setSelectionRange(s - L, s - L + sel.length);
        return;
    }
    const inner = sel || placeholder;
    insertText(mark + inner + mark);
    ta.setSelectionRange(s + L, s + L + inner.length);
}

function codeFormat() {
    const ta = noteFormBody;
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel.indexOf('\n') === -1) {
        wrapSelection('`', 'code');
        return;
    }
    insertText(FENCE + '\n' + sel.replace(/\n$/, '') + '\n' + FENCE);
}

function prefixLines(kind) {
    const ta = noteFormBody;
    const { bs, be, v } = lineRange();
    const rows = v.slice(bs, be).split('\n');
    const marks = {
        h2: /^##\s+/,
        h3: /^###\s+/,
        ul: /^[-*]\s+(?!\[[ xX]\]\s)/,
        ol: /^\d+[.)]\s+/,
        task: /^[-*]\s+\[[ xX]\]\s+/,
        quote: /^>\s?/,
    };
    const re = marks[kind];
    const strip = /^(#{1,6}\s+|[-*]\s+\[[ xX]\]\s+|[-*]\s+|\d+[.)]\s+|>\s?)/;
    const used = rows.filter((r) => r.trim());
    const on = used.length > 0 && used.every((r) => re.test(r.replace(/^\s+/, '')));
    let n = 0;
    const out = rows.map((r) => {
        if (!r.trim()) return r;
        const lead = /^\s*/.exec(r)[0];
        let body = r.slice(lead.length);
        if (on) return lead + body.replace(re, '');
        body = body.replace(strip, '');
        n++;
        let mk = '> ';
        if (kind === 'h2') mk = '## ';
        else if (kind === 'h3') mk = '### ';
        else if (kind === 'ul') mk = '- ';
        else if (kind === 'ol') mk = n + '. ';
        else if (kind === 'task') mk = '- [ ] ';
        return lead + mk + body;
    });
    const text = out.join('\n');
    ta.focus();
    ta.setSelectionRange(bs, be);
    insertText(text);
    ta.setSelectionRange(bs, bs + text.length);
}

function applyFormat(kind) {
    if (S.noteMode !== 'edit') return;
    if (kind === 'bold') wrapSelection('**', 'bold text');
    else if (kind === 'italic') wrapSelection('*', 'italic text');
    else if (kind === 'code') codeFormat();
    else prefixLines(kind);
}

function indentSel(outdent) {
    const ta = noteFormBody;
    if (ta.selectionStart === ta.selectionEnd && !outdent) {
        insertText('  ');
        return;
    }
    const { bs, be, v } = lineRange();
    const out = v.slice(bs, be).split('\n')
        .map((l) => (outdent ? l.replace(/^ {1,2}|^\t/, '') : '  ' + l))
        .join('\n');
    ta.setSelectionRange(bs, be);
    insertText(out);
    ta.setSelectionRange(bs, bs + out.length);
}

function continueList(e) {
    const ta = noteFormBody;
    const s = ta.selectionStart;
    if (s !== ta.selectionEnd) return;
    const v = ta.value;
    const ls = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
    const before = v.slice(ls, s);
    const m = /^(\s*)((?:[-*+]\s+\[[ xX]\]\s+)|(?:[-*+]\s+)|(?:(\d+)([.)])\s+)|(?:>\s?))(.*)$/.exec(before);
    if (!m) return;
    e.preventDefault();
    if (!m[5].trim()) {
        ta.setSelectionRange(ls, s);
        if (!document.execCommand('delete')) {
            ta.setRangeText('', ls, s, 'end');
            ta.dispatchEvent(new Event('input'));
        }
        return;
    }
    let next;
    if (m[3] !== undefined) next = (parseInt(m[3], 10) + 1) + m[4] + ' ';
    else if (/\[[ xX]\]/.test(m[2])) next = m[2].replace(/\[[ xX]\]/, '[ ]');
    else if (m[2].charAt(0) === '>') next = '> ';
    else next = m[2];
    insertText('\n' + m[1] + next);
}

function onBodyKey(e) {
    if (e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && !e.altKey && !e.shiftKey && key === 'b') {
        e.preventDefault();
        wrapSelection('**', 'bold text');
        return;
    }
    if (mod && !e.altKey && !e.shiftKey && key === 'i') {
        e.preventDefault();
        wrapSelection('*', 'italic text');
        return;
    }
    if (mod || e.altKey) return;
    if (e.key === 'Tab') {
        e.preventDefault();
        indentSel(e.shiftKey);
        return;
    }
    if (e.key === 'Enter' && !e.shiftKey) continueList(e);
}

function refreshStructureBtn() {
    if (!noteSmartBtn) return;
    const on = S.structureResult != null && !!S.structureNoteId && S.structureNoteId === S.editingNoteId;
    noteSmartBtn.classList.toggle('on', on);
    noteSmartBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function autoStructureNow() {
    if (!S.unlocked || !noteFormBody) return;
    const cur = noteFormBody.value;
    if (!cur.trim()) return;
    const isOn = S.structureResult != null && S.structureNoteId === S.editingNoteId;
    if (isOn && cur === S.structureResult) {
        setStatus('Already structured - double-click to turn off', 'saved');
        return;
    }
    let next;
    try {
        next = structureNote(cur);
    } catch (err) {
        console.error('[SecretHolder] auto-structure failed:', err);
        setStatus('Auto-structure failed', 'error');
        return;
    }
    if (next === cur) {
        setStatus('Already structured', 'saved');
        return;
    }
    if (S.noteMode === 'edit') {
        noteFormBody.focus();
        noteFormBody.select();
        insertText(next);
    } else {
        noteFormBody.value = next;
    }
    S.noteDirty = true;
    saveNow(false);
    S.structureBackup = cur;
    S.structureResult = noteFormBody.value;
    S.structureNoteId = S.editingNoteId;
    refreshStructureBtn();
    if (S.noteMode === 'view') renderPreview();
}

function autoStructureOff() {
    if (!S.unlocked || !noteFormBody) return;
    if (S.structureResult == null || S.structureNoteId !== S.editingNoteId) return;
    const unchanged = noteFormBody.value === S.structureResult;
    const original = S.structureBackup;
    S.structureBackup = null;
    S.structureResult = null;
    S.structureNoteId = null;
    refreshStructureBtn();
    if (!unchanged) {
        setStatus('Auto-structure off - your edits were kept', 'saved');
        return;
    }
    if (S.noteMode === 'edit') {
        noteFormBody.focus();
        noteFormBody.select();
        insertText(original);
    } else {
        noteFormBody.value = original;
    }
    S.noteDirty = true;
    saveNow(false);
    if (S.noteMode === 'view') renderPreview();
}

export function wireNotesExtras() {
    if (noteSmartBtn) {
        noteSmartBtn.classList.remove('on');
        noteSmartBtn.setAttribute('aria-pressed', 'false');
        noteSmartBtn.title = 'Auto-structure this note: adds ## and ### headings with divider lines, turns "term : definition" and "- a -- b" rows into tables, "Note: ..." into a quote and short lines into a list. Double-click to turn it off and restore the original text.';
        noteSmartBtn.addEventListener('click', autoStructureNow);
        noteSmartBtn.addEventListener('dblclick', (e) => {
            e.preventDefault();
            autoStructureOff();
        });
    }
    tabStudy.addEventListener('click', () => switchTab('study'));
    noteMoveBtn.addEventListener('click', handleNoteMove);
    noteModeBar.addEventListener('click', (e) => {
        const b = e.target.closest('.sh-notes-mode-btn');
        if (!b) return;
        setMode(b.dataset.mode, true);
    });
    notePreview.addEventListener('dblclick', () => setMode('edit', true));
    noteToolbar.addEventListener('mousedown', (e) => {
        if (e.target.closest('[data-md]')) e.preventDefault();
    });
    noteToolbar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-md]');
        if (b) applyFormat(b.dataset.md);
    });
    noteFormBody.addEventListener('keydown', onBodyKey);
    noteFormBody.addEventListener('input', scheduleAutoSave);
    noteFormTitle.addEventListener('input', scheduleAutoSave);
    noteFormDate.addEventListener('input', scheduleAutoSave);
    noteFormDate.addEventListener('change', scheduleAutoSave);
    noteFormTitle.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        setMode('edit', true);
    });
    notesEditorForm.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        const key = e.key.toLowerCase();
        if (key === 's') {
            e.preventDefault();
            e.stopPropagation();
            handleNoteSave();
        } else if (key === 'e') {
            e.preventDefault();
            e.stopPropagation();
            setMode(S.noteMode === 'edit' ? 'view' : 'edit', true);
        }
    });
    window.addEventListener('beforeunload', flushNoteSave);
}