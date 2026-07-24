'use strict';

const constants = require('./constants');
const buffer = require('./buffer');
const session = require('./session');
const network = require('./capture/network');
const processStats = require('./capture/process-stats');
const browserBridge = require('./capture/browser-bridge');

let _started = false;
let _networkRefCount = 0;
let _shutdownHooks = [];
let _storeRef = null;

function start() {
  if (_started) return { success: true, message: 'Already running' };
  _started = true;
  _installShutdownHandlers();
  constants.log('Ecosystem Watcher initialized');
  return { success: true };
}

function stop() {
  if (!_started) return { success: true, message: 'Not running' };
  _shutdown();
  return { success: true };
}

function _shutdown() {
  if (!_started) return;
  session.endAllSessions();
  if (network.isActive()) network.stopCapture();
  processStats.stopAllPolling();
  browserBridge.detachAll();
  _networkRefCount = 0;
  _started = false;
  constants.log('Ecosystem Watcher stopped');
}

function _installShutdownHandlers() {
  if (_shutdownHooks.length > 0) return;

  const handler = function () { _shutdown(); };
  if (typeof process !== 'undefined' && process.on) {
    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
    process.on('uncaughtException', function (err) {
      constants.log('Uncaught exception:', err.message);
      _shutdown();
    });
    _shutdownHooks = [handler];
  }
}

function isRunning() {
  return _started;
}

function getStatus() {
  return {
    running: _started,
    sessions: session.getSessionCount(),
    uptime: process.uptime(),
    captures: {
      network: network.isActive(),
    },
  };
}

function getHealth() {
  const storeHealth = _storeRef && typeof _storeRef.getHealth === 'function' ? _storeRef.getHealth() : {};
  const sessionHealth = session.getHealth();
  const wsCount = session.getSessionCount();

  if (wsCount > 100) {
    constants.log('Leak warning: session count is ' + wsCount);
  }

  return {
    success: true,
    data: Object.assign({
      running: _started,
      sessionCount: wsCount,
      leakWarning: wsCount > 100 ? ('Session count ' + wsCount + ' exceeds threshold') : null,
      uptime: Math.floor(process.uptime()),
      captures: {
        network: network.isActive(),
        browserBridge: false,
        processStats: false,
      },
    }, storeHealth),
    meta: { timestamp: Date.now() },
  };
}

function createSession(engineSessionId, meta) {
  meta = meta || {};

  const sess = session.createSession(engineSessionId, meta);

  if (meta.captureNetwork) {
    _enableNetwork(engineSessionId);
  }

  if (meta.captureProcessStats) {
    processStats.startPolling(engineSessionId, function (evt) {
      session.pushEvent(engineSessionId, evt);
      processStats.touchActivity(engineSessionId);
    }, { intervalMs: meta.pollIntervalMs, sessionStart: sess.startedAt });
  }

  if (wsCount() > 100) {
    constants.log('Leak warning: session count is ' + wsCount());
  }

  return sess;
}

function wsCount() {
  return session.getSessionCount();
}

function endSession(engineSessionId) {
  processStats.stopPolling(engineSessionId);
  browserBridge.detach(engineSessionId);
  if (_networkRefCount > 0) {
    _networkRefCount--;
    if (_networkRefCount <= 0) {
      network.stopCapture();
      _networkRefCount = 0;
    }
  }
  session.endSession(engineSessionId);
}

function _enableNetwork(engineSessionId) {
  if (!network.isActive()) {
    network.startCapture(function (evt) {
      for (const sid of session.listSessions()) {
        const ws = session.getSession(sid.sessionId);
        if (ws && ws.meta && ws.meta.captureNetwork) {
          session.pushEvent(sid.sessionId, evt);
        }
      }
    });
  }
  _networkRefCount++;
}

