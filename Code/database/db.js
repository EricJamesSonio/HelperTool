const initSqlJs = require('sql.js/dist/sql-wasm.js');
const path = require('path');
const fs = require('fs');

const DB_DIR = 'symbol-index';
const DB_FILE = 'index.db';

let _db = null;
let _appRef = null;

function getDbPath() {
  const dir = path.join(_appRef.getPath('userData'), DB_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, DB_FILE);
}

async function initDatabase(app) {
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
  save();

  return _db;
}

function createSchema() {
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

  _db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(name, signature, content=symbols, content_rowid=id)`);

  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_repo_id ON symbols(repo_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_indexed_files_repo_dirty ON indexed_files(repo_id, is_dirty)');

  const row = _db.exec("SELECT name FROM sqlite_master WHERE type='trigger' AND name='symbols_ai'");
  if (row.length === 0) {
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
  }
}

function getDb() {
  if (!_db) throw new Error('Database not initialized');
  return _db;
}

function save() {
  if (!_db) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  const dbPath = getDbPath();
  fs.writeFileSync(dbPath, buffer);
}

function close() {
  if (_db) {
    save();
    _db.close();
    _db = null;
  }
}

module.exports = { initDatabase, getDb, save, close };
