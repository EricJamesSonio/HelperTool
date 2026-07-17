function getSessions(storage, opts) {
  if (!storage) return [];
  var raw;
  if (typeof opts === 'number') {
    raw = storage.getRecentSessions(opts);
  } else {
    raw = storage.getSessions(opts || {});
  }
  return (raw || []).map(function (s) {
    return {
      id: s.id,
      project: s.project || '',
      command: s.command || '',
      cwd: s.cwd || '',
      status: s.status || '',
      exitCode: s.exit_code,
      startedAt: s.started_at ? new Date(s.started_at).getTime() : null,
      endedAt: s.ended_at ? new Date(s.ended_at).getTime() : null,
      totalErrors: s.total_errors || 0,
      totalWarnings: s.total_warnings || 0,
      totalLines: s.total_lines || 0,
    };
  });
}

module.exports = { getSessions };
