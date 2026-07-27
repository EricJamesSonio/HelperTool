'use strict';

const http = require('http');
const { log } = require('../constants');

// ─── Constants ───
const HEALTH_CHECK_INTERVAL_MS = 15000;
const MAX_HISTORY_PER_URL = 20;

// ─── Private State ───
let _urls = null;
let _checkTimer = null;

function _init() {
  if (_urls) return;
  _urls = new Map();
}

function _startTimer() {
  if (_checkTimer) return;
  _checkTimer = setInterval(_checkAll, HEALTH_CHECK_INTERVAL_MS);
  _checkTimer.unref();
  log('URL health checker started');
}

function _stopTimer() {
  if (_checkTimer) {
    clearInterval(_checkTimer);
    _checkTimer = null;
    log('URL health checker stopped');
  }
}

function _checkAll() {
  if (!_urls || _urls.size === 0) return;
  for (const [port, state] of _urls) {
    _checkOne(port, state);
  }
}

function _checkOne(port, state) {
  const start = Date.now();
  const req = http.get(state.url, { timeout: 5000 }, function (res) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode || 0;
    res.resume();
    _recordResult(port, {
      timestamp: Date.now(),
      status: statusCode >= 200 && statusCode < 400 ? 'online' : 'degraded',
      statusCode,
      responseTimeMs: duration,
    });
  });

  req.on('error', function () {
    const duration = Date.now() - start;
    _recordResult(port, {
      timestamp: Date.now(),
      status: 'offline',
      statusCode: 0,
      responseTimeMs: duration,
    });
  });

  req.on('timeout', function () {
    req.destroy();
    _recordResult(port, {
      timestamp: Date.now(),
      status: 'offline',
      statusCode: 0,
      responseTimeMs: Date.now() - start,
    });
  });
}

function _recordResult(port, result) {
  const state = _urls ? _urls.get(port) : null;
  if (!state) return;

  state.lastCheck = result.timestamp;
  state.status = result.status;
  state.statusCode = result.statusCode;
  state.responseTimeMs = result.responseTimeMs;

  state.history.push(result);
  if (state.history.length > MAX_HISTORY_PER_URL) {
    state.history.shift();
  }
}

// ─── Public API ───

function register({ url, port, framework, sessionId } = {}) {
  if (!url || !port) return { success: false, error: 'url and port required' };
  _init();

  if (_urls.has(port)) {
    return { success: true, data: { port, message: 'Already registered' } };
  }

  _urls.set(port, {
    url,
    port,
    framework: framework || 'Unknown',
    sessionId: sessionId || null,
    status: 'unknown',
    statusCode: 0,
    responseTimeMs: 0,
    lastCheck: null,
    history: [],
    registeredAt: Date.now(),
  });

  _startTimer();
  log('URL registered for health monitoring:', url);
  return { success: true, data: { port } };
}

function unregister(port) {
  if (!_urls) return { success: false, error: 'No URLs registered' };
  const removed = _urls.delete(port);
  if (_urls.size === 0) _stopTimer();
  return { success: true, data: { removed } };
}

function list() {
  if (!_urls) return { success: true, data: [] };
  const result = [];
  for (const [port, state] of _urls) {
    result.push({
      port,
      url: state.url,
      framework: state.framework,
      sessionId: state.sessionId,
      status: state.status,
      statusCode: state.statusCode,
      responseTimeMs: state.responseTimeMs,
      lastCheck: state.lastCheck,
      registeredAt: state.registeredAt,
    });
  }
  return { success: true, data: result };
}

function getHealthHistory(port, limit) {
  if (!_urls) return { success: true, data: [] };
  const state = _urls.get(port);
  if (!state) return { success: true, data: [] };
  const max = limit || 10;
  const history = state.history.slice(-max);
  return { success: true, data: history };
}

function checkNow(port) {
  if (!_urls) return { success: false, error: 'No URLs registered' };
  const state = _urls.get(port);
  if (!state) return { success: false, error: 'URL not found for port: ' + port };
  _checkOne(port, state);
  return { success: true, data: { port, status: state.status } };
}

function stopAll() {
  _stopTimer();
  if (_urls) _urls.clear();
  _urls = null;
  log('URL monitor stopped');
}

module.exports = {
  register,
  unregister,
  list,
  getHealthHistory,
  checkNow,
  stopAll,
};
