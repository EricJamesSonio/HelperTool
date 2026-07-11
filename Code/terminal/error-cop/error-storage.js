const { getErrorCopDb, save } = require('../../database/errorCopDb');

class ErrorStorage {
  // ── Sessions ──

  createSession({ project, cwd, shell, command }) {
    const db = getErrorCopDb();
    db.run(
      `INSERT INTO sessions (project, cwd, shell, command, status, started_at)
       VALUES (?, ?, ?, ?, 'running', datetime('now','localtime'))`,
      [project || '', cwd || '', shell || '', command || '']
    );
    save();
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    return id;
  }

  updateSessionCommand(id, command) {
    const db = getErrorCopDb();
    db.run('UPDATE sessions SET command = ? WHERE id = ?', [command, id]);
    save();
  }

  endSession(id, exitCode) {
    const db = getErrorCopDb();
    const status = exitCode === 0 ? 'ended' : 'failed';
    db.run(
      `UPDATE sessions SET status = ?, ended_at = datetime('now','localtime'), exit_code = ? WHERE id = ?`,
      [status, exitCode, id]
    );
    save();
  }

  incrementSessionLines(id) {
    const db = getErrorCopDb();
    db.run('UPDATE sessions SET total_lines = total_lines + 1 WHERE id = ?', [id]);
  }

  getSession(id) {
    const db = getErrorCopDb();
    const res = db.exec('SELECT * FROM sessions WHERE id = ?', [id]);
    if (!res.length || !res[0].values.length) return null;
    return _rowToObj(res[0], res[0].values[0]);
  }

  getRecentSessions(limit = 20) {
    const db = getErrorCopDb();
    const res = db.exec(
      `SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?`,
      [limit]
    );
    if (!res.length) return [];
    return res[0].values.map(r => _rowToObj(res[0], r));
  }

  // ── Errors ──

  insertError({ sessionId, project, level, source, title, message, stack, fingerprint, firstSeen, lastSeen }) {
    const db = getErrorCopDb();
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO errors (session_id, project, timestamp, level, source, title, message, stack, fingerprint, occurrences, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [sessionId, project || '', now, level, source || 'terminal', title, message || '', stack || null, fingerprint || null, firstSeen || now, lastSeen || now]
    );
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];

    db.run(
      `UPDATE sessions SET total_errors = total_errors + 1 WHERE id = ? AND ? = 'error'`,
      [sessionId, level]
    );
    db.run(
      `UPDATE sessions SET total_warnings = total_warnings + 1 WHERE id = ? AND ? = 'warning'`,
      [sessionId, level]
    );
    save();
    return id;
  }

  updateOccurrences(fingerprint, occurrences, lastSeen) {
    const db = getErrorCopDb();
    db.run(
      `UPDATE errors SET occurrences = ?, last_seen = ? WHERE fingerprint = ?`,
      [occurrences, lastSeen, fingerprint]
    );
    save();
  }

  getErrorsBySession(sessionId) {
    const db = getErrorCopDb();
    const res = db.exec(
      'SELECT * FROM errors WHERE session_id = ? ORDER BY timestamp ASC',
      [sessionId]
    );
    if (!res.length) return [];
    return res[0].values.map(r => _rowToObj(res[0], r));
  }

  getErrors({ project, level, limit = 50, offset = 0 } = {}) {
    const db = getErrorCopDb();
    let sql = 'SELECT * FROM errors WHERE 1=1';
    const params = [];
    if (project) { sql += ' AND project = ?'; params.push(project); }
    if (level) { sql += ' AND level = ?'; params.push(level); }
    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const res = db.exec(sql, params);
    if (!res.length) return [];
    return res[0].values.map(r => _rowToObj(res[0], r));
  }

  getTimeline({ project, limit = 100 } = {}) {
    const db = getErrorCopDb();
    let sql = `SELECT e.id, e.timestamp, e.level, e.title, e.message, e.occurrences,
                      e.session_id, COALESCE(e.project, s.project) as project, s.command
               FROM errors e
               LEFT JOIN sessions s ON s.id = e.session_id
               WHERE 1=1`;
    const params = [];
    if (project) { sql += ' AND (e.project = ? OR s.project = ?)'; params.push(project, project); }
    sql += ' ORDER BY e.timestamp DESC LIMIT ?';
    params.push(limit);
    const res = db.exec(sql, params);
    if (!res.length) return [];
    return res[0].values.map(r => _rowToObj(res[0], r));
  }

  markRead(sessionId) {
    // No-op: read status is client-side via unread tracking
    // We keep this for API compat
  }

  getUnreadCount(project) {
    // Simple heuristic: count errors from last 24h for the project
    const db = getErrorCopDb();
    const res = db.exec(
      `SELECT COUNT(*) as cnt FROM errors
       WHERE project = ? AND timestamp > datetime('now','localtime','-1 day')`,
      [project || '']
    );
    if (!res.length) return 0;
    return res[0].values[0][0];
  }

  // ── Browser Servers ──

  insertBrowserServer({ sessionId, port, framework, url }) {
    const db = getErrorCopDb();
    db.run(
      `INSERT INTO browser_servers (session_id, port, framework, url)
       VALUES (?, ?, ?, ?)`,
      [sessionId, port, framework || '', url || '']
    );
    save();
  }

  getBrowserServers(sessionId) {
    const db = getErrorCopDb();
    const res = db.exec(
      'SELECT * FROM browser_servers WHERE session_id = ? ORDER BY detected_at',
      [sessionId]
    );
    if (!res.length) return [];
    return res[0].values.map(r => _rowToObj(res[0], r));
  }

  // ── Cleanup ──

  purgeOldSessions(days = 30) {
    const db = getErrorCopDb();
    db.run(
      `DELETE FROM sessions WHERE started_at < datetime('now','localtime',?-||' days')`,
      [days]
    );
    save();
  }
}

function _rowToObj(meta, row) {
  const obj = {};
  meta.columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

module.exports = { ErrorStorage };
