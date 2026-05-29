/**
 * renderer/fileSeederTool/index.js
 * Public API — mirrors the pattern of gitTool.js, secretHolder.js, etc.
 */

import { getPanelHTML }          from './template.js';
import { wireUI, resetUI, setTargetLabel } from './ui.js';
import { state, resetState }     from './state.js';

let _overlay  = null;
let _panel    = null;
let _wired    = false;

// ── DOM construction ──────────────────────────────────────────────────────────

function buildPanel() {
    _overlay = document.createElement('div');
    _overlay.id        = 'fileSeederOverlay';
    _overlay.className = 'fs-overlay';

    _panel = document.createElement('div');
    _panel.id        = 'fileSeederPanel';
    _panel.className = 'fs-panel';
    _panel.innerHTML = getPanelHTML();

    _overlay.appendChild(_panel);
    document.body.appendChild(_overlay);

    // Click backdrop to close
    _overlay.addEventListener('click', (e) => {
        if (e.target === _overlay) close();
    });

    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.isOpen) close();
    });
}

// ── Close handler passed into wireUI ─────────────────────────────────────────

function handleClose(result) {
    close();

    if (result?.seeded) {
        const created = result.created?.length ?? 0;
        const errs    = result.errors?.length  ?? 0;
        const msg     = errs > 0
            ? `✅ Seeded ${created} file(s). ⚠️ ${errs} error(s) — check console.`
            : `✅ Seeded ${created} file(s) successfully.`;

        // Reuse the app's toast / status bar if available, else console
        console.info('[FileSeeder]', msg);

        // Trigger tree refresh so new files appear immediately
        document.getElementById('refreshBtn')?.click();
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function init() {
    if (_overlay) return;
    buildPanel();
    wireUI(handleClose);
    _wired = true;
}

/**
 * Open the panel pre-targeted at a folder.
 * @param {string} absolutePath  - Full path to the folder
 * @param {string} displayLabel  - Short label shown in the header (e.g. 'src')
 */
export function open(absolutePath, displayLabel) {
    if (!_overlay) init();

    resetState();
    resetUI();

    state.targetPath  = absolutePath;
    state.targetLabel = displayLabel;
    state.isOpen      = true;

    setTargetLabel(displayLabel);

    _overlay.classList.add('fs-overlay--visible');
    _panel.classList.add('fs-panel--visible');

    // Focus textarea
    setTimeout(() => document.getElementById('fsInput')?.focus(), 80);
}

export function close() {
    if (!_overlay) return;
    _overlay.classList.remove('fs-overlay--visible');
    _panel.classList.remove('fs-panel--visible');
    state.isOpen = false;
}

export function isOpen() {
    return state.isOpen;
}