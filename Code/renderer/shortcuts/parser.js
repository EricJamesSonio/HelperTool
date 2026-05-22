const KEY_MAP = {
  'Control':     'Ctrl',
  'Meta':        'Cmd',
  'Shift':       'Shift',
  'Alt':         'Alt',
  ' ':           'Space',
  'ArrowUp':     'Up',
  'ArrowDown':   'Down',
  'ArrowLeft':   'Left',
  'ArrowRight':  'Right',
  'Escape':      'Esc',
  'Enter':       'Enter',
  'Tab':         'Tab',
  'Backspace':   'Backspace',
  'Delete':      'Delete',
  'Home':        'Home',
  'End':         'End',
  'PageUp':      'PageUp',
  'PageDown':    'PageDown',
  'Insert':      'Insert',
};

const MODIFIERS = ['Ctrl', 'Cmd', 'Alt', 'Shift'];
const MODIFIER_KEYS = ['Control', 'Meta', 'Alt', 'Shift'];

function isModifierKey(key) {
  return MODIFIER_KEYS.includes(key);
}

function eventToString(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Cmd');
  if (e.altKey)  parts.push('Alt');
  if (e.shiftKey && !isModifierKey(e.key)) parts.push('Shift');
  if (isModifierKey(e.key)) return null;

  let key = KEY_MAP[e.key];
  if (!key) {
    key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  }
  parts.push(key);
  return parts.join('+');
}

function normalize(shortcut) {
  if (!shortcut || typeof shortcut !== 'string') return null;
  const parts = shortcut.split('+').map(s => s.trim());
  if (parts.length < 2) return null;
  const mods = [];
  const rest = [];
  for (const p of parts) {
    const cap = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    if (MODIFIERS.includes(cap)) mods.push(cap);
    else rest.push(p.toUpperCase());
  }
  if (rest.length !== 1) return null;
  return [...mods, rest[0]].join('+');
}

export { eventToString, normalize, isModifierKey };
