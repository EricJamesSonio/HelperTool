import { S } from './state.js';
import { applySettings } from './core.js';
import { FULL_THEMES } from './themes.js';
import { saveAndApply } from './utils.js';
import { openSettings, closeSettings, syncControls } from './wiring.js';

export function initSettings() {
  applySettings();
}

export function hookLegacyThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener('click', () => {
    const theme = FULL_THEMES[S.settings.themeId] || FULL_THEMES['navy-dark'];
    if (theme.dark) {
      const lightCounterpart = {
        'navy-dark':       'cream-light',
        'catppuccin-mocha':'catppuccin-latte',
        'solarized-dark':  'solarized-light',
        'github-dark':     'github-light',
      };
      S.settings.themeId = lightCounterpart[S.settings.themeId] || 'cream-light';
    } else {
      const darkCounterpart = {
        'cream-light':      'navy-dark',
        'catppuccin-latte': 'catppuccin-mocha',
        'solarized-light':  'solarized-dark',
        'github-light':     'github-dark',
      };
      S.settings.themeId = darkCounterpart[S.settings.themeId] || 'navy-dark';
    }
    saveAndApply();
    if (S.overlayEl?.classList.contains('open')) syncControls();
  });
}

export { openSettings, closeSettings } from './wiring.js';
