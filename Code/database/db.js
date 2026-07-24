const { getSqlJs } = require('./sharedSqlJs');
const path = require('path');
const fs = require('fs');

const DB_DIR = 'symbol-index';
const DB_FILE = 'index.db';

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

async function initDatabase(app) {
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

  const _debugQuery = !!process.env.DEBUG_QUERY;
  _db = new Proxy(_db, {
    get(target, prop) {
      const val = target[prop];
      if (typeof val === 'function' && (prop === 'run' || prop === 'exec' || prop === 'prepare')) {
        return function (...args) {
          _dirty = true;
          if (_debugQuery && typeof args[0] === 'string') {
            const sql = args[0].replace(/\s+/g, ' ').trim().slice(0, 120);
            console.log(`[DB] ${prop}: ${sql}`);
          }
          return val.apply(target, args);
        };
      }
      return val;
    }
  });

  // Yield before schema creation so any pending renderer IPC (features, activeProject) gets processed
  await new Promise(r => setTimeout(r, 0));
  createSchema();
  _flush();

  return _db;
}

function _tablesExist(names) {
  try {
    const r = _db.exec(`SELECT count(*) c FROM sqlite_master WHERE type='table' AND name IN (${names.map(n => `'${n}'`).join(',')})`);
    return r.length > 0 && r[0].values[0][0] === names.length;
  } catch { return false; }
}

