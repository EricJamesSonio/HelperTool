const { getDb } = require('./db');

function insertBatch(symbols) {
  const db = getDb();
  if (symbols.length === 0) return;
  const stmt = db.prepare(
    'INSERT INTO symbols (repo_id, file_id, name, type, line, column, is_exported, class_name, language, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  db.run('BEGIN');
  for (const s of symbols) {
    stmt.run([s.repo_id, s.file_id, s.name, s.type, s.line, s.column, s.is_exported ? 1 : 0, s.class_name || null, s.language || null, s.signature || null]);
  }
  db.run('COMMIT');
  stmt.free();
}

function deleteByFile(fileId) {
  const db = getDb();
  db.run('DELETE FROM symbols WHERE file_id = ?', [fileId]);
}

function deleteByRepo(repoId) {
  const db = getDb();
  db.run('DELETE FROM symbols WHERE repo_id = ?', [repoId]);
}

function search(repoId, query, limit) {
  const db = getDb();
  limit = limit || 20;
  const searchTerm = query.trim();
  if (!searchTerm) return [];

  const results = [];

  // Try FTS5 first (faster, ranked)
  const sanitized = searchTerm.replace(/[^a-zA-Z0-9_*]/g, ' ').trim();
  if (sanitized) {
    const ftsQuery = sanitized.split(/\s+/).map(w => w + '*').join(' ');
    const sql = `
      SELECT s.name, s.type, s.line, s.class_name, s.signature,
             f.path as file_path
      FROM symbols_fts
      JOIN symbols s ON symbols_fts.rowid = s.id
      JOIN indexed_files f ON s.file_id = f.id
      WHERE s.repo_id = ? AND symbols_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    try {
      const stmt = db.prepare(sql);
      stmt.bind([repoId, ftsQuery, limit]);
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
    } catch (e) {
      console.warn('[Symbols] FTS5 query failed, using LIKE fallback:', e.message);
    }
  }

  // If FTS5 returned nothing, fallback to LIKE on name only
  if (results.length === 0) {
    const like = `%${searchTerm.replace(/[%_]/g, '\\$&')}%`;
    const sql = `
      SELECT s.name, s.type, s.line, s.class_name, s.signature,
             f.path as file_path
      FROM symbols s
      JOIN indexed_files f ON s.file_id = f.id
      WHERE s.repo_id = ? AND s.name LIKE ? ESCAPE '\\'
      ORDER BY
        CASE WHEN s.name = ? THEN 0
             WHEN s.name LIKE ? THEN 1
             ELSE 2 END,
        s.name
      LIMIT ?
    `;
    try {
      const stmt = db.prepare(sql);
      stmt.bind([repoId, like, searchTerm, like, limit]);
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
    } catch (e) {
      console.error('[Symbols] LIKE search failed:', e.message);
      return [];
    }
  }

  return results;
}

function countByRepo(repoId) {
  const db = getDb();
  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM symbols WHERE repo_id = ?');
  stmt.bind([repoId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.cnt;
  }
  stmt.free();
  return 0;
}

function countByType(repoId) {
  const db = getDb();
  const results = {};
  const stmt = db.prepare('SELECT type, COUNT(*) as cnt FROM symbols WHERE repo_id = ? GROUP BY type ORDER BY cnt DESC');
  stmt.bind([repoId]);
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results[row.type] = row.cnt;
  }
  stmt.free();
  return results;
}

function getByRepoGrouped(repoId) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT f.id as file_id, f.path as file_path, f.language, f.is_dirty,
           s.id as symbol_id, s.name, s.type, s.line, s.column, s.is_exported, s.class_name, s.signature
    FROM indexed_files f
    LEFT JOIN symbols s ON s.file_id = f.id
    WHERE f.repo_id = ?
    ORDER BY f.path, s.line
  `);
  stmt.bind([repoId]);

  const files = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    if (!files[row.file_path]) {
      files[row.file_path] = {
        path: row.file_path,
        language: row.language,
        is_dirty: !!row.is_dirty,
        symbols: [],
      };
    }
    if (row.symbol_id) {
      files[row.file_path].symbols.push({
        id: row.symbol_id,
        name: row.name,
        type: row.type,
        line: row.line,
        column: row.column,
        is_exported: !!row.is_exported,
        class_name: row.class_name,
        signature: row.signature,
      });
    }
  }
  stmt.free();
  return Object.values(files);
}

function getByFile(fileId) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare('SELECT * FROM symbols WHERE file_id = ? ORDER BY line');
  stmt.bind([fileId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getByRepoGroupedLight(repoId) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT f.path, f.language, f.is_dirty,
           (SELECT COUNT(*) FROM symbols WHERE file_id = f.id) as symbol_count
    FROM indexed_files f
    WHERE f.repo_id = ?
    ORDER BY f.path
  `);
  stmt.bind([repoId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getByRepoAndFile(repoId, filePath) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT s.name, s.type, s.line,
           s.class_name, s.signature
    FROM symbols s
    JOIN indexed_files f ON s.file_id = f.id
    WHERE f.repo_id = ? AND f.path = ?
    ORDER BY s.line
  `);
  stmt.bind([repoId, filePath]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getAllByRepo(repoId) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT s.name, s.type, s.line, s.class_name, s.signature,
           f.path as file_path, f.language
    FROM symbols s
    JOIN indexed_files f ON s.file_id = f.id
    WHERE s.repo_id = ?
    ORDER BY f.path, s.line
  `);
  stmt.bind([repoId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

module.exports = { insertBatch, deleteByFile, deleteByRepo, search, countByRepo, countByType, getByRepoGrouped, getByFile, getByRepoGroupedLight, getByRepoAndFile, getAllByRepo };
