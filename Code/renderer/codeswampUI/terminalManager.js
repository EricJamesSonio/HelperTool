import { state } from './state.js';
import { getLoadingController } from './loading.js';
import { getProvider } from './providers.js';
import { convStore } from './conversationStore.js';

const instances = {};
const _loadingTerminalIds = new Set();

let TerminalClass = null;
let FitAddonClass = null;
let _xtermLoaded = false;
const _loadingTimestamps = {};

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
  div.style.overflow = 'hidden';
  if (!state.parallelMode) {
    div.style.position = 'absolute';
    div.style.top = '0';
    div.style.left = '0';
    div.style.width = '100%';
    div.style.height = '100%';
  }
  container.appendChild(div);
  div.addEventListener('click', () => {
    if (state.parallelMode) activateSlot(slotIndex);
  });

  // Force reflow so container has final grid dimensions
  void container.offsetWidth;

  const containerW = container.offsetWidth;
  const containerH = container.offsetHeight;

  const charW = 7.8;
  const charH = 17;
  let cellW = containerW;
  let cellH = containerH;
  if (state.parallelMode && state.parallelSlots > 1) {
    const cols = 2;
    const rows = state.parallelSlots <= 2 ? 1 : 2;
    cellW = Math.floor(containerW / cols);
    cellH = Math.floor(containerH / rows);
  }
  const initCols = Math.max(40, Math.floor(cellW / charW));
  const initRows = Math.max(12, Math.floor(cellH / charH));

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

  const instance = { id: result.id, terminal, fitAddon, div, repoPath, slotIndex, ready: false, _readyResolve: null };
  instances[slotIndex] = instance;

  terminal.onData((data) => {
    window.electronAPI.opencode.termWrite({ id: result.id, data });
  });

  terminal.onResize(({ cols, rows }) => {
    window.electronAPI.opencode.termResize({ id: result.id, cols, rows });
  });

  showSlot(slotIndex);

  requestAnimationFrame(() => {
    if (state.parallelMode) {
      Object.values(instances).forEach(inst => {
        if (inst && inst.fitAddon) {
          try { inst.fitAddon.fit(); } catch {}
          const d = inst.fitAddon.proposeDimensions();
          if (d) {
            window.electronAPI.opencode.termResize({ id: inst.id, cols: d.cols, rows: d.rows });
          }
        }
      });
    } else {
      try { fitAddon.fit(); } catch {}
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        window.electronAPI.opencode.termResize({ id: result.id, cols: dims.cols, rows: dims.rows });
      }
    }
  });

  const provider = getProvider(state.selectedProvider);
  const binaryPath = state.opencodePath || provider.bin;
  const convId = state.slotData[slotIndex]?.convId || state.activeConvId[repoPath];
  const cmd = convId ? provider.resumeCmd(convId, binaryPath) : provider.newChatCmd(binaryPath);
  window.electronAPI.opencode.termWrite({ id: result.id, data: cmd });

  lc.advanceTo('Starting opencode...', 0.60, 400);
  _loadingTerminalIds.add(result.id);
  _loadingTimestamps[result.id] = Date.now();

  const timeout = setTimeout(() => {
    if (_loadingTerminalIds.has(result.id)) {
      _loadingTerminalIds.delete(result.id);
      delete _loadingTimestamps[result.id];
      getLoadingController().finish('Ready', 600);
    }
    instance.ready = true;
    if (instance._readyResolve) { instance._readyResolve(); instance._readyResolve = null; }
  }, 8000);

  instance._loadingTimeout = timeout;

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

export function writeToTerminalDisplay(repoPath, slotIndex, text) {
  let inst;
  if (slotIndex !== undefined && instances[slotIndex]) {
    inst = instances[slotIndex];
  } else {
    inst = Object.values(instances).find(i => i && i.repoPath === repoPath);
  }
  if (!inst) return;
  inst.terminal.write(text);
}

/* ── Response overlay helpers ── */

