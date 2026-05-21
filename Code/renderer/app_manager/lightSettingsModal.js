/**
 * lightSettingsModal.js
 * Minimal settings modal used when the full themeEngine is disabled.
 */

const FEATURES_META = [
    { id: 'apiTool',       icon: '🔌', label: 'API Tool',          desc: 'Built-in API tester + Swagger import' },
    { id: 'secretHolder',  icon: '🔐', label: 'Secret Holder',     desc: 'Password-protected vault for keys & notes' },
    { id: 'workspaceTool', icon: '👥', label: 'Workspace Tool',    desc: 'Manage workers and project tickets' },
    { id: 'themeEngine',   icon: '🎨', label: 'Full Theme Engine', desc: '20 themes + accent pickers (reload required)' },
    { id: 'folderFilters', icon: '📁', label: 'Folder Filters',    desc: 'Ignore / Focus folder panels' },
    { id: 'swagger',       icon: '⚡', label: 'Swagger Import',    desc: 'Auto-import from OpenAPI specs' },
];

function ensureModal(getFeatures, saveFeatures) {
    if (document.getElementById('lightSettingsOverlay')) return;

    const el = document.createElement('div');
    el.id        = 'lightSettingsOverlay';
    el.className = 'settings-overlay';
    el.innerHTML = `
        <div class="settings-modal" role="dialog">
            <div class="settings-header">
                <span class="settings-title"><span class="settings-title-icon">⚙️</span> Manage Features</span>
                <button class="settings-close-btn" id="lsCloseBtn">✕</button>
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
                <span class="settings-saved-badge" id="lsSavedBadge">✓ Saved</span>
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
                <span style="font-size:1.1rem">${f.icon}</span>
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