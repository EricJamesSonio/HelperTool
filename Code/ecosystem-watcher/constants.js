'use strict';

// ─── Event Types ───
const EVENT_TYPES = Object.freeze({
  LOG: 'log',
  ERROR: 'error',
  REQUEST: 'request',
  PROCESS: 'process',
  PROCESS_STATS: 'process_stats',
  BROWSER_ERROR: 'browser_error',
});
const VALID_EVENT_TYPES = new Set(Object.values(EVENT_TYPES));

// ─── Log Levels ───
const LOG_LEVELS = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  DEBUG: 'debug',
});
const VALID_LOG_LEVELS = new Set(Object.values(LOG_LEVELS));

// ─── Session Status ───
const SESSION_STATUS = Object.freeze({
  RUNNING: 'running',
  ENDED: 'ended',
  FAILED: 'failed',
  KILLED: 'killed',
});

// ─── Session Source ───
const SESSION_SOURCE = Object.freeze({
  USER: 'user',
  AI: 'ai',
});

// ─── Buffer Limits ───
const MAX_EVENTS_PER_SESSION = 5000;
const MAX_EVENT_SIZE_BYTES = 65536;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// ─── Cleanup ───
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// ─── Rate Limits ───
const MAX_EVENTS_PER_SEC = 1000;
const DEFAULT_SAMPLE_RATIO = 1;

// ─── Error Cop Integration ───
const ERROR_COP_PORT = 3334;
const ERROR_COP_HOST = 'http://127.0.0.1';

// ─── Watcher API Routes ───
const ROUTES = Object.freeze({
  SESSIONS: '/watcher/sessions',
  EVENTS: '/watcher/events',
  TIMELINE: '/watcher/timeline',
  QUERY: '/watcher/query',
  SUMMARY: '/watcher/summary',
  SNAPSHOT: '/watcher/snapshot',
});

// ─── Event Source Map ───
const SOURCES = Object.freeze({
  log: 'terminal',
  error: 'terminal',
  request: 'backend',
  process: 'backend',
  browser: 'browser',
});
const DEFAULT_SOURCE = 'terminal';

// ─── Debug Flag ───
const DEBUG = !!process.env.DEBUG_WATCHER;
const log = DEBUG ? (...args) => console.log('[watcher]', ...args) : () => {};

module.exports = {
  EVENT_TYPES,
  VALID_EVENT_TYPES,
  LOG_LEVELS,
  VALID_LOG_LEVELS,
  SESSION_STATUS,
  SESSION_SOURCE,
  SOURCES,
  DEFAULT_SOURCE,
  MAX_EVENTS_PER_SESSION,
  MAX_EVENT_SIZE_BYTES,
  SESSION_TTL_MS,
  CLEANUP_INTERVAL_MS,
  MAX_EVENTS_PER_SEC,
  DEFAULT_SAMPLE_RATIO,
  ERROR_COP_PORT,
  ERROR_COP_HOST,
  ROUTES,
  DEBUG,
  log,
};
