const DEFAULT_SETTINGS = { themeId: 'navy-dark', customAccent: null, fontSize: 14, compactMode: false };
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
        parsed.themeId = parsed.theme === 'light' ? 'cream-light' : 'navy-dark';
        delete parsed.theme; delete parsed.accentId;
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
