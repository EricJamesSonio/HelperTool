const { getDb } = require('./db');

function getByPath(repoPath) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM repositories WHERE repo_path = ?');
  stmt.bind([repoPath]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function upsert(repoPath, name, configJson) {
  const db = getDb();
  const existing = getByPath(repoPath);
  if (existing) {
    const now = new Date().toISOString();
    db.run('UPDATE repositories SET name=?, config_json=?, updated_at=? WHERE id=?', [
      name, JSON.stringify(configJson), now, existing.id
    ]);
    return existing.id;
  }
  db.run(
    'INSERT INTO repositories (repo_path, name, config_json) VALUES (?, ?, ?)',
    [repoPath, name, JSON.stringify(configJson)]
  );
  return db.exec('SELECT last_insert_rowid()')[0].values[0][0];
}

function markIndexed(repoId, totalFiles, totalSymbols) {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(
    'UPDATE repositories SET indexed=1, last_indexed=?, total_files=?, total_symbols=?, updated_at=? WHERE id=?',
    [now, totalFiles, totalSymbols, now, repoId]
  );
}

function markUnindexed(repoId) {
  const db = getDb();
  db.run(
    'UPDATE repositories SET indexed=0, last_indexed=NULL, total_files=0, total_symbols=0, updated_at=? WHERE id=?',
    [new Date().toISOString(), repoId]
  );
}

function updateConfig(repoId, configJson) {
  const db = getDb();
  db.run('UPDATE repositories SET config_json=?, updated_at=? WHERE id=?', [
    JSON.stringify(configJson), new Date().toISOString(), repoId
  ]);
}

function remove(repoPath) {
  const db = getDb();
  db.run('DELETE FROM repositories WHERE repo_path = ?', [repoPath]);
}

function getAll() {
  const db = getDb();
  const results = [];
  const stmt = db.prepare('SELECT * FROM repositories ORDER BY updated_at DESC');
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

module.exports = { getByPath, upsert, markIndexed, markUnindexed, updateConfig, remove, getAll };
