'use strict';

const { VALID_EVENT_TYPES, VALID_LOG_LEVELS, MAX_EVENTS_PER_SESSION, log, SOURCES, DEFAULT_SOURCE } = require('../constants');
const { denormalizeStored } = require('../normalizer');

const MAX_RETRIES = 3;
const BASE_RETRY_MS = 50;
const BATCH_FLUSH_LIMIT = 50;
const FLUSH_INTERVAL_MS = 100;

let _circuitOpen = false;
let _circuitFailures = 0;
let _lastFlushTime = 0;
let _totalEventsStored = 0;
let _totalFlushes = 0;

function createEventStore(dbProvider) {
  let _initialized = false;
  let _insertStmt = null;
  let _batch = [];
  let _batchTimer = null;

  function _init() {
    if (_initialized) return;
    const db = dbProvider.db;
    db.run(`
      CREATE TABLE IF NOT EXISTS watcher_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  INTEGER NOT NULL,
        type        TEXT NOT NULL,
        level       TEXT DEFAULT 'info',
        timestamp   TEXT NOT NULL,
        data        TEXT DEFAULT '{}',
        created_at  TEXT DEFAULT (datetime('now','localtime'))
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_we_session ON watcher_events(session_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_we_session_type ON watcher_events(session_id, type)');
    db.run('CREATE INDEX IF NOT EXISTS idx_we_timestamp ON watcher_events(timestamp)');
    _initialized = true;
  }

  function _executeWithRetry(fn) {
    return function () {
      const args = arguments;
      if (_circuitOpen) {
        log('Circuit breaker open — skipping flush');
        return false;
      }
      let lastErr = null;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const result = fn.apply(null, args);
          _circuitFailures = 0;
          _lastFlushTime = Date.now();
          return result;
        } catch (e) {
          lastErr = e;
          _circuitFailures++;
          log('Flush attempt', attempt + 1, 'failed:', e.message);
          if (attempt < MAX_RETRIES - 1) {
            const delay = BASE_RETRY_MS * Math.pow(2, attempt);
            const deadline = Date.now() + delay;
            while (Date.now() < deadline) { /* spin — SQLite ops are sync */ }
          }
        }
      }
      _circuitFailures++;
      if (_circuitFailures >= 6) {
        _circuitOpen = true;
        log('Circuit breaker OPEN after', _circuitFailures, 'failures');
        setTimeout(function () {
          _circuitOpen = false;
          _circuitFailures = 0;
          log('Circuit breaker RESET');
        }, 30000);
      }
      log('All', MAX_RETRIES, 'retries exhausted:', lastErr.message);
      return false;
    };
  }

  function _flushBatch() {
    if (_batchTimer) { clearTimeout(_batchTimer); _batchTimer = null; }
    if (_batch.length === 0) return;
    const db = dbProvider.db;
    const batch = _batch;
    _batch = [];

    const doFlush = function () {
      const stmt = db.prepare('INSERT INTO watcher_events (session_id, type, level, timestamp, data) VALUES (?, ?, ?, ?, ?)');
      for (let i = 0; i < batch.length; i++) {
        const evt = batch[i];
        stmt.run([evt.session_id, evt.type, evt.level, evt.timestamp, JSON.stringify(evt.data)]);
      }
      stmt.free();
      dbProvider.save();
      _totalEventsStored += batch.length;
      _totalFlushes++;
      log('Flushed', batch.length, 'events to store (total:', _totalEventsStored + ')');
    };

    _executeWithRetry(doFlush)();
  }

  function _scheduleFlush() {
    if (_batchTimer) clearTimeout(_batchTimer);
    _batchTimer = setTimeout(function () { _flushBatch(); }, FLUSH_INTERVAL_MS);
  }

  function _storePayload(event) {
    return {
      summary: event.summary || '',
      detail: event.detail || {},
      source: event.source || SOURCES[event.type] || DEFAULT_SOURCE,
      tags: event.tags || [],
      seq: event.seq || 0,
    };
  }

  function insertEvent(sessionId, event) {
    _init();
    if (!event || !event.type) return false;
    if (event.type && !VALID_EVENT_TYPES.has(event.type)) return false;
    if (event.level && !VALID_LOG_LEVELS.has(event.level)) return false;
    _batch.push({
      session_id: sessionId,
      type: event.type,
      level: event.level || 'info',
      timestamp: new Date(event.ts || Date.now()).toISOString(),
      data: _storePayload(event),
    });
    if (_batch.length >= BATCH_FLUSH_LIMIT) {
      _flushBatch();
    } else {
      _scheduleFlush();
    }
    return true;
  }

  function insertEvents(sessionId, events) {
    _init();
    if (!events || !events.length) return 0;
    let count = 0;
    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      if (evt && evt.type && VALID_EVENT_TYPES.has(evt.type)) {
        _batch.push({
          session_id: sessionId,
          type: evt.type,
          level: evt.level || 'info',
          timestamp: new Date(evt.ts || Date.now()).toISOString(),
          data: _storePayload(evt),
        });
        count++;
      }
    }
    if (_batch.length >= BATCH_FLUSH_LIMIT) {
      _flushBatch();
    } else {
      _scheduleFlush();
    }
    return count;
  }

  function queryEvents(filters) {
    _init();
    const db = dbProvider.db;
    let sql = 'SELECT id, session_id, type, level, timestamp, data FROM watcher_events WHERE 1=1';
    const params = [];

    if (filters.sessionId) {
      sql += ' AND session_id = ?'; params.push(filters.sessionId);
    }
    if (filters.type) {
      sql += ' AND type = ?'; params.push(filters.type);
    }
    if (filters.level) {
      sql += ' AND level = ?'; params.push(filters.level);
    }
    if (filters.after) {
      sql += ' AND id > ?'; params.push(filters.after);
    }
    if (filters.startTime) {
      sql += ' AND timestamp >= ?'; params.push(new Date(filters.startTime).toISOString());
    }
    if (filters.endTime) {
      sql += ' AND timestamp <= ?'; params.push(new Date(filters.endTime).toISOString());
    }

    sql += ' ORDER BY id ASC';
    const limit = Math.min(filters.limit || 50, 500);
    sql += ' LIMIT ?'; params.push(limit);

    const res = db.exec(sql, params);
    if (!res.length || !res[0].values.length) return { events: [], meta: { hasMore: false, count: 0 } };

    const cols = res[0].columns;
    const events = res[0].values.map(function (row) {
      const obj = {};
      cols.forEach(function (col, i) { obj[col] = row[i]; });
      return denormalizeStored(obj);
    });

    const hasMore = events.length >= limit;

    return {
      events: events,
      meta: {
        count: events.length,
        hasMore: hasMore,
        cursor: events.length > 0 ? events[events.length - 1].id : null,
      },
    };
  }

  function getSessionTimeline(sessionId, limit) {
    return queryEvents({ sessionId: sessionId, limit: limit || 200 });
  }

  function getEventCount(sessionId) {
    _init();
    const db = dbProvider.db;
    const res = db.exec('SELECT COUNT(*) as c FROM watcher_events WHERE session_id = ?', [sessionId]);
    if (!res.length || !res[0].values.length) return 0;
    return res[0].values[0][0];
  }

  function forceFlush() {
    _flushBatch();
  }

  function getHealth() {
    return {
      circuitOpen: _circuitOpen,
      circuitFailures: _circuitFailures,
      batchSize: _batch ? _batch.length : 0,
      lastFlushTime: _lastFlushTime,
      totalEventsStored: _totalEventsStored,
      totalFlushes: _totalFlushes,
    };
  }

  return {
    insertEvent,
    insertEvents,
    queryEvents,
    getSessionTimeline,
    getEventCount,
    forceFlush,
    getHealth,
  };
}

module.exports = { createEventStore };
