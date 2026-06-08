/**
 * themeManager.js
 * Fallback theme used when the full themeEngine feature is disabled.
 * When themeEngine IS enabled, settingsManager handles all theme logic.
 */

export function applyFallbackTheme() {
    const themeIcon  = document.getElementById('themeIcon');
    const saved      = localStorage.getItem('helpertool-theme') || 'dark';

    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeIcon)  themeIcon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M17 13.5A7 7 0 0 1 6.5 3 7 7 0 1 0 17 13.5z"/></svg>';
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (themeIcon)  themeIcon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="10" cy="10" r="4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41"/></svg>';
    }
}

export function wireFallbackThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    themeToggleBtn?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next    = current === 'light' ? 'dark' : 'light';
        localStorage.setItem('helpertool-theme', next);
        applyFallbackTheme();
    });
}