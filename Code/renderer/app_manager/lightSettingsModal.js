/**
 * lightSettingsModal.js
 * Minimal settings modal used when the full themeEngine is disabled.
 */

const ICON_LS_API = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="10" cy="10" r="3"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="10" y1="16" x2="10" y2="19"/><line x1="1" y1="10" x2="4" y2="10"/><line x1="16" y1="10" x2="19" y2="10"/></svg>';
const ICON_LS_SECRET = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="10" cy="11" r="2"/><path d="M5 11V6a5 5 0 0 1 10 0v5"/><rect x="3" y="11" width="14" height="8" rx="1"/></svg>';
const ICON_LS_WORKSPACE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>';
const ICON_LS_SEARCH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="9" cy="9" r="5"/><line x1="13" y1="13" x2="18" y2="18"/></svg>';
const ICON_LS_PALETTE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="10" cy="10" r="7.5"/><circle cx="7" cy="8" r="1" fill="currentColor"/><circle cx="13" cy="8" r="1" fill="currentColor"/><circle cx="10" cy="14" r="1" fill="currentColor"/></svg>';
const ICON_LS_FOLDER = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M2 7v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9L7 4H4a2 2 0 0 0-2 2v1z"/></svg>';
const ICON_LS_LIGHTNING = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M13 2L4 11h5l-2 7 9-9h-5l2-7z"/></svg>';
const ICON_LS_GEAR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41"/></svg>';
const ICON_LS_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';
const ICON_LS_CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="m4 10 4 4 8-8"/></svg>';

const FEATURES_META = [
    { id: 'apiTool',       icon: ICON_LS_API,       label: 'API Tool',          desc: 'Built-in API tester + Swagger import' },
    { id: 'secretHolder',  icon: ICON_LS_SECRET,    label: 'Secret Holder',     desc: 'Password-protected vault for keys & notes' },
    { id: 'workspaceTool', icon: ICON_LS_WORKSPACE, label: 'Workspace Tool',    desc: 'Manage workers and project tickets' },
    { id: 'symbolIndex',   icon: ICON_LS_SEARCH,    label: 'Symbol Index',      desc: 'Search code symbols & file watcher' },
    { id: 'themeEngine',   icon: ICON_LS_PALETTE,   label: 'Full Theme Engine', desc: '20 themes + accent pickers (reload required)' },
    { id: 'folderFilters', icon: ICON_LS_FOLDER,    label: 'Folder Filters',    desc: 'Ignore / Focus folder panels' },
    { id: 'swagger',       icon: ICON_LS_LIGHTNING, label: 'Swagger Import',    desc: 'Auto-import from OpenAPI specs' },
];

function ensureModal(getFeatures, saveFeatures) {
    if (document.getElementById('lightSettingsOverlay')) return;

    const el = document.createElement('div');
    el.id        = 'lightSettingsOverlay';
    el.className = 'settings-overlay';
    el.innerHTML = `
        <div class="settings-modal" role="dialog">
            <div class="settings-header">
                <span class="settings-title"><span class="settings-title-icon">${ICON_LS_GEAR}</span> Manage Features</span>
                <button class="settings-close-btn" id="lsCloseBtn">${ICON_LS_CLOSE}</button>
            </div>
            <div class="settings-body">
                <div class="settings-section">
                    <div class="settings-section-label">Active Features</div>
                    <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 12px">
                        Changes take effect on next launch. Reload the app after saving.
                    </p>
                    <div id="lsFeatureList" style="display:flex;flex-direction:column;gap:8px"></div>
                </div>
            </div>
            <div class="settings-footer">
                <span class="settings-saved-badge" id="lsSavedBadge">${ICON_LS_CHECK} Saved</span>
                <button style="margin-left:auto;padding:8px 18px;border:none;border-radius:7px;
                    background:var(--accent);color:#000;font-weight:700;cursor:pointer;font-size:0.82rem"
                    id="lsSaveBtn">Save &amp; Reload</button>
            </div>
        </div>`;
    document.body.appendChild(el);

    const list = el.querySelector('#lsFeatureList');

    function renderList() {
        const current = getFeatures();
        list.innerHTML = '';
        FEATURES_META.forEach(f => {
            const row = document.createElement('label');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid var(--border-subtle)';
            row.innerHTML = `
                <span style="display:inline-flex;align-items:center;flex-shrink:0">${f.icon}</span>
                <span style="flex:1">
                    <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);display:block">${f.label}</span>
                    <span style="font-size:0.74rem;color:var(--text-muted)">${f.desc}</span>
                </span>
                <input type="checkbox" id="ls-${f.id}" ${current[f.id] ? 'checked' : ''}
                    style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)"/>`;
            list.appendChild(row);
        });
    }

    renderList();

    el.querySelector('#lsCloseBtn').addEventListener('click', () => el.classList.remove('open'));
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });

    el.querySelector('#lsSaveBtn').addEventListener('click', async () => {
        const updated = {};
        FEATURES_META.forEach(f => {
            updated[f.id] = !!el.querySelector(`#ls-${f.id}`)?.checked;
        });
        await saveFeatures(updated);
        const badge = el.querySelector('#lsSavedBadge');
        badge.classList.add('visible');
        setTimeout(() => {
            badge.classList.remove('visible');
            location.reload();
        }, 900);
    });
}

export function openLightSettings() {
    import('../featureManager.js').then(({ getFeatures, saveFeatures }) => {
        ensureModal(getFeatures, saveFeatures);
        document.getElementById('lightSettingsOverlay')?.classList.add('open');
    });
}