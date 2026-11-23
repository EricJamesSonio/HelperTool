const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

let _pty = null;
function nodeCapMB() {
  try {
    const cfg = require('../config/config.js').readConfig();
    const mb = Number(cfg && cfg.perf && cfg.perf.nodeMemMB) || 0;
    return mb >= 256 ? Math.floor(mb) : 0;
  } catch (_) {
    return 0;
  }
}

function withNodeCap(opts) {
  const mb = nodeCapMB();
  if (!mb) return opts;
  const env = Object.assign({}, (opts && opts.env) || process.env);
  const cur = String(env.NODE_OPTIONS || '');
  if (/--max-old-space-size/.test(cur)) return opts;
  env.NODE_OPTIONS = (cur + ' --max-old-space-size=' + mb).trim();
  return Object.assign({}, opts, { env });
}

// Build a shell environment that does not depend on how the app was launched.
// Vars injected by npm, Electron, editors and Windows Terminal are dropped so
// dev and installed runs behave the same.
const LAUNCH_ONLY_ENV = /^(npm_|ELECTRON_|VSCODE_|OPENCODE_|CLAUDE_|INIT_CWD$|NODE_ENV$|PSExecutionPolicyPreference$|__COMPAT_LAYER$|TERM$|COLORTERM$|TERM_PROGRAM$|TERM_PROGRAM_VERSION$|WT_SESSION$|WT_PROFILE_ID$|FORCE_COLOR$|NO_COLOR$)/i;

function terminalEnv() {
  const env = {};
  for (const key of Object.keys(process.env)) {
    if (!LAUNCH_ONLY_ENV.test(key)) env[key] = process.env[key];
  }
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.FORCE_COLOR = '1';
  return env;
}
function getPty() {
  if (!_pty) {
    try {
      const real = require('node-pty');
      _pty = Object.assign({}, real, {
        spawn: (shell, args, opts) => real.spawn(shell, args, withNodeCap(opts)),
      });
    } catch (e) {
      console.error('[Terminal] node-pty not available:', e.message);
    }
  }
  return _pty;
}

const FLUSH_MS = 12;
const FLUSH_BYTES = 65536;
const BACKFILL_BYTES = 262144;

const terminals = new Map();
const _outputBuffers = new Map();
const _pending = new Map();
let nextId = 1;

let _errorEngine = null;

function setErrorEngine(engine) {
  _errorEngine = engine;
}

function getErrorEngine() {
  return _errorEngine;
}

let _shellCache = null;

function runCmd(cmd, opts) {
  return new Promise((resolve) => {
    try {
      exec(cmd, Object.assign({ timeout: 3000, windowsHide: true }, opts || {}), (err, stdout) => {
        resolve({ err, stdout: stdout || '' });
      });
    } catch (e) {
      resolve({ err: e, stdout: '' });
    }
  });
}

