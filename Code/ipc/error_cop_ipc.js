const { ipcMain } = require('electron');
const { getErrorEngine } = require('./terminal_ipc');

let _errorEngine = null;

function register({ getMainWindow }) {
  const { ErrorEngine } = require('../terminal/error-cop/error-engine');
  _errorEngine = new ErrorEngine(getMainWindow);

  // Start localhost API server for AI agent access
  try {
    const server = require('../errorCopServer/server');
    server.start(_errorEngine);
  } catch (e) {
    console.error('[ErrorCop] Failed to start API server:', e.message);
  }

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

  ipcMain.handle('error-cop:getErrors', safe((event, { project, level, limit, offset, startDate, endDate } = {}) => {
    return storage().getErrors({ project, level, limit, offset, startDate, endDate });
  }));

  ipcMain.handle('error-cop:getSessionErrors', safe((event, sessionId) => {
    return storage().getErrorsBySession(sessionId);
  }));

  ipcMain.handle('error-cop:getTimeline', safe((event, { project, limit, startDate, endDate } = {}) => {
    return storage().getTimeline({ project, limit, startDate, endDate });
  }));

  ipcMain.handle('error-cop:getSessions', safe((event, opts) => {
    if (typeof opts === 'number') return storage().getRecentSessions(opts);
    return storage().getSessions(opts || {});
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

  ipcMain.handle('error-cop:getAllBrowserServers', safe(() => {
    return storage().getAllBrowserServers();
  }));

  ipcMain.handle('error-cop:getSessionOccurrences', safe((event, sessionId) => {
    return storage().getOccurrencesBySession(sessionId);
  }));

  // ── Session Management ──

  ipcMain.handle('error-cop:deleteSessions', safe((event, ids) => {
    if (!Array.isArray(ids) || !ids.length) return { deleted: 0 };
    _errorEngine.deleteSessions(ids);
    return { deleted: ids.length };
  }));

  // ── Browser Collector IPC ──

  ipcMain.handle('error-cop:browserAttach', safe((event, { sessionId, port, url }) => {
    const result = _errorEngine.attachBrowser(sessionId, port, url);
    return result || { error: 'Failed to attach' };
  }));

  ipcMain.handle('error-cop:browserDetach', safe((event, port) => {
    _errorEngine.detachBrowser(port);
    return { success: true };
  }));

  ipcMain.handle('error-cop:browserDetachAll', safe(() => {
    const attached = _errorEngine.getAttachedBrowsers();
    for (const port of Object.keys(attached)) {
      _errorEngine.detachBrowser(parseInt(port, 10));
    }
    return { success: true };
  }));

  ipcMain.handle('error-cop:getAttachedBrowsers', safe(() => {
    return _errorEngine.getAttachedBrowsers();
  }));
}

module.exports = { register };
