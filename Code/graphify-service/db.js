'use strict';

const fs   = require('fs');
const path = require('path');

let _db = null;
let _data = null;

async function initFromJson(repoPath) {
  if (_db) return _db;

  const jsonPath = path.join(repoPath, 'graphify', 'symbol-index-storage', 'symbols.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`graphify/symbol-index-storage/symbols.json not found at ${repoPath}. Please index your codebase first.`);
  }

  let raw = fs.readFileSync(jsonPath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  _data = JSON.parse(raw);

  const sqlJsPath = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.js');
  const initSqlJs = require(sqlJsPath);
  const SQL = await initSqlJs();

  _db = new SQL.Database();

  createSchema();
  populateDb();

  return _db;
}

function createSchema() {
  _db.run(`
    CREATE TABLE repositories (
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
    CREATE TABLE indexed_files (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id       INTEGER NOT NULL,
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
    CREATE TABLE symbols (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id       INTEGER NOT NULL,
      file_id       INTEGER NOT NULL,
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

  _db.run(`
    CREATE TABLE file_imports (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id            INTEGER NOT NULL,
      file_id            INTEGER NOT NULL,
      import_path        TEXT NOT NULL,
      import_type        TEXT NOT NULL,
      resolved_file_id   INTEGER,
      imported_symbols   TEXT,
      line               INTEGER,
      column             INTEGER
    )
  `);

  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_repo_id ON symbols(repo_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_indexed_files_repo_dirty ON indexed_files(repo_id, is_dirty)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_imports_file ON file_imports(file_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_imports_resolved ON file_imports(resolved_file_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_imports_repo ON file_imports(repo_id)');
}

function populateDb() {
  const repoId = 1;
  const now = new Date().toISOString();

  _db.run(
    'INSERT INTO repositories (id, repo_path, name, indexed, last_indexed, total_files, total_symbols) VALUES (?, ?, ?, 1, ?, ?, ?)',
    [repoId, _data.repoPath, _data.repoName, now, _data.overview.totalFiles, _data.overview.totalSymbols]
  );

  const filePathToId = new Map();
  for (const f of _data.files) {
    const id = f.id;
    _db.run(
      'INSERT INTO indexed_files (id, repo_id, path, language, last_modified, indexed_at, is_dirty) VALUES (?, ?, ?, ?, ?, ?, 0)',
      [id, repoId, f.path, f.language || '', now, now]
    );
    filePathToId.set(f.path, id);
  }

  for (const s of _data.symbols) {
    const fileId = filePathToId.get(s.filePath) || 0;
    if (!fileId) continue;
    _db.run(
      'INSERT INTO symbols (repo_id, file_id, name, type, line, column, is_exported, class_name, language, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        repoId, fileId, s.name, s.type,
        s.line || 0, s.column || 0,
        s.isExported ? 1 : 0,
        s.className || null,
        _data.files.find(f => f.path === s.filePath)?.language || '',
        s.signature || ''
      ]
    );
  }

  for (const i of _data.imports) {
    const fileId = filePathToId.get(i.sourceFile) || 0;
    if (!fileId) continue;
    const resolvedId = i.resolvedFile ? (filePathToId.get(i.resolvedFile) || null) : null;
    _db.run(
      'INSERT INTO file_imports (repo_id, file_id, import_path, import_type, resolved_file_id, imported_symbols, line, column) VALUES (?, ?, ?, ?, ?, ?, 0, 0)',
      [repoId, fileId, i.importPath, i.importType, resolvedId, JSON.stringify(i.importedSymbols || [])]
    );
  }

  _db.run('PRAGMA query_only = ON');
}

function getDb() {
  if (!_db) throw new Error('[graphify] DB not initialized. Please index your codebase first.');
  return _db;
}

function getRawData() {
  return _data;
}

function getRepoInfo(repoPath) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      r.repo_path,
      r.name,
      (SELECT COUNT(*) FROM indexed_files WHERE repo_id = r.id) as totalFiles,
      (SELECT COUNT(*) FROM symbols WHERE repo_id = r.id) as totalSymbols
    FROM repositories r
    WHERE r.repo_path = ? LIMIT 1
  `);
  stmt.bind([repoPath]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return {
      repoPath: row.repo_path,
      repoName: row.name || (row.repo_path ? row.repo_path.split(/[/\\]/).pop() : 'unknown'),
      totalFiles: row.totalFiles || 0,
      totalSymbols: row.totalSymbols || 0,
    };
  }
  stmt.free();
  return null;
}

function closeDb() {
  if (_db) {
    try { _db.close(); } catch (_) {}
    _db = null;
  }
  _data = null;
}

module.exports = { initFromJson, getDb, getRawData, getRepoInfo, closeDb };