function connectToErrorEngine(errorEngine) {
  if (!errorEngine || typeof errorEngine._onBrowserError !== 'function') {
    return { success: false, error: 'Invalid errorEngine (no _onBrowserError)' };
  }

  const origOnBrowserError = errorEngine._onBrowserError.bind(errorEngine);

  errorEngine._onBrowserError = function (browserError) {
    origOnBrowserError(browserError);

    try {
      const sessionId = browserError && browserError.sessionId;
      if (sessionId) {
        const ws = session.getSession(sessionId);
        if (ws) {
          const event = {
            timestamp: browserError.timestamp
              ? (typeof browserError.timestamp === 'number' ? browserError.timestamp : Date.parse(browserError.timestamp) || Date.now())
              : Date.now(),
            type: constants.EVENT_TYPES.BROWSER_ERROR,
            level: browserError.level === 'error' || browserError.level === 3
              ? constants.LOG_LEVELS.ERROR
              : browserError.level === 'warning' || browserError.level === 2
                ? constants.LOG_LEVELS.WARN
                : constants.LOG_LEVELS.INFO,
            data: {
              url: browserError.url || '',
              message: browserError.message || '',
              title: browserError.title || '',
              stack: browserError.stack || '',
              fingerprint: browserError.fingerprint || '',
              occurrences: browserError.occurrences || 1,
            },
          };
          session.pushEvent(sessionId, event);
        }
      }
    } catch (e) {
      constants.log('Browser bridge error:', e.message);
    }
  };

  return { success: true };
}

function setStore(store) {
  _storeRef = store;
  session.setStore(store);
}

function setPushHandler(fn) {
  session.setPushHandler(fn);
}

function getSessionDetail(sessionId) {
  const ws = session.getSession(sessionId);
  if (!ws) {
    return {
      session: null,
      stats: { events: 0, errors: 0, requests: 0, dropped: 0, process: 0, browser: 0 },
      live: { status: 'not_found', uptime: 0 },
      recent: [],
      throughput: 0,
      lastEventAt: 0,
    };
  }

  const bufEvents = ws.buffer.getAll();
  for (let i = 0; i < bufEvents.length; i++) {
    if (bufEvents[i] && typeof bufEvents[i] === 'object') delete bufEvents[i]._ts;
  }

  const health = session.getHealth(sessionId);
  const storeCount = _storeRef ? _storeRef.getEventCount(sessionId) : 0;

  let errors = 0;
  let requests = 0;
  let process = 0;
  let browser = 0;
  for (let i = 0; i < bufEvents.length; i++) {
    const e = bufEvents[i];
    if (e.type === 'error') errors++;
    else if (e.type === 'request') requests++;
    else if (e.type === 'process') process++;
    else if (e.type === 'browser') browser++;
  }

  const lastEvent = bufEvents.length > 0 ? bufEvents[bufEvents.length - 1] : null;
  const recent = bufEvents.slice(-20);

  return {
    session: {
      id: sessionId,
      status: 'running',
      startedAt: ws.startedAt,
      uptime: health ? health.uptime : 0,
    },
    stats: {
      events: ws.eventCount,
      errors: errors,
      requests: requests,
      process: process,
      browser: browser,
      dropped: health ? health.droppedEvents : 0,
      inStore: storeCount,
      inBuffer: bufEvents.length,
    },
    live: {
      status: 'running',
      uptime: health ? health.uptime : 0,
      sampleRatio: health ? health.sampleRatio : 1,
    },
    recent: recent,
    throughput: bufEvents.length > 0 ? Math.round(bufEvents.length / ((Date.now() - ws.startedAt) / 1000)) : 0,
    lastEventAt: lastEvent ? lastEvent.ts : 0,
  };
}

module.exports = {
  start,
  stop,
  isRunning,
  getStatus,
  getHealth,
  createSession,
  endSession,
  connectToErrorEngine,
  setStore,
  setPushHandler,
  getSessionDetail,
  constants,
  buffer,
  session,
  capture: { network, processStats, browserBridge },
};
