const { ipcMain } = require('electron');
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

const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'build', '.cache', 'coverage', '.next', 'out'];

function countLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').length;
  } catch {
    return 0;
  }
}

function shouldIgnore(name, relativePath, extraPatterns = []) {
  if (DEFAULT_IGNORE.includes(name)) return true;
  return extraPatterns.some(p => relativePath.includes(p) || name === p);
}

function scanDirectory(rootPath, ignorePatterns = []) {
  const results = [];

  function walk(currentPath) {
    let entries;
    try { entries = fs.readdirSync(currentPath, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      if (shouldIgnore(entry.name, relativePath, ignorePatterns)) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          results.push({
            path: relativePath,
            name: entry.name,
            ext,
            lines: countLines(fullPath)
          });
        }
      }
    }
  }

  walk(rootPath);
  return results;
}

function register(shared) {
  ipcMain.handle('loc:scan', async (event, { rootPath, threshold, mode, ignorePatterns }) => {
    try {
      if (!rootPath || !fs.existsSync(rootPath)) {
        return { success: false, error: 'Invalid directory path.' };
      }

      const allFiles = scanDirectory(rootPath, ignorePatterns || []);

      const filtered = allFiles.filter(file =>
        mode === 'above' ? file.lines >= threshold : file.lines < threshold
      );

      filtered.sort((a, b) => b.lines - a.lines);

      return {
        success: true,
        files: filtered,
        total: allFiles.length,
        matched: filtered.length,
        scannedAt: new Date().toISOString()
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };