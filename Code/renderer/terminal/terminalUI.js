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
  link.href = '../node_modules/@xterm/xterm/css/xterm.css';
  document.head.appendChild(link);

  xtermLoaded = true;
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

const ICON_SHELL = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M6 8l3 2-3 2M11 12h3"/></svg>';

const ICON_PLUS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>';

const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';

const ICON_CHEVRON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M6 8l4 4 4-4"/></svg>';

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
  }

  async init() {
    await ensureXterm();

    this.shells = await window.electronAPI.terminalListShells();
    if (!this.shells || this.shells.length === 0) {
      this.shells = [{ name: 'PowerShell', cmd: 'powershell.exe', args: ['-NoLogo'] }];
    }
    this._selectedShell = this.shells[0];

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
        <div class="terminal-tabs-left">
          <button class="terminal-tab-add" id="terminalTabAdd" title="Left-click: new terminal · Right-click: select shell">
            <span class="terminal-tab-add-icon">${ICON_PLUS}</span>
            <span class="terminal-tab-add-label">${this._selectedShell.name}</span>
            <span class="terminal-tab-add-chevron">${ICON_CHEVRON}</span>
          </button>
        </div>
        <div class="terminal-tabs-right">
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
        this._addTerminal(this._lastCwd);
      }
    });
    document.addEventListener('click', () => {
      this._shellDropdown.classList.remove('open');
    });

    this._initResize();
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
      });
      this._shellDropdown.appendChild(opt);
    });
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
    this._lastCwd = cwd || this._lastCwd;
    this.panel.classList.add('open');
    this.panel.style.height = '';
    if (this.instances.size === 0) {
      this._addTerminal(this._lastCwd);
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
    this._lastCwd = folderPath;
    this.open();
    this._addTerminal(folderPath);
  }

  async _addTerminal(cwd, shell) {
    const id = this.nextId++;
    const useShell = shell || this._selectedShell || this.shells[0];

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
        <span class="terminal-tab-icon">${ICON_SHELL}</span>
        <span class="terminal-tab-name">${useShell.name}</span>
      </span>
      <span class="terminal-tab-close">${ICON_CLOSE}</span>
    `;
    tab.querySelector('.terminal-tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._killTerminal(id);
    });
    tab.addEventListener('click', () => this._activateTerminal(id));
    this.tabBar.insertBefore(tab, this.tabBar.querySelector('.terminal-tabs-right'));

    this.instances.set(id, { terminal, fitAddon, shell: useShell, tab, inst, cwd });

    try {
      await window.electronAPI.terminalSpawn({
        cwd: cwd || '',
        shell: useShell.cmd,
        args: useShell.args,
      });
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
