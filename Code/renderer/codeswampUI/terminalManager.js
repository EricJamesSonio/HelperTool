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
const _creating = new Map();
const _prewarming = new Map();
const BOOT_TIMEOUT = 25000;
const BOOT_SETTLE = 350;
const BOOT_QUIET = 1000;
const BOOT_MIN_QUIET = 3000;


async function loadXterm() {
  if (_xtermLoaded) return;
  const xtermMod = await import('../../node_modules/@xterm/xterm/lib/xterm.mjs');
  const fitMod = await import('../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs');
  const { createEnhancedTerminal } = await import('../terminal/terminalEnhancements.js');
  TerminalClass = createEnhancedTerminal(xtermMod.Terminal);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function injectBootCss() {
  if (document.getElementById('ocBootCss')) return;
  const link = document.createElement('link');
  link.id = 'ocBootCss';
  link.rel = 'stylesheet';
  link.href = './styles/codeswamp-boot.css';
  document.head.appendChild(link);
}

function prewarmEnabled() {
  try {
    return localStorage.getItem('helpertool-cs-prewarm') !== '0';
  } catch (_) {
    return true;
  }
}

function stageTerminal(on) {
  const wrapper = document.getElementById('ocTerminal');
  if (wrapper) wrapper.classList.toggle('oc-terminal--stage', !!on);
}

function _findInst(repoPath, slotIndex) {
  if (slotIndex !== undefined && instances[slotIndex]) return instances[slotIndex];
  return Object.values(instances).find((i) => i && i.repoPath === repoPath) || null;
}

function buildBootOverlay(label) {
  const el = document.createElement('div');
  el.className = 'oc-term-boot';
  el.innerHTML =
    '<div class="oc-term-boot-spin"></div>' +
    '<div class="oc-term-boot-title">Loading Code Swamp...</div>' +
    '<div class="oc-term-boot-sub">' + label + ' is getting ready</div>';
  return el;
}

function setBootText(inst, text) {
  if (!inst || !inst.bootEl) return;
  const sub = inst.bootEl.querySelector('.oc-term-boot-sub');
  if (sub) sub.textContent = text;
}

function altActive(inst) {
  try {
    return inst.terminal.buffer.active.type === 'alternate';
  } catch (_) {
    return false;
  }
}

function shellPromptInst(inst) {
  if (!inst || !inst.terminal) return false;
  try {
    const buf = inst.terminal.buffer.active;
    if (buf.type === 'alternate') return false;
    const cy = buf.baseY + buf.cursorY;
    const lines = [];
    for (let i = Math.max(0, cy - 2); i <= cy; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString());
    }
    const tail = lines.join('\n').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
    return /(^|\n)(\$ |PS>|# |[A-Z]:\\)/.test(tail);
  } catch (_) {
    return false;
  }
}

function ensureOpen(inst) {
  if (inst.opened) return true;
  if (!inst.div || !inst.div.isConnected) return false;
  if (inst.div.offsetWidth < 40 || inst.div.offsetHeight < 40) return false;
  try {
    inst.terminal.open(inst.div);
    inst.opened = true;
  } catch (_) {
    return false;
  }
  return true;
}

function safeFit(inst) {
  if (!inst || !inst.fitAddon || !inst.div) return;
  const wasOpen = inst.opened;
  if (!ensureOpen(inst)) return;
  if (inst.div.offsetWidth < 40 || inst.div.offsetHeight < 40) return;
  try {
    inst.fitAddon.fit();
  } catch (_) {}
  if (!wasOpen) {
    setTimeout(() => {
      try {
        inst.fitAddon.fit();
      } catch (_) {}
    }, 120);
  }
}

function finishBoot(inst, reason) {
  if (!inst || inst.booted) return;
  inst.booted = true;
  inst.ready = true;
  if (inst.bootTimer) {
    clearInterval(inst.bootTimer);
    inst.bootTimer = 0;
  }
  _loadingTerminalIds.delete(inst.id);
  delete _loadingTimestamps[inst.id];
  delete _loadingOutputBuffer[inst.id];
  if (inst._readyResolve) {
    inst._readyResolve();
    inst._readyResolve = null;
  }
  const el = inst.bootEl;
  inst.bootEl = null;
  if (el) {
    el.classList.add('done');
    setTimeout(() => el.remove(), 260);
  }
  console.log('[CS] ready (' + reason + ') repo=' + inst.repoPath);
  if (inst.revealed) {
    getLoadingController().finish('Ready', 400);
    fitActiveTerminal();
  }
}

function startBootWatch(inst) {
  inst.bootStart = Date.now();
  inst.lastDataAt = Date.now();
  inst.bootTimer = setInterval(() => {
    if (inst.booted) {
      clearInterval(inst.bootTimer);
      inst.bootTimer = 0;
      return;
    }
    const now = Date.now();
    const since = now - inst.lastDataAt;
    const age = now - inst.bootStart;
    if (altActive(inst) && since >= BOOT_SETTLE && age > 600) {
      finishBoot(inst, 'tui');
      return;
    }
    if (age > BOOT_MIN_QUIET && since >= BOOT_QUIET && !shellPromptInst(inst)) {
      finishBoot(inst, 'quiet');
      return;
    }
    if (age > BOOT_TIMEOUT) finishBoot(inst, 'timeout');
  }, 200);
}

export async function initXterm() {
  await loadXterm();
}

export function createTerminalSession(repoPath, slotIndex = 0, opts = {}) {
  if (instances[slotIndex]) return Promise.resolve(instances[slotIndex]);
  if (_creating.has(slotIndex)) return _creating.get(slotIndex);
  const p = _createSession(repoPath, slotIndex, opts).finally(() => {
    _creating.delete(slotIndex);
  });
  _creating.set(slotIndex, p);
  return p;
}

async function _createSession(repoPath, slotIndex, opts) {
  const background = !!(opts && opts.background);
  await loadXterm();
  injectBootCss();

  const container = document.getElementById('ocTerminalContainer');
  if (!container) return null;

  const existing = _getSlotDiv(slotIndex);
  if (existing) existing.remove();

  const provider = getProvider(state.selectedProvider);

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
  const bootEl = buildBootOverlay(provider.label);
  div.appendChild(bootEl);
  if (background) {
    div.style.visibility = 'hidden';
    div.style.pointerEvents = 'none';
  }
  container.appendChild(div);
  div.addEventListener('click', () => {
    if (state.parallelMode) activateSlot(slotIndex);
  });

  if (background) {
    if (state.activeTab === repoPath) stageTerminal(true);
  } else {
    stageTerminal(false);
    showSlot(slotIndex);
  }

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

  const measurable = div.offsetWidth >= 40 && div.offsetHeight >= 40;
  if (measurable) terminal.open(div);

  terminal.write('\x1b[?25h');

  if (measurable) {
    await sleep(100);
    try {
      fitAddon.fit();
    } catch (e) {
      try { terminal.resize(initCols, initRows); } catch {}
    }
  }

  const { getSelectedShell } = await import('./sidebar.js');
  const shell = getSelectedShell();

  const result = await window.electronAPI.opencode.termSpawn({
    cwd: repoPath,
    shell: shell.cmd,
    args: shell.args,
  });

  if (!result || result.error) {
    console.warn('[CS] terminal spawn failed:', result && result.error);
    try { terminal.dispose(); } catch (_) {}
    div.remove();
    if (!background) {
      getLoadingController().hide();
      const w = document.getElementById('ocWelcome');
      const t = document.getElementById('ocTerminal');
      if (w) w.style.display = '';
      if (t) t.style.display = 'none';
    }
    return null;
  }

  const lc = getLoadingController();
  if (!background) lc.setProgress('Starting shell...', 0.35);

  const instance = {
    id: result.id,
    terminal,
    fitAddon,
    div,
    repoPath,
    slotIndex,
    ready: false,
    booted: false,
    revealed: !background,
    prewarmed: background,
    used: !background,
    opened: measurable,
    bootEl,
    bootTimer: 0,
    bootStart: Date.now(),
    lastDataAt: Date.now(),
    _readyResolve: null,
  };
  instances[slotIndex] = instance;

  terminal.onData((data) => {
    window.electronAPI.opencode.termWrite({ id: result.id, data });
  });

  terminal.onResize(({ cols, rows }) => {
    window.electronAPI.opencode.termResize({ id: result.id, cols, rows });
  });

  window.electronAPI.opencode.termResize({ id: result.id, cols: terminal.cols, rows: terminal.rows });

  if (!background) showSlot(slotIndex);

  requestAnimationFrame(() => fitActiveTerminal());

  const binaryPath = state.opencodePath || provider.bin;
  const convId = state.slotData[slotIndex]?.convId || state.activeConvId[repoPath];
  const cmd = convId ? provider.resumeCmd(convId, binaryPath) : provider.newChatCmd(binaryPath);
  window.electronAPI.opencode.termWrite({ id: result.id, data: cmd });

  if (!background) lc.advanceTo('Starting opencode...', 0.60, 400);
  _loadingTerminalIds.add(result.id);
  _loadingTimestamps[result.id] = Date.now();
  startBootWatch(instance);

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
      safeFit(inst);
      let dims = null;
      try {
        dims = inst.opened ? inst.fitAddon.proposeDimensions() : null;
      } catch (_) {
        dims = null;
      }
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
  return shellPromptInst(_findInst(repoPath, slotIndex));
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
  const maxWait = 15000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 200));
    if (!isShellPrompt(repoPath, slotIndex)) return;
  }
}

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
  if (inst.bootTimer) {
    clearInterval(inst.bootTimer);
    inst.bootTimer = 0;
  }
  delete _loadingOutputBuffer[inst.id];
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
  Object.values(instances).forEach((inst) => {
    if (!inst || !inst.fitAddon || !inst.div) return;
    if (!state.parallelMode && inst.div.style.display === 'none') return;
    requestAnimationFrame(() => safeFit(inst));
  });
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
  injectBootCss();
  window.electronAPI.opencode.onTermData(({ id, data }) => {
    let inst = null;
    for (const i of Object.values(instances)) {
      if (i && i.id === id) {
        inst = i;
        break;
      }
    }
    if (inst) inst.lastDataAt = Date.now();

    if (inst && !inst.booted) {
      const next = ((_loadingOutputBuffer[id] || '') + data).slice(-4000);
      _loadingOutputBuffer[id] = next;
      if (next.toLowerCase().includes('session not found')) {
        console.log(`[CS] session not found for terminal ${id} (repo: ${inst.repoPath}), auto-fallback to new chat`);
        const provider = getProvider(state.selectedProvider);
        const binaryPath = state.opencodePath || provider.bin;
        window.electronAPI.opencode.termWrite({ id, data: provider.newChatCmd(binaryPath) });
        state.activeConvId[inst.repoPath] = null;
        if (state.slotData[inst.slotIndex]) {
          state.slotData[inst.slotIndex].convId = null;
        }
        delete _loadingOutputBuffer[id];
        inst.bootStart = Date.now();
        setBootText(inst, 'Starting a new chat');
      }
    }

    if (_onSessionDetected) {
      const sesMatch = data.match(/ses_[a-zA-Z0-9_-]{10,}/);
      if (sesMatch) {
        const sesId = sesMatch[0];
        if (!_seenSessionIds.has(sesId)) {
          _seenSessionIds.add(sesId);
          if (inst) _onSessionDetected(sesId, inst.repoPath, inst.slotIndex);
        }
      }
    }

    if (inst) inst.terminal.write(data);
  });

  if (!_termExitHandlerSetup) {
    _termExitHandlerSetup = true;
    window.electronAPI.opencode.onTermExited(({ id, code }) => {
      console.log(`[CS] terminal exited: id=${id} code=${code}`);
      for (const [slot, inst] of Object.entries(instances)) {
        if (inst && inst.id === id) {
          console.log(`[CS] cleaning up stale instance at slot ${slot}`);
          if (inst.bootTimer) {
            clearInterval(inst.bootTimer);
            inst.bootTimer = 0;
          }
          if (_loadingTerminalIds.has(id)) {
            _loadingTerminalIds.delete(id);
            delete _loadingTimestamps[id];
          }
          delete _loadingOutputBuffer[id];
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

export function getTerminalInstances() {
  return instances;
}

function killUnusedPrewarmed(keepRepo) {
  Object.keys(instances).forEach((key) => {
    const inst = instances[key];
    if (inst && inst.prewarmed && !inst.used && inst.repoPath !== keepRepo) killSlot(Number(key));
  });
}

export function awaitPrewarm(repoPath) {
  const p = _prewarming.get(repoPath);
  return p ? p.then(() => undefined, () => undefined) : Promise.resolve();
}

export function prewarmSession(repoPath) {
  if (!repoPath || !prewarmEnabled() || state.parallelMode) return Promise.resolve(null);
  const have = _findSlotByRepoPath(repoPath);
  if (have >= 0) return Promise.resolve(instances[have]);
  if (_prewarming.has(repoPath)) return _prewarming.get(repoPath);
  const p = (async () => {
    killUnusedPrewarmed(repoPath);
    for (let i = 0; i < 15 && !(state.terminalShells && state.terminalShells.length); i++) {
      await sleep(100);
    }
    if (_findSlotByRepoPath(repoPath) >= 0) return null;
    const slot = getNextFreeSlot();
    if (slot < 0) return null;
    return createTerminalSession(repoPath, slot, { background: true });
  })()
    .catch((err) => {
      console.warn('[CS] prewarm failed:', err && err.message ? err.message : err);
      return null;
    })
    .finally(() => {
      _prewarming.delete(repoPath);
    });
  _prewarming.set(repoPath, p);
  return p;
}

export function revealTerminalForRepo(repoPath) {
  const slot = _findSlotByRepoPath(repoPath);
  if (slot < 0) return false;
  const inst = instances[slot];
  inst.revealed = true;
  inst.used = true;
  if (inst.div) {
    inst.div.style.visibility = '';
    inst.div.style.pointerEvents = '';
  }
  stageTerminal(false);
  state.activeSlotIndex = slot;
  showSlot(slot);
  return true;
}

export function isTerminalRevealed(repoPath) {
  const slot = _findSlotByRepoPath(repoPath);
  if (slot < 0) return false;
  return instances[slot].revealed !== false;
}

export function syncStage(repoPath) {
  const slot = _findSlotByRepoPath(repoPath);
  const inst = slot >= 0 ? instances[slot] : null;
  stageTerminal(!!inst && inst.revealed === false);
}

export function pickSlotForRepo(repoPath) {
  const have = _findSlotByRepoPath(repoPath);
  if (have >= 0) return have;
  if (state.parallelMode) return state.activeSlotIndex;
  const free = getNextFreeSlot();
  return free < 0 ? 0 : free;
}

export function waitForTerminalBoot(repoPath, slotIndex, timeout = 30000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const inst = _findInst(repoPath, slotIndex);
      return !inst || inst.booted || Date.now() - start > timeout;
    };
    if (check()) {
      resolve();
      return;
    }
    const iv = setInterval(() => {
      if (check()) {
        clearInterval(iv);
        resolve();
      }
    }, 120);
  });
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
    if (!instances[i] && !_creating.has(i)) return i;
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

  if (state.parallelMode && slotIndex !== prevSlot) {
    const slotData = state.slotData[slotIndex];
    if (slotData && slotData.repoPath && slotData.convId) {
      state.activeConvId[slotData.repoPath] = slotData.convId;
    }
    import('./repoTabs.js').then(m => m.renderConvList());
  }
}