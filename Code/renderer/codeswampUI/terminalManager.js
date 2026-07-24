import { state } from './state.js';
import { getLoadingController } from './loading.js';
import { getProvider } from './providers.js';
import { convStore } from './conversationStore.js';
import { showOutputViewer } from '../utils/outputViewer.js';

const instances = {};
const _loadingTerminalIds = new Set();
const _commandHistory = [];
const MAX_HISTORY_ENTRIES = 100;

let TerminalClass = null;
let FitAddonClass = null;
let _xtermLoaded = false;
const _loadingTimestamps = {};
const _loadingOutputBuffer = {};

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
  const viewBtn = document.createElement('button');
  viewBtn.className = 'oc-term-output-btn';
  viewBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 4 16 14"/><line x1="2" y1="16" x2="18" y2="16"/></svg>`;
  viewBtn.title = 'View full terminal output';
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const inst = instances[slotIndex];
    if (!inst || !inst.terminal) return;
    const buf = inst.terminal.buffer.active;
    const total = buf.baseY + buf.cursorY;
    const lines = [];
    for (let i = 0; i < total; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString());
    }
    showOutputViewer({ title: `Terminal [${repoPath.split('\\').pop().split('/').pop() || repoPath}]`, content: lines.join('\n'), language: 'terminal' });
  });
  div.appendChild(viewBtn);
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
  if (!inst) return Promise.resolve();
  return window.electronAPI.opencode.termWrite({ id: inst.id, data: text }).catch(() => {});
}

export function writeToSlot(slotIndex, text) {
  const inst = instances[slotIndex];
  if (!inst) return Promise.resolve();
  return window.electronAPI.opencode.termWrite({ id: inst.id, data: text }).catch(() => {});
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

export function isShellPrompt(repoPath, slotIndex) {
  let inst;
  if (slotIndex !== undefined && instances[slotIndex]) {
    inst = instances[slotIndex];
  } else {
    inst = Object.values(instances).find(i => i && i.repoPath === repoPath);
  }
  if (!inst || !inst.terminal) return false;
  const buf = inst.terminal.buffer.active;
  const len = buf.length;
  const lines = [];
  for (let i = Math.max(0, len - 3); i < len; i++) {
    const line = buf.getLine(i);
    if (line) lines.push(line.translateToString());
  }
  const tail = lines.join('\n').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
  return /(^|\n)(\$ |PS>|# |[A-Z]:\\)/.test(tail);
}

export function hasPasteWarning(repoPath, slotIndex) {
  let inst;
  if (slotIndex !== undefined && instances[slotIndex]) {
    inst = instances[slotIndex];
  } else {
    inst = Object.values(instances).find(i => i && i.repoPath === repoPath);
  }
  if (!inst || !inst.terminal) return false;
  const buf = inst.terminal.buffer.active;
  const len = buf.length;
  const lines = [];
  for (let i = Math.max(0, len - 5); i < len; i++) {
    const line = buf.getLine(i);
    if (line) lines.push(line.translateToString());
  }
  const tail = lines.join('\n').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
  return /(Warning.*paste|Continue\?|\(y\/N\))/i.test(tail);
}

export async function acceptPasteWarning(repoPath, slotIndex, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (hasPasteWarning(repoPath, slotIndex)) {
      if (slotIndex !== undefined && instances[slotIndex]) {
        await writeToSlot(slotIndex, 'y\r');
      } else {
        await writeToTerminal(repoPath, 'y\r');
      }
      return true;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

export async function restartOpencode(repoPath, slotIndex) {
  let inst;
  if (slotIndex !== undefined && instances[slotIndex]) {
    inst = instances[slotIndex];
  } else {
    inst = Object.values(instances).find(i => i && i.repoPath === repoPath);
  }
  if (!inst || !inst.terminal) return;
  const { getProvider } = await import('./providers.js');
  const provider = getProvider(state.selectedProvider);
  const binaryPath = state.opencodePath || provider.bin;
  inst.terminal.write(`\r\n${binaryPath || 'opencode'}\r`);
  // Wait for the shell prompt to disappear (opencode starts)
  const maxWait = 15000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 200));
    if (!isShellPrompt(repoPath, slotIndex)) return;
  }
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

function _addCommandEntry(command) {
  _commandHistory.push({ command: command || '', output: '' });
  if (_commandHistory.length > MAX_HISTORY_ENTRIES) _commandHistory.shift();
  return _commandHistory.length - 1;
}

function _buildEntryElement(entry, index) {
  const div = document.createElement('div');
  div.className = 'oc-response-entry';
  div.dataset.entryIndex = index;

  const header = document.createElement('div');
  header.className = 'oc-response-entry-header';

  const cmdSpan = document.createElement('span');
  cmdSpan.className = 'oc-response-entry-command';
  cmdSpan.textContent = `$ ${entry.command}`;
  header.appendChild(cmdSpan);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'oc-response-entry-copy';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const text = `$ ${entry.command}\n${entry.output}`;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    }).catch(() => {});
  });
  header.appendChild(copyBtn);

  div.appendChild(header);

  const output = document.createElement('div');
  output.className = 'oc-response-entry-output collapsed';
  output.textContent = entry.output;
  output.addEventListener('click', (e) => {
    e.stopPropagation();
    output.classList.toggle('collapsed');
    output.classList.toggle('expanded');
  });
  div.appendChild(output);

  return div;
}

