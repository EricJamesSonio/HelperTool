function extractFileInfo(message, stack) {
  const text = stack || message || '';
  const stackMatch = text.match(/\((.+?):(\d+):(\d+)\)/);
  if (stackMatch) return { file: stackMatch[1], line: parseInt(stackMatch[2], 10) };
  const bareMatch = text.match(/((?:\/[^\s:]+?):(\d+):\d+)/);
  if (bareMatch) return { file: bareMatch[1].replace(/:\d+$/, ''), line: parseInt(bareMatch[2], 10) };
  return null;
}

function normalize(raw) {
  const info = extractFileInfo(raw.message, raw.stack);
  return {
    id: raw.id,
    sessionId: raw.session_id || raw.sessionId || null,
    project: raw.project || null,
    type: raw.level || 'error',
    message: raw.title || raw.message || '',
    file: info ? info.file : null,
    line: info ? info.line : null,
    timestamp: raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now(),
    occurrences: raw.occurrences || 1,
  };
}

function getErrors(storage, opts) {
  if (!storage) return { data: [], pagination: { total: 0, hasMore: false, limit: 0, offset: 0 } };
  const raw = storage.getErrors(opts);
  const data = (raw || []).map(normalize);
  var total = 0;
  var hasMore = false;
  if (opts && opts.limit) {
    total = storage.countErrors(opts);
    hasMore = (opts.offset || 0) + opts.limit < total;
  }
  return {
    data: data,
    pagination: {
      total: total,
      hasMore: hasMore,
      limit: (opts && opts.limit) || 50,
      offset: (opts && opts.offset) || 0,
    },
  };
}

function getSessionErrors(storage, sessionId) {
  if (!storage) return [];
  const raw = storage.getErrorsBySession(sessionId);
  return (raw || []).map(normalize);
}

function getErrorDetail(storage, id) {
  if (!storage || !id) return null;
  const raw = storage.getErrorById(id);
  if (!raw) return null;
  const info = extractFileInfo(raw.message, raw.stack);
  var occurrences = [];
  try {
    occurrences = storage.getOccurrencesBySession(raw.session_id);
  } catch (e) {}
  return {
    id: raw.id,
    sessionId: raw.session_id,
    project: raw.project || null,
    type: raw.level || 'error',
    source: raw.source || 'terminal',
    title: raw.title || '',
    message: raw.message || '',
    stack: raw.stack || null,
    file: info ? info.file : null,
    line: info ? info.line : null,
    timestamp: raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now(),
    occurrences: raw.occurrences || 1,
    occurrenceLines: occurrences.map(function (o) {
      return {
        timestamp: o.timestamp ? new Date(o.timestamp).getTime() : null,
        message: o.message || o.line_text || '',
        level: o.level,
      };
    }),
    firstSeen: raw.first_seen ? new Date(raw.first_seen).getTime() : null,
    lastSeen: raw.last_seen ? new Date(raw.last_seen).getTime() : null,
    fingerprint: raw.fingerprint || null,
    resolved: !!raw.resolved,
  };
}

function getTimeline(storage, opts) {
  if (!storage) return [];
  const raw = storage.getTimeline(opts);
  return (raw || []).map(function (t) {
    const info = extractFileInfo(t.message, t.stack);
    return {
      timestamp: t.timestamp ? new Date(t.timestamp).getTime() : Date.now(),
      type: t.level || 'error',
      title: t.title || '',
      message: t.message || '',
      level: t.level || 'error',
      file: info ? info.file : null,
      line: info ? info.line : null,
      sessionId: t.session_id || t.sessionId || null,
      project: t.project || null,
      command: t.command || '',
      label: t.label || '',
      occurrences: t.occurrences || 1,
    };
  });
}

function getUnreadCount(notify) {
  if (!notify) return { count: 0 };
  return { count: notify.getUnreadCount() };
}

function markRead(notify) {
  if (!notify) return { success: false };
  notify.resetUnreadCount();
  return { success: true };
}

function getSummary(storage) {
  if (!storage) {
    return { recent: [], mostFrequent: [], byType: { error: 0, warning: 0, info: 0 } };
  }
  const recentRaw = storage.getErrors({ limit: 20 });
  const recent = (recentRaw || []).map(normalize);
  const aggregated = storage.getSummary();
  return {
    recent: recent,
    mostFrequent: (aggregated.mostFrequent || []).map(normalize),
    byType: aggregated.byType || { error: 0, warning: 0, info: 0 },
  };
}

module.exports = {
  extractFileInfo,
  normalize,
  getErrors,
  getErrorDetail,
  getSessionErrors,
  getTimeline,
  getUnreadCount,
  markRead,
  getSummary,
};
