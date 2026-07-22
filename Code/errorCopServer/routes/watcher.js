'use strict';

const watcher = require('../../ecosystem-watcher');
const watcherSession = require('../../ecosystem-watcher/session');
const { summarize } = require('../../ecosystem-watcher/summarizer');

function getSessions() {
  const sessions = watcherSession.listSessions();
  return { success: true, data: sessions, meta: { count: sessions.length } };
}

function getSessionEvents(sessionId, query) {
  const ws = watcherSession.getSession(sessionId);
  if (!ws) {
    return { success: false, error: 'Session not found' };
  }

  const start = parseInt(query.start, 10) || 0;
  const limit = parseInt(query.limit, 10) || 50;
  const events = watcherSession.getEvents(sessionId, start, limit);

  return {
    success: true,
    data: events,
    meta: {
      sessionId: sessionId,
      count: events.length,
      total: ws.eventCount,
      start: start,
      limit: limit,
      hasMore: start + limit < ws.eventCount,
    },
  };
}

function getLastEvents(sessionId, query) {
  const ws = watcherSession.getSession(sessionId);
  if (!ws) {
    return { success: false, error: 'Session not found' };
  }

  const n = parseInt(query.tail, 10) || 50;
  const events = watcherSession.getLastEvents(sessionId, n);

  return {
    success: true,
    data: events,
    meta: {
      sessionId: sessionId,
      count: events.length,
      total: ws.eventCount,
      tail: n,
    },
  };
}

function getSessionQuery(queryParams) {
  const sessionId = parseInt(queryParams.sessionId, 10);
  if (!sessionId) {
    return { success: false, error: 'sessionId required' };
  }

  const ws = watcherSession.getSession(sessionId);
  if (!ws) {
    return { success: false, error: 'Session not found' };
  }

  const type = queryParams.type || null;
  const level = queryParams.level || null;
  const after = queryParams.after ? parseInt(queryParams.after, 10) : null;
  const limit = parseInt(queryParams.limit, 10) || 100;

  let events = watcherSession.getEvents(sessionId, 0, ws.buffer.size());
  if (type) events = events.filter(function (e) { return e.type === type; });
  if (level) events = events.filter(function (e) { return e.level === level; });
  if (after) events = events.slice(after);

  const result = events.slice(0, limit);

  return {
    success: true,
    data: result,
    meta: {
      count: result.length,
      total: ws.eventCount,
      hasMore: events.length > limit,
    },
  };
}

function getTimeline(sessionId, query) {
  const ws = watcherSession.getSession(sessionId);
  if (!ws) {
    return { success: false, error: 'Session not found' };
  }

  const limit = parseInt(query.limit, 10) || 100;
  const events = watcherSession.getLastEvents(sessionId, limit);

  const timeline = events.map(function (e) {
    return {
      timestamp: e.timestamp,
      type: e.type,
      level: e.level,
      message: e.data && e.data.raw ? e.data.raw.slice(0, 200) : '',
    };
  });

  return {
    success: true,
    data: timeline,
    meta: { count: timeline.length, sessionId: sessionId },
  };
}

function getSummary(sessionId) {
  const ws = watcherSession.getSession(sessionId);
  if (!ws) {
    return { success: false, error: 'Session not found' };
  }

  const allEvents = watcherSession.getLastEvents(sessionId, ws.buffer.size());
  const s = summarize(allEvents);

  return {
    success: true,
    data: s,
    meta: { sessionId: sessionId, total: ws.eventCount },
  };
}

function getSnapshot(sessionId) {
  const ws = watcherSession.getSession(sessionId);
  if (!ws) {
    return { success: false, error: 'Session not found' };
  }

  const recentEvents = watcherSession.getLastEvents(sessionId, 20);
  const allEvents = watcherSession.getLastEvents(sessionId, ws.buffer.size());
  const s = summarize(allEvents);

  return {
    success: true,
    data: {
      session: {
        sessionId: sessionId,
        source: ws.meta.source || 'ai',
        eventCount: ws.eventCount,
        startedAt: ws.startedAt,
        uptime: Math.floor((Date.now() - ws.startedAt) / 1000),
      },
      summary: s.summary,
      keyEvents: s.keyEvents,
      metrics: s.metrics,
      recentEvents: recentEvents.slice(-10),
    },
    meta: { sessionId: sessionId },
  };
}

function getHealth() {
  return watcher.getHealth();
}

module.exports = { getSessions, getSessionEvents, getLastEvents, getSessionQuery, getTimeline, getSummary, getSnapshot, getHealth };
