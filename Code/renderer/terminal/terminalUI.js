let TerminalClass = null;
let FitAddonClass = null;
import { DEFAULT_PREFERENCES } from '../defaultPreferences.js';

let themeFn = null;
let xtermLoaded = false;

const DOCK_H_KEY = 'helpertool-ide-terminal-h2';
const DOCK_H_DEFAULT = DEFAULT_PREFERENCES.ide.terminalDockHeight;
const EARLY_MAX_ENTRIES = 50;
const EARLY_MAX_CHARS = 262144;

async function ensureXterm() {
  if (xtermLoaded) return;
  const xtermMod = await import('../../node_modules/@xterm/xterm/lib/xterm.mjs');
  const fitMod   = await import('../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs');
  const enh = await import('./terminalEnhancements.js');
  TerminalClass = enh.createEnhancedTerminal(xtermMod.Terminal);
  themeFn = enh.getTerminalTheme;
  FitAddonClass = fitMod.FitAddon;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '../node_modules/@xterm/xterm/css/xterm.css';
  document.head.appendChild(link);

  xtermLoaded = true;
}

function injectRepoTabCss() {
  if (document.getElementById('termRepoTabCss')) return;
  const el = document.createElement('style');
  el.id = 'termRepoTabCss';
  el.textContent = '.terminal-tab.terminal-tab--other-repo{opacity:0.55;}.terminal-tab.terminal-tab--other-repo.active{opacity:1;}';
  document.head.appendChild(el);
}

function injectLinksCss() {
  if (document.getElementById('termLinksCss')) return;
  const link = document.createElement('link');
  link.id = 'termLinksCss';
  link.rel = 'stylesheet';
  link.href = './styles/terminal-links.css';
  document.head.appendChild(link);
}

function monoFont() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
    if (v) return v;
  } catch (_) {}
  return "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace";
}