function createSchema() {
  const localTables = ['boards','blueprint_categories','blueprints','kit_items','profile','profile_meta','activity_days','file_save_events','github_repo_trees'];

  if (!process.env.SKIP_SHARED_DB) {
    localTables.push('repositories','indexed_files','symbols','file_imports');
  }

  if (_tablesExist(localTables)) {
    try { _db.run("ALTER TABLE profile ADD COLUMN bio TEXT DEFAULT ''"); } catch (e) {}
    try { _db.run("ALTER TABLE profile ADD COLUMN website TEXT DEFAULT ''"); } catch (e) {}
    return;
  }

  if (!process.env.SKIP_SHARED_DB) {
    _db.run(`
      CREATE TABLE IF NOT EXISTS repositories (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_path     TEXT UNIQUE NOT NULL,
        name          TEXT NOT NULL,
        indexed       INTEGER DEFAULT 0,
        last_indexed  TEXT,
        total_files   INTEGER DEFAULT 0,
        total_symbols INTEGER DEFAULT 0,
        config_json   TEXT DEFAULT '{}',
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now'))
      )
    `);

    _db.run(`
      CREATE TABLE IF NOT EXISTS indexed_files (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id       INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        path          TEXT NOT NULL,
        language      TEXT,
        file_hash     TEXT,
        last_modified TEXT,
        indexed_at    TEXT,
        is_dirty      INTEGER DEFAULT 0,
        UNIQUE(repo_id, path)
      )
    `);

    _db.run(`
      CREATE TABLE IF NOT EXISTS symbols (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id       INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        file_id       INTEGER NOT NULL REFERENCES indexed_files(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        type          TEXT NOT NULL,
        line          INTEGER,
        column        INTEGER,
        is_exported   INTEGER DEFAULT 0,
        class_name    TEXT,
        language      TEXT,
        signature     TEXT,
        created_at    TEXT DEFAULT (datetime('now'))
      )
    `);

    try {
      _db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(name, signature, content=symbols, content_rowid=id)`);
      try {
        const existing = _db.exec("SELECT COUNT(*) as cnt FROM symbols_fts");
        if (existing.length > 0 && existing[0].values[0][0] === 0) {
          _db.run("INSERT INTO symbols_fts(rowid, name, signature) SELECT id, name, signature FROM symbols");
          console.log('[DB] FTS5 populated with existing symbols');
        }
      } catch (e) {
        console.log('[DB] FTS5 population skipped:', e.message);
      }
    } catch (e) {
      console.log('[DB] FTS5 not available, search fallback will be used:', e.message);
    }

    _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_repo_id ON symbols(repo_id)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_indexed_files_repo_dirty ON indexed_files(repo_id, is_dirty)');

    _db.run(`
      CREATE TABLE IF NOT EXISTS file_imports (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id       INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        file_id       INTEGER NOT NULL REFERENCES indexed_files(id) ON DELETE CASCADE,
        import_path   TEXT NOT NULL,
        import_type   TEXT NOT NULL,
        resolved_file_id INTEGER,
        imported_symbols TEXT,
        line          INTEGER,
        column        INTEGER
      )
    `);
    _db.run('CREATE INDEX IF NOT EXISTS idx_imports_file ON file_imports(file_id)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_imports_resolved ON file_imports(resolved_file_id)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_imports_repo ON file_imports(repo_id)');

    const row = _db.exec("SELECT name FROM sqlite_master WHERE type='trigger' AND name='symbols_ai'");
    const hasFts = _db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='symbols_fts'");
    if (row.length === 0 && hasFts.length > 0) {
      try {
        _db.run(`CREATE TRIGGER symbols_ai AFTER INSERT ON symbols BEGIN
          INSERT INTO symbols_fts(rowid, name, signature) VALUES (new.id, new.name, new.signature);
        END`);
        _db.run(`CREATE TRIGGER symbols_ad AFTER DELETE ON symbols BEGIN
          INSERT INTO symbols_fts(symbols_fts, rowid, name, signature) VALUES('delete', old.id, old.name, old.signature);
        END`);
        _db.run(`CREATE TRIGGER symbols_au AFTER UPDATE ON symbols BEGIN
          INSERT INTO symbols_fts(symbols_fts, rowid, name, signature) VALUES('delete', old.id, old.name, old.signature);
          INSERT INTO symbols_fts(rowid, name, signature) VALUES (new.id, new.name, new.signature);
        END`);
      } catch (e) {
        console.log('[DB] FTS5 triggers skipped:', e.message);
      }
    }
  }

  _db.run(`
    CREATE TABLE IF NOT EXISTS boards (
      id         TEXT PRIMARY KEY,
      repo_path  TEXT,
      name       TEXT NOT NULL,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  _db.run('CREATE INDEX IF NOT EXISTS idx_boards_repo ON boards(repo_path)');

  // ── Blueprint Library ────────────────────────────────────────────────
  _db.run(`
    CREATE TABLE IF NOT EXISTS blueprint_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      type       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS blueprints (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES blueprint_categories(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      pseudo_code TEXT NOT NULL,
      tags        TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS kit_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES blueprint_categories(id) ON DELETE CASCADE,
      kit_level   TEXT NOT NULL CHECK(kit_level IN ('starter', 'medium', 'large')),
      item_type   TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      sort_order  INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS profile (
      id            INTEGER PRIMARY KEY DEFAULT 1,
      name          TEXT,
      email         TEXT,
      avatar_color  TEXT DEFAULT '#4F8EF7',
      facebook      TEXT,
      tiktok        TEXT,
      linkedin      TEXT,
      wakatime      TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS profile_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS activity_days (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      date            TEXT NOT NULL,
      repo_path       TEXT NOT NULL,
      repo_name       TEXT NOT NULL,
      commits         INTEGER DEFAULT 0,
      files_touched   INTEGER DEFAULT 0,
      file_saves      INTEGER DEFAULT 0,
      lines_added     INTEGER DEFAULT 0,
      lines_removed   INTEGER DEFAULT 0,
      UNIQUE(date, repo_path)
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS file_save_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp       TEXT NOT NULL,
      repo_path       TEXT NOT NULL,
      repo_name       TEXT NOT NULL,
      file_path       TEXT NOT NULL,
      file_ext        TEXT NOT NULL
    )
  `);

  _db.run('CREATE INDEX IF NOT EXISTS idx_activity_days_date ON activity_days(date)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_activity_days_repo_path ON activity_days(repo_path)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_file_save_events_ts ON file_save_events(timestamp)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_file_save_events_ext ON file_save_events(file_ext)');

  _db.run(`
    CREATE TABLE IF NOT EXISTS github_repo_trees (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_url    TEXT NOT NULL UNIQUE,
      repo_name   TEXT NOT NULL,
      branch      TEXT DEFAULT 'main',
      description TEXT DEFAULT '',
      total_files INTEGER DEFAULT 0,
      truncated   INTEGER DEFAULT 0,
      tree_data   TEXT NOT NULL,
      saved_at    TEXT DEFAULT (datetime('now'))
    )
  `);
}

function getDb() {
  if (!_db) throw new Error('Database not initialized');
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
    console.error('[DB] Write worker error:', err.message);
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
  if (!_db) return;
  if (!_dirty) return;
  try {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(getDbPath(), buffer);
  } catch (err) {
    console.error('[DB] flushSync error:', err.message);
  }
}

function save() {
  if (!_db || !_dirty) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    _flush();
  }, 5000);
}

function saveImmediate() {
  if (!_db || !_dirty) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = null;
  _flush();
}

function close() {
  if (_db) {
    if (_saveTimer) clearTimeout(_saveTimer);
    const start = performance.now();
    _flushSync();
    const duration = performance.now() - start;
    if (duration > 100) {
      console.warn(`[DB] Sync flush took ${duration.toFixed(0)}ms on close`);
    }
    if (_writeWorker) { try { _writeWorker.terminate(); } catch (_) {} }
    _db.close();
    _db = null;
  }
}

module.exports = { initDatabase, getDb, save, saveImmediate, close, getDbPath };
