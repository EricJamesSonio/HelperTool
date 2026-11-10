'use strict';

const { ipcMain } = require('electron');

const INDEXER_FLAGS = ['symbolIndex', 'codebbaseChat', 'codebaseMap', 'graphify'];
const DEFAULT_AFTER_SEC = 60;
const BUSY_RETRY_MS = 15000;

let _win = null;
let _attached = false;
let _timer = null;
let _asleep = false;
let _gmailPolling = false;
let _gmailPaused = false;
const _handlers = new Map();

function perfConfig() {
  try {
    const cfg = require('../config/config.js').readConfig();
    return (cfg && cfg.perf) || {};
  } catch (_) {
    return {};
  }
}

function afterSec() {
  const v = perfConfig().hibernateSec;
  if (v === undefined || v === null) return DEFAULT_AFTER_SEC;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_AFTER_SEC;
}

function writeAfter(sec) {
  try {
    const config = require('../config/config.js');
    const cfg = config.readConfig() || {};
    cfg.perf = Object.assign({}, cfg.perf, { hibernateSec: sec });
    config.writeConfig(cfg);
    return true;
  } catch (_) {
    return false;
  }
}

function indexerWanted() {
  try {
    const cfg = require('../config/config.js').readConfig();
    const feats = cfg && cfg.features ? cfg.features : null;
    return !feats || INDEXER_FLAGS.some((id) => feats[id] !== false);
  } catch (_) {
    return true;
  }
}

function winAway() {
  if (!_win || _win.isDestroyed()) return false;
  return _win.isMinimized() || !_win.isVisible();
}

function sleepingList() {
  const out = [];
  try {
    if (require('./workerProxy.js').isAsleep()) out.push('workerService');
  } catch (_) {}
  try {
    if (require('./indexerProxy.js').isAsleep()) out.push('symbolIndex');
  } catch (_) {}
  return out;
}

function snapshot() {
  return { asleep: _asleep, sleeping: sleepingList(), afterSec: afterSec() };
}

function broadcast() {
  if (!_win || _win.isDestroyed()) return;
  try {
    _win.webContents.send('hibernate:state', snapshot());
  } catch (_) {}
}

function sleepWorker(force) {
  try {
    return require('./workerProxy.js').sleep(force);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function sleepIndexer(force) {
  try {
    if (!indexerWanted()) return { ok: true, already: true };
    return require('./indexerProxy.js').sleep(force);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function pauseGmail() {
  if (!_gmailPolling || _gmailPaused) return;
  try {
    require('../services/gmailService').stopPolling();
    _gmailPaused = true;
  } catch (_) {}
}

function resumeGmail() {
  if (!_gmailPaused) return;
  _gmailPaused = false;
  const fn = _handlers.get('gmail:startPolling');
  if (fn) {
    Promise.resolve()
      .then(() => fn(null))
      .catch(() => {});
  }
}

function tryEnter() {
  _timer = null;
  if (_asleep || !winAway()) return;
  const w = sleepWorker(false);
  const i = sleepIndexer(false);
  if ((w && w.busy) || (i && i.busy)) {
    _timer = setTimeout(tryEnter, BUSY_RETRY_MS);
    return;
  }
  pauseGmail();
  _asleep = true;
  console.log('[Hibernate] asleep');
  broadcast();
}

function schedule() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  const sec = afterSec();
  if (!sec || _asleep) return;
  _timer = setTimeout(tryEnter, sec * 1000);
}

function wake() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  const was = _asleep || _gmailPaused || sleepingList().length > 0;
  _asleep = false;
  try {
    require('./workerProxy.js').wake();
  } catch (_) {}
  try {
    require('./indexerProxy.js').wake();
  } catch (_) {}
  resumeGmail();
  if (was) {
    console.log('[Hibernate] awake');
    broadcast();
  }
}

function featureAction(id, action) {
  if (id === 'workerService' && action === 'sleep') {
    const r = sleepWorker(false);
    broadcast();
    return r;
  }
  if (id === 'symbolIndex' && action === 'sleep') {
    const r = sleepIndexer(false);
    broadcast();
    return r;
  }
  if (id === 'graphify' && action === 'stop') {
    try {
      require('./graphify_ipc.js').shutdown();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  return { ok: false, error: 'Nothing to do for ' + id };
}

function hookIpc() {
  const orig = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = function (channel, handler) {
    if (channel === 'gmail:startPolling' || channel === 'gmail:stopPolling') {
      _handlers.set(channel, handler);
      return orig(channel, async function (event, ...args) {
        const res = await handler.call(this, event, ...args);
        _gmailPolling = channel === 'gmail:startPolling';
        if (channel === 'gmail:stopPolling') _gmailPaused = false;
        return res;
      });
    }
    return orig(channel, handler);
  };
}

function registerIpc() {
  ipcMain.handle('hibernate:getState', () => snapshot());

  ipcMain.handle('hibernate:setAfter', (_event, sec) => {
    const n = Math.floor(Number(sec));
    if (!(n >= 0 && n <= 86400)) {
      return { ok: false, error: 'Pick 0 (off) up to 86400 seconds.' };
    }
    if (!writeAfter(n)) return { ok: false, error: 'Could not save the setting.' };
    if (!n) {
      if (_timer) {
        clearTimeout(_timer);
        _timer = null;
      }
      if (_asleep) wake();
    } else if (winAway() && !_asleep) {
      schedule();
    }
    broadcast();
    return { ok: true, afterSec: n };
  });

  ipcMain.handle('hibernate:wake', () => {
    wake();
    return snapshot();
  });

  ipcMain.handle('hibernate:feature', (_event, payload) => {
    const id = String((payload && payload.id) || '');
    const action = String((payload && payload.action) || '');
    const res = featureAction(id, action);
    return Object.assign({}, res, { state: snapshot() });
  });
}

function attach(win) {
  _win = win;
  if (!_attached) {
    _attached = true;
    hookIpc();
    registerIpc();
  }
  win.on('minimize', schedule);
  win.on('hide', schedule);
  win.on('restore', wake);
  win.on('show', wake);
  win.on('focus', () => {
    if (_asleep) wake();
  });
}

module.exports = { attach };