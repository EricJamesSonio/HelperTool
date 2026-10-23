// ===== File: Code\renderer\selectShortcuts\store.js =====
// Global (cross-repo) storage for the named "select shortcut" presets.
//
// Shape: [{ id, name, targets: ['backend', 'frontend'] }]

const STORAGE_KEY = 'helpertool-select-shortcuts';

let _cache = null;

function makeShortcutId() {
  return 'sc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim();
  if (!name) return null;
  const targets = Array.isArray(raw.targets)
    ? raw.targets.map(t => String(t ?? '').trim()).filter(Boolean)
    : [];
  return {
    id: raw.id ? String(raw.id) : makeShortcutId(),
    name,
    targets,
  };
}

export function loadSelectShortcuts() {
  if (_cache) return _cache;
  let items = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        items = parsed.map(sanitizeItem).filter(Boolean);
      }
    }
  } catch (_) {
    items = [];
  }
  _cache = items;
  return _cache;
}

export function saveSelectShortcuts(items) {
  _cache = (Array.isArray(items) ? items : []).map(sanitizeItem).filter(Boolean);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
  } catch (_) { /* storage unavailable — keep the in-memory copy */ }
  return _cache;
}

export function addSelectShortcut(item) {
  const list = [...loadSelectShortcuts()];
  const clean = sanitizeItem(item);
  if (!clean) return loadSelectShortcuts();
  list.push(clean);
  return saveSelectShortcuts(list);
}

export function updateSelectShortcut(id, patch) {
  const list = loadSelectShortcuts().map(it => (it.id === id ? { ...it, ...patch } : it));
  return saveSelectShortcuts(list);
}

export function removeSelectShortcut(id) {
  return saveSelectShortcuts(loadSelectShortcuts().filter(it => it.id !== id));
}

export function getSelectShortcut(id) {
  return loadSelectShortcuts().find(it => it.id === id) || null;
}

export { makeShortcutId };
