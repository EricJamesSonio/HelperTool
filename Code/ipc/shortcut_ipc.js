const { ipcMain } = require('electron');
const path = require('path');

function normalizeCwd(cwd, repoPath) {
  if (!cwd) return repoPath || '';
  return path.isAbsolute(cwd) ? path.normalize(cwd) : path.resolve(repoPath, cwd);
}

function register({ config }) {
  ipcMain.handle('shortcut:getConfig', (_, repoPath) => {
    if (!repoPath) return null;
    const cfg = config.readConfig();
    const shortcuts = cfg.projects?.[repoPath]?.shortcuts;
    if (!shortcuts) return null;
    const result = {};
    for (const [type, s] of Object.entries(shortcuts)) {
      result[type] = { ...s, cwd: normalizeCwd(s.cwd, repoPath) };
    }
    return result;
  });

  ipcMain.handle('shortcut:setConfig', (_, { repoPath, type, cwd, command }) => {
    if (!repoPath) return false;
    const cfg = config.readConfig();
    if (!cfg.projects) cfg.projects = {};
    if (!cfg.projects[repoPath]) cfg.projects[repoPath] = {};
    if (!cfg.projects[repoPath].shortcuts) cfg.projects[repoPath].shortcuts = {};
    cfg.projects[repoPath].shortcuts[type] = { cwd: normalizeCwd(cwd, repoPath), command };
    config.writeConfig(cfg);
    return true;
  });
}

module.exports = { register };
