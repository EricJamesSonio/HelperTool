const { getSqlJs } = require('./sharedSqlJs');
const path = require('path');
const fs = require('fs');

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
  const dbPath = getDbPath();

  let buffer = null;
  if (fs.existsSync(dbPath)) {
    buffer = fs.readFileSync(dbPath);
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

  return _db;
}

function createSchema() {
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
  const buffer = Buffer.from(data);
  const dbPath = getDbPath();
  const worker = _getWriteWorker();
  if (_writeWorkerBusy) {
    _pendingWrite = { buffer, path: dbPath };
    return;
  }
  _writeWorkerBusy = true;
  worker.postMessage({ buffer, path: dbPath });
}

function _flushSync() {
  if (!_db || !_dirty) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(getDbPath(), buffer);
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
