const { ipcMain, dialog } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let pty = null;
try { pty = require('node-pty'); } catch (e) { console.log('[CS-IPC] node-pty not available:', e.message); }

function execAsync(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: opts.timeout || 10000, windowsHide: true, ...opts }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
}

let _activeProc = null;
let _getMainWindow = null;
let _discoveryCache = null;

function getWin() {
  return _getMainWindow ? _getMainWindow() : null;
}

function getDataRoot() {
  const home = os.homedir();
  return path.join(home, '.local', 'share', 'opencode');
}

function getStorageDir(repoPath) {
  const dataRoot = getDataRoot();
  if (!repoPath) return path.join(dataRoot, 'project', 'global', 'storage');
  const slug = path.basename(repoPath).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  return path.join(dataRoot, 'project', slug, 'storage');
}

async function findOpencode() {
  const isWin = process.platform === 'win32';
  const commonPaths = [
    'opencode',
    ...(isWin ? [
      path.join(process.env.LOCALAPPDATA || '', 'opencode', 'opencode.exe'),
      path.join(process.env.APPDATA || '', 'npm', 'opencode'),
    ] : [
      path.join(os.homedir(), '.local', 'bin', 'opencode'),
      path.join(os.homedir(), 'go', 'bin', 'opencode'),
      '/usr/local/bin/opencode',
    ]),
  ];
  for (const bin of commonPaths) {
    const out = await execAsync(`"${bin}" --version 2>${isWin ? 'nul' : '/dev/null'}`, { timeout: 3000 });
    if (out !== null) return bin;
  }
  return 'opencode';
}

async function discover(force = false) {
  if (_discoveryCache && !force) return _discoveryCache;
  const binaryPath = await findOpencode();
  let version = 'unknown';
  const isWin = process.platform === 'win32';
  const out = await execAsync(`"${binaryPath}" --version 2>${isWin ? 'nul' : '/dev/null'}`, { timeout: 3000 });
  if (out) version = out;
  const dataRoot = getDataRoot();
  _discoveryCache = { binaryPath, dataRoot, version };
  console.log(`[CS-IPC] discover: binaryPath="${binaryPath}" version="${version}" dataRoot="${dataRoot}"`);
  return _discoveryCache;
}

async function listViaCli(binaryPath) {
  try {
    const out = await execAsync(`"${binaryPath}" session list --json 2>${process.platform === 'win32' ? 'nul' : '/dev/null'}`, { timeout: 10000 });
    if (!out) return null;
    const data = JSON.parse(out);
    if (Array.isArray(data)) return data;
    if (data.sessions && Array.isArray(data.sessions)) return data.sessions;
  } catch (_) {}
  return null;
}

function listViaStorage(storageDir, repoPath) {
  const results = [];
  if (!fs.existsSync(storageDir)) return results;
  try {
    const entries = fs.readdirSync(storageDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.session'))) {
        try {
          const filePath = path.join(storageDir, entry.name);
          const stat = fs.statSync(filePath);
          const raw = fs.readFileSync(filePath, 'utf-8');
          let title = entry.name.replace(/\.[^/.]+$/, '');
          let messageCount = 0;
          let date = stat.mtime.toISOString();
          try {
            const data = JSON.parse(raw);
            const messages = data.messages || data.history || [];
            messageCount = messages.length;
            if (data.title || data.name) title = data.title || data.name;
            if (data.date || data.createdAt || data.timestamp) date = data.date || data.createdAt || data.timestamp;
          } catch (_) {}
          results.push({
            id: path.basename(entry.name, path.extname(entry.name)),
            title,
            date,
            messageCount,
            repoPath: repoPath || '',
          });
        } catch (_) {}
      }
    }
  } catch (_) {}
  results.sort((a, b) => new Date(b.date) - new Date(a.date));
  return results;
}

function normPath(p) {
  return (p || '').replace(/\\/g, '/');
}

