const { ipcMain } = require('electron');

function register({ config }) {
  ipcMain.handle('shortcut:getConfig', (_, repoPath) => {
    if (!repoPath) return null;
    const cfg = config.readConfig();
    const project = cfg.projects?.[repoPath];
    return project?.shortcuts || null;
  });

  ipcMain.handle('shortcut:setConfig', (_, { repoPath, type, cwd, command }) => {
    if (!repoPath) return false;
    const cfg = config.readConfig();
    if (!cfg.projects) cfg.projects = {};
    if (!cfg.projects[repoPath]) cfg.projects[repoPath] = {};
    if (!cfg.projects[repoPath].shortcuts) cfg.projects[repoPath].shortcuts = {};
    cfg.projects[repoPath].shortcuts[type] = { cwd, command };
    config.writeConfig(cfg);
    return true;
  });
}

module.exports = { register };
