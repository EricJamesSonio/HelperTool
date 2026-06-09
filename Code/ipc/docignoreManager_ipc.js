const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const REPO_FILE = '.docignore';

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

function register(shared) {
  ipcMain.handle('docignore:get-global', async () => {
    return readFile(getGlobalPath());
  });

  ipcMain.handle('docignore:set-global', async (event, { rules }) => {
    try {
      writeFile(getGlobalPath(), rules);
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
    const filePath = path.join(repoPath, REPO_FILE);
    return readFile(filePath);
  });

  ipcMain.handle('docignore:set-repo', async (event, { repoPath, rules }) => {
    if (!repoPath) return { success: false, error: 'No repo path' };
    try {
      const filePath = path.join(repoPath, REPO_FILE);
      writeFile(filePath, rules);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
