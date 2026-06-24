const { ipcMain, dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let _activeProc = null;
let _mainWindow = null;

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

function findOpencode() {
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
    try {
      execSync(`"${bin}" --version 2>${isWin ? 'nul' : '/dev/null'}`, { timeout: 3000, windowsHide: true });
      return bin;
    } catch (_) {}
  }
  return 'opencode';
}

function discover() {
  const binaryPath = findOpencode();
  let version = 'unknown';
  const isWin = process.platform === 'win32';
  try {
    version = execSync(`"${binaryPath}" --version 2>${isWin ? 'nul' : '/dev/null'}`, { encoding: 'utf-8', timeout: 3000, windowsHide: true }).trim();
  } catch (_) {}
  const dataRoot = getDataRoot();
  return { binaryPath, dataRoot, version };
}

function listViaCli(binaryPath) {
  try {
    const out = execSync(`"${binaryPath}" session list --json 2>${process.platform === 'win32' ? 'nul' : '/dev/null'}`, { encoding: 'utf-8', timeout: 10000, windowsHide: true });
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
          results.push({
            id: path.basename(entry.name, path.extname(entry.name)),
            title: entry.name.replace(/\.[^/.]+$/, ''),
            date: stat.mtime.toISOString(),
            messageCount: 0,
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
  _mainWindow = shared.getMainWindow ? shared.getMainWindow() : null;

  ipcMain.handle('opencode:discover', async () => {
    return discover();
  });

  ipcMain.handle('opencode:listConversations', async (_, { repoPath }) => {
    const { binaryPath } = discover();

    const cliResult = listViaCli(binaryPath);
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
    const { binaryPath } = discover();
    const isWin = process.platform === 'win32';

    try {
      const out = execSync(`"${binaryPath}" session export ${convId} --json 2>${isWin ? 'nul' : '/dev/null'}`, { encoding: 'utf-8', timeout: 10000, windowsHide: true });
      const data = JSON.parse(out);
      return { id: convId, messages: data.messages || data.history || [] };
    } catch (_) {}

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
    const { binaryPath } = discover();
    const args = ['run', message];

    if (continueConv) args.push('-c');
    if (files && files.length) {
      for (const f of files) args.push('--file', f);
    }

    return new Promise((resolve) => {
      const proc = spawn(binaryPath, args, {
        cwd: repoPath,
        env: { ...process.env },
        windowsHide: true,
        shell: process.platform === 'win32',
      });

      _activeProc = proc;

      proc.stdout.on('data', (chunk) => {
        if (_mainWindow && !_mainWindow.isDestroyed()) {
          _mainWindow.webContents.send('opencode:stream', { chunk: chunk.toString() });
        }
      });

      let stderrBuf = '';
      proc.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString();
        if (_mainWindow && !_mainWindow.isDestroyed()) {
          _mainWindow.webContents.send('opencode:stream', { chunk: chunk.toString(), isError: true });
        }
      });

      proc.on('close', (code) => {
        _activeProc = null;
        if (_mainWindow && !_mainWindow.isDestroyed()) {
          _mainWindow.webContents.send('opencode:done', { code, stderr: stderrBuf });
        }
        resolve({ code });
      });

      proc.on('error', (err) => {
        _activeProc = null;
        if (_mainWindow && !_mainWindow.isDestroyed()) {
          _mainWindow.webContents.send('opencode:done', { code: -1, error: err.message });
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
    const { binaryPath } = discover();
    const cliResult = listViaCli(binaryPath);
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
              if (files.length > 0) {
                repoSet.add(proj.name);
              }
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
    const { binaryPath } = discover();
    const isWin = process.platform === 'win32';
    try {
      execSync(`"${binaryPath}" session delete ${convId} 2>${isWin ? 'nul' : '/dev/null'}`, { timeout: 5000, windowsHide: true });
      return { success: true };
    } catch (_) {}

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
    const win = _mainWindow;
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }],
    });
    return result;
  });
}

module.exports = { register };
