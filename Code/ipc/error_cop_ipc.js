const { ipcMain } = require('electron');
const path = require('path');
const { getErrorEngine } = require('./terminal_ipc');

let _errorEngine = null;
let _serverStarted = false;

function register({ getMainWindow }) {
  const { ErrorEngine } = require('../terminal/error-cop/error-engine');
  _errorEngine = new ErrorEngine(getMainWindow);

  // Share the engine with terminal_ipc
  const termIpc = require('./terminal_ipc');
  termIpc.setErrorEngine(_errorEngine);

  // Sweep stale 'running' sessions every 60s
  setInterval(() => {
    try { _errorEngine.getStorage().cleanupStaleSessions(); } catch {}
  }, 60000).unref();

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

  ipcMain.handle('error-cop:getTimeline', safe((event, { project, limit, offset, startDate, endDate } = {}) => {
    return storage().getTimeline({ project, limit, offset, startDate, endDate });
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

  // ── Localhost API Server Control ──

  ipcMain.handle('error-cop:startServer', safe(async () => {
    if (_serverStarted) return { success: true, port: 3334, message: 'Already running' };
    try {
      const server = require('../errorCopServer/server');
      server.start(_errorEngine);

      // Start ecosystem watcher alongside the server (store already set by watcher_ipc)
      try {
        const watcher = require('../ecosystem-watcher');
        watcher.start();
      } catch (we) {
        console.error('[ErrorCop] Failed to start ecosystem watcher:', we.message);
      }

      _serverStarted = true;
      return { success: true, port: 3334 };
    } catch (e) {
      console.error('[ErrorCop] Failed to start API server:', e.message);
      return { success: false, error: e.message };
    }
  }));

  ipcMain.handle('error-cop:stopServer', safe(async () => {
    try {
      const server = require('../errorCopServer/server');
      server.stop();
      _serverStarted = false;
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }));

  ipcMain.handle('error-cop:serverStatus', safe(async () => {
    try {
      const server = require('../errorCopServer/server');
      const running = server.isRunning();
      return { running, port: running ? 3334 : null };
    } catch (e) {
      return { running: false, port: null, error: e.message };
    }
  }));

  // ── Cheatsheet Generation ──

  ipcMain.handle('error-cop:generateCheatsheet', safe(async (event, repoPath) => {
    const cheatsheetPath = path.join(repoPath, 'MCP', 'errorCop', 'errorcop-cheatsheet.md').replace(/\\/g, '/');
    const server = require('../errorCopServer/server');
    return server.generateCheatsheet(cheatsheetPath);
  }));

  // ── Command Runner IPC ──

  ipcMain.handle('error-cop:commandRun', safe((event, opts) => {
    return _errorEngine.getCommandRunner().run(opts);
  }));

  ipcMain.handle('error-cop:commandStop', safe((event, id) => {
    return { success: _errorEngine.getCommandRunner().stop(id) };
  }));

  ipcMain.handle('error-cop:commandList', safe(() => {
    return _errorEngine.getCommandRunner().list();
  }));

  ipcMain.handle('error-cop:commandGetStatus', safe((event, id) => {
    return _errorEngine.getCommandRunner().getStatus(id);
  }));

  ipcMain.handle('error-cop:commandGetOutput', safe((event, { id, tail }) => {
    return { id, output: _errorEngine.getCommandRunner().getOutput(id, { tail }) };
  }));

  // ── URL Tracker IPC ──

  ipcMain.handle('error-cop:urlList', safe(() => {
    return _errorEngine.getUrlTracker().getAll();
  }));

  ipcMain.handle('error-cop:urlHealthCheck', safe(async (event, port) => {
    return await _errorEngine.getUrlTracker().healthCheck(port);
  }));

  ipcMain.handle('error-cop:urlFetchTest', safe(async (event, port) => {
    return await _errorEngine.getUrlTracker().fetchTest(port);
  }));

  ipcMain.handle('error-cop:urlWaitForReady', safe(async (event, { port, timeout }) => {
    return await _errorEngine.getUrlTracker().waitForReady(port, { timeout: timeout || 30000 });
  }));
}

module.exports = { register };
