const { getDb } = require('./db');

function insertBatch(imports) {
  if (!imports || imports.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO file_imports (repo_id, file_id, import_path, import_type, resolved_file_id, line, column)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  db.run('BEGIN');
  for (const imp of imports) {
    stmt.bind([imp.repo_id, imp.file_id, imp.import_path, imp.import_type, imp.resolved_file_id || null, imp.line || null, imp.column || null]);
    stmt.step();
    stmt.reset();
  }
  db.run('COMMIT');
  stmt.free();
}

function getByFile(fileId) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare(`
    SELECT fi.*, f.path as resolved_path
    FROM file_imports fi
    LEFT JOIN indexed_files f ON f.id = fi.resolved_file_id
    WHERE fi.file_id = ?
    ORDER BY fi.line
  `);
  stmt.bind([fileId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getReverseDeps(fileId, repoId) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare(`
    SELECT fi.*, f.path as source_path
    FROM file_imports fi
    JOIN indexed_files f ON f.id = fi.file_id
    WHERE fi.resolved_file_id = ? AND fi.repo_id = ?
    ORDER BY f.path
  `);
  stmt.bind([fileId, repoId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getByRepoAndResolvedPath(repoId, resolvedPath) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare(`
    SELECT fi.*, f.path as source_path
    FROM file_imports fi
    JOIN indexed_files f ON f.id = fi.file_id
    WHERE fi.repo_id = ? AND fi.import_path = ?
  `);
  stmt.bind([repoId, resolvedPath]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function deleteByFile(fileId) {
  const db = getDb();
  db.run('DELETE FROM file_imports WHERE file_id = ?', [fileId]);
}

function deleteByRepo(repoId) {
  const db = getDb();
  db.run('DELETE FROM file_imports WHERE repo_id = ?', [repoId]);
}

function countByRepo(repoId) {
  const db = getDb();
  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM file_imports WHERE repo_id = ?');
  stmt.bind([repoId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.cnt;
  }
  stmt.free();
  return 0;
}

module.exports = {
  insertBatch, getByFile, getReverseDeps, getByRepoAndResolvedPath,
  deleteByFile, deleteByRepo, countByRepo,
};