function getOverlay() {
  return document.getElementById('ocResponseOverlay');
}
function getOverlayContent() {
  return document.getElementById('ocResponseContent');
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

export function showResponseOverlay() {
  const ov = getOverlay();
  if (ov) ov.style.display = '';
  const closeBtn = document.getElementById('ocResponseOverlayClose');
  if (closeBtn) {
    closeBtn.onclick = hideResponseOverlay;
  }
}
export function hideResponseOverlay() {
  const ov = getOverlay();
  if (ov) ov.style.display = 'none';
}
export function clearResponseOverlay() {
  const c = getOverlayContent();
  if (c) c.textContent = '';
}
export function appendToResponseOverlay(text) {
  const c = getOverlayContent();
  if (!c) return;
  c.textContent += stripAnsi(text);
  c.scrollTop = c.scrollHeight;
}

/* ── Execute opencode run via IPC ── */

export function executeOpencodeRun(repoPath, slotIndex, message, files, continueConv, sessionId, mode) {
  if (state.streaming) {
    console.warn('[CS] executeOpencodeRun: already streaming, ignoring');
    return Promise.resolve({ code: -1, error: 'Already streaming' });
  }

  clearResponseOverlay();
  showResponseOverlay();

  state.streaming = true;
  state.streamBuffer = '';
  state.activeConvIdForStream = sessionId || null;
  state.activeTabForStream = repoPath;

  window.electronAPI.opencode.removeStreamListeners();

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;
    let detectedSessionId = sessionId || null;

    function cleanup() {
      if (settled) return;
      settled = true;
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      state.streaming = false;
      state.streamBuffer = '';
      state.activeConvIdForStream = null;
      state.activeTabForStream = null;
      window.electronAPI.opencode.removeStreamListeners();
    }

    timeoutId = setTimeout(() => {
      if (settled) return;
      cleanup();
      const msg = '[Timeout] opencode run did not complete within 60s';
      console.warn('[CS]', msg);
      appendToResponseOverlay(`\n\x1b[31m${msg}\x1b[0m\n`);
      resolve({ code: -1, error: msg });
    }, 60000);

    window.electronAPI.opencode.onStream(({ chunk, isError }) => {
      console.log(`[CS] stream chunk: ${chunk.length}B error=${isError}`);
      state.streamBuffer += chunk;
      appendToResponseOverlay(chunk);
      const sesMatch = chunk.match(/ses_[a-zA-Z0-9_-]{10,}/);
      if (sesMatch) {
        detectedSessionId = sesMatch[0];
      }
    });

    window.electronAPI.opencode.onDone(({ code, stderr, error }) => {
      console.log(`[CS] stream done: code=${code} stderrLen=${(stderr||'').length} error=${error}`);
      if (settled) return;
      cleanup();

      if (code !== 0) {
        const errText = (stderr || error || '').toLowerCase();
        if (errText.includes('session not found')) {
          state.activeConvId[repoPath] = null;
          if (slotIndex !== undefined && state.slotData[slotIndex]) {
            state.slotData[slotIndex].convId = null;
          }
        }
        if (stderr) {
          appendToResponseOverlay(`\n[Error] ${stderr}\n`);
        }
      }

      if (code === 0 && detectedSessionId) {
        state.activeConvId[repoPath] = detectedSessionId;
        if (slotIndex !== undefined) {
          state.slotData[slotIndex] = state.slotData[slotIndex] || {};
          state.slotData[slotIndex].convId = detectedSessionId;
        }
        convStore.addConversation(repoPath, {
          id: detectedSessionId,
          title: message.length > 40 ? message.slice(0, 40) + '\u2026' : message,
          date: new Date().toISOString(),
          provider: state.selectedProvider,
        });
        convStore.touchConversation(repoPath, detectedSessionId);
        const streamText = state.streamBuffer || '';
        writeToTerminalDisplay(repoPath, slotIndex, `\r\n\x1b[36m> ${message}\x1b[0m\r\n`);
        if (streamText) {
          writeToTerminalDisplay(repoPath, slotIndex, streamText);
        }
        writeToTerminalDisplay(repoPath, slotIndex, '\r\n');
        appendToResponseOverlay(`\n\x1b[2m[Done]\x1b[0m\n`);
      }
      resolve({ code, stderr, error });
    });

    window.electronAPI.opencode.run(repoPath, message, files, continueConv, sessionId, mode)
      .then((immediateResult) => {
        if (settled) return;
        cleanup();
        resolve(immediateResult);
      })
      .catch((err) => {
        if (settled) return;
        cleanup();
        const msg = `[IPC Error] ${err.message}`;
        console.error('[CS]', msg);
        appendToResponseOverlay(`\n\x1b[31m${msg}\x1b[0m\n`);
        resolve({ code: -1, error: err.message });
      });
  });
}

