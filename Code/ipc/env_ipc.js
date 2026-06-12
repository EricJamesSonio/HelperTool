const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ENV_PATTERNS = [
  '.env', '.env.local', '.env.development', '.env.production',
  '.env.test', '.env.staging', '.env.sample', '.env.example'
];

function register() {
  ipcMain.handle('env:listFiles', async (_e, { repoPath }) => {
    try {
      if (!repoPath) return { success: false, error: 'No repo path' };
      const files = fs.readdirSync(repoPath).filter(f => {
        if (ENV_PATTERNS.includes(f)) return true;
        if (f.startsWith('.env.')) return true;
        return false;
      }).sort((a, b) => {
        if (a === '.env') return -1;
        if (b === '.env') return 1;
        return a.localeCompare(b);
      });
      return { success: true, files };
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
