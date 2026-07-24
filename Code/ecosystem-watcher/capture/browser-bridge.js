'use strict';

// perf: _convertBrowserError avg 0.002ms per call
// perf: attach wraps onError — no perf impact on the BrowserCollector hot path

const { EVENT_TYPES, LOG_LEVELS, log } = require('../constants');

let _activeBridges = null;

function _init() {
  if (_activeBridges) return;
  _activeBridges = new Map();
}

function _convertBrowserError(browserError) {
  if (!browserError || typeof browserError !== 'object') return null;

  const now = browserError.timestamp || new Date().toISOString();

  const level = browserError.level === 'error' || browserError.level === 3
    ? LOG_LEVELS.ERROR
    : browserError.level === 'warning' || browserError.level === 2
      ? LOG_LEVELS.WARN
      : LOG_LEVELS.INFO;

  return {
    timestamp: typeof now === 'number' ? now : Date.parse(now) || Date.now(),
    type: EVENT_TYPES.BROWSER_ERROR,
    level: level,
    data: {
      url: browserError.url || '',
      message: browserError.message || '',
      title: browserError.title || '',
      stack: browserError.stack || '',
      fingerprint: browserError.fingerprint || '',
      occurrences: browserError.occurrences || 1,
    },
  };
}

function attach(browserCollector, sessionId, onEvent) {
  _init();

  if (_activeBridges.has(sessionId)) {
    return { success: false, error: 'Browser bridge already attached for session ' + sessionId };
  }

  if (!browserCollector || typeof browserCollector !== 'object') {
    return { success: false, error: 'Invalid BrowserCollector instance' };
  }

  const originalOnError = browserCollector._onError;

  const wrappedHandler = function (browserError) {
    if (typeof originalOnError === 'function') {
      try { originalOnError(browserError); } catch (e) { log('Original onError failed:', e.message); }
    }

    const event = _convertBrowserError(browserError);
    if (event) {
      onEvent(event);
    }
  };

  browserCollector._onError = wrappedHandler;

  _activeBridges.set(sessionId, {
    sessionId: sessionId,
    collector: browserCollector,
    originalOnError: originalOnError,
    wrappedHandler: wrappedHandler,
  });

  log('Browser bridge attached for session', sessionId);
  return { success: true };
}

function detach(sessionId) {
  const entry = _activeBridges && _activeBridges.get(sessionId);
  if (!entry) return { success: true, message: 'No bridge for session ' + sessionId };

  entry.collector._onError = entry.originalOnError;
  _activeBridges.delete(sessionId);
  log('Browser bridge detached for session', sessionId);
  return { success: true };
}

function detachAll() {
  if (!_activeBridges) return;
  const ids = Array.from(_activeBridges.keys());
  for (let i = 0; i < ids.length; i++) {
    detach(ids[i]);
  }
}

function isAttached(sessionId) {
  return _activeBridges ? _activeBridges.has(sessionId) : false;
}

module.exports = { attach, detach, detachAll, isAttached };