export function killSlot(slotIndex) {
  const inst = instances[slotIndex];
  if (!inst) return;
  if (_loadingTerminalIds.has(inst.id)) {
    _loadingTerminalIds.delete(inst.id);
    delete _loadingTimestamps[inst.id];
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
let _termExitHandlerSetup = false;
let _onSessionDetected = null;
const _seenSessionIds = new Set();

export function setOnSessionDetected(cb) {
  _onSessionDetected = cb;
}

export function setupTerminalDataHandler() {
  if (_termDataHandlerSetup) return;
  _termDataHandlerSetup = true;
  window.electronAPI.opencode.onTermData(({ id, data }) => {
    if (_loadingTerminalIds.has(id)) {
      const elapsed = Date.now() - (_loadingTimestamps[id] || 0);
      if (elapsed >= 2500) {
        _loadingTerminalIds.delete(id);
        delete _loadingTimestamps[id];
        getLoadingController().finish('Ready', 600);
      }
    }

    // Detect new session IDs from opencode terminal output and store locally
    if (_onSessionDetected) {
      const sesMatch = data.match(/ses_[a-zA-Z0-9_-]{10,}/);
      if (sesMatch) {
        const sesId = sesMatch[0];
        if (!_seenSessionIds.has(sesId)) {
          _seenSessionIds.add(sesId);
          const inst = Object.values(instances).find(i => i && i.id === id);
          if (inst) {
            inst.ready = true;
            if (inst._readyResolve) { inst._readyResolve(); inst._readyResolve = null; }
            _onSessionDetected(sesId, inst.repoPath, inst.slotIndex);
          }
        }
      }
    }

    for (const inst of Object.values(instances)) {
      if (inst && inst.id === id) {
        inst.terminal.write(data);
        break;
      }
    }
  });

  if (!_termExitHandlerSetup) {
    _termExitHandlerSetup = true;
    window.electronAPI.opencode.onTermExited(({ id, code }) => {
      console.log(`[CS] terminal exited: id=${id} code=${code}`);
      for (const [slot, inst] of Object.entries(instances)) {
        if (inst && inst.id === id) {
          console.log(`[CS] cleaning up stale instance at slot ${slot}`);
          if (_loadingTerminalIds.has(id)) {
            _loadingTerminalIds.delete(id);
            delete _loadingTimestamps[id];
          }
          try { inst.terminal.dispose(); } catch {}
          if (inst.div && inst.div.parentNode) inst.div.remove();
          delete instances[slot];
          delete state.slotData[slot];
          break;
        }
      }
    });
  }
}

export function markTerminalLoading(slotIndex) {
  const inst = instances[slotIndex];
  if (inst) {
    _loadingTerminalIds.add(inst.id);
    _loadingTimestamps[inst.id] = Date.now();
  }
}

export function clearTerminalLoading(slotIndex) {
  const inst = instances[slotIndex];
  if (inst) {
    _loadingTerminalIds.delete(inst.id);
    delete _loadingTimestamps[inst.id];
  }
}

export function waitForTerminalOpencode(repoPath, slotIndex, timeout = 10000) {
  return new Promise((resolve) => {
    let inst;
    if (slotIndex !== undefined && instances[slotIndex]) {
      inst = instances[slotIndex];
    } else {
      inst = Object.values(instances).find(i => i && i.repoPath === repoPath);
    }
    if (!inst || inst.ready) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      inst.ready = true;
      inst._readyResolve = null;
      resolve();
    }, timeout);
    inst._readyResolve = () => {
      clearTimeout(timer);
      inst._readyResolve = null;
      resolve();
    };
  });
}

export function isTerminalLoading(repoPath, slotIndex) {
  let inst;
  if (slotIndex !== undefined && instances[slotIndex]) {
    inst = instances[slotIndex];
  } else {
    inst = Object.values(instances).find(i => i && i.repoPath === repoPath);
  }
  return inst ? _loadingTerminalIds.has(inst.id) : false;
}

export function waitForTerminalReady(repoPath, slotIndex, timeout = 12000) {
  return new Promise((resolve) => {
    if (!isTerminalLoading(repoPath, slotIndex)) {
      resolve();
      return;
    }
    const start = Date.now();
    const iv = setInterval(() => {
      if (!isTerminalLoading(repoPath, slotIndex)) {
        clearInterval(iv);
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        clearInterval(iv);
        resolve();
      }
    }, 150);
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