function _renderOverlayEntries() {
  const body = getOverlayContent();
  if (!body) return;
  body.innerHTML = '';
  _commandHistory.forEach((entry, i) => {
    body.appendChild(_buildEntryElement(entry, i));
  });
  body.scrollTop = body.scrollHeight;
}

export function showResponseOverlay(command) {
  const ov = getOverlay();
  if (ov) ov.style.display = '';

  const titleEl = ov?.querySelector('.oc-response-overlay-title');
  if (titleEl) {
    titleEl.textContent = command ? `Response  —  ${command}` : 'Response';
  }

  _renderOverlayEntries();

  const closeBtn = document.getElementById('ocResponseOverlayClose');
  if (closeBtn) {
    closeBtn.onclick = hideResponseOverlay;
  }

  const copyBtn = document.getElementById('ocResponseOverlayCopy');
  if (copyBtn) {
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      const text = _commandHistory
        .map(e => `$ ${e.command}\n${e.output}`)
        .join('\n\n');
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = '📋'; }, 1200);
      }).catch(() => {});
    };
  }

  const expandBtn = document.getElementById('ocResponseOverlayExpand');
  if (expandBtn) {
    expandBtn.onclick = (e) => {
      e.stopPropagation();
      const text = _commandHistory
        .map(e => `$ ${e.command}\n${e.output}`)
        .join('\n\n');
      if (!text) return;
      showOutputViewer({
        title: 'CodeSwamp Response',
        content: text,
        command: _commandHistory.length > 0 ? _commandHistory[_commandHistory.length - 1].command : undefined,
        language: 'opencode',
      });
    };
  }

  const clearBtn = document.getElementById('ocResponseOverlayClear');
  if (clearBtn) {
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      _commandHistory.length = 0;
      _renderOverlayEntries();
    };
  }
}

export function hideResponseOverlay() {
  const ov = getOverlay();
  if (ov) ov.style.display = 'none';
  // _commandHistory is preserved across hide/show
}

export function clearResponseOverlay() {
  const c = getOverlayContent();
  if (c) c.textContent = '';
}

export function appendToResponseOverlay(text) {
  if (_commandHistory.length === 0) return;
  const entry = _commandHistory[_commandHistory.length - 1];
  if (text) entry.output += stripAnsi(text);

  const body = getOverlayContent();
  if (!body) return;
  const lastEntryEl = body.lastElementChild;
  if (lastEntryEl) {
    const outputEl = lastEntryEl.querySelector('.oc-response-entry-output');
    if (outputEl) {
      outputEl.textContent = entry.output;
      body.scrollTop = body.scrollHeight;
    }
  }
}

/* ── Execute opencode run via IPC ── */

