import { S, tabSecrets, tabNotes, tabStudy, panelSecrets, panelNotes } from './state.js';
import { renderSidebar, flushNoteSave, openMostRecent } from './notes.js';

export function switchTab(tab) {
    const next = tab === 'secrets' ? 'secrets' : tab === 'study' ? 'study' : 'general';
    flushNoteSave();
    S.activeTab = next;
    tabSecrets.classList.toggle('sh-tab-active', next === 'secrets');
    tabNotes.classList.toggle('sh-tab-active', next === 'general');
    tabStudy.classList.toggle('sh-tab-active', next === 'study');
    panelSecrets.style.display = next === 'secrets' ? 'flex' : 'none';
    panelNotes.style.display   = next === 'secrets' ? 'none' : 'flex';
    if (next === 'secrets') return;
    renderSidebar();
    openMostRecent();
}