function register(shared) {
  // Store getter instead of cached value — window doesn't exist yet at register time
  _getMainWindow = shared.getMainWindow || null;

  ipcMain.handle('opencode:discover', async () => {
    return discover();
  });

  ipcMain.handle('opencode:listConversations', async (_, { repoPath }) => {
    const { binaryPath } = await discover();
    const cliResult = await listViaCli(binaryPath);
    if (cliResult && Array.isArray(cliResult)) {
      const np = repoPath ? normPath(repoPath) : null;
      return cliResult
        .filter(s => !np || (s.repoPath && normPath(s.repoPath) === np))
        .map(s => ({
          id: s.id || s.sessionId || '',
          title: s.title || s.name || 'Untitled',
          date: s.date || s.createdAt || s.timestamp || '',
          messageCount: s.messageCount || s.messages?.length || 0,
          repoPath: s.repoPath || '',
        }));
    }
    const storageDir = getStorageDir(repoPath);
    return listViaStorage(storageDir, repoPath);
  });

  ipcMain.handle('opencode:getConversation', async (_, { convId }) => {
    if (!convId) return null;
    const { binaryPath } = await discover();
    const isWin = process.platform === 'win32';

    const out = await execAsync(`"${binaryPath}" session export ${convId} --json 2>${isWin ? 'nul' : '/dev/null'}`, { timeout: 10000 });
    if (out) {
      try {
        const data = JSON.parse(out);
        return { id: convId, messages: data.messages || data.history || [] };
      } catch (_) {}
    }

    const dataRoot = getDataRoot();
    const candidates = [
      path.join(dataRoot, 'project', 'global', 'storage', convId + '.json'),
      path.join(dataRoot, 'project', 'global', 'storage', convId + '.session'),
    ];
    const projectDir = path.join(dataRoot, 'project');
    if (fs.existsSync(projectDir)) {
      try {
        const projects = fs.readdirSync(projectDir, { withFileTypes: true });
        for (const proj of projects) {
          if (proj.isDirectory()) {
            const storagePath = path.join(projectDir, proj.name, 'storage');
            if (fs.existsSync(storagePath)) {
              candidates.push(path.join(storagePath, convId + '.json'));
              candidates.push(path.join(storagePath, convId + '.session'));
            }
          }
        }
      } catch (_) {}
    }

    for (const fp of candidates) {
      if (fs.existsSync(fp)) {
        try {
          const raw = fs.readFileSync(fp, 'utf-8');
          const data = JSON.parse(raw);
          return { id: convId, messages: data.messages || data.history || [] };
        } catch (_) {}
      }
    }
    return null;
  });

  ipcMain.handle('opencode:run', async (_, { repoPath, message, files, continueConv }) => {
    const { binaryPath } = await discover();
    const args = ['run', '--format', 'default', message];

    if (continueConv) args.push('-c');
    if (files && files.length) {
      for (const f of files) args.push('--file', f);
    }

    console.log(`[CS-IPC] run: binary="${binaryPath}" args=${JSON.stringify(args)} cwd="${repoPath}"`);

    return new Promise((resolve) => {
      let proc;
      try {
        proc = spawn(binaryPath, args, {
          cwd: repoPath,
          env: { ...process.env },
          windowsHide: true,
          shell: process.platform === 'win32',
        });
      } catch (spawnErr) {
        console.log(`[CS-IPC] run spawn failed: ${spawnErr.message}`);
        const w = getWin();
        if (w && !w.isDestroyed()) {
          w.webContents.send('opencode:stream', { chunk: `\n[Spawn Error] ${spawnErr.message}\n`, isError: true });
          w.webContents.send('opencode:done', { code: -1, error: spawnErr.message });
        }
        resolve({ code: -1, error: spawnErr.message });
        return;
      }

      _activeProc = proc;
      console.log(`[CS-IPC] run spawned PID: ${proc.pid}`);

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const w = getWin();
        if (w && !w.isDestroyed()) {
          w.webContents.send('opencode:stream', { chunk: text });
        }
      });

      let stderrBuf = '';
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderrBuf += text;
        const w = getWin();
        if (w && !w.isDestroyed()) {
          w.webContents.send('opencode:stream', { chunk: text, isError: true });
        }
      });

      proc.on('close', (code) => {
        console.log(`[CS-IPC] close: code=${code} stderrLen=${stderrBuf.length}`);
        _activeProc = null;
        const w = getWin();
        if (w && !w.isDestroyed()) {
          if (code !== 0 && !stderrBuf) {
            w.webContents.send('opencode:stream', { chunk: `\n[Process exited with code ${code}]\n`, isError: true });
          }
          w.webContents.send('opencode:done', { code, stderr: stderrBuf });
        }
        resolve({ code });
      });

      proc.on('error', (err) => {
        console.log(`[CS-IPC] error: ${err.message}`);
        _activeProc = null;
        const w = getWin();
        if (w && !w.isDestroyed()) {
          w.webContents.send('opencode:stream', { chunk: `\n[Error] ${err.message}\n`, isError: true });
          w.webContents.send('opencode:done', { code: -1, error: err.message });
        }
        resolve({ code: -1, error: err.message });
      });
    });
  });

  ipcMain.handle('opencode:stop', async () => {
    if (_activeProc) {
      try { _activeProc.kill(); } catch (_) {}
      _activeProc = null;
    }
    return true;
  });

  ipcMain.handle('opencode:listRepos', async () => {
    const { binaryPath } = await discover();
    const cliResult = await listViaCli(binaryPath);
    if (cliResult && Array.isArray(cliResult)) {
      const repoMap = {};
      for (const s of cliResult) {
        const rp = s.repoPath || '';
        if (rp) {
          const np = normPath(rp);
          repoMap[np] = (repoMap[np] || 0) + 1;
        }
      }
      return Object.entries(repoMap).map(([repoPath, convoCount]) => ({
        repoPath,
        label: path.basename(repoPath) || repoPath,
        convoCount,
      }));
    }

    const dataRoot = getDataRoot();
    const repoSet = new Set();
    const projectDir = path.join(dataRoot, 'project');
    if (fs.existsSync(projectDir)) {
      try {
        const projects = fs.readdirSync(projectDir, { withFileTypes: true });
        for (const proj of projects) {
          if (proj.isDirectory()) {
            const storagePath = path.join(projectDir, proj.name, 'storage');
            if (fs.existsSync(storagePath)) {
              const files = fs.readdirSync(storagePath).filter(f => f.endsWith('.json') || f.endsWith('.session'));
              if (files.length > 0) repoSet.add(proj.name);
            }
          }
        }
      } catch (_) {}
    }

    return Array.from(repoSet).map(slug => ({
      repoPath: slug,
      label: slug,
      convoCount: 0,
    }));
  });

  ipcMain.handle('opencode:deleteConversation', async (_, { convId }) => {
    const { binaryPath } = await discover();
    const isWin = process.platform === 'win32';
    const out = await execAsync(`"${binaryPath}" session delete ${convId} 2>${isWin ? 'nul' : '/dev/null'}`, { timeout: 5000 });
    if (out !== null) return { success: true };

    const dataRoot = getDataRoot();
    const projectDir = path.join(dataRoot, 'project');
    if (fs.existsSync(projectDir)) {
      try {
        const projects = fs.readdirSync(projectDir, { withFileTypes: true });
        for (const proj of projects) {
          if (proj.isDirectory()) {
            const storagePath = path.join(projectDir, proj.name, 'storage');
            for (const ext of ['.json', '.session']) {
              const fp = path.join(storagePath, convId + ext);
              if (fs.existsSync(fp)) {
                fs.unlinkSync(fp);
                return { success: true };
              }
            }
          }
        }
      } catch (_) {}
    }
    return { success: false, error: 'Conversation not found' };
  });

  ipcMain.handle('opencode:selectFile', async () => {
    const win = getWin();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }],
    });
    return result;
  });

  // ── Terminal (PTY) handlers ──
  const _csTerminals = new Map();
  let _csTermNextId = 1;

  ipcMain.handle('opencode:termSpawn', async (_, { cwd, shell, args }) => {
    if (!pty) return { error: 'node-pty not available' };
    const id = _csTermNextId++;
    const resolvedCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();

    try {
      const isWin = process.platform === 'win32';
      let useShell = shell || 'powershell.exe';
      let useArgs = args && args.length ? args : [];

      if (isWin) {
        const shellMap = {
          'powershell.exe': {
            path: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
            args: ['-NoLogo', '-NoExit'],
          },
          'cmd.exe': {
            path: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'),
            args: [],
          },
          'bash.exe': { path: 'bash.exe', args: [] },
          'wsl.exe':  { path: 'wsl.exe',  args: [] },
        };
        const mapped = shellMap[useShell];
        if (mapped) {
          useShell = fs.existsSync(mapped.path) ? mapped.path : useShell;
          useArgs = mapped.args;
        }
      }

      console.log(`[CS-IPC] termSpawn: id=${id} shell="${useShell}" args=${JSON.stringify(useArgs)} cwd="${resolvedCwd}"`);

      const term = pty.spawn(useShell, useArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: resolvedCwd,
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      term.onData((data) => {
        const w = getWin();
        console.log(`[CS-IPC] termData: id=${id} len=${data.length} win=${!!w}`);
        if (w && !w.isDestroyed()) {
          w.webContents.send('opencode:termData', { id, data });
        }
      });

      term.onExit(({ exitCode }) => {
        console.log(`[CS-IPC] termExit: id=${id} code=${exitCode}`);
        const w = getWin();
        if (w && !w.isDestroyed()) {
          w.webContents.send('opencode:termData', {
            id,
            data: `\r\n\x1b[31mProcess exited (${exitCode})\x1b[0m\r\n`,
          });
        }
        _csTerminals.delete(id);
      });

      _csTerminals.set(id, { term, cwd: resolvedCwd });
      return { id, cwd: resolvedCwd };
    } catch (err) {
      console.log(`[CS-IPC] termSpawn error: ${err.message}`);
      return { error: err.message };
    }
  });

  ipcMain.handle('opencode:termWrite', (_, { id, data }) => {
    const t = _csTerminals.get(id);
    if (t) t.term.write(data);
  });

  ipcMain.handle('opencode:termResize', (_, { id, cols, rows }) => {
    const t = _csTerminals.get(id);
    if (t) t.term.resize(cols, rows);
  });

  ipcMain.handle('opencode:termKill', (_, id) => {
    const t = _csTerminals.get(id);
    if (t) {
      try { t.term.kill(); } catch {}
      _csTerminals.delete(id);
    }
  });
}

module.exports = { register };