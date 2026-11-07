const { getSqlJs } = require('./sharedSqlJs');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const DB_DIR = 'error-cop';
const DB_FILE = 'errors.db';

const WRITE_WORKER_CODE = `
const { parentPort } = require('worker_threads');
const fs = require('fs');
parentPort.on('message', ({ buffer, path }) => {
  try {
    fs.writeFileSync(path, buffer);
    parentPort.postMessage({ ok: true });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err.message });
  }
});
`;

let _db = null;
let _appRef = null;
let _saveTimer = null;
let _writeWorker = null;
let _writeWorkerBusy = false;
let _pendingWrite = null;
let _dirty = false;

function getDbPath() {
  const dir = path.join(_appRef.getPath('userData'), DB_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, DB_FILE);
}

async function initErrorCopDb(app) {
  if (_db) return _db;
  _appRef = app;

  const SQL = await getSqlJs();

  // Yield before sync I/O so renderer isn't blocked
  await new Promise(r => setTimeout(r, 0));

  const dbPath = getDbPath();

  let buffer = null;
  if (fs.existsSync(dbPath)) {
    buffer = await fsp.readFile(dbPath);
  }

  _db = new SQL.Database(buffer);
  _db.run('PRAGMA journal_mode=WAL');
  _db.run('PRAGMA foreign_keys=ON');
  _dirty = false;

  _db = new Proxy(_db, {
    get(target, prop) {
      const val = target[prop];
      if (typeof val === 'function' && (prop === 'run' || prop === 'exec' || prop === 'prepare')) {
        return function (...args) {
          _dirty = true;
          return val.apply(target, args);
        };
      }
      return val;
    }
  });

  createSchema();
  migrateSchema();
  _flush();

  const timer = setTimeout(runMaintenance, 30000);
  if (timer.unref) timer.unref();

  return _db;
}