function normRepoKey(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function repoBaseName(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
}

const ICON_SHELL = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M6 8l3 2-3 2M11 12h3"/></svg>';

const ICON_PLUS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>';

const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';

const ICON_OUTPUT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 4 16 14"/><line x1="2" y1="16" x2="18" y2="16"/></svg>';

const ICON_CHEVRON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M6 8l4 4 4-4"/></svg>';

import { showOutputViewer } from '../utils/outputViewer.js';
import ErrorCopUI from './error-cop-ui.js';
import { createColorizer } from './outputColors.js';
import { extractUrls, renderUrlBar } from './urlActions.js';
import { createEcoButton, openEcosystem, shortcutKindOf } from './ecoLink.js';

function _stripAnsiForDetection(text) {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function shellKindOf(shell) {
  const k = String((shell && shell.kind) || '').toLowerCase();
  if (k === 'powershell') return 'ps';
  if (k === 'cmd') return 'cmd';
  if (k) return 'sh';
  const s = String((shell && (shell.cmd || shell.name)) || '').toLowerCase();
  if (s.indexOf('powershell') !== -1 || s.indexOf('pwsh') !== -1) return 'ps';
  if (/(^|[\\/])cmd(\.exe)?$/.test(s) || s === 'command prompt') return 'cmd';
  return 'sh';
}

export default class TerminalUI {
  constructor() {
    this.panel = null;
    this.body = null;
    this.tabBar = null;
    this.instances = new Map();
    this.activeId = null;
    this.nextId = 1;
    this.shells = [];
    this._lastCwd = '';
    this._selectedShell = null;
    this._addBtn = null;
    this._addLabel = null;
    this._shellDropdown = null;
    this._errorCop = new ErrorCopUI();
    this._firstDataDeferred = new Map();
    this._docked = false;
    this._resizeObs = null;
    this._repoPending = new Map();
    this._ecoBtn = null;
    this._mainToLocal = new Map();
    this._closedMain = new Set();
    this._early = new Map();
  }

  async init() {
    await ensureXterm();
    injectRepoTabCss();
    injectLinksCss();

    this.shells = await window.electronAPI.terminalListShells();
    if (!this.shells || this.shells.length === 0) {
      this.shells = [{ name: 'PowerShell', cmd: 'powershell.exe', args: ['-NoLogo'], kind: 'powershell' }];
    }
    this._selectedShell = this.shells[0];

    this._errorCop.init();

    this._createPanel();

    window.electronAPI.onTerminalReady(({ id }) => {
      if (this._closedMain.has(id)) return;
      const local = this._mainToLocal.get(id);
      if (local == null) {
        this._earlyFor(id).ready = true;
        return;
      }
      this._resolveFirst(local);
    });

    window.electronAPI.onTerminalData(({ id, data }) => {
      if (this._closedMain.has(id)) return;
      const local = this._mainToLocal.get(id);
      if (local == null) {
        const e = this._earlyFor(id);
        if (e.size < EARLY_MAX_CHARS) {
          e.chunks.push(data);
          e.size += data.length;
        }
        return;
      }
      this._deliverData(local, data);
    });

    window.electronAPI.onTerminalExit(({ id, exitCode }) => {
      if (this._closedMain.has(id)) return;
      const local = this._mainToLocal.get(id);
      if (local == null) {
        this._earlyFor(id).exit = { exitCode };
        return;
      }
      this._deliverExit(local, exitCode);
    });

  }

  _earlyFor(mainId) {
    let e = this._early.get(mainId);
    if (!e) {
      if (this._early.size >= EARLY_MAX_ENTRIES) {
        const oldest = this._early.keys().next().value;
        this._early.delete(oldest);
      }
      e = { ready: false, chunks: [], size: 0, exit: null };
      this._early.set(mainId, e);
    }
    return e;
  }

  _resolveFirst(localId) {
    const d = this._firstDataDeferred.get(localId);
    if (d) {
      d.resolve();
      this._firstDataDeferred.delete(localId);
    }
  }

  _deliverData(localId, data) {
    const inst = this.instances.get(localId);
    if (inst && inst.terminal) {
      inst.terminal.write(inst.colorizer ? inst.colorizer.process(data) : data);
      this._detectUrls(inst, data);
    }
    this._resolveFirst(localId);
  }

  _deliverExit(localId, exitCode) {
    const inst = this.instances.get(localId);
    if (!inst) return;
    inst.exited = true;
    if (inst.terminal) {
      inst.terminal.write(`\r\n\x1b[31mProcess exited with code ${exitCode}\x1b[0m\r\n`);
    }
  }

  _bindMain(localId, mainId) {
    if (mainId == null) return;
    this._mainToLocal.set(mainId, localId);
    const early = this._early.get(mainId);
    if (!early) return;
    this._early.delete(mainId);
    if (early.ready) this._resolveFirst(localId);
    for (const chunk of early.chunks) this._deliverData(localId, chunk);
    if (early.exit) this._deliverExit(localId, early.exit.exitCode);
  }

  _activeRepo() {
    return window.__activeRepoPath || this._lastCwd || '';
  }

  _newInActiveRepo(shell) {
    const repo = this._activeRepo();
    if (repo) this._lastCwd = repo;
    return this._addTerminal(repo, shell || null, repo || null);
  }

  _createPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'terminal-panel';
    this.panel.id = 'terminalPanel';
    this.panel.innerHTML = `
      <div class="terminal-resize-handle"></div>
      <div class="terminal-tabs" id="terminalTabs">
        <div class="terminal-tabs-left">
          <button class="terminal-tab-add" id="terminalTabAdd" title="Left-click: new terminal in the active repo \u00b7 Right-click: select shell">
            <span class="terminal-tab-add-icon">${ICON_PLUS}</span>
            <span class="terminal-tab-add-label">${this._selectedShell.name}</span>
            <span class="terminal-tab-add-chevron">${ICON_CHEVRON}</span>
          </button>
        </div>
        <div class="terminal-tabs-right">
          <div style="position:relative;display:inline-flex" id="ecpTerminalBtnContainer"></div>
          <button class="terminal-view-output" id="terminalViewOutput" title="View terminal output in modal">${ICON_OUTPUT} Output</button>
          <button class="terminal-panel-close" id="terminalPanelClose" title="Close terminal panel">${ICON_CLOSE}</button>
        </div>
      </div>
      <div class="terminal-body" id="terminalBody"></div>
      <div class="terminal-shell-dropdown" id="terminalShellDropdown"></div>
    `;
    document.body.appendChild(this.panel);

    this.tabBar = this.panel.querySelector('#terminalTabs');
    this.body = this.panel.querySelector('#terminalBody');
    this._resizeHandle = this.panel.querySelector('.terminal-resize-handle');

    this.panel.querySelector('#terminalPanelClose').addEventListener('click', () => this.close());
    this.panel.querySelector('#terminalViewOutput').addEventListener('click', () => this._viewTerminalOutput());

    const ecpContainer = this.panel.querySelector('#ecpTerminalBtnContainer');
    const ecpBtn = this._errorCop.createTerminalButton(() => {
      const cur = this.instances.get(this.activeId);
      return cur ? cur.sessionId : null;
    });
    ecpBtn.appendChild(this._errorCop.getBadgeEl());
    ecpContainer.appendChild(ecpBtn);

    this._ecoBtn = createEcoButton(() => this._openEcosystem());
    this.panel.querySelector('.terminal-tabs-right').insertBefore(this._ecoBtn, ecpContainer);

    this._addBtn = this.panel.querySelector('#terminalTabAdd');
    this._addLabel = this.panel.querySelector('.terminal-tab-add-label');
    this._shellDropdown = this.panel.querySelector('#terminalShellDropdown');
    this._buildShellDropdown();

    this._addBtn.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (e.target.closest('.terminal-tab-add-chevron')) {
        this._openDropdown();
      } else {
        this._newInActiveRepo();
      }
    });
    this._addBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openDropdown();
    });
    document.addEventListener('click', () => {
      this._shellDropdown.classList.remove('open');
    });

    this._initResize();

    if (typeof ResizeObserver === 'function') {
      let raf = 0;
      this._resizeObs = new ResizeObserver(() => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (this.isOpen()) this._fitActive();
        });
      });
      this._resizeObs.observe(this.body);
    }
  }

  _openDropdown() {
    this._shellDropdown.classList.toggle('open');
    if (this._shellDropdown.classList.contains('open')) {
      const rect = this._addBtn.getBoundingClientRect();
      this._shellDropdown.style.left = rect.left + 'px';
      this._shellDropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    }
  }

  _buildShellDropdown() {
    this._shellDropdown.innerHTML = '';
    this.shells.forEach((s) => {
      const opt = document.createElement('button');
      opt.className = 'terminal-shell-option';
      opt.innerHTML = `
        <span class="terminal-shell-option-icon">${ICON_SHELL}</span>
        <span class="terminal-shell-option-label">${s.name}</span>
      `;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this._shellDropdown.classList.remove('open');
        this._selectedShell = s;
        this._addLabel.textContent = s.name;
        this._newInActiveRepo(s);
      });
      this._shellDropdown.appendChild(opt);
    });
  }

  _initResize() {
    let startY, startHeight;
    const maxHeight = () => {
      if (this._docked && this.panel.parentElement) {
        return Math.max(160, this.panel.parentElement.clientHeight - 140);
      }
      return window.innerHeight - 100;
    };
    const onMove = (e) => {
      const dy = startY - e.clientY;
      const newH = Math.max(100, Math.min(maxHeight(), startHeight + dy));
      this.panel.style.height = newH + 'px';
      this._fitActive();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      if (this._docked) {
        try { localStorage.setItem(DOCK_H_KEY, String(Math.round(this.panel.offsetHeight))); } catch (_) {}
      }
    };
    this._resizeHandle.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startHeight = this.panel.offsetHeight;
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  _applyHeight() {
    if (!this.panel) return;
    if (!this._docked) {
      this.panel.style.height = '';
      return;
    }
    let h = 0;
    try { h = parseInt(localStorage.getItem(DOCK_H_KEY) || '', 10); } catch (_) {}
    if (!(h >= 120)) h = DOCK_H_DEFAULT;
    h = Math.min(h, Math.max(160, window.innerHeight - 220));
    this.panel.style.height = h + 'px';
  }

  _refreshTheme() {
    if (!themeFn) return;
    const theme = themeFn();
    this.instances.forEach((inst) => {
      try { inst.terminal.options.theme = theme; } catch (_) {}
    });
  }

  _showPanel() {
    if (this.panel.classList.contains('open')) return;
    this._applyHeight();
    this.panel.classList.add('open');
    this._refreshTheme();
  }

  isDocked() {
    return !!this._docked;
  }

  dockInto(host, before) {
    if (!this.panel || !host) return;
    if (before && before.parentNode === host) host.insertBefore(this.panel, before);
    else host.appendChild(this.panel);
    this.panel.classList.add('terminal-panel--docked');
    this._docked = true;
    this._applyHeight();
    requestAnimationFrame(() => this._fitActive());
  }

  undock() {
    if (!this.panel) return;
    this.panel.classList.remove('open');
    this.panel.classList.remove('terminal-panel--docked');
    this.panel.style.height = '';
    document.body.appendChild(this.panel);
    this._docked = false;
  }

  _markRepoTabs() {
    const current = normRepoKey(this._lastCwd);
    for (const inst of this.instances.values()) {
      const base = inst.repo || inst.cwd;
      if (!base || !inst.tab) continue;
      const k = normRepoKey(base);
      const mine = !current || k === current || k.indexOf(current + '/') === 0;
      inst.tab.classList.toggle('terminal-tab--other-repo', !mine);
      const name = repoBaseName(base);
      inst.tab.title = (name ? name + ' - ' : '') + String(base);
    }
  }

  _disposeForeign(repoPath) {
    if (!repoPath) return;
    this._lastCwd = repoPath;
    this._markRepoTabs();
  }

  async _ensureRepoTerminal(repoPath) {
    if (!repoPath || !this.panel) return;
    const key = normRepoKey(repoPath);
    for (const [id, inst] of this.instances) {
      if (inst.repo && normRepoKey(inst.repo) === key) {
        this._activateTerminal(id);
        return;
      }
    }
    if (this._repoPending.has(key)) return this._repoPending.get(key);
    const p = this._addTerminal(repoPath, null, repoPath).finally(() => {
      this._repoPending.delete(key);
    });
    this._repoPending.set(key, p);
    return p;
  }

  async syncRepo(repoPath) {
    if (!repoPath || !this.panel) return;
    this._lastCwd = repoPath;
    const wasOpen = this.isOpen();
    this._disposeForeign(repoPath);
    if (!wasOpen) return;
    this._showPanel();
    await this._ensureRepoTerminal(repoPath);
    requestAnimationFrame(() => this._fitActive());
  }

  open(cwd) {
    if (this.panel.classList.contains('open')) return;
    this._lastCwd = cwd || this._lastCwd;
    if (cwd) this._disposeForeign(cwd);
    this._showPanel();
    if (cwd) {
      this._ensureRepoTerminal(cwd);
    } else if (this.instances.size === 0) {
      this._newInActiveRepo();
    }
    requestAnimationFrame(() => this._fitActive());
  }

  close() {
    this.panel.classList.remove('open');
  }

  isOpen() {
    return this.panel?.classList.contains('open');
  }

  hasTabWithLabel(label) {
    if (!this.tabBar) return false;
    const names = this.tabBar.querySelectorAll('.terminal-tab-name');
    return Array.from(names).some(el => el.textContent.trim() === label);
  }

  killTerminalByLabel(label) {
    for (const [id, inst] of this.instances) {
      const nameEl = inst.tab?.querySelector('.terminal-tab-name');
      if (nameEl && nameEl.textContent.trim() === label) {
        this._killTerminal(id);
        return true;
      }
    }
    return false;
  }

  openTerminalHere(folderPath) {
    this._showPanel();
    this._addTerminal(folderPath, null, this._activeRepo() || null);
  }

  async _openCommandTerminal(cwd, label, command, shortcut) {
    this._showPanel();
    const id = this.nextId++;
    const useShell = this._selectedShell || this.shells[0];
    await this._addTerminalInstance(id, cwd, useShell, label || `${useShell.name} ${id}`);
    const inst = this.instances.get(id);
    if (inst && shortcut) {
      inst.shortcut = {
        kind: shortcutKindOf(label),
        cwd: cwd || '',
        command: command || '',
        label: label || '',
      };
      this._syncEcoButton();
    }
    if (command && inst && inst.mainId != null) {
      const d = this._firstDataDeferred.get(id);
      if (d) {
        try { await d.promise; } catch { return id; }
      }
      await window.electronAPI.terminalWrite({ id: inst.mainId, data: command + '\r' });
    }
    return id;
  }

  async openTerminal(cwd, label, command) {
    this._lastCwd = cwd;
    const asShortcut = !!command && !!shortcutKindOf(label);
    return this._openCommandTerminal(cwd, label, command, asShortcut);
  }

  async openShortcutTerminal(cwd, label, command) {
    return this._openCommandTerminal(cwd, label, command, true);
  }

  updateLastCwd(cwd) {
    this._lastCwd = cwd || this._lastCwd;
  }

  async _addTerminal(cwd, shell, repo) {
    const id = this.nextId++;
    const useShell = shell || this._selectedShell || this.shells[0];
    let owner = repo || null;
    if (!owner && cwd && this._lastCwd && normRepoKey(cwd) === normRepoKey(this._lastCwd)) {
      owner = cwd;
    }
    const label = owner ? `${useShell.name} \u00b7 ${repoBaseName(owner)}` : undefined;
    await this._addTerminalInstance(id, cwd, useShell, label, owner);
    this._markRepoTabs();
  }

  async _addTerminalInstance(id, cwd, useShell, label, repo) {
    label = label || `${useShell.name} ${id}`;

    const inst = document.createElement('div');
    inst.className = 'terminal-instance';
    inst.id = 'terminalInst_' + id;
    inst.innerHTML += `<button class="terminal-instance-output-btn" title="View full output">${ICON_OUTPUT}</button>`;
    inst.querySelector('.terminal-instance-output-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._viewTerminalOutputById(id);
    });
    const urlBar = document.createElement('div');
    urlBar.className = 'terminal-url-bar';
    urlBar.id = 'terminalUrlBar_' + id;
    inst.appendChild(urlBar);
    this.body.appendChild(inst);

    const terminal = new TerminalClass({
      fontSize: 13,
      fontFamily: monoFont(),
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: false,
      scrollback: 5000,
      tabStopWidth: 4,
      minimumContrastRatio: 4.5,
    });

    const fitAddon = new FitAddonClass();
    terminal.loadAddon(fitAddon);
    terminal.open(inst);

    const tab = document.createElement('button');
    tab.className = 'terminal-tab';
    tab.dataset.terminalId = id;
    if (cwd) tab.title = cwd;
    tab.innerHTML = `
      <span class="terminal-tab-shell">
        <span class="terminal-tab-icon">${ICON_SHELL}</span>
        <span class="terminal-tab-name">${label}</span>
      </span>
      <span class="terminal-tab-close">${ICON_CLOSE}</span>
    `;
    tab.querySelector('.terminal-tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._killTerminal(id);
    });
    tab.addEventListener('click', () => this._activateTerminal(id));
    this.tabBar.insertBefore(tab, this.tabBar.querySelector('.terminal-tabs-right'));

    let sessionId = null;
    let mainId = null;
    const deferred = {};
    deferred.promise = new Promise((resolve, reject) => {
      deferred.resolve = resolve;
      deferred.reject = reject;
      setTimeout(() => {
        if (this._firstDataDeferred.get(id) === deferred) {
          this._firstDataDeferred.delete(id);
          resolve();
        }
      }, 5000);
    });
    deferred.promise.catch(() => {});
    this._firstDataDeferred.set(id, deferred);
    let spawnFailed = false;
    try {
      const result = await window.electronAPI.terminalSpawn({
        cwd: cwd || '',
        shell: useShell.cmd,
        args: useShell.args,
        kind: useShell.kind || '',
        label,
      });
      if (result && result.error) throw new Error(result.error);
      if (result) {
        sessionId = result.sessionId || null;
        mainId = result.id != null ? result.id : null;
      }
    } catch (err) {
      spawnFailed = true;
      terminal.write(`\r\n\x1b[31m${err.message}\x1b[0m\r\n`);
      if (this._firstDataDeferred.get(id) === deferred) {
        this._firstDataDeferred.delete(id);
        deferred.reject(err);
      }
    }

    this.instances.set(id, {
      terminal,
      fitAddon,
      shell: useShell,
      tab,
      inst,
      cwd,
      repo: repo || null,
      sessionId,
      mainId,
      exited: spawnFailed,
      discoveredUrls: new Set(),
      urlTail: '',
      shortcut: null,
      colorizer: createColorizer(),
    });

    this._bindMain(id, mainId);

    terminal.onData((data) => {
      if (mainId == null) return;
      window.electronAPI.terminalWrite({ id: mainId, data });
    });

    terminal.onResize(({ cols, rows }) => {
      if (mainId == null) return;
      window.electronAPI.terminalResize({ id: mainId, cols, rows });
    });

    this._activateTerminal(id);

    requestAnimationFrame(() => {
      setTimeout(() => {
        try { fitAddon.fit(); } catch (_) {}
        const dims = fitAddon.proposeDimensions();
        if (dims && mainId != null) {
          window.electronAPI.terminalResize({ id: mainId, cols: dims.cols, rows: dims.rows });
        }
      }, 50);
    });
  }

  _activateTerminal(id) {
    this.activeId = id;
    this.instances.forEach((inst, i) => {
      inst.tab.classList.toggle('active', i === id);
      inst.inst.classList.toggle('active', i === id);
    });
    this._syncEcoButton();
    requestAnimationFrame(() => this._fitActive());
  }

  _syncEcoButton() {
    if (!this._ecoBtn) return;
    const inst = this.instances.get(this.activeId);
    const on = !!(inst && inst.shortcut);
    this._ecoBtn.hidden = !on;
    if (on) {
      const name = inst.shortcut.label || 'this terminal';
      this._ecoBtn.title = 'Ecosystem Tool for ' + name + ' - logs, API calls and errors';
    }
  }

  async _openEcosystem() {
    const inst = this.instances.get(this.activeId);
    if (!inst || !inst.shortcut) return;
    const termId = inst.mainId != null ? inst.mainId : this.activeId;
    try {
      await openEcosystem(inst.shortcut, termId);
    } catch (err) {
      console.error('[Terminal] ecosystem open failed:', err);
    }
  }

  _fitActive() {
    const inst = this.instances.get(this.activeId);
    if (inst && inst.fitAddon) {
      try { inst.fitAddon.fit(); } catch { }
    }
  }

  _readTerminalBuffer(inst) {
    if (!inst || !inst.terminal) return '';
    const buf = inst.terminal.buffer.active;
    const totalLines = buf.baseY + buf.cursorY + 1;
    const lines = [];
    for (let i = 0; i < totalLines; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString());
    }
    return lines.join('\n');
  }

  _detectLastCommand(content) {
    if (!content) return '';
    const lines = content.split('\n');
    const promptPatterns = [
      /[#$>]\s+(\S.*)$/,
      /PS[^>]*>\s*(\S.*)$/i,
      /[A-Z]:\\.*>(\s*\S.*)$/i,
    ];
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = _stripAnsiForDetection(lines[i]);
      for (const pattern of promptPatterns) {
        const m = line.match(pattern);
        if (m && m[1].trim()) {
          return m[1].trim();
        }
      }
    }
    return '';
  }

  _parseBufferToEntries(content) {
    if (!content) return [];
    const rawLines = content.split('\n');
    const promptPatterns = [
      /^[#$>]\s+(\S.*)$/,
      /^PS[^>]*>\s*(\S.*)$/i,
      /^[A-Z]:\\.*>\s*(\S.*)$/i,
    ];
    const entries = [];
    let currentCmd = '';
    let currentOut = '';
    for (let i = 0; i < rawLines.length; i++) {
      const raw = rawLines[i];
      const clean = _stripAnsiForDetection(raw).trimEnd();
      let matched = false;
      for (const pat of promptPatterns) {
        const m = clean.match(pat);
        if (m) {
          if (currentCmd) {
            entries.push({ command: currentCmd, output: currentOut.replace(/\n+$/, '') });
          }
          currentCmd = m[1].trim();
          currentOut = '';
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (currentCmd) {
          currentOut += (currentOut ? '\n' : '') + raw;
        }
      }
    }
    if (currentCmd) {
      entries.push({ command: currentCmd, output: currentOut.replace(/\n+$/, '') });
    }
    return entries;
  }

  _viewTerminalOutputById(id) {
    const inst = this.instances.get(id);
    const content = this._readTerminalBuffer(inst);
    if (!content) return;
    const shellName = inst?.shell?.name || 'Terminal';
    const command = this._detectLastCommand(content);
    const entries = this._parseBufferToEntries(content);
    if (entries.length > 0) {
      showOutputViewer({
        title: `${shellName} \u2014 Output`,
        entries,
        language: 'terminal'
      });
    } else {
      showOutputViewer({
        title: `${shellName} \u2014 Output`,
        content,
        command: command || undefined,
        language: 'terminal'
      });
    }
  }

  _viewTerminalOutput() {
    this._viewTerminalOutputById(this.activeId);
  }

  _killTerminal(id, quiet) {
    const inst = this.instances.get(id);
    if (!inst) return;

    if (inst.mainId != null) {
      this._closedMain.add(inst.mainId);
      this._mainToLocal.delete(inst.mainId);
      window.electronAPI.terminalKill(inst.mainId);
    }
    this._firstDataDeferred.delete(id);

    inst.terminal.dispose();
    inst.inst.remove();
    inst.tab.remove();
    this.instances.delete(id);
    this._syncEcoButton();

    if (quiet) return;

    if (this.instances.size === 0) {
      this.close();
    } else if (this.activeId === id) {
      const next = this.instances.keys().next().value;
      this._activateTerminal(next);
    }
  }

  _detectUrls(inst, data) {
    const fresh = extractUrls(inst, data);
    if (fresh.length) this._renderUrlBar(inst);
  }

  _renderUrlBar(inst) {
    const bar = inst.inst.querySelector('.terminal-url-bar');
    if (!bar) return;
    renderUrlBar(bar, inst.discoveredUrls, {
      onView: (url) => this._viewHere(url, inst),
      onExternal: (url) => window.electronAPI.openExternal(url),
    });
  }

  async _viewHere(url, inst) {
    const nameEl = inst && inst.tab ? inst.tab.querySelector('.terminal-tab-name') : null;
    const title = nameEl ? nameEl.textContent.trim() : '';
    try {
      const mod = await import('../ideMode/browserPane.js');
      if (mod.show({ url, title })) return;
    } catch (err) {
      console.error('[Terminal] browser pane failed:', err);
    }
    window.electronAPI.openExternal(url);
  }
}

TerminalUI.prototype.runCommand = async function runCommand(repoPath, build) {
  if (!this.panel || typeof build !== 'function') return false;
  if (repoPath) this._lastCwd = repoPath;
  this._showPanel();
  for (const eid of Array.from(this.instances.keys())) {
    const dead = this.instances.get(eid);
    if (dead && dead.exited) this._killTerminal(eid, true);
  }
  let id = this.activeId;
  let inst = this.instances.get(id);
  let created = false;
  if (!inst) {
    if (repoPath) await this._ensureRepoTerminal(repoPath);
    else await this._newInActiveRepo();
    id = this.activeId;
    inst = this.instances.get(id);
    created = true;
  }
  if (!inst || inst.mainId == null) return false;
  if (created) {
    const d = this._firstDataDeferred.get(id);
    if (d) {
      try { await d.promise; } catch (_) {}
    }
  }
  const cmd = build(shellKindOf(inst.shell));
  if (!cmd) return false;
  this._activateTerminal(id);
  await window.electronAPI.terminalWrite({ id: inst.mainId, data: cmd + '\r' });
  try { inst.terminal.focus(); } catch (_) {}
  return true;
};
const _origInit = TerminalUI.prototype.init;
TerminalUI.prototype.init = async function init() {
  await _origInit.call(this);
  document.addEventListener('ide:theme-changed', () => {
    requestAnimationFrame(() => this._refreshTheme());
  });
};

const _origDock = TerminalUI.prototype.dockInto;
TerminalUI.prototype.dockInto = function dockInto(host, before) {
  _origDock.call(this, host, before);
  requestAnimationFrame(() => this._refreshTheme());
};

const _origUndock = TerminalUI.prototype.undock;
TerminalUI.prototype.undock = function undock() {
  _origUndock.call(this);
  requestAnimationFrame(() => this._refreshTheme());
};