const { ipcMain } = require('electron');
const path = require('path');

function register({ config }) {
  ipcMain.handle('shortcut:getConfig', (_, repoPath) => {
    if (!repoPath) return null;
    const cfg = config.readConfig();
    const project = cfg.projects?.[repoPath];
    return project?.shortcuts || null;
  });

  ipcMain.handle('shortcut:setConfig', (_, { repoPath, type, cwd, command }) => {
    if (!repoPath) return false;
    const resolvedCwd = path.isAbsolute(cwd) ? cwd : path.resolve(repoPath, cwd);
    const cfg = config.readConfig();
    if (!cfg.projects) cfg.projects = {};
    if (!cfg.projects[repoPath]) cfg.projects[repoPath] = {};
    if (!cfg.projects[repoPath].shortcuts) cfg.projects[repoPath].shortcuts = {};
    cfg.projects[repoPath].shortcuts[type] = { cwd: resolvedCwd, command };
    config.writeConfig(cfg);
    return true;
  });
}

module.exports = { register };
