const initSqlJs = require('sql.js/dist/sql-wasm.js');
const path = require('path');
const fs = require('fs');

const DB_DIR = 'error-cop';
const DB_FILE = 'errors.db';

let _db = null;
let _appRef = null;
let _dirty = false;
let _interval = null;

function getDbPath() {
  const dir = path.join(_appRef.getPath('userData'), DB_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, DB_FILE);
}

async function initErrorCopDb(app) {
  if (_db) return _db;
  _appRef = app;

  const SQL = await initSqlJs();
  const dbPath = getDbPath();

  let buffer = null;
  if (fs.existsSync(dbPath)) {
    buffer = fs.readFileSync(dbPath);
  }

  _db = new SQL.Database(buffer);
  _db.run('PRAGMA journal_mode=WAL');
  _db.run('PRAGMA foreign_keys=ON');

  createSchema();
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
      status        TEXT CHECK(status IN ('running','ended','failed')) DEFAULT 'running',
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
}

function getErrorCopDb() {
  if (!_db) throw new Error('Error Cop database not initialized');
  return _db;
}

function _flush() {
  if (!_db) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  const dbPath = getDbPath();
  fs.writeFileSync(dbPath, buffer);
}

function save() {
  if (!_db) return;
  _dirty = true;
  if (!_interval) {
    _interval = setInterval(() => {
      if (_dirty) {
        _dirty = false;
        _flush();
      }
    }, 5000);
  }
}

function forceFlush() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  if (_dirty) {
    _dirty = false;
    _flush();
  }
}

function closeErrorCopDb() {
  if (_db) {
    forceFlush();
    _db.close();
    _db = null;
  }
}

module.exports = { initErrorCopDb, getErrorCopDb, save, forceFlush, closeErrorCopDb, getDbPath };
