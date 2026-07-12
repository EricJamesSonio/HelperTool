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

  const safe = (fn) => {
    return async (...args) => {
      try { return await fn(...args); }
      catch (e) { console.error('[ErrorCop] IPC error:', e); return []; }
    };
  };

  ipcMain.handle('error-cop:getErrors', safe((event, { project, level, limit, offset } = {}) => {
    return storage().getErrors({ project, level, limit, offset });
  }));

  ipcMain.handle('error-cop:getSessionErrors', safe((event, sessionId) => {
    return storage().getErrorsBySession(sessionId);
  }));

  ipcMain.handle('error-cop:getTimeline', safe((event, { project, limit } = {}) => {
    return storage().getTimeline({ project, limit });
  }));

  ipcMain.handle('error-cop:getSessions', safe((event, limit) => {
    return storage().getRecentSessions(limit);
  }));

  ipcMain.handle('error-cop:getSession', safe((event, id) => {
    return storage().getSession(id);
  }));

  ipcMain.handle('error-cop:markRead', safe(() => {
    notify().resetUnreadCount();
    return { success: true };
  }));

  ipcMain.handle('error-cop:getUnreadCount', safe(() => {
    return { count: notify().getUnreadCount() };
  }));

  ipcMain.handle('error-cop:getBrowserServers', safe((event, sessionId) => {
    return storage().getBrowserServers(sessionId);
  }));
}

module.exports = { register };
