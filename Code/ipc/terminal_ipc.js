const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let _pty = null;
function getPty() {
  if (!_pty) {
    try { _pty = require('node-pty'); } catch (e) { console.error('[Terminal] node-pty not available:', e.message); }
  }
  return _pty;
}

const terminals = new Map();
const _outputBuffers = new Map();
let nextId = 1;

let _errorEngine = null;

function setErrorEngine(engine) {
  _errorEngine = engine;
}

function getErrorEngine() {
  return _errorEngine;
}

let _shellCache = null;

async function detectShells() {
  if (_shellCache) return _shellCache;
  const shells = [];
  const isWin = process.platform === 'win32';

  if (isWin) {
    shells.push({ name: 'PowerShell', cmd: 'powershell.exe', args: ['-NoLogo'] });
    const candidates = [
      { name: 'Command Prompt', cmd: 'cmd.exe',             args: [] },
      { name: 'Git Bash',    cmd: 'bash.exe',               args: ['--login'] },
    ];
    if (process.env.WINDIR) {
      const sysDir = path.join(process.env.WINDIR, 'System32');
      const wowDir = path.join(process.env.WINDIR, 'SysWOW64');
      for (const s of candidates) {
        if (fs.existsSync(path.join(sysDir, s.cmd)) || fs.existsSync(path.join(wowDir, s.cmd))) {
          shells.push(s);
        }
      }
    }
    if (process.env.LOCALAPPDATA) {
      const gitBash = path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe');
      if (fs.existsSync(gitBash)) {
        if (!shells.find(s => s.name === 'Git Bash')) {
          shells.push({ name: 'Git Bash', cmd: gitBash, args: ['--login'] });
        }
      }
    }
    try {
      const { exec } = require('child_process');
      await new Promise((resolve) => {
        exec('where wsl.exe', { timeout: 3000 }, (err, stdout) => {
          if (!err && stdout.trim()) {
            shells.push({ name: 'WSL / Ubuntu', cmd: 'wsl.exe', args: ['--cd', '~'] });
          }
          resolve();
        });
      });
    } catch { }
  } else {
    const candidates = [
      { name: 'bash', cmd: 'bash', args: ['--login'] },
      { name: 'zsh',  cmd: 'zsh',  args: ['--login'] },
      { name: 'sh',   cmd: 'sh',   args: [] },
    ];
    for (const s of candidates) {
      try {
        const { exec } = require('child_process');
        await new Promise((resolve) => {
          exec(`which ${s.cmd}`, { timeout: 3000 }, (err) => {
            if (!err) shells.push(s);
            resolve();
          });
        });
      } catch { }
    }
    if (shells.length === 0) shells.push({ name: 'sh', cmd: 'sh', args: [] });
  }
  _shellCache = shells;
  return shells;
}

const _dataListeners = new Map();
const _exitListeners = new Map();

function addDataListener(id, cb) {
  if (!_dataListeners.has(id)) _dataListeners.set(id, new Set());
  _dataListeners.get(id).add(cb);
}

function removeDataListener(id, cb) {
  const s = _dataListeners.get(id);
  if (s) { s.delete(cb); if (s.size === 0) _dataListeners.delete(id); }
}

function addExitListener(id, cb) {
  if (!_exitListeners.has(id)) _exitListeners.set(id, new Set());
  _exitListeners.get(id).add(cb);
}

function removeExitListener(id, cb) {
  const s = _exitListeners.get(id);
  if (s) { s.delete(cb); if (s.size === 0) _exitListeners.delete(id); }
}

function killTerminal(id) {
  const t = terminals.get(id);
  if (t) {
    try { t.term.kill(); } catch (e) { /* ignore */ }
    terminals.delete(id);
    _outputBuffers.delete(id);
  }
}

function getTerminalBuffer(id) {
  var buf = _outputBuffers.get(id);
  return buf ? buf.join('') : '';
}

function register({ getMainWindow }) {
  if (!getPty()) {
    console.error('[Terminal] node-pty not available — terminal feature disabled');
    return;
  }

  ipcMain.handle('terminal:listShells', () => detectShells());

  ipcMain.handle('terminal:spawn', (event, { cwd, shell, args, label }) => {
    const id = nextId++;
    const win = getMainWindow();
    const defaultCwd = cwd || os.homedir();
    const resolvedCwd = defaultCwd && fs.existsSync(defaultCwd) ? defaultCwd : os.homedir();

    const env = Object.assign({}, process.env);
    const term = getPty().spawn(shell, args || [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolvedCwd,
      env,
    });

    // ── Error Cop: Create session ──
    let sessionId = null;
    if (_errorEngine) {
      try {
        const session = _errorEngine.createSession({ cwd: resolvedCwd, shell, command: '', label });
        sessionId = session.sessionId;
      } catch (e) {
        console.error('[ErrorCop] createSession failed:', e);
      }
    }

    term.onData((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:data', { id, data });

        // ── Buffer output for backfill ──
        var buf = _outputBuffers.get(id);
        if (buf) {
          buf.push(data);
          if (buf.length > 200) buf.shift();
        }

        // ── Error Cop: Process output ──
        if (_errorEngine && sessionId) {
          try {
            _errorEngine.processOutput(sessionId, data);
          } catch (e) {
            console.error('[ErrorCop] processOutput failed:', e);
          }
        }

        // ── Ecosystem Tool: data listeners ──
        const dls = _dataListeners.get(id);
        if (dls) dls.forEach(function (cb) { try { cb(data); } catch (e) { /* ignore */ } });
      }
    });

    term.onExit(({ exitCode, signal }) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:exit', { id, exitCode, signal });
      }
      // ── Error Cop: End session ──
      if (_errorEngine && sessionId) {
        try {
          _errorEngine.endSession(sessionId, exitCode);
        } catch (e) {
          console.error('[ErrorCop] endSession failed:', e);
        }
      }

      // ── Ecosystem Tool: exit listeners ──
      const els = _exitListeners.get(id);
      if (els) els.forEach(function (cb) { try { cb(exitCode, signal); } catch (e) { /* ignore */ } });
      _exitListeners.delete(id);
      _dataListeners.delete(id);
      _outputBuffers.delete(id);
      terminals.delete(id);
    });

    terminals.set(id, { term, cwd: resolvedCwd, shell, sessionId });
    _outputBuffers.set(id, []);
    return { id, cwd: resolvedCwd, sessionId };
  });

  ipcMain.handle('terminal:write', (event, { id, data }) => {
    const t = terminals.get(id);
    if (t) t.term.write(data);
  });

  ipcMain.handle('terminal:resize', (event, { id, cols, rows }) => {
    const t = terminals.get(id);
    if (t && cols > 0 && rows > 0) t.term.resize(cols, rows);
  });

  ipcMain.handle('terminal:kill', (event, id) => {
    const t = terminals.get(id);
    if (t) {
      try { t.term.kill(); } catch (e) { console.error('[Terminal] kill error:', e); }
      terminals.delete(id);
    }
  });

  ipcMain.handle('terminal:hasRunningInRepo', async (event, repoPath) => {
    if (!repoPath) return { running: false, count: 0 };
    const count = [...terminals.values()].filter(t => t.cwd && t.cwd.startsWith(repoPath)).length;
    return { running: count > 0, count };
  });
}

module.exports = { register, setErrorEngine, getErrorEngine, addDataListener, removeDataListener, addExitListener, removeExitListener, killTerminal, getTerminalBuffer };
