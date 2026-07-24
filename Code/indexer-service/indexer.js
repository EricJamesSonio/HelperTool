const { SymbolCache } = require('./cache.js');
const { parseFile } = require('./parser.js');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cache = new SymbolCache();
let _db = null;
let _flushTimer = null;
let _pendingFlush = false;
let _dbDirty = false;
function respond(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function initDb(dbPath) {
  const initSqlJs = require('../node_modules/sql.js/dist/sql-wasm.js');
  initSqlJs().then(SQL => {
    let buffer = null;
    if (fs.existsSync(dbPath)) {
      buffer = fs.readFileSync(dbPath);
    }
    _db = new SQL.Database(buffer);
    _db.run('PRAGMA journal_mode=WAL');
    createSchema();
    cleanupDotGit();
    flushDb();
    process.stdout.write(JSON.stringify({ id: 'bootstrap', type: 'ready', ok: true, data: { dbReady: true } }) + '\n');
    setTimeout(() => cache.warmRecentFiles(_db, 10), 2000);
  }).catch(err => {
    process.stderr.write(`[indexer] DB init error: ${err.message}\n`);
    process.stdout.write(JSON.stringify({ id: 'bootstrap', type: 'ready', ok: true, data: { dbReady: false } }) + '\n');
  });
}

function createSchema() {
  _db.run(`CREATE TABLE IF NOT EXISTS repositories (
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
  )`);
  _db.run(`CREATE TABLE IF NOT EXISTS indexed_files (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id       INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    path          TEXT NOT NULL,
    language      TEXT,
    file_hash     TEXT,
    last_modified TEXT,
    indexed_at    TEXT,
    is_dirty      INTEGER DEFAULT 0,
    UNIQUE(repo_id, path)
  )`);
  _db.run(`CREATE TABLE IF NOT EXISTS symbols (
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
  )`);
  _db.run(`CREATE TABLE IF NOT EXISTS file_imports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id       INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_id       INTEGER NOT NULL REFERENCES indexed_files(id) ON DELETE CASCADE,
    import_path   TEXT NOT NULL,
    import_type   TEXT NOT NULL,
    resolved_file_id INTEGER,
    imported_symbols TEXT,
    line          INTEGER,
    column        INTEGER
  )`);
  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_repo_id ON symbols(repo_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_indexed_files_repo_dirty ON indexed_files(repo_id, is_dirty)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_files_path ON indexed_files(path)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_repo_name ON symbols(repo_id, name)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_symbols_name_nocase ON symbols(name COLLATE NOCASE)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_imports_file ON file_imports(file_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_imports_resolved ON file_imports(resolved_file_id)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_imports_repo ON file_imports(repo_id)');
}

function flushDb() {
  if (!_db) return;
  _pendingFlush = false;
  _dbDirty = false;
  const data = _db.export();
  const buffer = Buffer.from(data);
  const dbPath = process.argv[2];
  if (dbPath) {
    try { fs.writeFileSync(dbPath, buffer); } catch (e) { process.stderr.write(`[indexer] DB write error: ${e.message}\n`); }
  }
}

function scheduleFlush() {
  if (!_db) return;
  _dbDirty = true;
  if (_flushTimer) { _pendingFlush = true; return; }
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flushDb();
    if (_pendingFlush) {
      _pendingFlush = false;
      _flushTimer = setTimeout(() => { _flushTimer = null; flushDb(); }, 5000);
    }
  }, 5000);
}

// ── DB operation helpers ──

function repoGetByPath(repoPath) {
  const stmt = _db.prepare('SELECT * FROM repositories WHERE repo_path = ?');
  stmt.bind([repoPath]);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free(); return null;
}

function repoUpsert(repoPath, name, configJson) {
  const existing = repoGetByPath(repoPath);
  if (existing) {
    _db.run('UPDATE repositories SET name=?, config_json=?, updated_at=? WHERE id=?', [name, JSON.stringify(configJson), new Date().toISOString(), existing.id]);
    return existing.id;
  }
  _db.run('INSERT INTO repositories (repo_path, name, config_json) VALUES (?, ?, ?)', [repoPath, name, JSON.stringify(configJson)]);
  return _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
}

function repoMarkIndexed(repoId, totalFiles, totalSymbols) {
  const now = new Date().toISOString();
  _db.run('UPDATE repositories SET indexed=1, last_indexed=?, total_files=?, total_symbols=?, updated_at=? WHERE id=?', [now, totalFiles, totalSymbols, now, repoId]);
}

function repoMarkUnindexed(repoId) {
  _db.run('UPDATE repositories SET indexed=0, last_indexed=NULL, total_files=0, total_symbols=0, updated_at=? WHERE id=?', [new Date().toISOString(), repoId]);
}

function repoGetAll() {
  const results = [];
  const stmt = _db.prepare('SELECT * FROM repositories ORDER BY updated_at DESC');
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function detectLanguage(ext) {
  const map = {
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'tsx',
    '.py': 'python',
    '.html': 'html', '.htm': 'html',
    '.css': 'css', '.scss': 'css', '.less': 'css',
  };
  return map[ext] || null;
}

function fileInsert(repoId, filePath, language, fileHash, lastModified) {
  const now = new Date().toISOString();
  _db.run('INSERT OR REPLACE INTO indexed_files (repo_id, path, language, file_hash, last_modified, indexed_at, is_dirty) VALUES (?, ?, ?, ?, ?, ?, 0)', [repoId, filePath, language, fileHash, lastModified, now]);
  return _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
}

function fileGetByRepoAndPath(repoId, filePath) {
  const stmt = _db.prepare('SELECT * FROM indexed_files WHERE repo_id = ? AND path = ?');
  stmt.bind([repoId, filePath]);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free(); return null;
}

function fileMarkDirty(repoId, filePath) {
  _db.run('UPDATE indexed_files SET is_dirty=1 WHERE repo_id=? AND path=?', [repoId, filePath]);
}

function fileMarkClean(id) {
  _db.run('UPDATE indexed_files SET is_dirty=0, indexed_at=? WHERE id=?', [new Date().toISOString(), id]);
}

function fileCountDirtyByRepo(repoId) {
  const stmt = _db.prepare('SELECT COUNT(*) as cnt FROM indexed_files WHERE repo_id = ? AND is_dirty = 1');
  stmt.bind([repoId]);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row.cnt; }
  stmt.free(); return 0;
}

function fileGetDirtyByRepo(repoId) {
  const results = [];
  const stmt = _db.prepare('SELECT * FROM indexed_files WHERE repo_id = ? AND is_dirty = 1 ORDER BY path');
  stmt.bind([repoId]);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function fileGetDirtyWithSymbols(repoId) {
  const results = [];
  const stmt = _db.prepare('SELECT f.id, f.path, f.language, f.last_modified, (SELECT COUNT(*) FROM symbols WHERE file_id = f.id) as symbol_count FROM indexed_files f WHERE f.repo_id = ? AND f.is_dirty = 1 ORDER BY f.path');
  stmt.bind([repoId]);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function fileCountByRepo(repoId) {
  const stmt = _db.prepare('SELECT COUNT(*) as cnt FROM indexed_files WHERE repo_id = ?');
  stmt.bind([repoId]);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row.cnt; }
  stmt.free(); return 0;
}

function fileRemoveByPath(repoId, filePath) {
  const stmt = _db.prepare('SELECT id FROM indexed_files WHERE repo_id = ? AND path = ?');
  stmt.bind([repoId, filePath]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    _db.run('DELETE FROM symbols WHERE file_id = ?', [row.id]);
    _db.run('DELETE FROM indexed_files WHERE id = ?', [row.id]);
  }
  stmt.free();
}

function clearRepoData(repoId) {
  _db.run('DELETE FROM file_imports WHERE repo_id = ?', [repoId]);
  _db.run('DELETE FROM symbols WHERE repo_id = ?', [repoId]);
  _db.run('DELETE FROM indexed_files WHERE repo_id = ?', [repoId]);
}

function cleanupDotGit() {
  _db.run("DELETE FROM file_imports WHERE file_id IN (SELECT id FROM indexed_files WHERE path LIKE '.git/%' OR path = '.git')");
  _db.run("DELETE FROM symbols WHERE file_id IN (SELECT id FROM indexed_files WHERE path LIKE '.git/%' OR path = '.git')");
  _db.run("DELETE FROM indexed_files WHERE path LIKE '.git/%' OR path = '.git'");
}

function fileInsertSymbols(fileId, repoId, symbols) {
  _db.run('DELETE FROM symbols WHERE file_id = ?', [fileId]);
  for (const sym of symbols) {
    _db.run('INSERT INTO symbols (repo_id, file_id, name, type, line, column, is_exported) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [repoId, fileId, sym.name || 'anonymous', sym.type || 'unknown', sym.line ?? null, sym.column ?? null, sym.isExport ? 1 : 0]);
  }
}

function fileInsertImports(fileId, repoId, imports) {
  _db.run('DELETE FROM file_imports WHERE file_id = ?', [fileId]);
  for (const imp of imports) {
    const importPath = imp.import_path ?? imp.source;
    const importType = imp.import_type ?? 'require';
    const importedSymbols = JSON.stringify(imp.imported_symbols ?? imp.names ?? []);
    _db.run('INSERT INTO file_imports (repo_id, file_id, import_path, import_type, imported_symbols, line, column) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [repoId, fileId, importPath, importType, importedSymbols, imp.line ?? null, imp.column ?? null]);
  }
}

// ── Sync DB handlers ──

function h_dbFlush(id, type) {
  flushDb();
  return respond({ id, type, ok: true });
}

function h_dbInit(id, type, payload) {
  return respond({ id, type, ok: true });
}

function h_dbCheckRepo(id, type, payload) {
  const { repoPath } = payload || {};
  if (!repoPath) return respond({ id, type, ok: false, error: 'Missing repoPath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: { indexed: false } });
  return respond({ id, type, ok: true, data: { indexed: !!repo.indexed, total_files: repo.total_files, total_symbols: repo.total_symbols, last_indexed: repo.last_indexed } });
}

function h_dbGetStatus(id, type, payload) {
  const { repoPath } = payload || {};
  if (!repoPath) return respond({ id, type, ok: false, error: 'Missing repoPath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: { exists: false } });
  const dirtyCount = fileCountDirtyByRepo(repo.id);
  return respond({ id, type, ok: true, data: { exists: true, indexed: !!repo.indexed, total_files: repo.total_files, total_symbols: repo.total_symbols, last_indexed: repo.last_indexed, dirty_count: dirtyCount, repo_id: repo.id } });
}

function h_dbUpsertRepo(id, type, payload) {
  const { repoPath, name, config } = payload || {};
  if (!repoPath) return respond({ id, type, ok: false, error: 'Missing repoPath' });
  const repoId = repoUpsert(repoPath, name || path.basename(repoPath), config || {});
  scheduleFlush();
  return respond({ id, type, ok: true, data: { repo_id: repoId } });
}

function h_dbMarkIndexed(id, type, payload) {
  const { repoId, totalFiles, totalSymbols } = payload || {};
  if (!repoId) return respond({ id, type, ok: false, error: 'Missing repoId' });
  repoMarkIndexed(repoId, totalFiles, totalSymbols);
  scheduleFlush();
  try {
    const { exportRepoToJson } = require('./exportToJson.js');
    const result = exportRepoToJson(_db, repoId);
    if (result) process.stderr.write(`[indexer] Exported to ${result.symbolsPath} (${result.stats.files} files, ${result.stats.symbols} symbols)\n`);
  } catch (err) {
    process.stderr.write(`[indexer] JSON export error: ${err.message}\n`);
  }
  return respond({ id, type, ok: true });
}

function h_dbGetDirtyCount(id, type, payload) {
  const { repoId } = payload || {};
  if (!repoId) return respond({ id, type, ok: false, error: 'Missing repoId' });
  const count = fileCountDirtyByRepo(repoId);
  return respond({ id, type, ok: true, data: { count } });
}

function h_dbMarkDirty(id, type, payload) {
  const { repoPath, filePath } = payload || {};
  if (!repoPath || !filePath) return respond({ id, type, ok: false, error: 'Missing repoPath or filePath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: false, error: 'Repo not found' });
  if (filePath.startsWith('.git/') || filePath === '.git') return respond({ id, type, ok: true, data: { dirty_count: fileCountDirtyByRepo(repo.id) } });
  const existing = fileGetByRepoAndPath(repo.id, filePath);
  if (!existing) {
    const ext = path.extname(filePath).toLowerCase();
    const langMap = { '.js': 'javascript', '.ts': 'typescript', '.tsx': 'tsx', '.py': 'python', '.html': 'html', '.css': 'css' };
    try {
      const fullPath = path.join(repoPath, filePath);
      const stat = fs.statSync(fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const hash = crypto.createHash('md5').update(content).digest('hex');
      fileInsert(repo.id, filePath, langMap[ext] || null, hash, stat.mtime.toISOString());
    } catch (_) {}
  }
  fileMarkDirty(repo.id, filePath);
  const count = fileCountDirtyByRepo(repo.id);
  scheduleFlush();
  return respond({ id, type, ok: true, data: { dirty_count: count } });
}

function h_dbGetDirtyFiles(id, type, payload) {
  const { repoId } = payload || {};
  if (!repoId) return respond({ id, type, ok: false, error: 'Missing repoId' });
  const files = fileGetDirtyWithSymbols(repoId);
  return respond({ id, type, ok: true, data: { files } });
}

function h_dbMarkClean(id, type, payload) {
  const { ids } = payload || {};
  if (!ids || !Array.isArray(ids)) return respond({ id, type, ok: false, error: 'Missing ids array' });
  for (const id of ids) fileMarkClean(id);
  scheduleFlush();
  return respond({ id, type, ok: true });
}

function h_dbReset(id, type, payload) {
  const { repoPath } = payload || {};
  if (!repoPath) return respond({ id, type, ok: false, error: 'Missing repoPath' });
  const repo = repoGetByPath(repoPath);
  if (repo) {
    clearRepoData(repo.id);
    repoMarkUnindexed(repo.id);
  }
  cache.clear();
  scheduleFlush();
  return respond({ id, type, ok: true });
}

function h_dbDelete(id, type, payload) {
  const { repoPath } = payload || {};
  if (!repoPath) return respond({ id, type, ok: false, error: 'Missing repoPath' });
  const repo = repoGetByPath(repoPath);
  if (repo) {
    clearRepoData(repo.id);
    _db.run('DELETE FROM repositories WHERE id=?', [repo.id]);
  }
  cache.clear();
  scheduleFlush();
  return respond({ id, type, ok: true });
}

function h_dbGetManaged(id, type) {
  const repos = repoGetAll();
  const map = {};
  for (const r of repos) map[r.repo_path] = r.id;
  return respond({ id, type, ok: true, data: { repos: map } });
}

function h_dbGetSymbolTypes(id, type, payload) {
  const { repoId } = payload || {};
  if (!repoId) return respond({ id, type, ok: false, error: 'Missing repoId' });
  const results = [];
  const stmt = _db.prepare('SELECT type, COUNT(*) as count FROM symbols WHERE repo_id=? GROUP BY type ORDER BY count DESC');
  stmt.bind([repoId]);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return respond({ id, type, ok: true, data: { types: results } });
}

function h_dbInsertFile(id, type, payload) {
  const { repoPath, filePath, language, hash, lastModified } = payload || {};
  if (!repoPath || !filePath) return respond({ id, type, ok: false, error: 'Missing repoPath or filePath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: false, error: 'Repo not found' });
  if (filePath.startsWith('.git/') || filePath === '.git') return respond({ id, type, ok: true, data: { file_id: null } });
  const fileId = fileInsert(repo.id, filePath, language || null, hash || null, lastModified || new Date().toISOString());
  scheduleFlush();
  return respond({ id, type, ok: true, data: { file_id: fileId } });
}

function h_dbReindexFile(id, type, payload) {
  const { repoPath, filePath } = payload || {};
  if (!repoPath || !filePath) return respond({ id, type, ok: false, error: 'Missing repoPath or filePath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: false, error: 'Repo not found' });
  if (filePath.startsWith('.git/') || filePath === '.git') return respond({ id, type, ok: true, data: { symbols: 0, imports: 0 } });
  const fullPath = path.join(repoPath, filePath);
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const hash = crypto.createHash('md5').update(content).digest('hex');
    const result = parseFile(content, filePath);
    cache.set(filePath, result);
    const existing = fileGetByRepoAndPath(repo.id, filePath);
    let fileId;
    if (existing) {
      fileId = existing.id;
      fileMarkClean(fileId);
      _db.run('DELETE FROM symbols WHERE file_id=?', [fileId]);
      _db.run('DELETE FROM file_imports WHERE file_id=?', [fileId]);
      _db.run('UPDATE indexed_files SET file_hash=?, last_modified=?, indexed_at=? WHERE id=?', [hash, new Date().toISOString(), new Date().toISOString(), fileId]);
    } else {
      const langMap = { '.js': 'javascript', '.ts': 'typescript', '.tsx': 'tsx', '.py': 'python', '.html': 'html', '.css': 'css' };
      const ext = path.extname(filePath).toLowerCase();
      fileId = fileInsert(repo.id, filePath, langMap[ext] || null, hash, new Date().toISOString());
      _db.run('UPDATE indexed_files SET is_dirty=0 WHERE id=?', [fileId]);
    }
    fileInsertSymbols(fileId, repo.id, result.symbols);
    fileInsertImports(fileId, repo.id, result.imports);
    scheduleFlush();
    return respond({ id, type, ok: true, data: { symbols: result.symbols.length, imports: result.imports.length } });
  } catch (err) {
    return respond({ id, type, ok: false, error: err.message });
  }
}

function h_dbGetFileByPathAndRepo(id, type, payload) {
  const { repoPath, filePath } = payload || {};
  if (!repoPath || !filePath) return respond({ id, type, ok: false, error: 'Missing repoPath or filePath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: { file: null } });
  const file = fileGetByRepoAndPath(repo.id, filePath);
  return respond({ id, type, ok: true, data: { file: file || null } });
}

function h_dbGetFiles(id, type, payload) {
  const { repoPath } = payload || {};
  if (!repoPath) return respond({ id, type, ok: false, error: 'Missing repoPath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: [] });

  const stmt = _db.prepare('SELECT id, path, language FROM indexed_files WHERE repo_id = ? ORDER BY path');
  stmt.bind([repo.id]);
  const files = [];
  while (stmt.step()) files.push(stmt.getAsObject());
  stmt.free();
  return respond({ id, type, ok: true, data: files });
}

function h_dbGetChatSymbols(id, type, payload) {
  const { repoPath, filePath } = payload || {};
  if (!repoPath || !filePath) return respond({ id, type, ok: false, error: 'Missing repoPath or filePath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: [] });
  const file = fileGetByRepoAndPath(repo.id, filePath);
  if (!file) return respond({ id, type, ok: true, data: [] });
  const stmt = _db.prepare('SELECT name, type, line, signature FROM symbols WHERE file_id = ? ORDER BY line');
  stmt.bind([file.id]);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return respond({ id, type, ok: true, data: results });
}

function h_dbGetChatDependencies(id, type, payload) {
  const { repoPath, filePath } = payload || {};
  if (!repoPath || !filePath) return respond({ id, type, ok: false, error: 'Missing repoPath or filePath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: [] });
  const file = fileGetByRepoAndPath(repo.id, filePath);
  if (!file) return respond({ id, type, ok: true, data: [] });
  const stmt = _db.prepare(`SELECT fi.import_path, fi.import_type, fi.imported_symbols, f.path as resolved_path
    FROM file_imports fi LEFT JOIN indexed_files f ON f.id = fi.resolved_file_id
    WHERE fi.file_id = ? ORDER BY fi.line`);
  stmt.bind([file.id]);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return respond({ id, type, ok: true, data: results });
}

function h_dbGetChatDependents(id, type, payload) {
  const { repoPath, filePath } = payload || {};
  if (!repoPath || !filePath) return respond({ id, type, ok: false, error: 'Missing repoPath or filePath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: [] });
  const file = fileGetByRepoAndPath(repo.id, filePath);
  if (!file) return respond({ id, type, ok: true, data: [] });
  const stmt = _db.prepare(`SELECT f.path, fi.import_type, fi.imported_symbols
    FROM file_imports fi JOIN indexed_files f ON f.id = fi.file_id
    WHERE fi.resolved_file_id = ? AND fi.repo_id = ? ORDER BY f.path`);
  stmt.bind([file.id, repo.id]);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return respond({ id, type, ok: true, data: results });
}

function h_dbGetChatImportChain(id, type, payload) {
  const { repoPath, filePath } = payload || {};
  if (!repoPath || !filePath) return respond({ id, type, ok: false, error: 'Missing repoPath or filePath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: null });
  const visited = new Set();
  const maxDepth = 6;
  function dfs(path, depth) {
    if (depth > maxDepth || visited.has(path)) return { path, children: [], cycle: visited.has(path) };
    visited.add(path);
    const f = fileGetByRepoAndPath(repo.id, path);
    if (!f) return { path, children: [] };
    const stmt = _db.prepare(`SELECT f.path FROM file_imports fi
      JOIN indexed_files f ON f.id = fi.resolved_file_id
      WHERE fi.file_id = ? AND fi.resolved_file_id IS NOT NULL`);
    stmt.bind([f.id]);
    const deps = [];
    while (stmt.step()) deps.push(stmt.getAsObject());
    stmt.free();
    const children = deps.map(d => dfs(d.path, depth + 1));
    return { path, children };
  }
  return respond({ id, type, ok: true, data: dfs(filePath, 0) });
}

function h_dbGetChatCircularDeps(id, type, payload) {
  const { repoPath, filePath } = payload || {};
  if (!repoPath || !filePath) return respond({ id, type, ok: false, error: 'Missing repoPath or filePath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: [] });
  const cycles = [];
  const visitStack = [];
  const visited = new Set();
  function dfs(path) {
    if (visitStack.includes(path)) { const idx = visitStack.indexOf(path); cycles.push([...visitStack.slice(idx), path]); return; }
    if (visited.has(path)) return;
    visited.add(path);
    visitStack.push(path);
    const f = fileGetByRepoAndPath(repo.id, path);
    if (f) {
      const stmt = _db.prepare(`SELECT f.path FROM file_imports fi
        JOIN indexed_files f ON f.id = fi.resolved_file_id
        WHERE fi.file_id = ? AND fi.resolved_file_id IS NOT NULL`);
      stmt.bind([f.id]);
      const deps = [];
      while (stmt.step()) deps.push(stmt.getAsObject());
      stmt.free();
      for (const d of deps) dfs(d.path);
    }
    visitStack.pop();
  }
  dfs(filePath);
  return respond({ id, type, ok: true, data: cycles });
}

function h_dbGetFileList(id, type, payload) {
  const { repoPath, limit, offset } = payload || {};
  if (!repoPath) return respond({ id, type, ok: false, error: 'Missing repoPath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: { files: [], total: 0 } });

  const lmt = limit || 50;
  const off = offset || 0;
  const excludePrefix = '.git';

  const countStmt = _db.prepare("SELECT COUNT(*) as cnt FROM indexed_files WHERE repo_id = ? AND path NOT LIKE ? AND path != ?");
  countStmt.bind([repo.id, excludePrefix + '/%', excludePrefix]);
  let total = 0;
  if (countStmt.step()) total = countStmt.getAsObject().cnt;
  countStmt.free();

  const stmt = _db.prepare("SELECT f.id, f.path, (SELECT COUNT(*) FROM symbols WHERE file_id = f.id) as symbol_count FROM indexed_files f WHERE f.repo_id = ? AND f.path NOT LIKE ? AND f.path != ? ORDER BY f.path LIMIT ? OFFSET ?");
  stmt.bind([repo.id, excludePrefix + '/%', excludePrefix, lmt, off]);
  const files = [];
  while (stmt.step()) files.push(stmt.getAsObject());
  stmt.free();

  return respond({ id, type, ok: true, data: { files, total } });
}

function h_dbGetFileDeps(id, type, payload) {
  const { repoPath, filePath, mode } = payload || {};
  if (!repoPath || !filePath) return respond({ id, type, ok: false, error: 'Missing repoPath or filePath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: { imports: [], imported_by: [] } });

  const file = fileGetByRepoAndPath(repo.id, filePath);
  if (!file) return respond({ id, type, ok: true, data: { imports: [], imported_by: [] } });

  const importStmt = _db.prepare('SELECT import_path, import_type, line, column, imported_symbols FROM file_imports WHERE file_id = ?');
  importStmt.bind([file.id]);
  const imports = [];
  while (importStmt.step()) {
    const row = importStmt.getAsObject();
    imports.push({
      import_path: row.import_path,
      import_type: row.import_type,
      line: row.line,
      imported_symbols: row.imported_symbols ? JSON.parse(row.imported_symbols) : [],
    });
  }
  importStmt.free();

  // Optimized path: use resolved_file_id index for reverse dependency lookup
  const optStmt = _db.prepare(`
    SELECT fi.path as source_path, fi2.import_path, fi2.import_type, fi2.imported_symbols
    FROM file_imports fi2
    JOIN indexed_files fi ON fi.id = fi2.file_id
    WHERE fi2.resolved_file_id = ? AND fi2.repo_id = ?
  `);
  optStmt.bind([file.id, repo.id]);
  const imported_by = [];
  while (optStmt.step()) {
    const row = optStmt.getAsObject();
    imported_by.push({
      source_path: row.source_path,
      import_path: row.import_path,
      import_type: row.import_type,
      imported_symbols: row.imported_symbols ? JSON.parse(row.imported_symbols) : [],
    });
  }
  optStmt.free();

  const result = { imports, imported_by };

  if (mode === 'function') {
    const symbolStmt = _db.prepare('SELECT name, type, line, column FROM symbols WHERE file_id = ?');
    symbolStmt.bind([file.id]);
    const localSymbols = [];
    while (symbolStmt.step()) localSymbols.push(symbolStmt.getAsObject());
    symbolStmt.free();

    const funcImports = imports.map(imp => {
      const resolvedStmt = _db.prepare('SELECT id FROM indexed_files WHERE repo_id = ? AND (path = ? OR ? LIKE \'%/\' || path) LIMIT 1');
      resolvedStmt.bind([repo.id, imp.import_path, imp.import_path]);
      let resolvedSymbols = [];
      const names = imp.imported_symbols || [];
      if (resolvedStmt.step()) {
        const resolvedFile = resolvedStmt.getAsObject();
        const symStmt = _db.prepare('SELECT name, type, line FROM symbols WHERE file_id = ?');
        symStmt.bind([resolvedFile.id]);
        while (symStmt.step()) {
          const s = symStmt.getAsObject();
          if (names.length === 0 || names.includes(s.name)) resolvedSymbols.push({ name: s.name, type: s.type, line: s.line });
        }
        symStmt.free();
      } else {
        resolvedSymbols = names.map(n => ({ name: n, type: 'unknown', line: null }));
      }
      resolvedStmt.free();
      return { import_path: imp.import_path, import_type: imp.import_type, symbols: resolvedSymbols };
    });

    const funcReverse = imported_by.map(rd => {
      const symbols = (rd.imported_symbols || []).length > 0
        ? localSymbols.filter(s => (rd.imported_symbols || []).includes(s.name)).map(s => ({ name: s.name, type: s.type, line: s.line }))
        : localSymbols.map(s => ({ name: s.name, type: s.type, line: s.line }));
      return { source_path: rd.source_path, import_type: rd.import_type, symbols };
    });

    return respond({ id, type, ok: true, data: { imports, imported_by, funcImports, funcReverse } });
  }

  return respond({ id, type, ok: true, data: result });
}

// ── Existing sync handlers ──

function h_indexFile(id, type, payload) {
  const { filePath, content } = payload || {};
  if (!filePath || content == null) {
    return respond({ id, type, ok: false, error: 'Missing filePath or content' });
  }
  const result = parseFile(content, filePath);
  cache.set(filePath, result);
  const importData = result.imports.map(i => ({ import_path: i.import_path ?? i.source, import_type: i.import_type ?? 'require', line: i.line ?? null, column: i.column ?? null, imported_symbols: i.imported_symbols ?? i.names ?? [] }));
  return respond({ id, type, ok: true, data: { symbols: result.symbols.length, imports: result.imports.length, importData } });
}

function h_indexFiles(id, type, payload) {
  const { files } = payload || {};
  if (!files || !Array.isArray(files)) {
    return respond({ id, type, ok: false, error: 'Missing files array' });
  }
  const results = [];
  for (const { filePath, content } of files) {
    if (filePath && content != null) {
      const result = parseFile(content, filePath);
      cache.set(filePath, result);
      results.push({ filePath, symbols: result.symbols.length, imports: result.imports.map(i => ({ import_path: i.import_path ?? i.source, import_type: i.import_type ?? 'require', line: i.line ?? null, column: i.column ?? null, imported_symbols: i.imported_symbols ?? i.names ?? [] })) });
    }
  }
  const totalSymbols = results.reduce((sum, r) => sum + r.symbols, 0);
  return respond({ id, type, ok: true, data: { indexed: results.length, total: files.length, totalSymbols, fileResults: results } });
}

function h_dbGetCodebaseMapData(id, type, payload) {
  const { repoPath, limit, offset } = payload || {};
  if (!repoPath) return respond({ id, type, ok: false, error: 'Missing repoPath' });
  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: true, data: null });

  if (limit == null) {
    const fStmt = _db.prepare('SELECT * FROM indexed_files WHERE repo_id = ? ORDER BY path');
    fStmt.bind([repo.id]);
    const files = [];
    while (fStmt.step()) files.push(fStmt.getAsObject());
    fStmt.free();

    const sStmt = _db.prepare(`SELECT s.name, s.type, s.line, s.column, s.is_exported, s.class_name, s.signature, f.path as file_path
      FROM symbols s JOIN indexed_files f ON f.id = s.file_id WHERE s.repo_id = ? ORDER BY f.path, s.line`);
    sStmt.bind([repo.id]);
    const symbols = [];
    while (sStmt.step()) symbols.push(sStmt.getAsObject());
    sStmt.free();

    const iStmt = _db.prepare(`SELECT fi.import_path, fi.import_type, fi.imported_symbols, fi.line, fi.column, f.path as source_path, rf.path as resolved_path
      FROM file_imports fi JOIN indexed_files f ON f.id = fi.file_id LEFT JOIN indexed_files rf ON rf.id = fi.resolved_file_id
      WHERE fi.repo_id = ? ORDER BY f.path, fi.line`);
    iStmt.bind([repo.id]);
    const fileImports = [];
    while (iStmt.step()) {
      const row = iStmt.getAsObject();
      if (row.imported_symbols) {
        try { row.imported_symbols = JSON.parse(row.imported_symbols); } catch (e) { row.imported_symbols = []; }
      } else {
        row.imported_symbols = [];
      }
      fileImports.push(row);
    }
    iStmt.free();

    return respond({ id, type, ok: true, data: { files, symbols, imports: fileImports } });
  }

  const effectiveLimit = Math.min(limit, 500);
  const effectiveOffset = offset || 0;

  const countStmt = _db.prepare('SELECT COUNT(*) as count FROM indexed_files WHERE repo_id = ?');
  countStmt.bind([repo.id]);
  countStmt.step();
  const totalFiles = countStmt.getAsObject().count;
  countStmt.free();

  const symCountStmt = _db.prepare('SELECT COUNT(*) as count FROM symbols WHERE repo_id = ?');
  symCountStmt.bind([repo.id]);
  symCountStmt.step();
  const totalSymbols = symCountStmt.getAsObject().count;
  symCountStmt.free();

  const impCountStmt = _db.prepare('SELECT COUNT(*) as count FROM file_imports WHERE repo_id = ?');
  impCountStmt.bind([repo.id]);
  impCountStmt.step();
  const totalImports = impCountStmt.getAsObject().count;
  impCountStmt.free();

  const fStmt = _db.prepare('SELECT * FROM indexed_files WHERE repo_id = ? ORDER BY path LIMIT ? OFFSET ?');
  fStmt.bind([repo.id, effectiveLimit, effectiveOffset]);
  const files = [];
  while (fStmt.step()) files.push(fStmt.getAsObject());
  fStmt.free();

  const fileIds = files.map(f => f.id);
  if (fileIds.length === 0) {
    return respond({ id, type, ok: true, data: {
      files: [], symbols: [], imports: [],
      totalFiles, totalSymbols, totalImports,
    }});
  }

  const placeholders = fileIds.map(() => '?').join(',');
  const sStmt = _db.prepare(`SELECT s.name, s.type, s.line, s.column, s.is_exported, s.class_name, s.signature, f.path as file_path
    FROM symbols s JOIN indexed_files f ON f.id = s.file_id WHERE s.file_id IN (${placeholders}) ORDER BY f.path, s.line`);
  sStmt.bind(fileIds);
  const symbols = [];
  while (sStmt.step()) symbols.push(sStmt.getAsObject());
  sStmt.free();

  const iStmt = _db.prepare(`SELECT fi.import_path, fi.import_type, fi.imported_symbols, fi.line, fi.column, f.path as source_path, rf.path as resolved_path
    FROM file_imports fi JOIN indexed_files f ON f.id = fi.file_id LEFT JOIN indexed_files rf ON rf.id = fi.resolved_file_id
    WHERE fi.file_id IN (${placeholders}) ORDER BY f.path, fi.line`);
  iStmt.bind(fileIds);
  const fileImports = [];
  while (iStmt.step()) {
    const row = iStmt.getAsObject();
    if (row.imported_symbols) {
      try { row.imported_symbols = JSON.parse(row.imported_symbols); } catch (e) { row.imported_symbols = []; }
    } else {
      row.imported_symbols = [];
    }
    fileImports.push(row);
  }
  iStmt.free();

  return respond({ id, type, ok: true, data: {
    files, symbols, imports: fileImports,
    totalFiles, totalSymbols, totalImports,
  }});
}

function h_symbolsGet(id, type, payload) {
  const { filePath, limit, offset } = payload || {};
  if (!filePath) return respond({ id, type, ok: false, error: 'Missing filePath' });
  const result = cache.getFileSymbolsHot(_db, filePath, limit, offset);
  return respond({ id, type, ok: true, data: result });
}

function h_search(id, type, payload) {
  const { query, limit, offset, repoPath } = payload || {};
  if (!query) return respond({ id, type, ok: false, error: 'Missing query' });
  let repoId = null;
  if (repoPath) {
    const repo = repoGetByPath(repoPath);
    if (repo) repoId = repo.id;
  }
  const result = cache.searchFromDb(_db, query, limit, offset, repoId);
  return respond({ id, type, ok: true, data: result });
}

function h_status(id, type) {
  const counts = cache.getCountsFromDb(_db);
  return respond({ id, type, ok: true, data: { indexedFiles: counts.indexedFiles, totalSymbols: counts.totalSymbols, files: [] } });
}

function h_removeFile(id, type, payload) {
  const { filePath } = payload || {};
  if (filePath) cache.delete(filePath);
  return respond({ id, type, ok: true });
}

function h_clear(id, type) {
  cache.clear();
  return respond({ id, type, ok: true });
}

function h_getFileList(id, type, payload) {
  const { limit, offset } = payload || {};
  const result = cache.getFileList(limit, offset);
  return respond({ id, type, ok: true, data: result });
}

function h_getFileDeps(id, type, payload) {
  const { filePath, mode } = payload || {};
  if (!filePath) return respond({ id, type, ok: false, error: 'Missing filePath' });
  const result = cache.getFileDeps(filePath, mode);
  if (!result) return respond({ id, type, ok: false, error: 'File not found in index' });
  return respond({ id, type, ok: true, data: result });
}

// ── Async handlers ──

async function h_indexStart(id, type, payload) {
  const { repoPath, files } = payload || {};
  if (!repoPath || !files || !Array.isArray(files)) {
    return respond({ id, type, ok: false, error: 'Missing repoPath or files array' });
  }

  const repo = repoGetByPath(repoPath);
  if (!repo) return respond({ id, type, ok: false, error: 'Repo not found in DB' });

  const BATCH_SIZE = 10;
  let indexedCount = 0;
  let totalSymbols = 0;
  const total = files.length;

  let lastProgress = 0;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(batch.map(async (filePath) => {
      const fullPath = path.join(repoPath, filePath);
      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const hash = crypto.createHash('md5').update(content).digest('hex');
        const result = parseFile(content, filePath);
        cache.set(filePath, result);

        const existing = fileGetByRepoAndPath(repo.id, filePath);
        let fileId;
        if (existing) {
          fileId = existing.id;
          fileMarkClean(fileId);
          _db.run('UPDATE indexed_files SET file_hash=?, indexed_at=? WHERE id=?', [hash, new Date().toISOString(), fileId]);
        } else {
          const lang = detectLanguage(path.extname(filePath).toLowerCase());
          fileId = fileInsert(repo.id, filePath, lang, hash, new Date().toISOString());
        }
        fileInsertSymbols(fileId, repo.id, result.symbols);
        fileInsertImports(fileId, repo.id, result.imports);

        totalSymbols += result.symbols.length;
      } catch (_) {}
    }));

    indexedCount += batch.length;

    const now = Date.now();
    if (now - lastProgress > 100) {
      lastProgress = now;
      respond({
        id: 'progress', type: 'progress',
        data: { current: indexedCount, total, percent: Math.round((indexedCount / total) * 100) },
      });
    }
  }

  scheduleFlush();
  respond({ id, type, ok: true, data: { totalFiles: total, totalSymbols } });
}

async function h_indexFilesById(id, type, payload) {
  const { repoPath, files } = payload || {};
  if (!repoPath || !files || !Array.isArray(files)) {
    return respond({ id, type, ok: false, error: 'Missing repoPath or files array' });
  }

  const BATCH_SIZE = 10;
  let indexedCount = 0;
  let totalSymbols = 0;
  const total = files.length;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(batch.map(async (filePath) => {
      const fullPath = path.join(repoPath, filePath);
      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const result = parseFile(content, filePath);
        cache.set(filePath, result);
        totalSymbols += result.symbols.length;
      } catch (_) {}
    }));

    indexedCount += batch.length;

    respond({
      id: 'progress', type: 'progress',
      data: { current: indexedCount, total, percent: Math.round((indexedCount / total) * 100) },
    });
  }

  respond({ id, type, ok: true, data: { totalFiles: total, totalSymbols } });
}

// ── Router ──

function handle(msg) {
  const { id, type, payload } = msg || {};
  if (!id || !type) return;

  try {
    switch (type) {
      // DB operations
      case 'db:init': return h_dbInit(id, type, payload);
      case 'db:checkRepo': return h_dbCheckRepo(id, type, payload);
      case 'db:getStatus': return h_dbGetStatus(id, type, payload);
      case 'db:upsertRepo': return h_dbUpsertRepo(id, type, payload);
      case 'db:markIndexed': return h_dbMarkIndexed(id, type, payload);
      case 'db:getDirtyCount': return h_dbGetDirtyCount(id, type, payload);
      case 'db:markDirty': return h_dbMarkDirty(id, type, payload);
      case 'db:getDirtyFiles': return h_dbGetDirtyFiles(id, type, payload);
      case 'db:markClean': return h_dbMarkClean(id, type, payload);
      case 'db:reset': return h_dbReset(id, type, payload);
      case 'db:delete': return h_dbDelete(id, type, payload);
      case 'db:getManaged': return h_dbGetManaged(id, type);
      case 'db:getSymbolTypes': return h_dbGetSymbolTypes(id, type, payload);
      case 'db:insertFile': return h_dbInsertFile(id, type, payload);
      case 'db:reindexFile': return h_dbReindexFile(id, type, payload);
      case 'db:flush': return h_dbFlush(id, type);
      case 'db:getFileByPathAndRepo': return h_dbGetFileByPathAndRepo(id, type, payload);
      case 'db:getFiles': return h_dbGetFiles(id, type, payload);
      case 'db:getChatSymbols': return h_dbGetChatSymbols(id, type, payload);
      case 'db:getChatDependencies': return h_dbGetChatDependencies(id, type, payload);
      case 'db:getChatDependents': return h_dbGetChatDependents(id, type, payload);
      case 'db:getChatImportChain': return h_dbGetChatImportChain(id, type, payload);
      case 'db:getChatCircularDeps': return h_dbGetChatCircularDeps(id, type, payload);
      case 'db:getFileList': return h_dbGetFileList(id, type, payload);
      case 'db:getFileDeps': return h_dbGetFileDeps(id, type, payload);
      case 'db:getCodebaseMapData': return h_dbGetCodebaseMapData(id, type, payload);

      // Existing operations
      case 'indexFile': return h_indexFile(id, type, payload);
      case 'indexFiles': return h_indexFiles(id, type, payload);
      case 'index:start': return h_indexStart(id, type, payload);
      case 'index:files': return h_indexFilesById(id, type, payload);
      case 'symbols:get': return h_symbolsGet(id, type, payload);
      case 'search': return h_search(id, type, payload);
      case 'status': return h_status(id, type);
      case 'removeFile': return h_removeFile(id, type, payload);
      case 'clear': return h_clear(id, type);
      case 'getFileList': return h_getFileList(id, type);
      case 'getFileDeps': return h_getFileDeps(id, type, payload);
      default: return respond({ id, type, ok: false, error: `Unknown message type: ${type}` });
    }
  } catch (err) {
    return respond({ id, type, ok: false, error: err.message });
  }
}

// ── Main loop ──

const dbPath = process.argv[2];

if (dbPath) {
  initDb(dbPath);
} else {
  process.stdout.write(JSON.stringify({ id: 'bootstrap', type: 'ready', ok: true, data: { dbReady: false } }) + '\n');
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;
  try {
    const msg = JSON.parse(line);
    handle(msg);
  } catch (err) {
    process.stderr.write(`[indexer] Invalid JSON: ${err.message}\n`);
  }
});

rl.on('close', () => {
  if (_db) { flushDb(); _db.close(); }
  process.exit(0);
});
