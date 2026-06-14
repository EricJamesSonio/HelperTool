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
  btn.style.display = 'none';
}

export { openSettings, closeSettings } from './wiring.js';
