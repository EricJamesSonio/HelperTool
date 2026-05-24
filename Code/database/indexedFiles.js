const { getDb } = require('./db');

function insert(repoId, filePath, language, fileHash, lastModified) {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(
    `INSERT OR REPLACE INTO indexed_files (repo_id, path, language, file_hash, last_modified, indexed_at, is_dirty)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [repoId, filePath, language, fileHash, lastModified, now]
  );
  const row = db.exec('SELECT last_insert_rowid()');
  return row[0].values[0][0];
}

function getByRepoAndPath(repoId, filePath) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM indexed_files WHERE repo_id = ? AND path = ?');
  stmt.bind([repoId, filePath]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function markDirty(repoId, filePath) {
  const db = getDb();
  db.run('UPDATE indexed_files SET is_dirty=1 WHERE repo_id=? AND path=?', [repoId, filePath]);
}

function markClean(id) {
  const db = getDb();
  const now = new Date().toISOString();
  db.run('UPDATE indexed_files SET is_dirty=0, indexed_at=? WHERE id=?', [now, id]);
}

function getDirtyByRepo(repoId) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare('SELECT * FROM indexed_files WHERE repo_id = ? AND is_dirty = 1 ORDER BY path');
  stmt.bind([repoId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getDirtyWithSymbols(repoId) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare(`
    SELECT f.id, f.path, f.language, f.last_modified,
           (SELECT COUNT(*) FROM symbols WHERE file_id = f.id) as symbol_count
    FROM indexed_files f
    WHERE f.repo_id = ? AND f.is_dirty = 1
    ORDER BY f.path
  `);
  stmt.bind([repoId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function countDirtyByRepo(repoId) {
  const db = getDb();
  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM indexed_files WHERE repo_id = ? AND is_dirty = 1');
  stmt.bind([repoId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.cnt;
  }
  stmt.free();
  return 0;
}

function countByRepo(repoId) {
  const db = getDb();
  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM indexed_files WHERE repo_id = ?');
  stmt.bind([repoId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.cnt;
  }
  stmt.free();
  return 0;
}

function getByRepo(repoId) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare('SELECT * FROM indexed_files WHERE repo_id = ? ORDER BY path');
  stmt.bind([repoId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function removeByPath(repoId, filePath) {
  const db = getDb();
  const file = getByRepoAndPath(repoId, filePath);
  if (file) {
    db.run('DELETE FROM symbols WHERE file_id = ?', [file.id]);
    db.run('DELETE FROM indexed_files WHERE id = ?', [file.id]);
  }
}

function removeByRepo(repoId) {
  const db = getDb();
  db.run('DELETE FROM indexed_files WHERE repo_id = ?', [repoId]);
}

module.exports = {
  insert, getByRepoAndPath, markDirty, markClean,
  getDirtyByRepo, getDirtyWithSymbols, countDirtyByRepo, countByRepo, getByRepo,
  removeByPath, removeByRepo
};
