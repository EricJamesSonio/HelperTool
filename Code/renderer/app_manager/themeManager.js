import { getFeatures } from '../featureManager.js';

export function applyFallbackTheme() {
    const themeIcon = document.getElementById('themeIcon');
    document.documentElement.removeAttribute('data-theme');
    if (themeIcon) {
        themeIcon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="10" cy="10" r="4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41"/></svg>';
    }

    let engineOn = true;
    try { engineOn = getFeatures().themeEngine !== false; } catch (_) {}
    if (engineOn) return;

    Promise.all([
        import('../settingsManager/core.js'),
        import('../settingsManager/state.js'),
    ]).then(([core, st]) => {
        core.applySettings({ ...st.DEFAULT_SETTINGS });
    }).catch((err) => console.error('[Theme] default theme failed:', err));
}

export function wireFallbackThemeToggle() {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.style.display = 'none';
}