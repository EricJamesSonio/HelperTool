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

function _findSlotByRepoPath(repoPath) {
  for (const [slot, inst] of Object.entries(instances)) {
    if (inst && inst.repoPath === repoPath) return Number(slot);
  }
  return -1;
}

function _getSlotDiv(slotIndex) {
  return document.querySelector(`.oc-term-instance.slot-${slotIndex}`);
}

function _updateContainerGrid() {
  const container = document.getElementById('ocTerminalContainer');
  if (!container) return;
  container.classList.remove('parallel-2', 'parallel-3', 'parallel-4');
  if (state.parallelMode && state.parallelSlots > 1) {
    container.classList.add(`parallel-${state.parallelSlots}`);
  }
}

function _highlightActiveSlot() {
  document.querySelectorAll('.oc-term-instance').forEach(el => {
    el.classList.toggle('active', el.dataset.slot === String(state.activeSlotIndex));
  });
}

export async function initXterm() {
  await loadXterm();
}

export async function createTerminalSession(repoPath, slotIndex = 0) {
  if (instances[slotIndex]) {
    return instances[slotIndex];
  }

  await loadXterm();

  const container = document.getElementById('ocTerminalContainer');
  if (!container) return null;

  const existing = _getSlotDiv(slotIndex);
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = `oc-term-instance slot-${slotIndex}`;
  div.dataset.repo = repoPath;
  div.dataset.slot = String(slotIndex);
  div.style.width = '100%';
  div.style.height = '100%';
  div.style.position = 'absolute';
  div.style.top = '0';
  div.style.left = '0';
  container.appendChild(div);
  div.addEventListener('click', () => {
    if (state.parallelMode) activateSlot(slotIndex);
  });

  const containerW = container.offsetWidth;
  const containerH = container.offsetHeight;

  const charW = 7.8;
  const charH = 17;
  const initCols = Math.max(80, Math.floor(containerW / charW));
  const initRows = Math.max(24, Math.floor(containerH / charH));

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

  terminal.write('\x1b[?25h');

  await new Promise(r => setTimeout(r, 100));

  try {
    fitAddon.fit();
  } catch(e) {
    try { terminal.resize(initCols, initRows); } catch {}
  }

  const { getSelectedShell } = await import('./sidebar.js');
  const shell = getSelectedShell();

  const result = await window.electronAPI.opencode.termSpawn({
    cwd: repoPath,
    shell: shell.cmd,
    args: shell.args,
  });

  if (!result || result.error) {
    terminal.write(`\r\n\x1b[31mFailed to start: ${result?.error || 'unknown'}\x1b[0m\r\n`);
    return null;
  }

  const lc = getLoadingController();
  lc.setProgress('Starting shell...', 0.35);

  const instance = { id: result.id, terminal, fitAddon, div, repoPath, slotIndex };
  instances[slotIndex] = instance;

  terminal.onData((data) => {
    window.electronAPI.opencode.termWrite({ id: result.id, data });
  });

  terminal.onResize(({ cols, rows }) => {
    window.electronAPI.opencode.termResize({ id: result.id, cols, rows });
  });

  showSlot(slotIndex);

  requestAnimationFrame(() => {
    try { fitAddon.fit(); } catch {}
    const dims = fitAddon.proposeDimensions();
    if (dims) {
      window.electronAPI.opencode.termResize({ id: result.id, cols: dims.cols, rows: dims.rows });
    }
  });

  const provider = getProvider(state.selectedProvider);
  const convId = state.slotData[slotIndex]?.convId || state.activeConvId[repoPath];
  const cmd = convId ? provider.resumeCmd(convId) : provider.newChatCmd();
  window.electronAPI.opencode.termWrite({ id: result.id, data: cmd });

  lc.advanceTo('Starting opencode...', 0.60, 400);
  _loadingTerminalIds.add(result.id);

  setTimeout(() => {
    if (_loadingTerminalIds.has(result.id)) {
      _loadingTerminalIds.delete(result.id);
      getLoadingController().finish('Ready', 600);
    }
  }, 8000);

  return instance;
}

export function showSlot(slotIndex) {
  const termWrapper = document.getElementById('ocTerminal');
  const welcome = document.getElementById('ocWelcome');
  if (termWrapper) termWrapper.style.display = '';
  if (welcome) welcome.style.display = 'none';

  if (!state.parallelMode) {
    Object.values(instances).forEach(inst => {
      if (inst.div) inst.div.style.display = inst.slotIndex === slotIndex ? '' : 'none';
    });
  }

  const inst = instances[slotIndex];
  if (inst && inst.fitAddon) {
    requestAnimationFrame(() => {
      try { inst.fitAddon.fit(); } catch {}
      const dims = inst.fitAddon.proposeDimensions();
      if (dims) {
        window.electronAPI.opencode.termResize({ id: inst.id, cols: dims.cols, rows: dims.rows });
      }
    });
  }

  _highlightActiveSlot();
}

