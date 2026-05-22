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
        if (themeIcon)  themeIcon.textContent  = '🌙';
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (themeIcon)  themeIcon.textContent  = '☀️';
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