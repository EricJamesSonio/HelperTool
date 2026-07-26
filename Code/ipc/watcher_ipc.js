'use strict';

const { ipcMain } = require('electron');

const _ecoStore = require('../ecoStore');
const _ecoTool = require('../ecoTool');

let _store = null;
let _filter = null;
let _initialized = false;

function _init() {
  if (_initialized) return true;
  try {
    const { getErrorCopDb, save } = require('../database/errorCopDb');
    const { createEventStore } = require('../ecosystem-watcher/store/event-store');
    const { createFilter } = require('../ecosystem-watcher/query/filter');
    const watcherSession = require('../ecosystem-watcher/session');

    _store = createEventStore({ db: getErrorCopDb(), save: save });
    watcherSession.setStore(_store);
    const watcher = require('../ecosystem-watcher');
    watcher.setStore(_store);
    _filter = createFilter(_store, watcherSession);
    _initialized = true;
    return true;
  } catch (e) {
    return false;
  }
}

function safe(fn) {
  return async function () {
    _init();
    try { return await fn.apply(this, arguments); }
    catch (e) {
      console.error('[WatcherIPC] Error:', e.message);
      return { success: false, error: e.message };
    }
  };
}

function _wirePushHandler(getMainWindow) {
  try {
    const watcher = require('../ecosystem-watcher');
    watcher.setPushHandler(function (event) {
      const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
      if (win && !win.isDestroyed()) {
        try { win.webContents.send('watcher:event', event); } catch (e) { /* ignore */ }
      }
    });
  } catch (e) {
    console.warn('[WatcherIPC] Push handler not wired:', e.message);
  }
}

function _ensureWatcherStarted() {
  try {
    const watcher = require('../ecosystem-watcher');
    if (!watcher.isRunning()) watcher.start();
  } catch (e) {
    console.warn('[WatcherIPC] Could not start watcher:', e.message);
  }
}

function register(getMainWindow) {
  // Start watcher early so Health shows Running even if DB init hasn't finished
  _ensureWatcherStarted();
  const inited = _init();
  if (inited) _wirePushHandler(getMainWindow);

  ipcMain.handle('watcher:query', safe(async function (_, opts) {
    return _filter.filter(opts || {});
  }));

  ipcMain.handle('watcher:feed', safe(async function (_, opts) {
    return _filter.getFeed(opts || {});
  }));

  ipcMain.handle('watcher:sessionDetail', safe(async function (_, sessionId) {
    const watcher = require('../ecosystem-watcher');
    return watcher.getSessionDetail(sessionId);
  }));

  ipcMain.handle('watcher:timeline', safe(async function (_, sessionId, limit) {
    const result = _filter.getSessionTimeline(sessionId, limit || 100);
    return { success: true, data: result.events, meta: result.meta };
  }));

  ipcMain.handle('watcher:summary', safe(async function (_, sessionId) {
    return _filter.getSessionSummary(sessionId);
  }));

  ipcMain.handle('watcher:sessions', safe(async function () {
    const sessions = require('../ecosystem-watcher/session');
    return { success: true, data: sessions.listSessions() };
  }));

  ipcMain.handle('watcher:snapshot', safe(async function (_, sessionId) {
    const sessions = require('../ecosystem-watcher/session');
    const { getSnapshot } = require('../errorCopServer/routes/watcher');
    return getSnapshot(sessionId);
  }));

  ipcMain.handle('watcher:health', safe(async function () {
    const watcher = require('../ecosystem-watcher');
    if (!watcher.isRunning()) watcher.start();
    return watcher.getHealth();
  }));

  // ─── Process Runner IPC ───

  ipcMain.handle('watcher:runCommand', safe(async function (_, opts) {
    const runner = require('../ecosystem-watcher/capture/process-runner');
    return runner.run(opts || {});
  }));

  ipcMain.handle('watcher:stopCommand', safe(async function (_, runnerId) {
    const runner = require('../ecosystem-watcher/capture/process-runner');
    return runner.stop(runnerId);
  }));

  ipcMain.handle('watcher:commandStatus', safe(async function (_, runnerId) {
    const runner = require('../ecosystem-watcher/capture/process-runner');
    const status = runner.getStatus(runnerId);
    return { success: true, data: status };
  }));

  ipcMain.handle('watcher:commandOutput', safe(async function (_, { runnerId, tail }) {
    const runner = require('../ecosystem-watcher/capture/process-runner');
    return runner.getOutput(runnerId, tail);
  }));

  ipcMain.handle('watcher:commandList', safe(async function () {
    const runner = require('../ecosystem-watcher/capture/process-runner');
    return runner.list();
  }));

  // ─── URL Monitor IPC ───

  ipcMain.handle('watcher:urlRegister', safe(async function (_, opts) {
    const urlMonitor = require('../ecosystem-watcher/capture/url-monitor');
    return urlMonitor.register(opts || {});
  }));

  ipcMain.handle('watcher:urlUnregister', safe(async function (_, port) {
    const urlMonitor = require('../ecosystem-watcher/capture/url-monitor');
    return urlMonitor.unregister(port);
  }));

  ipcMain.handle('watcher:urlList', safe(async function () {
    const urlMonitor = require('../ecosystem-watcher/capture/url-monitor');
    return urlMonitor.list();
  }));

  ipcMain.handle('watcher:urlHealthHistory', safe(async function (_, { port, limit }) {
    const urlMonitor = require('../ecosystem-watcher/capture/url-monitor');
    return urlMonitor.getHealthHistory(port, limit);
  }));

  // ─── Ecosystem Tool IPC ───

  ipcMain.handle('eco:feed', safe(async function (_, type, cursor) {
    return _ecoStore.feed(type, cursor);
  }));

  ipcMain.handle('eco:clear', safe(async function (_, type) {
    _ecoStore.clear(type);
    return { success: true };
  }));

  ipcMain.handle('eco:run', safe(async function (_, path, command) {
    return _ecoTool.start(path, command);
  }));

  ipcMain.handle('eco:stop', safe(async function () {
    return _ecoTool.stop();
  }));

  ipcMain.handle('eco:status', safe(async function () {
    return _ecoTool.getStatus();
  }));
}

module.exports = { register };
