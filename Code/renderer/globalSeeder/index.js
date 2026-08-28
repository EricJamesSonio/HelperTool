import { getPanelHTML }                              from './template.js';
import { wireUI, resetUI, setTargetLabel }            from './ui.js';
import { state, resetState }                          from './state.js';
import { state as appState }                          from '../app_manager/appState.js';

let _overlay = null;
let _panel   = null;

function buildPanel() {
    _overlay = document.createElement('div');
    _overlay.id        = 'globalSeederOverlay';
    _overlay.className = 'gs-overlay';

    _panel = document.createElement('div');
    _panel.id        = 'globalSeederPanel';
    _panel.className = 'gs-panel';
    _panel.innerHTML = getPanelHTML();

    _overlay.appendChild(_panel);
    document.body.appendChild(_overlay);

    _overlay.addEventListener('click', (e) => {
        if (e.target === _overlay) close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.isOpen) close();
    });
}

function currentRepoPath() {
    return appState.selectedRepoPath || null;
}

function handleClose(result) {
    close();

    if (result?.seeded) {
        const created     = result.created?.length ?? 0;
        const overwritten = result.overwritten?.length ?? 0;
        const errs        = result.errors?.length ?? 0;
        const parts = [];
        if (created) parts.push(`${created} created`);
        if (overwritten) parts.push(`${overwritten} overwritten`);
        const msg = errs > 0
            ? `✅ ${parts.join(', ') || 'Done'}. ⚠️ ${errs} error(s) — check console.`
            : `✅ ${parts.join(', ') || 'Done'}.`;
        console.info('[GlobalSeeder]', msg);
        document.getElementById('refreshBtn')?.click();
    }
}

export function init() {
    if (_overlay) return;
    buildPanel();
    wireUI(handleClose, currentRepoPath);
}

export function open() {
    if (!_overlay) init();

    resetState();
    resetUI();

    const repoPath = currentRepoPath();
    state.isOpen = true;

    setTargetLabel(repoPath ? repoPath.split(/[\\/]/).pop() : null);

    _overlay.classList.add('gs-overlay--visible');
    _panel.classList.add('gs-panel--visible');

    setTimeout(() => document.getElementById('gsInput')?.focus(), 80);
}

export function close() {
    if (!_overlay) return;
    _overlay.classList.remove('gs-overlay--visible');
    _panel.classList.remove('gs-panel--visible');
    state.isOpen = false;
}

export function isOpen() {
    return state.isOpen;
}