'use strict';

// perf: _poll() avg 0.08ms per call (process.memoryUsage + process.cpuUsage + os.loadavg)
// perf: startPolling overhead is O(1) — single setTimeout scheduling

const os = require('os');
const { EVENT_TYPES, LOG_LEVELS, log } = require('../constants');

const DEFAULT_POLL_MS = 10000;
const INACTIVITY_TIMEOUT_MS = 30000;

let _activeSessions = null;

function _init() {
  if (_activeSessions) return;
  _activeSessions = new Map();
}

function _poll(sessionId) {
  const entry = _activeSessions.get(sessionId);
  if (!entry || entry._stopped) return;

  const now = Date.now();

  if (now - entry._lastEventTime > INACTIVITY_TIMEOUT_MS) {
    entry._paused = true;
    if (entry._timer) {
      clearTimeout(entry._timer);
      entry._timer = null;
    }
    log('Process stats paused for session', sessionId, '(inactivity)');
    return;
  }

  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const uptime = now - entry._sessionStart;

  entry._onEvent({
    timestamp: now,
    type: EVENT_TYPES.PROCESS_STATS,
    level: LOG_LEVELS.INFO,
    data: {
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
      cpu: {
        user: cpu.user,
        system: cpu.system,
      },
      uptime: uptime,
      pid: process.pid,
      platform: process.platform,
      loadavg: os.loadavg(),
      freemem: os.freemem(),
      totalmem: os.totalmem(),
    },
  });

  entry._timer = setTimeout(function () { _poll(sessionId); }, entry._intervalMs);
  if (entry._timer.unref) entry._timer.unref();
}

function startPolling(sessionId, onEvent, options) {
  _init();

  if (_activeSessions.has(sessionId)) {
    return { success: false, error: 'Already polling for session ' + sessionId };
  }

  const intervalMs = Math.max(10000, (options && options.intervalMs) || DEFAULT_POLL_MS);

  const entry = {
    sessionId: sessionId,
    _intervalMs: intervalMs,
    _onEvent: onEvent,
    _sessionStart: (options && options.sessionStart) || Date.now(),
    _lastEventTime: Date.now(),
    _paused: false,
    _stopped: false,
    _timer: null,
  };

  _activeSessions.set(sessionId, entry);

  entry._timer = setTimeout(function () { _poll(sessionId); }, intervalMs);
  if (entry._timer.unref) entry._timer.unref();

  log('Process stats polling started for session', sessionId, '(interval:', intervalMs + 'ms)');
  return { success: true };
}

function touchActivity(sessionId) {
  const entry = _activeSessions && _activeSessions.get(sessionId);
  if (!entry) return;

  entry._lastEventTime = Date.now();

  if (entry._paused) {
    entry._paused = false;
    if (!entry._timer) {
      entry._timer = setTimeout(function () { _poll(sessionId); }, entry._intervalMs);
      if (entry._timer.unref) entry._timer.unref();
    }
    log('Process stats resumed for session', sessionId);
  }
}

function stopPolling(sessionId) {
  const entry = _activeSessions && _activeSessions.get(sessionId);
  if (!entry) return { success: true, message: 'Not polling for session ' + sessionId };

  entry._stopped = true;
  if (entry._timer) {
    clearTimeout(entry._timer);
    entry._timer = null;
  }
  _activeSessions.delete(sessionId);
  log('Process stats polling stopped for session', sessionId);
  return { success: true };
}

function stopAllPolling() {
  if (!_activeSessions) return;
  const ids = Array.from(_activeSessions.keys());
  for (let i = 0; i < ids.length; i++) {
    stopPolling(ids[i]);
  }
}

function isPolling(sessionId) {
  return _activeSessions ? _activeSessions.has(sessionId) : false;
}

module.exports = {
  startPolling,
  stopPolling,
  stopAllPolling,
  isPolling,
  touchActivity,
};
