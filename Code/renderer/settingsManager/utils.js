import { saveSettings } from './state.js';
import { applySettings } from './core.js';

function saveAndApply() { saveSettings(); applySettings(); flashSaved(); }

function flashSaved() {
  const badge = document.getElementById('settingsSavedBadge');
  if (!badge) return;
  badge.classList.add('visible');
  clearTimeout(badge._t);
  badge._t = setTimeout(() => badge.classList.remove('visible'), 1800);
}

export { saveAndApply, flashSaved };