export function executeOpencodeRun(repoPath, slotIndex, message, files, continueConv, sessionId, mode) {
  if (state.streaming) {
    console.warn('[CS] executeOpencodeRun: already streaming, ignoring');
    return Promise.resolve({ code: -1, error: 'Already streaming' });
  }

  const cmd = (message || '').trim();
  _addCommandEntry(cmd);
  showResponseOverlay(cmd);

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

        const existingConvs = convStore.getConversations(repoPath);
        const existingConv = existingConvs.find(c => c.id === detectedSessionId);
        const currentCount = existingConv?.messageCount || 0;

        convStore.addConversation(repoPath, {
          id: detectedSessionId,
          title: message.length > 40 ? message.slice(0, 40) + '\u2026' : message,
          date: new Date().toISOString(),
          provider: state.selectedProvider,
          messageCount: currentCount + 1,
        });
        convStore.touchConversation(repoPath, detectedSessionId);

        if (state.activeTab === repoPath) {
          state.conversations[repoPath] = convStore.getConversations(repoPath);
          import('./repoTabs.js').then(m => m.renderConvList());
        }

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

      // Buffer output during loading to detect "session not found" across chunks
      if (!_loadingOutputBuffer[id]) _loadingOutputBuffer[id] = '';
      _loadingOutputBuffer[id] += data;
      if (_loadingOutputBuffer[id].toLowerCase().includes('session not found')) {
        const inst = Object.values(instances).find(i => i && i.id === id);
        if (inst) {
          console.log(`[CS] session not found for terminal ${id} (repo: ${inst.repoPath}), auto-fallback to new chat`);
          const provider = getProvider(state.selectedProvider);
          const binaryPath = state.opencodePath || provider.bin;
          window.electronAPI.opencode.termWrite({ id, data: provider.newChatCmd(binaryPath) });
          state.activeConvId[inst.repoPath] = null;
          if (state.slotData[inst.slotIndex]) {
            state.slotData[inst.slotIndex].convId = null;
          }
        }
        _loadingTerminalIds.delete(id);
        delete _loadingTimestamps[id];
        delete _loadingOutputBuffer[id];
        getLoadingController().finish('Session not found, started new chat', 600);
        return;
      }

      if (elapsed >= 2500) {
        _loadingTerminalIds.delete(id);
        delete _loadingTimestamps[id];
        delete _loadingOutputBuffer[id];
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

export function waitForShellPrompt(repoPath, slotIndex, timeout = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (isShellPrompt(repoPath, slotIndex)) {
        clearInterval(iv);
        resolve(true);
        return;
      }
      if (Date.now() - start > timeout) {
        clearInterval(iv);
        resolve(false);
      }
    }, 200);
  });
}

export function getSlotForRepo(repoPath) {
  return _findSlotByRepoPath(repoPath);
}

export function getConvSlotMap(repoPath) {
  const map = {};
  for (const [slot, data] of Object.entries(state.slotData)) {
    if (data && data.repoPath === repoPath && data.convId) {
      map[data.convId] = Number(slot);
    }
  }
  return map;
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

export function getNextFreeSlot() {
  const max = 20;
  for (let i = 0; i < max; i++) {
    if (!instances[i]) return i;
  }
  return -1;
}

export function setParallelConfig(mode, count) {
  const wasParallel = state.parallelMode;
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
    if (!wasParallel && instances[0] && !instances[1]) {
      state.activeSlotIndex = 1;
    }
    // Initialize slotData when entering parallel mode so the sidebar
    // can map conversations to their slots (slot badges, per-slot borders)
    if (!wasParallel) {
      const repoPath = instances[0]?.repoPath;
      if (repoPath) {
        state.slotData[0] = { repoPath, convId: state.activeConvId[repoPath] || null };
      }
    }
  }

  import('./repoTabs.js').then(m => m.renderConvList());

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
  const prevSlot = state.activeSlotIndex;
  state.activeSlotIndex = slotIndex;
  _highlightActiveSlot();
  showSlot(slotIndex);

  // Update active conversation in sidebar when slot changes in parallel mode
  if (state.parallelMode && slotIndex !== prevSlot) {
    const slotData = state.slotData[slotIndex];
    if (slotData && slotData.repoPath && slotData.convId) {
      state.activeConvId[slotData.repoPath] = slotData.convId;
    }
    import('./repoTabs.js').then(m => m.renderConvList());
  }
}
