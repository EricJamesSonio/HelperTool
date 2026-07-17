const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const REPO_FILE = '.docignore';
const CACHE_TTL = 30000;
const _globalCache = { data: null, ts: 0 };
const _repoCaches = new Map();

function getGlobalPath() {
  const userData = require('electron').app.getPath('userData');
  return path.join(userData, 'global-docignore.json');
}

function readFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(s => typeof s === 'string');
  } catch {
    return [];
  }
}

function writeFile(filePath, rules) {
  if (!Array.isArray(rules)) throw new Error('Rules must be an array');
  for (const r of rules) {
    if (typeof r !== 'string') throw new Error(`Invalid rule: ${JSON.stringify(r)}`);
  }
  fs.writeFileSync(filePath, JSON.stringify(rules, null, 2), 'utf8');
}

function _getCached(path, cache) {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) return cache.data;
  cache.data = readFile(path);
  cache.ts = Date.now();
  return cache.data;
}

function register(shared) {
  ipcMain.handle('docignore:get-global', async () => {
    return _getCached(getGlobalPath(), _globalCache);
  });

  ipcMain.handle('docignore:set-global', async (event, { rules }) => {
    try {
      writeFile(getGlobalPath(), rules);
      _globalCache.data = null; _globalCache.ts = 0;
      if (shared && shared.docignoreUtils && shared.docignoreUtils.loadGlobalIgnoreRules) {
        shared.docignoreUtils.loadGlobalIgnoreRules(true);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('docignore:get-repo', async (event, { repoPath }) => {
    if (!repoPath) return [];
    let cache = _repoCaches.get(repoPath);
    if (!cache) { cache = { data: null, ts: 0 }; _repoCaches.set(repoPath, cache); }
    const filePath = path.join(repoPath, REPO_FILE);
    return _getCached(filePath, cache);
  });

  ipcMain.handle('docignore:set-repo', async (event, { repoPath, rules }) => {
    if (!repoPath) return { success: false, error: 'No repo path' };
    try {
      const filePath = path.join(repoPath, REPO_FILE);
      writeFile(filePath, rules);
      _repoCaches.delete(repoPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
