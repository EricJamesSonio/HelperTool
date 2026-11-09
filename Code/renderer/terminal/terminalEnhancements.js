function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (_) {
    return fallback;
  }
}

function withAlpha(color, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

const FORCED_OPTIONS = {
  scrollback: 4000,
  rightClickSelectsWord: false,
  drawBoldTextInBrightColors: true,
};

export function getTerminalTheme() {
  const bg = cssVar('--bg-base', '#000000');
  const fg = cssVar('--text-primary', '#ffffff');
  const out = cssVar('--term-output', cssVar('--accent-hover', '#58a6ff'));
  const accent = cssVar('--accent', '#2f81f7');
  const green = cssVar('--green', '#3fb950');
  const red = cssVar('--red', '#ff6b69');
  const yellow = cssVar('--yellow', '#d29922');
  const blue = cssVar('--blue', '#2f81f7');
  const purple = cssVar('--purple', '#bc8cff');
  const raised = cssVar('--bg-raised', '#181818');
  const secondary = cssVar('--text-secondary', '#e0e4e8');
  const faint = cssVar('--text-faint', '#707880');
  const muted = cssVar('--text-muted', '#a0a8b0');
  const selection = withAlpha(accent, 0.45) || '#2f6fd0';
  const inactive = withAlpha(accent, 0.25) || '#3a4a5a';
  return {
    background: bg,
    foreground: out,
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: selection,
    selectionInactiveBackground: inactive,
    black: raised,
    red: red,
    green: green,
    yellow: yellow,
    blue: blue,
    magenta: purple,
    cyan: '#39c5cf',
    white: secondary,
    brightBlack: faint,
    brightRed: red,
    brightGreen: green,
    brightYellow: yellow,
    brightBlue: cssVar('--accent-hover', '#58a6ff'),
    brightMagenta: purple,
    brightCyan: '#56d4dd',
    brightWhite: fg,
    extendedAnsi: undefined,
    muted: muted,
  };
}

function flash(parent, text) {
  if (!parent) return;
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    'position:absolute;right:12px;bottom:10px;z-index:20;padding:3px 10px;border-radius:5px;' +
    'font-size:11px;font-weight:600;color:#fff;background:var(--accent, #2f81f7);' +
    'pointer-events:none;opacity:1;transition:opacity 0.25s';
  parent.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, 900);
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

async function copySelection(term) {
  const text = term.getSelection();
  if (!text) return false;
  const ok = await writeClipboard(text);
  if (ok) {
    term.clearSelection();
    flash(term._enhancedParent, 'Copied');
  }
  term.focus();
  return ok;
}

function handleKey(term, ev) {
  if (!ev.ctrlKey || ev.altKey) {
    if (ev.shiftKey && !ev.ctrlKey && ev.key === 'Insert') return false;
    return true;
  }
  const key = (ev.key || '').toLowerCase();
  if (key === 'c') {
    if (ev.shiftKey || term.hasSelection()) {
      ev.preventDefault();
      if (ev.type === 'keydown') copySelection(term);
      return false;
    }
    return true;
  }
  if (key === 'v') return false;
  if (key === 'insert') {
    ev.preventDefault();
    if (ev.type === 'keydown') copySelection(term);
    return false;
  }
  return true;
}

function installPointerHandlers(term, parent) {
  parent.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (term.hasSelection()) {
      await copySelection(term);
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) term.paste(text);
    } catch (_) {}
    term.focus();
  });
}

export function createEnhancedTerminal(BaseTerminal) {
  return class EnhancedTerminal extends BaseTerminal {
    constructor(options = {}) {
      super({ ...options, ...FORCED_OPTIONS, theme: getTerminalTheme() });
      this._enhancedParent = null;
      this.attachCustomKeyEventHandler((ev) => handleKey(this, ev));
    }

    open(parent) {
      super.open(parent);
      this._enhancedParent = parent;
      installPointerHandlers(this, parent);
    }
  };
}