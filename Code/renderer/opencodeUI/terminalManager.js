const instances = {};

let TerminalClass = null;
let FitAddonClass = null;
let _xtermLoaded = false;

async function loadXterm() {
  if (_xtermLoaded) return;
  const xtermMod = await import('../../node_modules/@xterm/xterm/lib/xterm.mjs');
  const fitMod = await import('../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs');
  TerminalClass = xtermMod.Terminal;
  FitAddonClass = fitMod.FitAddon;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '../node_modules/@xterm/xterm/css/xterm.css';
  document.head.appendChild(link);

  _xtermLoaded = true;
}

function getDarkTheme() {
  return {
    background: '#0c0c0c',
    foreground: '#f2f2f2',
    cursor: '#f2f2f2',
    cursorAccent: '#0c0c0c',
    selectionBackground: '#264f78',
    black: '#1a1a1a',
    red: '#f14c4c',
    green: '#23d18b',
    yellow: '#f5f543',
    blue: '#3b8eea',
    magenta: '#d670d6',
    cyan: '#29b8db',
    white: '#e0e0e0',
    brightBlack: '#5a5a5a',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#ffffff',
  };
}

export async function initXterm() {
  await loadXterm();
}

export async function createTerminalSession(repoPath) {
  if (instances[repoPath]) {
    showTerminalSession(repoPath);
    return instances[repoPath];
  }

  await loadXterm();

  const container = document.getElementById('ocTerminalContainer');
  if (!container) return null;

  const div = document.createElement('div');
  div.className = 'oc-term-instance';
  div.dataset.repo = repoPath;
  container.appendChild(div);

  const terminal = new TerminalClass({
    theme: getDarkTheme(),
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 5000,
    allowTransparency: false,
    minimumContrastRatio: 4.5,
  });

  const fitAddon = new FitAddonClass();
  terminal.loadAddon(fitAddon);
  terminal.open(div);

  // Small delay to let xterm render, then fit
  await new Promise(r => setTimeout(r, 50));
  try { fitAddon.fit(); } catch {}

  const { getSelectedShell } = await import('./sidebar.js');
  const shell = getSelectedShell();
  console.log('[CS] Spawning shell:', shell.cmd, shell.args);

  const result = await window.electronAPI.opencode.termSpawn({
    cwd: repoPath,
    shell: shell.cmd,
    args: shell.args,
  });

  if (!result || result.error) {
    terminal.write(`\r\n\x1b[31mFailed to start: ${result?.error || 'unknown'}\x1b[0m\r\n`);
    return null;
  }

  const instance = {
    id: result.id,
    terminal,
    fitAddon,
    div,
    repoPath,
  };
  instances[repoPath] = instance;

  terminal.onData((data) => {
    window.electronAPI.opencode.termWrite({ id: result.id, data });
  });

  terminal.onResize(({ cols, rows }) => {
    window.electronAPI.opencode.termResize({ id: result.id, cols, rows });
  });

  showTerminalSession(repoPath);

  // Fit after a frame
  requestAnimationFrame(() => {
    try { fitAddon.fit(); } catch {}
    const dims = fitAddon.proposeDimensions();
    if (dims) {
      window.electronAPI.opencode.termResize({ id: result.id, cols: dims.cols, rows: dims.rows });
    }
  });

setTimeout(() => {
  window.electronAPI.opencode.termWrite({ id: result.id, data: 'opencode\r' });
}, 2000);

  return instance;
}

export function showTerminalSession(repoPath) {
  // Show/hide the outer wrapper
  const termWrapper = document.getElementById('ocTerminal');
  const welcome = document.getElementById('ocWelcome');
  if (termWrapper) termWrapper.style.display = '';
  if (welcome) welcome.style.display = 'none';

  // Show correct instance, hide others
  Object.keys(instances).forEach(rp => {
    const inst = instances[rp];
    if (inst.div) inst.div.style.display = rp === repoPath ? '' : 'none';
  });

  const inst = instances[repoPath];
  if (inst && inst.fitAddon) {
    requestAnimationFrame(() => {
      try { inst.fitAddon.fit(); } catch {}
      const dims = inst.fitAddon.proposeDimensions();
      if (dims) {
        window.electronAPI.opencode.termResize({ id: inst.id, cols: dims.cols, rows: dims.rows });
      }
    });
  }
}

export function writeToTerminal(repoPath, text) {
  const inst = instances[repoPath];
  if (!inst) return;
  window.electronAPI.opencode.termWrite({ id: inst.id, data: text });
}

export function killTerminalSession(repoPath) {
  const inst = instances[repoPath];
  if (!inst) return;
  window.electronAPI.opencode.termKill(inst.id);
  try { inst.terminal.dispose(); } catch {}
  if (inst.div.parentNode) inst.div.remove();
  delete instances[repoPath];
}

export function hasTerminalSession(repoPath) {
  return !!instances[repoPath];
}

export function fitActiveTerminal() {
  const container = document.getElementById('ocTerminalContainer');
  if (!container) return;
  const visible = container.querySelector('.oc-term-instance:not([style*="display: none"])');
  if (!visible) return;
  const repoPath = visible.dataset.repo;
  const inst = instances[repoPath];
  if (inst && inst.fitAddon) {
    requestAnimationFrame(() => {
      try { inst.fitAddon.fit(); } catch {}
    });
  }
}

export function setupTerminalDataHandler() {
  window.electronAPI.opencode.onTermData(({ id, data }) => {
    for (const rp of Object.keys(instances)) {
      if (instances[rp].id === id) {
        instances[rp].terminal.write(data);
        break;
      }
    }
  });
}
