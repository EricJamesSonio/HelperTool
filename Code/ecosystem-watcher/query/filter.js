'use strict';

const { log } = require('../constants');

function _stripInternal(event) {
  if (event && typeof event === 'object') {
    delete event._ts;
  }
  return event;
}

function _sortByTsSeq(a, b) {
  if (a.ts !== b.ts) return a.ts - b.ts;
  return (a.seq || 0) - (b.seq || 0);
}

function createFilter(eventStore, session) {

  function filter(opts) {
    const sessionId = opts.sessionId;
    const type = opts.type || null;
    const level = opts.level || null;
    const limit = Math.min(opts.limit || 100, 500);
    const after = opts.after || null;

    const storeResult = eventStore.queryEvents({
      sessionId: sessionId,
      type: type,
      level: level,
      limit: limit,
      after: after,
      startTime: opts.startTime,
      endTime: opts.endTime,
    });

    const ws = session.getSession(sessionId);
    let bufferEvents = [];
    if (ws) {
      bufferEvents = ws.buffer.getAll();
      for (let i = 0; i < bufferEvents.length; i++) {
        _stripInternal(bufferEvents[i]);
      }
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

  function getFeed(opts) {
    const sessionId = opts.sessionId || null;
    const type = opts.type || null;
    const level = opts.level || null;
    const limit = Math.min(opts.limit || 100, 500);
    const cursor = opts.cursor || { storeId: 0, bufSeq: 0 };
    const storeId = (cursor && cursor.storeId) || 0;
    const bufSeq = (cursor && cursor.bufSeq) || 0;

    const storeResult = eventStore.queryEvents({
      sessionId: sessionId,
      type: type,
      level: level,
      limit: limit + 1,
      after: storeId,
    });

    const ws = session.getSession(sessionId);
    let bufferEvents = [];
    if (ws) {
      bufferEvents = ws.buffer.getAll();
      for (let i = 0; i < bufferEvents.length; i++) {
        _stripInternal(bufferEvents[i]);
      }
      bufferEvents = bufferEvents.filter(function (e) {
        if (e.seq <= bufSeq) return false;
        if (type && e.type !== type) return false;
        if (level && e.level !== level) return false;
        return true;
      });
    }

    const merged = storeResult.events.concat(bufferEvents);
    merged.sort(_sortByTsSeq);

    const hasMore = merged.length > limit;
    const events = merged.slice(0, limit);

    let nextStoreId = storeId;
    let nextBufSeq = bufSeq;
    if (events.length > 0) {
      const last = events[events.length - 1];
      if (last.id && last.id > 0) {
        nextStoreId = last.id;
      }
      if (last.seq && last.seq > nextBufSeq) {
        nextBufSeq = last.seq;
      }
    }

    return {
      events: events,
      nextCursor: { storeId: nextStoreId, bufSeq: nextBufSeq },
    };
  }

  function getSessionTimeline(sessionId, limit) {
    return eventStore.getSessionTimeline(sessionId, limit);
  }

  function getSessionSummary(sessionId) {
    const ws = session.getSession(sessionId);
    if (!ws) return { summary: 'Session not found', keyEvents: [], metrics: {} };

    const allEvents = ws.buffer.getAll();
    for (let i = 0; i < allEvents.length; i++) {
      _stripInternal(allEvents[i]);
    }
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
        errors.push({ message: e.summary || 'Unknown error', time: e.ts });
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

  return { filter, getFeed, getSessionTimeline, getSessionSummary };
}

module.exports = { createFilter };
