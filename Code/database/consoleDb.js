'use strict';

const fs = require('fs');
const path = require('path');

let _db = null;
let _available = false;
let _logCap = 200000;
const _seq = new Map();
const _capped = new Set();
const MAX_SNAPSHOT = 200000;

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  action_id TEXT,
  title TEXT NOT NULL,
  kind TEXT,
  env TEXT,
  app_env TEXT,
  host TEXT,
  db_name TEXT,
  command TEXT,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_ms INTEGER,
  exit_code INTEGER,
  error TEXT,
  meta_json TEXT
);
CREATE TABLE IF NOT EXISTS run_steps (
  run_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  step_id TEXT,
  title TEXT,
  command TEXT,
  status TEXT,
  exit_code INTEGER,
  started_at INTEGER,
  ended_at INTEGER,
  progress_json TEXT,
  result_json TEXT,
  PRIMARY KEY (run_id, idx)
);
CREATE TABLE IF NOT EXISTS run_logs (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  step_index INTEGER,
  kind TEXT,
  text TEXT,
  PRIMARY KEY (run_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_runs_repo_started ON runs (repo_path, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_action ON runs (action_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs (status);
`;

const SCHEMA_V2_TABLES = `
CREATE TABLE IF NOT EXISTS run_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  step_idx INTEGER,
  fingerprint TEXT,
  level TEXT,
  title TEXT,
  message TEXT,
  file TEXT,
  line INTEGER,
  col INTEGER,
  stack TEXT,
  count INTEGER DEFAULT 1,
  log_seq INTEGER
);
CREATE INDEX IF NOT EXISTS idx_run_errors_run ON run_errors (run_id);
`;

const SCHEMA_V2_COLUMNS = [
  ['job_id', 'TEXT'],
  ['job_name', 'TEXT'],
  ['reason', 'TEXT'],
];

function redact(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/\/\/([^:@\/\s]+):([^@\/\s]+)@/g, '//$1:***@')
    .replace(/(password|passwd|pwd|secret|token|api[_-]?key)(\s*[=:]\s*)(["']?)[^\s"',;&]+/gi, '$1$2$3***')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/g, 'Bearer ***');
}

function columnExists(table, column) {
  const rows = _db.prepare('PRAGMA table_info(' + table + ')').all();
  return rows.some((r) => r.name === column);
}

function migrateV2() {
  tx(() => {
    for (const [column, type] of SCHEMA_V2_COLUMNS) {
      if (!columnExists('run_steps', column)) {
        _db.exec('ALTER TABLE run_steps ADD COLUMN ' + column + ' ' + type);
      }
    }
    _db.exec(SCHEMA_V2_TABLES);
  });
}

function init(app) {
  if (_db) return _available;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const dir = path.join(app.getPath('userData'), 'repo-console');
    fs.mkdirSync(dir, { recursive: true });
    _db = new DatabaseSync(path.join(dir, 'console.db'));
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA synchronous = NORMAL');
    const row = _db.prepare('PRAGMA user_version').get();
    const version = row ? row.user_version : 0;
    if (version < 1) {
      _db.exec(SCHEMA_V1);
      _db.exec('PRAGMA user_version = 1');
    }
    if (version < 2) {
      migrateV2();
      _db.exec('PRAGMA user_version = 2');
    }
    _available = true;
  } catch (err) {
    console.error('[RepoConsole] History database is not available:', err.message);
    try {
      if (_db) _db.close();
    } catch (closeError) {
      /* nothing to close */
    }
    _db = null;
    _available = false;
  }
  return _available;
}

function close() {
  if (_db) {
    try {
      _db.close();
    } catch (err) {
      /* already closed */
    }
  }
  _db = null;
  _available = false;
  _seq.clear();
  _capped.clear();
}

function available() {
  return _available;
}

function setLogCap(count) {
  _logCap = Number(count) > 0 ? Number(count) : 200000;
}

function tx(fn) {
  _db.exec('BEGIN');
  try {
    fn();
    _db.exec('COMMIT');
  } catch (err) {
    try {
      _db.exec('ROLLBACK');
    } catch (rollbackError) {
      /* nothing to roll back */
    }
    throw err;
  }
}

function json(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function num(value) {
  return Number.isFinite(value) ? value : null;
}

function snapshotJson(snapshot) {
  if (snapshot === null || snapshot === undefined) return null;
  let text;
  try {
    text = JSON.stringify(snapshot);
  } catch (err) {
    return null;
  }
  if (!text) return null;
  if (text.length > MAX_SNAPSHOT) {
    text = JSON.stringify({ truncated: true, note: 'The run snapshot was larger than ' + MAX_SNAPSHOT + ' characters and was not stored.' });
  }
  return redact(text);
}

function insertSteps(view) {
  const stmt = _db.prepare(
    'INSERT OR REPLACE INTO run_steps (run_id, idx, step_id, title, command, status, exit_code, started_at, ended_at, progress_json, result_json, job_id, job_name, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const s of view.steps || []) {
    stmt.run(
      view.id,
      s.idx,
      s.id || null,
      redact(s.title),
      redact(s.command),
      s.status || null,
      s.exitCode === undefined ? null : s.exitCode,
      s.startedAt || null,
      s.endedAt || null,
      json(s.progress),
      json(s.result),
      s.jobId || null,
      s.jobTitle ? redact(s.jobTitle) : null,
      s.reason || null
    );
  }
}

function startRun(view, meta) {
  if (!_db) return;
  const m = meta || {};
  tx(() => {
    _db
      .prepare(
        'INSERT OR REPLACE INTO runs (id, repo_path, action_id, title, kind, env, app_env, host, db_name, command, status, started_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        view.id,
        view.repoPath,
        m.actionId || view.actionId || null,
        redact(view.title),
        view.kind || null,
        m.env || null,
        m.appEnv || null,
        m.host || null,
        m.database || null,
        redact(m.command || ''),
        'running',
        view.startedAt,
        snapshotJson(m.snapshot)
      );
    insertSteps(view);
  });
}

function appendLogs(runId, entries) {
  if (!_db || !entries || !entries.length) return;
  let seq = _seq.get(runId);
  if (seq === undefined) {
    const row = _db.prepare('SELECT COALESCE(MAX(seq), -1) AS m FROM run_logs WHERE run_id = ?').get(runId);
    seq = (row ? row.m : -1) + 1;
  }
  const stmt = _db.prepare('INSERT OR REPLACE INTO run_logs (run_id, seq, step_index, kind, text) VALUES (?, ?, ?, ?, ?)');
  tx(() => {
    for (const e of entries) {
      const stepIndex = e.s === undefined ? 0 : e.s;
      if (seq >= _logCap) {
        if (!_capped.has(runId)) {
          _capped.add(runId);
          stmt.run(runId, seq, stepIndex, 'sys', '[output truncated: history keeps the first ' + _logCap + ' lines of a run]');
          seq += 1;
        }
        continue;
      }
      stmt.run(runId, seq, stepIndex, e.k || 'out', redact(e.t));
      seq += 1;
    }
  });
  _seq.set(runId, seq);
}

function finishRun(view) {
  if (!_db) return;
  tx(() => {
    _db
      .prepare('UPDATE runs SET status = ?, ended_at = ?, duration_ms = ?, exit_code = ?, error = ? WHERE id = ?')
      .run(
        view.status,
        view.endedAt || Date.now(),
        view.endedAt ? view.endedAt - view.startedAt : null,
        view.exitCode === undefined ? null : view.exitCode,
        view.error ? redact(view.error) : null,
        view.id
      );
    insertSteps(view);
  });
  _seq.delete(view.id);
  _capped.delete(view.id);
}

function markInterrupted() {
  if (!_db) return;
  try {
    tx(() => {
      _db.exec("UPDATE run_steps SET status = 'interrupted' WHERE status = 'running' AND run_id IN (SELECT id FROM runs WHERE status = 'running')");
      _db.exec("UPDATE runs SET status = 'interrupted', ended_at = COALESCE(ended_at, started_at) WHERE status = 'running'");
    });
  } catch (err) {
    console.error('[RepoConsole] markInterrupted failed:', err.message);
  }
}

function insertErrors(runId, errors) {
  if (!_db || !errors || !errors.length) return;
  const stmt = _db.prepare(
    'INSERT INTO run_errors (run_id, step_idx, fingerprint, level, title, message, file, line, col, stack, count, log_seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  tx(() => {
    for (const e of errors) {
      stmt.run(
        String(runId),
        num(e.stepIdx),
        e.fingerprint || null,
        e.level || 'error',
        redact(e.title),
        redact(e.message),
        e.file || null,
        num(e.line),
        num(e.col),
        e.stack ? redact(e.stack) : null,
        e.count > 0 ? e.count : 1,
        num(e.logSeq)
      );
    }
  });
}

function listErrors(runId) {
  if (!_db) return [];
  return _db
    .prepare('SELECT * FROM run_errors WHERE run_id = ? ORDER BY id')
    .all(String(runId))
    .map((r) => ({
      id: r.id,
      stepIdx: r.step_idx,
      fingerprint: r.fingerprint,
      level: r.level,
      title: r.title,
      message: r.message,
      file: r.file,
      line: r.line,
      col: r.col,
      stack: r.stack,
      count: r.count,
      logSeq: r.log_seq,
    }));
}

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    repoPath: row.repo_path,
    actionId: row.action_id,
    title: row.title,
    kind: row.kind,
    env: row.env,
    appEnv: row.app_env,
    host: row.host,
    database: row.db_name,
    command: row.command,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    exitCode: row.exit_code,
    error: row.error,
  };
}

function listRuns(repoPath, opts) {
  if (!_db) return { items: [], total: 0 };
  const o = opts || {};
  const page = Math.max(1, parseInt(o.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(o.limit, 10) || 25));
  const where = ['repo_path = ?'];
  const params = [repoPath];
  if (o.action) {
    where.push('action_id = ?');
    params.push(String(o.action));
  }
  if (o.status) {
    where.push('status = ?');
    params.push(String(o.status));
  }
  if (o.env) {
    where.push('env = ?');
    params.push(String(o.env));
  }
  if (o.q) {
    const like = '%' + String(o.q).replace(/[%_]/g, '') + '%';
    where.push('(title LIKE ? OR action_id LIKE ? OR command LIKE ? OR db_name LIKE ?)');
    params.push(like, like, like, like);
  }
  const clause = where.join(' AND ');
  const total = _db.prepare('SELECT COUNT(*) AS n FROM runs WHERE ' + clause).get(...params).n;
  const rows = _db
    .prepare('SELECT * FROM runs WHERE ' + clause + ' ORDER BY started_at DESC LIMIT ? OFFSET ?')
    .all(...params, limit, (page - 1) * limit);
  return { items: rows.map(mapRun), total };
}

function slimError(e) {
  return {
    level: e.level,
    title: e.title,
    message: String(e.message || '').slice(0, 300),
    file: e.file,
    line: e.line,
    col: e.col,
    count: e.count,
  };
}

function previousRunFor(row) {
  return _db
    .prepare(
      "SELECT * FROM runs WHERE repo_path = ? AND action_id = ? AND kind = 'ci' AND status NOT IN ('running', 'interrupted') AND started_at < ? ORDER BY started_at DESC LIMIT 1"
    )
    .get(row.repo_path, row.action_id, row.started_at);
}

function compareRun(row, steps, errors) {
  if (row.kind !== 'ci' || !row.action_id) return null;
  const previous = previousRunFor(row);
  if (!previous) return { previous: null };

  const earlierErrors = listErrors(previous.id);
  const earlierSteps = _db.prepare('SELECT step_id, title, status FROM run_steps WHERE run_id = ?').all(previous.id);
  const before = new Set(earlierErrors.map((e) => e.fingerprint));
  const after = new Set(errors.map((e) => e.fingerprint));

  const newErrors = errors.filter((e) => !before.has(e.fingerprint)).map(slimError);
  const fixedErrors = earlierErrors.filter((e) => !after.has(e.fingerprint)).map(slimError);
  const persisting = errors.filter((e) => before.has(e.fingerprint)).length;

  const earlierById = new Map(earlierSteps.map((s) => [s.step_id, s]));
  const stepChanges = [];
  for (const step of steps) {
    const earlier = earlierById.get(step.id);
    if (earlier && earlier.status !== step.status) {
      stepChanges.push({ id: step.id, title: step.title, from: earlier.status, to: step.status });
    }
  }

  return {
    previous: { id: previous.id, status: previous.status, startedAt: previous.started_at },
    newErrors,
    fixedErrors,
    persisting,
    stepChanges,
  };
}

function getRun(runId) {
  if (!_db) return null;
  const row = _db.prepare('SELECT * FROM runs WHERE id = ?').get(String(runId));
  const run = mapRun(row);
  if (!run) return null;
  run.meta = parseJson(row.meta_json);
  const steps = _db
    .prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY idx')
    .all(run.id)
    .map((s) => ({
      idx: s.idx,
      id: s.step_id,
      title: s.title,
      command: s.command,
      status: s.status,
      exitCode: s.exit_code,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      jobId: s.job_id,
      jobTitle: s.job_name,
      reason: s.reason,
      progress: parseJson(s.progress_json),
      result: parseJson(s.result_json),
    }));
  const logs = _db
    .prepare('SELECT step_index, kind, text FROM run_logs WHERE run_id = ? ORDER BY seq LIMIT ?')
    .all(run.id, _logCap + 10)
    .map((l) => ({ s: l.step_index, k: l.kind, t: l.text }));
  const errors = listErrors(run.id);
  return { run, steps, logs, errors, compare: compareRun(row, steps, errors) };
}

function lastRun(repoPath, actionId, env) {
  if (!_db) return null;
  const row = _db
    .prepare('SELECT * FROM runs WHERE repo_path = ? AND action_id = ? AND env = ? ORDER BY started_at DESC LIMIT 1')
    .get(repoPath, actionId, env);
  return mapRun(row);
}

function countRuns(repoPath) {
  if (!_db) return 0;
  return _db.prepare('SELECT COUNT(*) AS n FROM runs WHERE repo_path = ?').get(repoPath).n;
}

function deleteRunRows(runId) {
  _db.prepare('DELETE FROM run_logs WHERE run_id = ?').run(runId);
  _db.prepare('DELETE FROM run_steps WHERE run_id = ?').run(runId);
  _db.prepare('DELETE FROM run_errors WHERE run_id = ?').run(runId);
  _db.prepare('DELETE FROM runs WHERE id = ?').run(runId);
}

function pruneRuns(repoPath, keep, kind) {
  if (!_db) return 0;
  const limit = parseInt(keep, 10);
  if (!(limit >= 1)) return 0;
  const where = ['repo_path = ?', "status != 'running'"];
  const params = [repoPath];
  if (kind) {
    where.push('kind = ?');
    params.push(String(kind));
  }
  const ids = _db
    .prepare('SELECT id FROM runs WHERE ' + where.join(' AND ') + ' ORDER BY started_at DESC LIMIT -1 OFFSET ?')
    .all(...params, limit)
    .map((r) => r.id);
  if (!ids.length) return 0;
  tx(() => {
    for (const id of ids) deleteRunRows(id);
  });
  return ids.length;
}

function clearRuns(repoPath) {
  if (!_db) return 0;
  const count = countRuns(repoPath);
  tx(() => {
    _db.prepare('DELETE FROM run_logs WHERE run_id IN (SELECT id FROM runs WHERE repo_path = ?)').run(repoPath);
    _db.prepare('DELETE FROM run_steps WHERE run_id IN (SELECT id FROM runs WHERE repo_path = ?)').run(repoPath);
    _db.prepare('DELETE FROM run_errors WHERE run_id IN (SELECT id FROM runs WHERE repo_path = ?)').run(repoPath);
    _db.prepare('DELETE FROM runs WHERE repo_path = ?').run(repoPath);
  });
  return count;
}

module.exports = {
  init,
  close,
  available,
  redact,
  startRun,
  appendLogs,
  finishRun,
  markInterrupted,
  insertErrors,
  listErrors,
  listRuns,
  getRun,
  lastRun,
  countRuns,
  pruneRuns,
  clearRuns,
  _setLogCap: setLogCap,
};