'use strict';

const fs = require('fs');
const path = require('path');

let _db = null;
let _available = false;
const _seq = new Map();

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

function redact(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/\/\/([^:@\/\s]+):([^@\/\s]+)@/g, '//$1:***@')
    .replace(/(password|passwd|pwd|secret|token|api[_-]?key)(\s*[=:]\s*)(["']?)[^\s"',;&]+/gi, '$1$2$3***')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/g, 'Bearer ***');
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
    _available = true;
  } catch (err) {
    console.error('[RepoConsole] History database is not available:', err.message);
    _db = null;
    _available = false;
  }
  return _available;
}

function available() {
  return _available;
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

function insertSteps(view) {
  const stmt = _db.prepare(
    'INSERT OR REPLACE INTO run_steps (run_id, idx, step_id, title, command, status, exit_code, started_at, ended_at, progress_json, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
      json(s.result)
    );
  }
}

function startRun(view, meta) {
  if (!_db) return;
  const m = meta || {};
  tx(() => {
    _db
      .prepare(
        'INSERT OR REPLACE INTO runs (id, repo_path, action_id, title, kind, env, app_env, host, db_name, command, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
        view.startedAt
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
      stmt.run(runId, seq, e.s === undefined ? 0 : e.s, e.k || 'out', redact(e.t));
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

function getRun(runId) {
  if (!_db) return null;
  const run = mapRun(_db.prepare('SELECT * FROM runs WHERE id = ?').get(String(runId)));
  if (!run) return null;
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
      progress: parseJson(s.progress_json),
      result: parseJson(s.result_json),
    }));
  const logs = _db
    .prepare('SELECT step_index, kind, text FROM run_logs WHERE run_id = ? ORDER BY seq LIMIT 200000')
    .all(run.id)
    .map((l) => ({ s: l.step_index, k: l.kind, t: l.text }));
  return { run, steps, logs };
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

function clearRuns(repoPath) {
  if (!_db) return 0;
  const count = countRuns(repoPath);
  tx(() => {
    _db.prepare('DELETE FROM run_logs WHERE run_id IN (SELECT id FROM runs WHERE repo_path = ?)').run(repoPath);
    _db.prepare('DELETE FROM run_steps WHERE run_id IN (SELECT id FROM runs WHERE repo_path = ?)').run(repoPath);
    _db.prepare('DELETE FROM runs WHERE repo_path = ?').run(repoPath);
  });
  return count;
}

module.exports = {
  init,
  available,
  redact,
  startRun,
  appendLogs,
  finishRun,
  markInterrupted,
  listRuns,
  getRun,
  lastRun,
  countRuns,
  clearRuns,
};