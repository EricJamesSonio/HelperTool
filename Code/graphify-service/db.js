/**
 * graphify-service/db.js
 * Opens the symbol index SQLite DB in read-only mode using sql.js.
 * Mirrors how indexer-service/indexer.js opens it — same sql.js, reads file
 * into memory, never writes back.
 *
 * Safe because:
 *  - We only run SELECT queries
 *  - We never call db.run() with mutations
 *  - The indexer-service owns all writes + flushes
 */

'use strict';

const fs   = require('fs');
const path = require('path');

let _db = null;

async function initDb(dbPath) {
  if (_db) return _db;

  // Resolve sql.js relative to this service — same as indexer-service does
  const sqlJsPath = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.js');
  const initSqlJs = require(sqlJsPath);
  const SQL = await initSqlJs();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`DB file not found: ${dbPath}`);
  }

  const buffer = fs.readFileSync(dbPath);
  _db = new SQL.Database(buffer);
  // Read-only pragma — just in case
  _db.run('PRAGMA query_only = ON');

  return _db;
}

function getDb() {
  if (!_db) throw new Error('[graphify] DB not initialized');
  return _db;
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
}

module.exports = { initDb, getDb, getRepoInfo, closeDb };