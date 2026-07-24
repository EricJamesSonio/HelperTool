'use strict';

const { createTTLBuffer } = require('./buffer');
const { MAX_EVENTS_PER_SESSION, SESSION_TTL_MS, VALID_EVENT_TYPES, VALID_LOG_LEVELS, MAX_EVENTS_PER_SEC, DEFAULT_SAMPLE_RATIO, log } = require('./constants');
const { normalizeEvent } = require('./normalizer');

let _sessions = null;
let _cleanupTimer = null;
let _rateCounters = null;
let _store = null;
let _pushHandler = null;

function _init() {
  if (_sessions) return;
  _sessions = new Map();
  _rateCounters = new Map();
  log('Session manager initialized');
}

function _startCleanupTimer() {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(function () {
    _purgeExpired();
  }, 5 * 60 * 1000);
  _cleanupTimer.unref();
}

function _stopCleanupTimer() {
  if (_cleanupTimer) {
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
  }
}

function _purgeExpired() {
  if (!_sessions || _sessions.size === 0) return;
  const now = Date.now();
  for (const [id, ws] of _sessions) {
    if (now - ws.startedAt > SESSION_TTL_MS) {
      ws.buffer.clear();
      _sessions.delete(id);
      log('Purged expired session', id);
    }
  }
  if (_sessions.size === 0) {
    _stopCleanupTimer();
  }
}

function setPushHandler(fn) {
  _pushHandler = fn;
}

function getPushHandler() {
  return _pushHandler;
}

function validateEvent(evt) {
  if (!evt || typeof evt !== 'object') return false;
  if (typeof evt.timestamp !== 'string' && typeof evt.timestamp !== 'number') return false;
  if (!VALID_EVENT_TYPES.has(evt.type)) return false;
  if (evt.level && !VALID_LOG_LEVELS.has(evt.level)) return false;
  return true;
}

function _getRateState(sessionId) {
  let rs = _rateCounters.get(sessionId);
  if (!rs) {
    rs = { timestamps: [], sampleRatio: DEFAULT_SAMPLE_RATIO, lastDropLog: 0 };
    _rateCounters.set(sessionId, rs);
  }
  return rs;
}

function _checkRateLimit(sessionId) {
  const rs = _getRateState(sessionId);
  const now = Date.now();
  const windowStart = now - 1000;

  while (rs.timestamps.length > 0 && rs.timestamps[0] < windowStart) {
    rs.timestamps.shift();
  }

  const currentRate = rs.timestamps.length;

  if (currentRate >= MAX_EVENTS_PER_SEC * rs.sampleRatio) {
    if (rs.sampleRatio > 1) {
      rs.sampleRatio = Math.max(1, Math.floor(rs.sampleRatio / 2));
    }
    if (now - rs.lastDropLog > 5000) {
      log('Rate limit:', sessionId, currentRate + '/sec — adaptive ratio:', rs.sampleRatio);
      rs.lastDropLog = now;
    }
    return false;
  }

  rs.timestamps.push(now);
  return true;
}

function _spillToStore(sessionId, ws) {
  if (!_store) return;
  const maxEvents = MAX_EVENTS_PER_SESSION;
  const threshold = Math.floor(maxEvents * 0.8);
  const currentSize = ws.buffer.size();
  if (currentSize < threshold) return;

  const spillCount = Math.min(Math.floor(maxEvents * 0.2), currentSize);
  const events = ws.buffer.getRange(0, spillCount);
  if (events.length === 0) return;

  const inserted = _store.insertEvents(sessionId, events);
  if (inserted > 0) {
    ws.buffer.removeRange(0, inserted);
    log('Spilled', inserted, 'events to store for session', sessionId);
  }
}

function createSession(engineSessionId, meta) {
  _init();
  _startCleanupTimer();

  const ws = {
    sessionId: engineSessionId,
    engineSessionId: engineSessionId,
    buffer: createTTLBuffer(MAX_EVENTS_PER_SESSION, SESSION_TTL_MS),
    eventCount: 0,
    startedAt: Date.now(),
    meta: Object.assign({ source: 'ai' }, meta || {}),
  };

  _sessions.set(engineSessionId, ws);
  log('Session created:', engineSessionId);
  return ws;
}

function getSession(sessionId) {
  if (!_sessions) return null;
  return _sessions.get(sessionId) || null;
}