async function whereAll(name) {
  const res = await runCmd('where ' + name);
  if (res.err) return [];
  return String(res.stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function isSystemBash(p) {
  return /[\\/]windows[\\/](system32|syswow64|sysnative)[\\/]/i.test(p) || /[\\/]windowsapps[\\/]/i.test(p);
}

async function findGitBash() {
  const env = process.env;
  const roots = [env.ProgramFiles, env.ProgramW6432, env['ProgramFiles(x86)']].filter(Boolean);
  const list = [];
  for (const r of roots) {
    list.push(path.join(r, 'Git', 'bin', 'bash.exe'));
    list.push(path.join(r, 'Git', 'usr', 'bin', 'bash.exe'));
  }
  if (env.LOCALAPPDATA) {
    list.push(path.join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'));
    list.push(path.join(env.LOCALAPPDATA, 'Programs', 'Git', 'usr', 'bin', 'bash.exe'));
  }
  list.push(path.join(os.homedir(), 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe'));
  for (const p of list) {
    if (fs.existsSync(p) && !isSystemBash(p)) return p;
  }
  const gits = await whereAll('git');
  for (const g of gits) {
    let dir = path.dirname(g);
    for (let i = 0; i < 3; i++) {
      const cand = path.join(dir, 'bin', 'bash.exe');
      if (fs.existsSync(cand) && !isSystemBash(cand)) return cand;
      dir = path.dirname(dir);
    }
  }
  const bashes = await whereAll('bash.exe');
  for (const b of bashes) {
    if (!isSystemBash(b) && fs.existsSync(b)) return b;
  }
  return '';
}

async function listWslDistros() {
  const sysDir = process.env.WINDIR ? path.join(process.env.WINDIR, 'System32') : '';
  if (sysDir && !fs.existsSync(path.join(sysDir, 'wsl.exe'))) return [];
  const res = await runCmd('wsl.exe -l -q', { encoding: 'buffer', timeout: 4000 });
  if (res.err) return [];
  const text = Buffer.from(res.stdout).toString('utf8').replace(/\0/g, '');
  const names = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9._-]+$/.test(s))
    .filter((s) => !/^docker-desktop/i.test(s));
  return names;
}

async function detectWindowsShells() {
  const shells = [];
  shells.push({ name: 'PowerShell', cmd: 'powershell.exe', args: ['-NoLogo'], kind: 'powershell' });
  const pwshList = await whereAll('pwsh.exe');
  if (pwshList.length) {
    shells.push({ name: 'PowerShell 7', cmd: pwshList[0], args: ['-NoLogo'], kind: 'powershell' });
  }
  const sysDir = process.env.WINDIR ? path.join(process.env.WINDIR, 'System32') : '';
  if (!sysDir || fs.existsSync(path.join(sysDir, 'cmd.exe'))) {
    shells.push({ name: 'Command Prompt', cmd: 'cmd.exe', args: [], kind: 'cmd' });
  }
  const gitBash = await findGitBash();
  if (gitBash) {
    shells.push({ name: 'Git Bash', cmd: gitBash, args: ['--login', '-i'], kind: 'gitbash' });
  }
  const distros = await listWslDistros();
  if (distros.length) {
    shells.push({ name: 'WSL', cmd: 'wsl.exe', args: [], kind: 'wsl' });
  }
  return shells;
}

async function detectPosixShells() {
  const shells = [];
  const candidates = [
    { name: 'bash', cmd: 'bash', args: ['--login'], kind: 'posix' },
    { name: 'zsh', cmd: 'zsh', args: ['--login'], kind: 'posix' },
    { name: 'sh', cmd: 'sh', args: [], kind: 'posix' },
  ];
  for (const s of candidates) {
    const res = await runCmd('which ' + s.cmd);
    if (!res.err) shells.push(s);
  }
  if (shells.length === 0) shells.push({ name: 'sh', cmd: 'sh', args: [], kind: 'posix' });
  return shells;
}

async function detectShells() {
  if (_shellCache) return _shellCache;
  const shells = process.platform === 'win32' ? await detectWindowsShells() : await detectPosixShells();
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

function pushBackfill(id, text) {
  const b = _outputBuffers.get(id);
  if (!b) return;
  b.chunks.push(text);
  b.size += text.length;
  while (b.size > BACKFILL_BYTES && b.chunks.length > 1) {
    b.size -= b.chunks.shift().length;
  }
}

function flushPending(id, win) {
  const p = _pending.get(id);
  if (!p) return;
  if (p.timer) {
    clearTimeout(p.timer);
    p.timer = 0;
  }
  _pending.delete(id);
  if (!p.data) return;
  pushBackfill(id, p.data);
  if (win && !win.isDestroyed()) {
    win.webContents.send('terminal:data', { id, data: p.data });
  }
}

function queueData(id, win, data) {
  let p = _pending.get(id);
  if (!p) {
    p = { data: '', timer: 0 };
    _pending.set(id, p);
  }
  p.data += data;
  if (p.data.length >= FLUSH_BYTES) {
    flushPending(id, win);
    return;
  }
  if (!p.timer) {
    p.timer = setTimeout(() => flushPending(id, win), FLUSH_MS);
  }
}

function dropPending(id) {
  const p = _pending.get(id);
  if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  _pending.delete(id);
}

function killTerminal(id) {
  const t = terminals.get(id);
  if (t) {
    try { t.term.kill(); } catch (e) { /* ignore */ }
    terminals.delete(id);
    _outputBuffers.delete(id);
    dropPending(id);
  }
}

function getTerminalBuffer(id) {
  const b = _outputBuffers.get(id);
  const p = _pending.get(id);
  return (b ? b.chunks.join('') : '') + (p ? p.data : '');
}

function register({ getMainWindow }) {
  if (!getPty()) {
    console.error('[Terminal] node-pty not available - terminal feature disabled');
    return;
  }

  ipcMain.handle('terminal:listShells', () => detectShells());

  ipcMain.handle('terminal:spawn', async (event, opts) => {
    const { cwd, shell, args, label, kind } = opts || {};
    const win = getMainWindow();
    const defaultCwd = cwd || os.homedir();
    const resolvedCwd = defaultCwd && fs.existsSync(defaultCwd) ? defaultCwd : os.homedir();

    let shellCmd = shell;
    let shellArgs = Array.isArray(args) ? args : [];
    let shellKind = kind || '';
    if (!shellCmd || (path.isAbsolute(shellCmd) && !fs.existsSync(shellCmd))) {
      const list = await detectShells();
      const fallback = list[0];
      if (!fallback) return { error: 'No shell is available on this machine.' };
      shellCmd = fallback.cmd;
      shellArgs = fallback.args || [];
      shellKind = fallback.kind || '';
    }

    const env = terminalEnv();
    if (shellKind === 'gitbash') {
      env.CHERE_INVOKING = '1';
      env.MSYSTEM = 'MINGW64';
    }

    let term;
    try {
      term = getPty().spawn(shellCmd, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: resolvedCwd,
        env,
      });
    } catch (e) {
      console.error('[Terminal] spawn failed:', e);
      return { error: 'Could not start ' + (label || shellCmd) + ': ' + (e && e.message ? e.message : String(e)) };
    }

    const id = nextId++;

    let sessionId = null;
    if (_errorEngine) {
      try {
        const session = _errorEngine.createSession({ cwd: resolvedCwd, shell: shellCmd, command: '', label });
        sessionId = session.sessionId;
      } catch (e) {
        console.error('[ErrorCop] createSession failed:', e);
      }
    }

    _outputBuffers.set(id, { chunks: [], size: 0 });

    term.onData((data) => {
      if (!win || win.isDestroyed()) return;

      queueData(id, win, data);

      if (_errorEngine && sessionId) {
        try {
          _errorEngine.processOutput(sessionId, data);
        } catch (e) {
          console.error('[ErrorCop] processOutput failed:', e);
        }
      }

      const dls = _dataListeners.get(id);
      if (dls) dls.forEach(function (cb) { try { cb(data); } catch (e) { /* ignore */ } });
    });

    term.onExit(({ exitCode, signal }) => {
      flushPending(id, win);
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:exit', { id, exitCode, signal });
      }
      if (_errorEngine && sessionId) {
        try {
          _errorEngine.endSession(sessionId, exitCode);
        } catch (e) {
          console.error('[ErrorCop] endSession failed:', e);
        }
      }

      const els = _exitListeners.get(id);
      if (els) els.forEach(function (cb) { try { cb(exitCode, signal); } catch (e) { /* ignore */ } });
      _exitListeners.delete(id);
      _dataListeners.delete(id);
      _outputBuffers.delete(id);
      dropPending(id);
      terminals.delete(id);
    });

    terminals.set(id, { term, cwd: resolvedCwd, shell: shellCmd, sessionId, hasInput: false });
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:ready', { id });
    }
    return { id, cwd: resolvedCwd, sessionId, shell: shellCmd, kind: shellKind };
  });

  ipcMain.handle('terminal:write', (event, { id, data }) => {
    const t = terminals.get(id);
    if (t && typeof data === 'string') {
      t.term.write(data);
      if (!t.hasInput && /[\r\n]/.test(data)) t.hasInput = true;
    }
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
      _outputBuffers.delete(id);
      dropPending(id);
    }
  });

  ipcMain.handle('terminal:hasRunningInRepo', async (event, repoPath) => {
    if (!repoPath) return { running: false, count: 0 };
    const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const root = norm(repoPath);
    const count = [...terminals.values()].filter((t) => {
      if (!t.hasInput || !t.cwd) return false;
      const c = norm(t.cwd);
      return c === root || c.indexOf(root + '/') === 0;
    }).length;
    return { running: count > 0, count };
  });
}

module.exports = { register, setErrorEngine, getErrorEngine, addDataListener, removeDataListener, addExitListener, removeExitListener, killTerminal, getTerminalBuffer };