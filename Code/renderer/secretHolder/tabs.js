import { S, tabSecrets, tabNotes, panelSecrets, panelNotes, noteFormDate } from './state.js';
import { _todayISO } from './utils.js';
import { renderSidebar } from './notes.js';

export function switchTab(tab) {
    S.activeTab = tab;
    if (tab === 'secrets') {
        tabSecrets.classList.add('sh-tab-active');
        tabNotes.classList.remove('sh-tab-active');
        panelSecrets.style.display = 'flex';
        panelNotes.style.display   = 'none';
    } else {
        tabNotes.classList.add('sh-tab-active');
        tabSecrets.classList.remove('sh-tab-active');
        panelNotes.style.display   = 'flex';
        panelSecrets.style.display = 'none';
        if (noteFormDate && !noteFormDate.value) noteFormDate.value = _todayISO();
        renderSidebar();
    }
}