function listSessions() {
  if (!_sessions) return [];
  const result = [];
  for (const [id, ws] of _sessions) {
    result.push({
      sessionId: id,
      source: ws.meta.source || 'ai',
      command: ws.meta.command || '',
      status: 'running',
      eventCount: ws.eventCount,
      startedAt: ws.startedAt,
      bufferSize: ws.buffer.size(),
      bufferDropped: ws.buffer.getDropped(),
    });
  }
  return result;
}

function pushEvent(sessionId, event) {
  const ws = _sessions.get(sessionId);
  if (!ws) return false;

  const normalized = normalizeEvent(event, sessionId, ws.meta && ws.meta.source);
  if (!normalized) return false;

  if (!validateEvent(normalized)) {
    log('Invalid event dropped for session', sessionId, normalized);
    return false;
  }

  if (!_checkRateLimit(sessionId)) {
    return false;
  }

  ws.buffer.push(normalized);
  ws.eventCount++;
  ws.buffer.resetTTL();
  _spillToStore(sessionId, ws);

  if (_pushHandler) {
    try { _pushHandler(normalized); } catch (e) { log('pushHandler error:', e.message); }
  }
  return true;
}

function pushEvents(sessionId, events) {
  const ws = _sessions.get(sessionId);
  if (!ws) return false;
  let pushed = 0;

  for (let i = 0; i < events.length; i++) {
    const normalized = normalizeEvent(events[i], sessionId, ws.meta && ws.meta.source);
    if (!normalized) continue;
    if (!validateEvent(normalized)) continue;
    if (!_checkRateLimit(sessionId)) continue;

    ws.buffer.push(normalized);
    ws.eventCount++;
    pushed++;
  }
  ws.buffer.resetTTL();
  if (pushed > 0) _spillToStore(sessionId, ws);
  return pushed > 0;
}

function _stripInternal(event) {
  if (event && typeof event === 'object') {
    delete event._ts;
  }
  return event;
}

function _stripInternalMany(events) {
  for (let i = 0; i < events.length; i++) {
    _stripInternal(events[i]);
  }
  return events;
}

function getEvents(sessionId, start, limit) {
  const ws = _sessions.get(sessionId);
  if (!ws) return [];
  return _stripInternalMany(ws.buffer.getRange(start || 0, limit || ws.buffer.size()));
}

function getLastEvents(sessionId, n) {
  const ws = _sessions.get(sessionId);
  if (!ws) return [];
  return _stripInternalMany(ws.buffer.getLast(n || 50));
}

function getSessionCount() {
  return _sessions ? _sessions.size : 0;
}

function endSession(sessionId) {
  const ws = _sessions.get(sessionId);
  if (!ws) return false;
  ws.buffer.clear();
  _sessions.delete(sessionId);
  _rateCounters.delete(sessionId);
  log('Session ended:', sessionId);
  if (_sessions.size === 0) {
    _stopCleanupTimer();
  }
  return true;
}

function endAllSessions() {
  if (!_sessions) return;
  for (const [id] of _sessions) {
    endSession(id);
  }
  _sessions.clear();
  _rateCounters.clear();
  _stopCleanupTimer();
  log('All sessions ended');
}

function setStore(store) {
  _store = store;
}

function getHealth(sessionId) {
  if (!_sessions) return { running: false };
  if (sessionId) {
    const ws = _sessions.get(sessionId);
    if (!ws) return null;
    const rs = _rateCounters.get(sessionId);
    return {
      eventCount: ws.eventCount,
      bufferSize: ws.buffer.size(),
      bufferDropped: ws.buffer.getDropped(),
      droppedEvents: ws.buffer.getDropped(),
      sampleRatio: rs ? rs.sampleRatio : DEFAULT_SAMPLE_RATIO,
      uptime: Math.floor((Date.now() - ws.startedAt) / 1000),
    };
  }
  let totalEvents = 0;
  let totalDropped = 0;
  let totalBuffer = 0;
  for (const [, ws] of _sessions) {
    totalEvents += ws.eventCount;
    totalDropped += ws.buffer.getDropped();
    totalBuffer += ws.buffer.size();
  }
  return {
    sessionCount: _sessions.size,
    totalEvents: totalEvents,
    totalDropped: totalDropped,
    totalBufferSize: totalBuffer,
    droppedEvents: totalDropped,
    sessions: listSessions(),
  };
}

module.exports = {
  createSession,
  getSession,
  listSessions,
  pushEvent,
  pushEvents,
  getEvents,
  getLastEvents,
  getSessionCount,
  endSession,
  endAllSessions,
  validateEvent,
  setStore,
  setPushHandler,
  getPushHandler,
  getHealth,
};
