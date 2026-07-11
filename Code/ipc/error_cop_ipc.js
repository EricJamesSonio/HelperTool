const { ipcMain } = require('electron');
const { getErrorEngine } = require('./terminal_ipc');

let _errorEngine = null;

function register({ getMainWindow }) {
  const { ErrorEngine } = require('../terminal/error-cop/error-engine');
  _errorEngine = new ErrorEngine(getMainWindow);

  // Share the engine with terminal_ipc
  const termIpc = require('./terminal_ipc');
  termIpc.setErrorEngine(_errorEngine);

  const storage = () => _errorEngine.getStorage();
  const notify = () => _errorEngine.getNotify();

  ipcMain.handle('error-cop:getErrors', (event, { project, level, limit, offset } = {}) => {
    return storage().getErrors({ project, level, limit, offset });
  });

  ipcMain.handle('error-cop:getSessionErrors', (event, sessionId) => {
    return storage().getErrorsBySession(sessionId);
  });

  ipcMain.handle('error-cop:getTimeline', (event, { project, limit } = {}) => {
    return storage().getTimeline({ project, limit });
  });

  ipcMain.handle('error-cop:getSessions', (event, limit) => {
    return storage().getRecentSessions(limit);
  });

  ipcMain.handle('error-cop:getSession', (event, id) => {
    return storage().getSession(id);
  });

  ipcMain.handle('error-cop:markRead', () => {
    notify().resetUnreadCount();
    return { success: true };
  });

  ipcMain.handle('error-cop:getUnreadCount', () => {
    return { count: notify().getUnreadCount() };
  });

  ipcMain.handle('error-cop:getBrowserServers', (event, sessionId) => {
    return storage().getBrowserServers(sessionId);
  });
}

module.exports = { register };
