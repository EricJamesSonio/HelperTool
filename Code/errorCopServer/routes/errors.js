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
    type: raw.level || 'error',
    message: raw.title || raw.message || '',
    file: info ? info.file : null,
    line: info ? info.line : null,
    timestamp: raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now(),
    occurrences: raw.occurrences || 1,
  };
}

function getErrors(storage, opts) {
  if (!storage) return [];
  const raw = storage.getErrors(opts);
  return (raw || []).map(normalize);
}

function getSessionErrors(storage, sessionId) {
  if (!storage) return [];
  const raw = storage.getErrorsBySession(sessionId);
  return (raw || []).map(normalize);
}

function getTimeline(storage, opts) {
  if (!storage) return [];
  const raw = storage.getTimeline(opts);
  return (raw || []).map(function (t) {
    return Object.assign({}, t, {
      timestamp: t.timestamp ? new Date(t.timestamp).getTime() : Date.now(),
    });
  });
}

function getUnreadCount(notify) {
  if (!notify) return { count: 0 };
  return { count: notify.getUnreadCount() };
}

function getSummary(storage) {
  if (!storage) {
    return { recent: [], mostFrequent: [], byType: { error: 0, warning: 0 } };
  }
  const recent = getErrors(storage, { limit: 20 });
  var byType = { error: 0, warning: 0 };
  recent.forEach(function (e) {
    if (byType[e.type] !== undefined) byType[e.type]++;
  });
  var sorted = recent.slice().sort(function (a, b) {
    return (b.occurrences || 1) - (a.occurrences || 1);
  });
  return {
    recent: recent,
    mostFrequent: sorted.slice(0, 5),
    byType: byType,
  };
}

module.exports = {
  extractFileInfo,
  normalize,
  getErrors,
  getSessionErrors,
  getTimeline,
  getUnreadCount,
  getSummary,
};