export function showTerminalSession(repoPath) {
  const slot = _findSlotByRepoPath(repoPath);
  if (slot >= 0) showSlot(slot);
}

export function writeToTerminal(repoPath, text) {
  const inst = Object.values(instances).find(i => i && i.repoPath === repoPath);
  if (!inst) return;
  window.electronAPI.opencode.termWrite({ id: inst.id, data: text });
}

export function writeToSlot(slotIndex, text) {
  const inst = instances[slotIndex];
  if (!inst) return;
  window.electronAPI.opencode.termWrite({ id: inst.id, data: text });
}

export function killSlot(slotIndex) {
  const inst = instances[slotIndex];
  if (!inst) return;
  if (_loadingTerminalIds.has(inst.id)) {
    _loadingTerminalIds.delete(inst.id);
    getLoadingController().hide();
  }
  window.electronAPI.opencode.termKill(inst.id);
  try { inst.terminal.dispose(); } catch {}
  if (inst.div && inst.div.parentNode) inst.div.remove();
  delete instances[slotIndex];
  delete state.slotData[slotIndex];
}

export function killTerminalSession(repoPath) {
  const slot = _findSlotByRepoPath(repoPath);
  if (slot >= 0) killSlot(slot);
}

export function hasTerminalSession(repoPath) {
  return _findSlotByRepoPath(repoPath) >= 0;
}

export function fitActiveTerminal() {
  const container = document.getElementById('ocTerminalContainer');
  if (!container) return;
  if (state.parallelMode) {
    Object.values(instances).forEach(inst => {
      if (inst && inst.fitAddon) {
        requestAnimationFrame(() => {
          try { inst.fitAddon.fit(); } catch {}
        });
      }
    });
  } else {
    const visible = container.querySelector('.oc-term-instance:not([style*="display: none"])');
    if (!visible) return;
    const slot = Number(visible.dataset.slot);
    const inst = instances[slot];
    if (inst && inst.fitAddon) {
      requestAnimationFrame(() => {
        try { inst.fitAddon.fit(); } catch {}
      });
    }
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
    for (const inst of Object.values(instances)) {
      if (inst && inst.id === id) {
        inst.terminal.write(data);
        break;
      }
    }
  });
}

export function getActiveSlots() {
  const count = state.parallelMode ? state.parallelSlots : 1;
  const result = [];
  for (let i = 0; i < count; i++) {
    const inst = instances[i];
    const data = state.slotData[i];
    result.push(data ? { repoPath: inst?.repoPath || data.repoPath, convId: data.convId, slotIndex: i } : null);
  }
  return result;
}

export function getFreeSlot() {
  const count = state.parallelMode ? state.parallelSlots : 1;
  for (let i = 0; i < count; i++) {
    if (!instances[i]) return i;
  }
  return -1;
}

export function setParallelConfig(mode, count) {
  state.parallelMode = mode;
  state.parallelSlots = count;

  if (!mode) {
    Object.keys(instances).map(Number).sort().forEach(slot => {
      if (slot > 0) killSlot(slot);
    });
    state.slotData = {};
    state.activeSlotIndex = 0;
    if (instances[0]) {
      state.slotData[0] = { repoPath: instances[0].repoPath, convId: state.activeConvId[instances[0].repoPath] || null };
    }
  } else {
    Object.keys(instances).map(Number).forEach(slot => {
      if (slot >= count) killSlot(slot);
    });
    if (state.activeSlotIndex >= count) state.activeSlotIndex = 0;
  }

  _updateContainerGrid();
  _highlightActiveSlot();

  if (!mode) {
    document.querySelectorAll('.oc-term-instance').forEach(el => {
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
      el.style.display = el.dataset.slot === '0' ? '' : 'none';
    });
  } else {
    document.querySelectorAll('.oc-term-instance').forEach(el => {
      el.style.position = 'relative';
      el.style.top = '';
      el.style.left = '';
      el.style.display = '';
    });
  }

  fitActiveTerminal();
}

export function activateSlot(slotIndex) {
  if (slotIndex < 0 || (state.parallelMode && slotIndex >= state.parallelSlots)) return;
  if (!state.parallelMode && slotIndex > 0) return;
  state.activeSlotIndex = slotIndex;
  _highlightActiveSlot();
  showSlot(slotIndex);
}
