const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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

function sortFiles(files) {
  return files.sort((a, b) => {
    if (a.toLowerCase() === '.env') return -1;
    if (b.toLowerCase() === '.env') return 1;
    return a.localeCompare(b);
  });
}

function findEnvFiles(dir, depth = 0) {
  if (depth > 5) return [];
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        results.push(...findEnvFiles(full, depth + 1));
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
      const found = findEnvFiles(repoPath);
      const files = found.map(f => path.relative(repoPath, f));
      return { success: true, files: sortFiles(files) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('env:readFile', async (_e, { repoPath, fileName }) => {
    try {
      const fullPath = path.join(repoPath, fileName);
      const content = fs.readFileSync(fullPath, 'utf-8');
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
      fs.writeFileSync(fullPath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('env:createFile', async (_e, { repoPath, fileName }) => {
    try {
      const fullPath = path.join(repoPath, fileName);
      if (fs.existsSync(fullPath)) return { success: false, error: 'File already exists' };
      fs.writeFileSync(fullPath, '', 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('env:deleteFile', async (_e, { repoPath, fileName }) => {
    try {
      const fullPath = path.join(repoPath, fileName);
      fs.unlinkSync(fullPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
