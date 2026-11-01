const ICON_GEAR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 10l4 4 6-6"/></svg>';

let _mods = null;

async function _loadMods() {
    if (_mods) return _mods;
    const [fm, feat] = await Promise.all([
        import('../featureManager.js'),
        import('../settingsManager/features.js'),
    ]);
    _mods = {
        saveFeatures: fm.saveFeatures,
        FEATURES_META: feat.FEATURES_META,
        renderList: feat._renderFeaturesList,
    };
    return _mods;
}

function _close() {
    document.getElementById('lightSettingsOverlay')?.classList.remove('open');
}

function _ensureModal(mods) {
    if (document.getElementById('lightSettingsOverlay')) return;

    const el = document.createElement('div');
    el.id        = 'lightSettingsOverlay';
    el.className = 'settings-overlay';
    el.innerHTML = `
        <div class="settings-modal" role="dialog" aria-label="Manage Features">
            <div class="settings-header">
                <span class="settings-title">
                    <span class="settings-title-icon">${ICON_GEAR}</span>
                    Manage Features
                </span>
                <button class="settings-close-btn" id="lsCloseBtn" title="Close">${ICON_CLOSE}</button>
            </div>
            <div class="settings-body" style="grid-template-columns:minmax(0,1fr)">
                <div class="settings-section" id="settingsFeaturesSection">
                    <div class="settings-section-label">Features</div>
                    <p style="font-size:0.77rem;color:var(--text-muted);margin:0 0 10px;line-height:1.5">
                        Disable features you don't use to make the app load faster.
                        Changes take effect after reloading the app.
                    </p>
                    <div id="settingsFeatureList" style="display:flex;flex-direction:column;gap:5px"></div>
                    <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:12px;gap:10px">
                        <span id="lsSavedBadge"
                            style="display:inline-flex;align-items:center;gap:4px;font-size:0.75rem;color:var(--green);opacity:0;transition:opacity 0.3s">
                            ${ICON_CHECK} Saved \u2014 reloading\u2026
                        </span>
                        <button id="lsSaveBtn"
                            style="padding:7px 16px;border:none;border-radius:7px;background:var(--accent);color:#000;font-weight:700;cursor:pointer;font-size:0.8rem;transition:opacity 0.15s">
                            Save &amp; Reload
                        </button>
                    </div>
                </div>
            </div>
            <div class="settings-footer">
                <span style="font-size:0.75rem;color:var(--text-muted)">
                    Theme: GitHub Dark High Contrast (default). Turn on Full Theme Engine to get more themes, accent colors and folder colors.
                </span>
            </div>
        </div>`;
    document.body.appendChild(el);

    el.addEventListener('click', (e) => { if (e.target === el) _close(); });
    el.querySelector('#lsCloseBtn').addEventListener('click', _close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && el.classList.contains('open')) _close();
    });

    el.querySelector('#lsSaveBtn').addEventListener('click', async () => {
        const updated = {};
        mods.FEATURES_META.forEach((f) => {
            updated[f.id] = !!document.getElementById('sf-feat-' + f.id)?.checked;
        });
        await mods.saveFeatures(updated);
        const badge = el.querySelector('#lsSavedBadge');
        if (badge) badge.style.opacity = '1';
        setTimeout(() => location.reload(), 900);
    });
}

export async function openLightSettings() {
    const mods = await _loadMods();
    _ensureModal(mods);
    mods.renderList();
    document.getElementById('lightSettingsOverlay')?.classList.add('open');
}