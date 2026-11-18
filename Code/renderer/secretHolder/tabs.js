import { S, tabSecrets, tabNotes, tabStudy, panelSecrets, panelNotes, noteFormDate } from './state.js';
import { _todayISO } from './utils.js';
import { renderSidebar, closeEditor } from './notes.js';

export function switchTab(tab) {
    const next = tab === 'secrets' ? 'secrets' : tab === 'study' ? 'study' : 'general';
    const prev = S.activeTab;
    S.activeTab = next;
    tabSecrets.classList.toggle('sh-tab-active', next === 'secrets');
    tabNotes.classList.toggle('sh-tab-active', next === 'general');
    tabStudy.classList.toggle('sh-tab-active', next === 'study');
    panelSecrets.style.display = next === 'secrets' ? 'flex' : 'none';
    panelNotes.style.display   = next === 'secrets' ? 'none' : 'flex';
    if (next === 'secrets') return;
    if (prev !== next) closeEditor();
    if (noteFormDate && !noteFormDate.value) noteFormDate.value = _todayISO();
    renderSidebar();
}