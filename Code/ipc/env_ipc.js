const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ENV_CACHE_TTL = 30000;
const _envFileCache = new Map();

async function _getCachedEnvFiles(repoPath) {
  const cached = _envFileCache.get(repoPath);
  if (cached && Date.now() - cached.ts < ENV_CACHE_TTL) {
    return cached.files;
  }
  const found = await findEnvFiles(repoPath);
  const files = sortFiles(found.map(f => path.relative(repoPath, f)));
  _envFileCache.set(repoPath, { files, ts: Date.now() });
  return files;
}

function _invalidateEnvCache(repoPath) {
  _envFileCache.delete(repoPath);
}

const ENV_PATTERNS = [
  '.env', '.env.local', '.env.development', '.env.production',
  '.env.test', '.env.staging', '.env.sample', '.env.example',
  '.env.development.local', '.env.production.local', '.env.test.local',
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__', 'venv', '.venv', 'env', '.env']);

function isEnvFile(name) {
  const lower = name.toLowerCase();
  if (ENV_PATTERNS.includes(lower)) return true;
  if (lower.startsWith('.env.')) return true;
  return false;
}

function matchesPattern(name, pattern) {
  if (name === pattern) return true;
  if (pattern.includes('*')) {
    const reStr = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try { return new RegExp('^' + reStr + '$').test(name); } catch { return false; }
  }
  return name.startsWith(pattern);
}

function sortFiles(files) {
  return files.sort((a, b) => {
    if (a.toLowerCase() === '.env') return -1;
    if (b.toLowerCase() === '.env') return 1;
    return a.localeCompare(b);
  });
}

async function findEnvFiles(dir, depth = 0) {
  if (depth > 5) return [];
  const results = [];
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        results.push(...await findEnvFiles(full, depth + 1));
      }
    } else if (entry.isFile() && isEnvFile(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function register() {
  ipcMain.handle('env:listFiles', async (_e, { repoPath }) => {
    try {
      if (!repoPath) return { success: false, error: 'No repo path' };
      const files = await _getCachedEnvFiles(repoPath);
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('env:readFile', async (_e, { repoPath, fileName }) => {
    try {
      const fullPath = path.join(repoPath, fileName);
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      const entries = lines.map(line => {
        if (line.startsWith('#')) return { key: null, value: null, comment: line };
        if (!line.trim()) return { key: null, value: null, comment: '' };
        const idx = line.indexOf('=');
        if (idx === -1) return { key: line.trim(), value: '', comment: null };
        const key = line.slice(0, idx).trim();
        let value = line.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return { key, value, comment: null };
      });
      return { success: true, entries };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('env:saveFile', async (_e, { repoPath, fileName, entries }) => {
    try {
      const fullPath = path.join(repoPath, fileName);
      const content = entries.map(e => {
        if (e.comment !== null && e.comment !== undefined) return e.comment;
        const val = e.value.includes(' ') || e.value.includes('"') || e.value.includes("'") ? `"${e.value}"` : e.value;
        return `${e.key}=${val}`;
      }).join('\n');
      await fs.promises.writeFile(fullPath, content, 'utf-8');
      _invalidateEnvCache(repoPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('env:createFile', async (_e, { repoPath, fileName }) => {
    try {
      const fullPath = path.join(repoPath, fileName);
      try { await fs.promises.access(fullPath); return { success: false, error: 'File already exists' }; } catch {}
      await fs.promises.writeFile(fullPath, '', 'utf-8');
      _invalidateEnvCache(repoPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('env:listFilesByPattern', async (_e, { repoPath, pattern }) => {
    try {
      if (!repoPath || !pattern) return { success: false, error: 'Missing params' };
      let entries;
      try { entries = await fs.promises.readdir(repoPath, { withFileTypes: true }); }
      catch { return { success: true, files: [] }; }
      let files = entries.filter(e => e.isFile() && matchesPattern(e.name, pattern)).map(e => e.name);
      if (files.some(f => f.toLowerCase() === '.env' || f.startsWith('.env.'))) {
        files = sortFiles(files);
      } else {
        files.sort((a, b) => a.localeCompare(b));
      }
      return { success: true, files };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('env:deleteFile', async (_e, { repoPath, fileName }) => {
    try {
      const fullPath = path.join(repoPath, fileName);
      await fs.promises.unlink(fullPath);
      _invalidateEnvCache(repoPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
