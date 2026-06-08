const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let pty = null;
try { pty = require('node-pty'); } catch { }

const terminals = new Map();
let nextId = 1;

function detectShells() {
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
      const wslCheck = require('child_process').execSync('where wsl.exe 2>nul', { encoding: 'utf8' }).trim();
      if (wslCheck) {
        shells.push({ name: 'WSL / Ubuntu', cmd: 'wsl.exe', args: ['--cd', '~'] });
      }
    } catch { }
  } else {
    const candidates = [
      { name: 'bash', cmd: 'bash', args: ['--login'] },
      { name: 'zsh',  cmd: 'zsh',  args: ['--login'] },
      { name: 'sh',   cmd: 'sh',   args: [] },
    ];
    for (const s of candidates) {
      try {
        require('child_process').execSync(`which ${s.cmd} 2>/dev/null`, { encoding: 'utf8' });
        shells.push(s);
      } catch { }
    }
    if (shells.length === 0) shells.push({ name: 'sh', cmd: 'sh', args: [] });
  }
  return shells;
}

function register({ getMainWindow }) {
  if (!pty) {
    console.error('[Terminal] node-pty not available — terminal feature disabled');
    return;
  }

  ipcMain.handle('terminal:listShells', () => detectShells());

  ipcMain.handle('terminal:spawn', (event, { cwd, shell, args }) => {
    const id = nextId++;
    const win = getMainWindow();
    const defaultCwd = cwd || os.homedir();
    const resolvedCwd = defaultCwd && fs.existsSync(defaultCwd) ? defaultCwd : os.homedir();

    const env = Object.assign({}, process.env);
    const term = pty.spawn(shell, args || [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolvedCwd,
      env,
    });

    term.onData((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:data', { id, data });
      }
    });

    term.onExit(({ exitCode, signal }) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:exit', { id, exitCode, signal });
      }
      terminals.delete(id);
    });

    terminals.set(id, { term, cwd: resolvedCwd, shell });
    return { id, cwd: resolvedCwd };
  });

  ipcMain.handle('terminal:write', (event, { id, data }) => {
    const t = terminals.get(id);
    if (t) t.term.write(data);
  });

  ipcMain.handle('terminal:resize', (event, { id, cols, rows }) => {
    const t = terminals.get(id);
    if (t) t.term.resize(cols, rows);
  });

  ipcMain.handle('terminal:kill', (event, id) => {
    const t = terminals.get(id);
    if (t) {
      try { t.term.kill(); } catch { }
      terminals.delete(id);
    }
  });
}

module.exports = { register };
