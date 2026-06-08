let TerminalClass = null;
let FitAddonClass = null;
let xtermLoaded = false;

async function ensureXterm() {
  if (xtermLoaded) return;
  const xtermMod = await import('../../node_modules/@xterm/xterm/lib/xterm.mjs');
  const fitMod   = await import('../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs');
  TerminalClass = xtermMod.Terminal;
  FitAddonClass = fitMod.FitAddon;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '../../node_modules/@xterm/xterm/css/xterm.css';
  document.head.appendChild(link);

  xtermLoaded = true;
}

function getDarkTheme() {
  return {
    background: '#1a1b26',
    foreground: '#a9b1d6',
    cursor: '#c0caf5',
    cursorAccent: '#1a1b26',
    selectionBackground: '#33467c',
    black: '#1d202f',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6',
    brightBlack: '#414868',
    brightRed: '#f7768e',
    brightGreen: '#9ece6a',
    brightYellow: '#e0af68',
    brightBlue: '#7aa2f7',
    brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff',
    brightWhite: '#c0caf5',
  };
}

function getLightTheme() {
  return {
    background: '#f4f4f4',
    foreground: '#1a1a2e',
    cursor: '#1a1a2e',
    cursorAccent: '#f4f4f4',
    selectionBackground: '#d0d0d8',
    black: '#1d202f',
    red: '#d73a49',
    green: '#28a745',
    yellow: '#d29922',
    blue: '#0366d6',
    magenta: '#8b5cf6',
    cyan: '#0891b2',
    white: '#6a737d',
    brightBlack: '#959da5',
    brightRed: '#d73a49',
    brightGreen: '#28a745',
    brightYellow: '#d29922',
    brightBlue: '#0366d6',
    brightMagenta: '#8b5cf6',
    brightCyan: '#0891b2',
    brightWhite: '#f4f4f4',
  };
}

const SHELL_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M6 8l3 2-3 2M11 12h3"/></svg>';

const ICON_PLUS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>';

const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';

const ICON_CHEVRON_DOWN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8l4 4 4-4"/></svg>';

export default class TerminalUI {
  constructor() {
    this.panel = null;
    this.body = null;
    this.tabBar = null;
    this.instances = new Map();
    this.activeId = null;
    this.nextId = 1;
    this.shells = [];
    this._resizeStart = null;
    this._shellDropdown = null;
  }

  async init() {
    await ensureXterm();

    this.shells = await window.electronAPI.terminalListShells();
    if (!this.shells || this.shells.length === 0) {
      this.shells = [{ name: 'PowerShell', cmd: 'powershell.exe', args: ['-NoLogo'] }];
    }

    this._createPanel();

    window.electronAPI.onTerminalData(({ id, data }) => {
      const inst = this.instances.get(id);
      if (inst && inst.terminal) {
        inst.terminal.write(data);
      }
    });

    window.electronAPI.onTerminalExit(({ id, exitCode }) => {
      const inst = this.instances.get(id);
      if (inst) {
        inst.exitCode = exitCode;
        if (inst.terminal) {
          inst.terminal.write(`\r\n\x1b[31mProcess exited with code ${exitCode}\x1b[0m\r\n`);
        }
      }
    });

  }

  _createPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'terminal-panel';
    this.panel.id = 'terminalPanel';
    this.panel.innerHTML = `
      <div class="terminal-resize-handle"></div>
      <div class="terminal-tabs" id="terminalTabs">
        <div class="terminal-tabs-right">
          <button class="terminal-panel-close" id="terminalPanelClose" title="Close terminal panel">${ICON_CLOSE}</button>
        </div>
      </div>
      <div class="terminal-body" id="terminalBody"></div>
    `;
    document.body.appendChild(this.panel);

    this.tabBar = this.panel.querySelector('#terminalTabs');
    this.body = this.panel.querySelector('#terminalBody');
    this._resizeHandle = this.panel.querySelector('.terminal-resize-handle');

    this.panel.querySelector('#terminalPanelClose').addEventListener('click', () => this.close());

    this._initResize();
  }

  _initResize() {
    let startY, startHeight;
    const onMove = (e) => {
      const dy = startY - e.clientY;
      const newH = Math.max(100, Math.min(window.innerHeight - 100, startHeight + dy));
      this.panel.style.height = newH + 'px';
      this._fitActive();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    this._resizeHandle.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startHeight = this.panel.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  open(cwd) {
    if (this.panel.classList.contains('open')) return;
    this.panel.classList.add('open');
    this.panel.style.height = '';
    if (this.instances.size === 0) {
      this._addTerminal(cwd);
    }
    requestAnimationFrame(() => this._fitActive());
  }

  close() {
    this.panel.classList.remove('open');
  }

  isOpen() {
    return this.panel?.classList.contains('open');
  }

  openTerminalHere(folderPath) {
    this.open();
    this._addTerminal(folderPath);
  }

  async _addTerminal(cwd) {
    const id = this.nextId++;
    const defaultShell = this.shells[0];
    const shell = defaultShell;

    const inst = document.createElement('div');
    inst.className = 'terminal-instance';
    inst.id = 'terminalInst_' + id;
    this.body.appendChild(inst);

    const terminal = new TerminalClass({
      theme: document.documentElement.getAttribute('data-theme') === 'light' ? getLightTheme() : getDarkTheme(),
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
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
    tab.innerHTML = `
      <span class="terminal-tab-shell">
        <span class="terminal-tab-icon">${SHELL_ICON}</span>
        ${shell.name}
      </span>
      <span class="terminal-tab-close">${ICON_CLOSE}</span>
    `;
    tab.querySelector('.terminal-tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._killTerminal(id);
    });
    tab.addEventListener('click', () => this._activateTerminal(id));
    this.tabBar.insertBefore(tab, this.tabBar.querySelector('.terminal-tabs-right'));

    this.instances.set(id, { terminal, fitAddon, shell, tab, inst, cwd });

    try {
      const result = await window.electronAPI.terminalSpawn({
        cwd: cwd || '',
        shell: shell.cmd,
        args: shell.args,
      });
      if (result) {
        this.instances.get(id).cwd = result.cwd;
      }
    } catch (err) {
      terminal.write(`\r\n\x1b[31mFailed to spawn terminal: ${err.message}\x1b[0m\r\n`);
    }

    terminal.onData((data) => {
      window.electronAPI.terminalWrite({ id, data });
    });

    terminal.onResize(({ cols, rows }) => {
      window.electronAPI.terminalResize({ id, cols, rows });
    });

    this._activateTerminal(id);

    requestAnimationFrame(() => {
      setTimeout(() => {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          window.electronAPI.terminalResize({ id, cols: dims.cols, rows: dims.rows });
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
    requestAnimationFrame(() => this._fitActive());
  }

  _fitActive() {
    const inst = this.instances.get(this.activeId);
    if (inst && inst.fitAddon) {
      try { inst.fitAddon.fit(); } catch { }
    }
  }

  _killTerminal(id) {
    const inst = this.instances.get(id);
    if (!inst) return;

    window.electronAPI.terminalKill(id);

    inst.terminal.dispose();
    inst.inst.remove();
    inst.tab.remove();
    this.instances.delete(id);

    if (this.instances.size === 0) {
      this.close();
    } else if (this.activeId === id) {
      const next = this.instances.keys().next().value;
      this._activateTerminal(next);
    }
  }
}
