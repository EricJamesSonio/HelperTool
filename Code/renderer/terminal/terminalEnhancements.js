const TERMINAL_THEME = {
  background: '#050a08',
  foreground: '#ffffff',
  cursor: '#ffffff',
  cursorAccent: '#050a08',
  selectionBackground: '#2f6fd0',
  selectionInactiveBackground: '#3a4a5a',
  black: '#1a1a1a',
  red: '#ff6b69',
  green: '#3fb950',
  yellow: '#e3b341',
  blue: '#58a6ff',
  magenta: '#d2a8ff',
  cyan: '#39c5cf',
  white: '#e6edf3',
  brightBlack: '#8b949e',
  brightRed: '#ff8e8c',
  brightGreen: '#56d364',
  brightYellow: '#f2cc60',
  brightBlue: '#79c0ff',
  brightMagenta: '#e2c5ff',
  brightCyan: '#56d4dd',
  brightWhite: '#ffffff',
};

const FORCED_OPTIONS = {
  scrollback: 4000,
  rightClickSelectsWord: false,
  drawBoldTextInBrightColors: true,
};

export function getTerminalTheme() {
  return { ...TERMINAL_THEME };
}

function flash(parent, text) {
  if (!parent) return;
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    'position:absolute;right:12px;bottom:10px;z-index:20;padding:3px 10px;border-radius:5px;' +
    'font-size:11px;font-weight:600;color:#fff;background:rgba(47,129,247,0.92);' +
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