const { ipcMain, shell } = require('electron');
const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTENSIONS = [
  '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
  '.css', '.scss', '.less', '.sass',
  '.html', '.htm',
  '.json', '.yaml', '.yml',
  '.py', '.rb', '.php', '.java', '.cs', '.go', '.rs', '.cpp', '.c', '.h',
  '.sh', '.bash', '.zsh',
  '.md', '.txt'
];

const DEFAULT_IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.cache', 'coverage', '.next', 'out']);

async function countLines(filePath) {
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    let count = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') count++;
    }
    return content.length > 0 ? count + 1 : 0;
  } catch {
    return 0;
  }
}

async function scanDirectory(rootPath, docignoreUtils) {
  const results = [];

  async function walk(currentPath) {
    let entries;
    try { entries = await fsp.readdir(currentPath, { withFileTypes: true }); }
    catch { return; }

    const dirs = [];
    const files = [];

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (DEFAULT_IGNORE.has(entry.name)) continue;
      if (docignoreUtils?.isIgnored(fullPath, rootPath)) continue;
      if (entry.isDirectory()) {
        dirs.push(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(rootPath, fullPath);
        files.push({ fullPath, name: entry.name, relativePath });
      }
    }

    await Promise.all(dirs.map(d => walk(d)));

    const BATCH = 50;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(async (f) => {
        const ext = path.extname(f.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.includes(ext)) return null;
        const lines = await countLines(f.fullPath);
        return { path: f.relativePath, name: f.name, ext, lines };
      }));
      for (const r of batchResults) {
        if (r) results.push(r);
      }
    }
  }

  await walk(rootPath);
  return results;
}

function register({ docignoreUtils }) {
  ipcMain.handle('loc:scan', async (event, { rootPath, threshold, mode }) => {
    try {
      if (!rootPath || !fs.existsSync(rootPath)) {
        return { success: false, error: 'Invalid directory path.' };
      }
      await docignoreUtils.getIgnoreRules(rootPath);
      const allFiles = await scanDirectory(rootPath, docignoreUtils);
      const filtered = allFiles.filter(file =>
        mode === 'above' ? file.lines >= threshold : file.lines < threshold
      );
      filtered.sort((a, b) => b.lines - a.lines);
      return {
        success: true, files: filtered, total: allFiles.length,
        matched: filtered.length, scannedAt: new Date().toISOString()
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('loc:openFile', async (event, filePath) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
