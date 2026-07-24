'use strict';

const { SOURCES, DEFAULT_SOURCE, LOG_LEVELS, MAX_EVENT_SIZE_BYTES } = require('./constants');
const { nextSeq } = require('./shared-counter');

const INTERNAL_FIELDS = new Set(['_ts', '_raw']);

function ensureNumericTs(raw) {
  if (typeof raw.timestamp === 'number') return raw.timestamp;
  if (typeof raw.timestamp === 'string') {
    const parsed = Date.parse(raw.timestamp);
    if (!isNaN(parsed)) return parsed;
  }
  if (typeof raw.ts === 'number') return raw.ts;
  if (typeof raw.ts === 'string') {
    const parsed = Date.parse(raw.ts);
    if (!isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function resolveType(raw) {
  if (raw.type === 'process_stats') return 'process';
  if (raw.type === 'browser_error') return 'browser';
  if (raw.type === 'log' || raw.type === 'error') {
    const isError = raw.level === 'error'
      || raw.level === LOG_LEVELS.ERROR
      || (raw.data && raw.data.isError);
    return isError ? 'error' : 'log';
  }
  return raw.type || 'log';
}

function resolveLevel(raw) {
  if (raw.level) return raw.level;
  if (raw.data && raw.data.level) return raw.data.level;
  return LOG_LEVELS.INFO;
}

function buildSummary(type, raw) {
  const data = raw.data || raw.detail || {};
  switch (type) {
    case 'log':
      return (data.raw || data.message || '').slice(0, 200);
    case 'error':
      return (data.raw || data.message || data.title || '').slice(0, 200);
    case 'request': {
      const method = data.method || 'GET';
      const url = (data.url || '/').slice(0, 120);
      const status = data.statusCode || '?';
      const dur = data.duration != null ? `${data.duration}ms` : '?';
      return `${method} ${url} → ${status} (${dur})`;
    }
    case 'process': {
      const mem = data.memory || {};
      const cpu = data.cpu || {};
      const rssMB = mem.rss ? (mem.rss / 1048576).toFixed(0) : '?';
      const cpuPct = cpu.user ? (cpu.user / 1000).toFixed(1) : '?';
      return `CPU ${cpuPct}% | Mem ${rssMB}MB`;
    }
    case 'browser':
      return `${data.title || 'Error'}: ${(data.message || '').slice(0, 150)}`;
    default:
      return (data.raw || data.message || '').slice(0, 200);
  }
}

function resolveDetail(raw) {
  const detail = raw.detail || raw.data || {};
  for (const key of Object.keys(detail)) {
    if (INTERNAL_FIELDS.has(key)) delete detail[key];
  }
  return detail;
}

function resolveTags(raw, resolvedType) {
  const tags = [];
  if (Array.isArray(raw.tags)) {
    for (const t of raw.tags) tags.push(t);
  }
  if (raw.type === 'process_stats') tags.push('process_stats');
  if (raw.type === 'browser_error') tags.push('browser_error');
  return tags;
}

function truncatePayload(event) {
  const json = JSON.stringify(event);
  if (json.length <= MAX_EVENT_SIZE_BYTES) return event;
  if (event.summary) event.summary = event.summary.slice(0, 100);
  if (event.detail) {
    const detailJson = JSON.stringify(event.detail);
    if (detailJson.length > MAX_EVENT_SIZE_BYTES * 0.8) {
      event.detail = { truncated: true, originalSize: detailJson.length };
    }
  }
  return event;
}

function normalizeEvent(raw, sessionId, sourceHint) {
  if (!raw || typeof raw !== 'object') return null;

  const ts = ensureNumericTs(raw);
  const type = resolveType(raw);
  const level = resolveLevel(raw);
  const source = sourceHint || SOURCES[type] || raw.source || DEFAULT_SOURCE;
  const detail = resolveDetail(raw);
  const summary = buildSummary(type, raw);
  const tags = resolveTags(raw, type);

  const event = {
    id: null,
    sessionId: sessionId || '',
    ts,
    seq: nextSeq(),
    type,
    level,
    summary,
    detail,
    source,
    tags,
  };

  return truncatePayload(event);
}

function denormalizeStored(row) {
  let detail = {};
  try {
    detail = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
  } catch (e) {
    detail = {};
  }

  if (detail.raw && !detail.summary) {
    detail.summary = detail.raw.slice(0, 200);
  }

  const event = {
    id: row.id,
    sessionId: row.session_id,
    ts: typeof row.timestamp === 'string' ? Date.parse(row.timestamp) || Date.now() : (row.timestamp || Date.now()),
    seq: detail.seq || 0,
    type: row.type || 'log',
    level: row.level || 'info',
    summary: detail.summary || detail.message || detail.raw?.slice(0, 200) || '',
    detail: detail.detail || detail,
    source: detail.source || SOURCES[row.type] || DEFAULT_SOURCE,
    tags: detail.tags || [],
  };

  return event;
}

module.exports = { normalizeEvent, denormalizeStored };
