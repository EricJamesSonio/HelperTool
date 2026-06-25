import { state } from './state.js';
import { getLoadingController } from './loading.js';
import { getProvider } from './providers.js';

const instances = {};
const _loadingTerminalIds = new Set();

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
  console.log('[CS] ocTerminalContainer found:', !!container, container?.offsetWidth, container?.offsetHeight);
  if (!container) return null;

  const div = document.createElement('div');
  div.className = 'oc-term-instance';
  div.dataset.repo = repoPath;
  // Set explicit size on div to match container — bypasses zoom measurement issues
  div.style.width = '100%';
  div.style.height = '100%';
  div.style.position = 'absolute';
  div.style.top = '0';
  div.style.left = '0';
  container.appendChild(div);
  console.log('[CS] term div appended, div size:', div.offsetWidth, div.offsetHeight);

  // Get actual pixel dimensions accounting for zoom
  const bodyZoom = parseFloat(document.body.style.zoom) || 1;
  const containerW = container.offsetWidth;
  const containerH = container.offsetHeight;

  // Approximate char dimensions at fontSize 13
  const charW = 7.8;
  const charH = 17;
  const initCols = Math.max(80, Math.floor(containerW / charW));
  const initRows = Math.max(24, Math.floor(containerH / charH));
  console.log('[CS] initial cols/rows:', initCols, initRows);

  const terminal = new TerminalClass({
    theme: getDarkTheme(),
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 5000,
    allowTransparency: false,
    cols: initCols,
    rows: initRows,
  });

  const fitAddon = new FitAddonClass();
  terminal.loadAddon(fitAddon);
  terminal.open(div);
  console.log('[CS] terminal.open() called');

  // Force a visible character to trigger DOM renderer paint
  terminal.write('\x1b[?25h');

  await new Promise(r => setTimeout(r, 100));

  try {
    fitAddon.fit();
    console.log('[CS] fitAddon.fit() OK');
  } catch(e) {
    console.log('[CS] fitAddon.fit() ERROR:', e.message);
    // Fallback: manual resize
    try { terminal.resize(initCols, initRows); } catch {}
  }

  const { getSelectedShell } = await import('./sidebar.js');
  const shell = getSelectedShell();
  console.log('[CS] Spawning shell:', shell.cmd, shell.args);

  const result = await window.electronAPI.opencode.termSpawn({
    cwd: repoPath,
    shell: shell.cmd,
    args: shell.args,
  });

  console.log('[CS] termSpawn result:', JSON.stringify(result));

  if (!result || result.error) {
    terminal.write(`\r\n\x1b[31mFailed to start: ${result?.error || 'unknown'}\x1b[0m\r\n`);
    return null;
  }

  const lc = getLoadingController();
  lc.setProgress('Starting shell...', 0.35);

  const instance = { id: result.id, terminal, fitAddon, div, repoPath };
  instances[repoPath] = instance;

  terminal.onData((data) => {
    window.electronAPI.opencode.termWrite({ id: result.id, data });
  });

  terminal.onResize(({ cols, rows }) => {
    window.electronAPI.opencode.termResize({ id: result.id, cols, rows });
  });

  console.log('[CS] calling showTerminalSession');
  showTerminalSession(repoPath);

  // Re-fit after show to get accurate dimensions
  requestAnimationFrame(() => {
    try { fitAddon.fit(); } catch {}
    const dims = fitAddon.proposeDimensions();
    console.log('[CS] proposeDimensions after show:', dims);
    if (dims) {
      window.electronAPI.opencode.termResize({ id: result.id, cols: dims.cols, rows: dims.rows });
    }
  });

  // Write AI provider command immediately (pty buffers input until shell is ready)
  const provider = getProvider(state.selectedProvider);
  const convId = state.activeConvId[repoPath];
  const cmd = convId ? provider.resumeCmd(convId) : provider.newChatCmd();
  window.electronAPI.opencode.termWrite({ id: result.id, data: cmd });

  lc.advanceTo('Starting opencode...', 0.60, 400);
  _loadingTerminalIds.add(result.id);

  // Safety timeout: force-hide overlay if no output arrives within 8s
  setTimeout(() => {
    if (_loadingTerminalIds.has(result.id)) {
      _loadingTerminalIds.delete(result.id);
      getLoadingController().finish('Ready', 600);
    }
  }, 8000);

  return instance;
}

export function showTerminalSession(repoPath) {
  const termWrapper = document.getElementById('ocTerminal');
  const welcome = document.getElementById('ocWelcome');
  if (termWrapper) termWrapper.style.display = '';
  if (welcome) welcome.style.display = 'none';

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
  if (_loadingTerminalIds.has(inst.id)) {
    _loadingTerminalIds.delete(inst.id);
    getLoadingController().hide();
  }
  window.electronAPI.opencode.termKill(inst.id);
  try { inst.terminal.dispose(); } catch {}
  if (inst.div && inst.div.parentNode) inst.div.remove();
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
let _termDataHandlerSetup = false;

export function setupTerminalDataHandler() {
  if (_termDataHandlerSetup) return;
  _termDataHandlerSetup = true;
  window.electronAPI.opencode.onTermData(({ id, data }) => {
    if (_loadingTerminalIds.has(id)) {
      _loadingTerminalIds.delete(id);
      getLoadingController().finish('Ready', 600);
    }
    for (const rp of Object.keys(instances)) {
      if (instances[rp].id === id) {
        instances[rp].terminal.write(data);
        break;
      }
    }
  });
}