function createSchema() {
  try {
    const r = _db.exec("SELECT count(*) c FROM sqlite_master WHERE type='table' AND name IN ('sessions','errors','error_occurrences','browser_servers')");
    if (r.length > 0 && r[0].values[0][0] === 4) return;
  } catch {}

  _db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      project       TEXT DEFAULT '',
      command       TEXT DEFAULT '',
      cwd           TEXT DEFAULT '',
      shell         TEXT DEFAULT '',
      label         TEXT DEFAULT '',
      status        TEXT CHECK(status IN ('running','ended','failed','killed')) DEFAULT 'running',
      ended_reason  TEXT DEFAULT '',
      started_at    TEXT DEFAULT (datetime('now','localtime')),
      ended_at      TEXT,
      exit_code     INTEGER,
      total_errors  INTEGER DEFAULT 0,
      total_warnings INTEGER DEFAULT 0,
      total_lines   INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS errors (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      project       TEXT DEFAULT '',
      timestamp     TEXT NOT NULL,
      level         TEXT CHECK(level IN ('error','warning','info')) DEFAULT 'error',
      source        TEXT DEFAULT 'terminal',
      title         TEXT NOT NULL,
      message       TEXT DEFAULT '',
      stack         TEXT,
      fingerprint   TEXT,
      occurrences   INTEGER DEFAULT 1,
      first_seen    TEXT,
      last_seen     TEXT,
      resolved      INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS error_occurrences (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      fingerprint   TEXT DEFAULT '',
      level         TEXT CHECK(level IN ('error','warning','info')) DEFAULT 'error',
      title         TEXT NOT NULL,
      message       TEXT DEFAULT '',
      line_text     TEXT DEFAULT '',
      timestamp     TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS browser_servers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      port          INTEGER NOT NULL,
      framework     TEXT DEFAULT '',
      url           TEXT DEFAULT '',
      detected_at   TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  _db.run('CREATE INDEX IF NOT EXISTS idx_errors_session ON errors(session_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_occurrences_session ON error_occurrences(session_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_occurrences_timestamp ON error_occurrences(timestamp)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_errors_project ON errors(project)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_errors_level ON errors(level)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_errors_fingerprint ON errors(fingerprint)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_errors_timestamp ON errors(timestamp)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at)');
}

function migrateSchema() {
  try { _db.run("ALTER TABLE sessions ADD COLUMN label TEXT DEFAULT ''"); } catch (e) {}
  try { _db.run("ALTER TABLE sessions ADD COLUMN ended_reason TEXT DEFAULT ''"); } catch (e) {}
}

const KEEP_DAYS = 30;
const VACUUM_LIMIT_BYTES = 200 * 1024 * 1024;

function countRows() {
  const r = _db.exec('SELECT (SELECT COUNT(*) FROM errors) + (SELECT COUNT(*) FROM error_occurrences) + (SELECT COUNT(*) FROM sessions) + (SELECT COUNT(*) FROM browser_servers)');
  return r.length ? Number(r[0].values[0][0]) || 0 : 0;
}

function dbBytes() {
  const pc = _db.exec('PRAGMA page_count');
  const ps = _db.exec('PRAGMA page_size');
  const count = pc.length ? Number(pc[0].values[0][0]) || 0 : 0;
  const size = ps.length ? Number(ps[0].values[0][0]) || 0 : 0;
  return count * size;
}

function runMaintenance() {
  if (!_db) return;
  try {
    const before = countRows();
    const old = "SELECT id FROM sessions WHERE status != 'running' AND started_at < datetime('now','localtime','-' || ? || ' days')";
    _db.run('DELETE FROM error_occurrences WHERE session_id IN (' + old + ')', [KEEP_DAYS]);
    _db.run('DELETE FROM errors WHERE session_id IN (' + old + ')', [KEEP_DAYS]);
    _db.run('DELETE FROM browser_servers WHERE session_id IN (' + old + ')', [KEEP_DAYS]);
    _db.run("DELETE FROM sessions WHERE status != 'running' AND started_at < datetime('now','localtime','-' || ? || ' days')", [KEEP_DAYS]);
    _db.run('DELETE FROM error_occurrences WHERE session_id NOT IN (SELECT id FROM sessions)');
    _db.run('DELETE FROM errors WHERE session_id NOT IN (SELECT id FROM sessions)');
    const removed = before - countRows();
    if (removed > 500 && dbBytes() < VACUUM_LIMIT_BYTES) {
      _db.run('VACUUM');
    }
    if (removed > 0) save();
  } catch (err) {
    console.error('[ErrorCopDB] maintenance failed:', err.message);
  }
}
function getErrorCopDb() {
  if (!_db) throw new Error('Error Cop database not initialized');
  return _db;
}

function _getWriteWorker() {
  if (_writeWorker) return _writeWorker;
  const { Worker } = require('worker_threads');
  _writeWorker = new Worker(WRITE_WORKER_CODE, { eval: true });
  _writeWorker.on('message', () => {
    _writeWorkerBusy = false;
    if (_pendingWrite) {
      const { buffer, path } = _pendingWrite;
      _pendingWrite = null;
      _writeWorkerBusy = true;
      _writeWorker.postMessage({ buffer, path });
    }
  });
  _writeWorker.on('error', (err) => {
    console.error('[ErrorCopDB] Write worker error:', err.message);
    _writeWorkerBusy = false;
    _writeWorker = null;
  });
  _writeWorker.on('exit', () => {
    _writeWorker = null;
    _writeWorkerBusy = false;
  });
  return _writeWorker;
}

function _flush() {
  if (!_db || !_dirty) return;
  _dirty = false;
  const data = _db.export();
  const dbPath = getDbPath();
  if (_writeWorkerBusy) {
    _pendingWrite = { buffer: data, path: dbPath };
    return;
  }
  const worker = _getWriteWorker();
  const owns = data.buffer instanceof ArrayBuffer && data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;
  _writeWorkerBusy = true;
  worker.postMessage({ buffer: data, path: dbPath }, owns ? [data.buffer] : []);
}

function _flushSync() {
  if (!_db || !_dirty) return;
  fs.writeFileSync(getDbPath(), _db.export());
}

function save() {
  if (!_db || !_dirty) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    _flush();
  }, 2000);
}

function forceFlush() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  _flushSync();
}

function closeErrorCopDb() {
  if (_db) {
    forceFlush();
    _db.close();
    _db = null;
  }
  if (_writeWorker) { try { _writeWorker.terminate(); } catch (_) {} _writeWorker = null; }
}

module.exports = { initErrorCopDb, getErrorCopDb, save, forceFlush, closeErrorCopDb, getDbPath };
