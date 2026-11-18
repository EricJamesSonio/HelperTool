import { DEFAULT_PREFERENCES } from '../defaultPreferences.js';

const STORAGE_KEY = 'helpertool-shortcuts';

const DEFAULT_SHORTCUTS = DEFAULT_PREFERENCES.shortcuts;

const S = { shortcuts: {} };

function loadShortcuts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let data = raw ? JSON.parse(raw) : {};

    // Migrate old opencodeChat -> codeswampChat
    if (data.opencodeChat !== undefined) {
      if (data.codeswampChat === undefined || data.codeswampChat === null) {
        data.codeswampChat = data.opencodeChat;
      }
      delete data.opencodeChat;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    // New key: if the user already bound our default ('G') to another tool,
    // leave Shortcut Mode unassigned instead of creating a conflict.
    // The dialog's capture-time check prevents future conflicts.
    if (data.shortcutMode === undefined && Object.values(data).includes(DEFAULT_SHORTCUTS.shortcutMode)) {
      data.shortcutMode = null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    // Same for Global Seeder ('Shift+G') - don't steal a user binding.
    if (data.globalSeeder === undefined && Object.values(data).includes(DEFAULT_SHORTCUTS.globalSeeder)) {
      data.globalSeeder = null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    // Same for Repo Console ('F1') - don't steal a user binding.
    if (data.repoConsole === undefined && Object.values(data).includes(DEFAULT_SHORTCUTS.repoConsole)) {
      data.repoConsole = null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    // Strip any keys that are no longer in DEFAULT_SHORTCUTS (e.g. removed tools)
    const cleaned = {};
    for (const key of Object.keys(data)) {
      if (key in DEFAULT_SHORTCUTS) cleaned[key] = data[key];
    }
    if (Object.keys(cleaned).length !== Object.keys(data).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    }
    S.shortcuts = { ...DEFAULT_SHORTCUTS, ...cleaned };
  } catch {
    S.shortcuts = { ...DEFAULT_SHORTCUTS };
  }
  return S.shortcuts;
}

function saveShortcuts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(S.shortcuts));
}

export { S, loadShortcuts, saveShortcuts, DEFAULT_SHORTCUTS, STORAGE_KEY };