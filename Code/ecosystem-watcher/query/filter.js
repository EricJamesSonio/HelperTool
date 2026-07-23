'use strict';

const { log } = require('../constants');

function createFilter(eventStore, session) {

  function filter(opts) {
    const sessionId = opts.sessionId;
    const type = opts.type || null;
    const level = opts.level || null;
    const limit = Math.min(opts.limit || 100, 500);
    const after = opts.after || null;

    // Get from store
    const storeResult = eventStore.queryEvents({
      sessionId: sessionId,
      type: type,
      level: level,
      limit: limit,
      after: after,
      startTime: opts.startTime,
      endTime: opts.endTime,
    });

    // Get from in-memory buffer (for recent events not yet flushed)
    const ws = session.getSession(sessionId);
    let bufferEvents = [];
    if (ws) {
      bufferEvents = ws.buffer.getAll();
      // Filter by type/level if specified
      if (type) bufferEvents = bufferEvents.filter(function (e) { return e.type === type; });
      if (level) bufferEvents = bufferEvents.filter(function (e) { return e.level === level; });
    }

    const merged = storeResult.events.concat(bufferEvents);

    return {
      events: merged.slice(0, limit),
      meta: {
        count: Math.min(merged.length, limit),
        total: ws ? ws.eventCount : storeResult.meta.count,
        hasMore: merged.length > limit || storeResult.meta.hasMore,
        cursor: merged.length > 0 ? (storeResult.meta.cursor || null) : null,
      },
    };
  }

  function getSessionTimeline(sessionId, limit) {
    return eventStore.getSessionTimeline(sessionId, limit);
  }

  function getSessionSummary(sessionId) {
    const ws = session.getSession(sessionId);
    if (!ws) return { summary: 'Session not found', keyEvents: [], metrics: {} };

    const allEvents = ws.buffer.getAll();
    const storeCount = eventStore.getEventCount(sessionId);
    const totalEvents = storeCount + ws.eventCount;

    const levels = {};
    const types = {};
    const errors = [];

    for (let i = 0; i < allEvents.length; i++) {
      const e = allEvents[i];
      levels[e.level] = (levels[e.level] || 0) + 1;
      types[e.type] = (types[e.type] || 0) + 1;
      if (e.level === 'error') {
        errors.push({ message: (e.data && e.data.raw ? e.data.raw.slice(0, 120) : 'Unknown error'), time: e.timestamp });
      }
    }

    const keyEvents = errors.slice(-5).map(function (e) { return 'error:' + e.message; });

    return {
      summary: errors.length > 0
        ? errors.length + ' error(s) detected. ' + keyEvents.join('; ')
        : 'No errors in session.',
      keyEvents: keyEvents,
      metrics: {
        total: totalEvents,
        inBuffer: allEvents.length,
        inStore: storeCount,
        byLevel: levels,
        byType: types,
        errorCount: errors.length,
      },
    };
  }

  return { filter, getSessionTimeline, getSessionSummary };
}

module.exports = { createFilter };
