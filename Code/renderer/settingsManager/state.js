import { DEFAULT_PREFERENCES } from '../defaultPreferences.js';

const DEFAULT_SETTINGS = DEFAULT_PREFERENCES.appearance;
const STORAGE_KEY = 'helpertool-settings';

const S = {
  settings: loadSettings(),
  overlayEl: null,
  _modalBuilt: false,
  _themeStyleEl: null,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.theme && !parsed.themeId) {
        parsed.themeId = parsed.theme === 'light' ? 'github-hc-dark' : 'github-hc-dark';
        delete parsed.theme; delete parsed.accentId;
      }
      if (parsed.compactMode !== undefined) {
        parsed.uiScale = parsed.compactMode ? 20 : 50;
        delete parsed.compactMode;
      }
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(S.settings));
}

export { DEFAULT_SETTINGS, STORAGE_KEY, S, loadSettings, saveSettings };
