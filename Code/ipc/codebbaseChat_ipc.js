const { ipcMain } = require('electron');
const { getDb } = require('../database/db');

function db() { return getDb(); }

function _getRepoId(repoPath) {
  const stmt = db().prepare('SELECT id FROM repositories WHERE repo_path = ?');
  stmt.bind([repoPath]);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r.id; }
  stmt.free();
  return null;
}

function _getFileId(repoId, filePath) {
  const stmt = db().prepare('SELECT id FROM indexed_files WHERE repo_id = ? AND path = ?');
  stmt.bind([repoId, filePath]);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r.id; }
  stmt.free();
  return null;
}

function _queryObjs(sql, params) {
  const stmt = db().prepare(sql);
  if (params) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function register() {

  ipcMain.handle('codebaseChat:getFiles', async (event, { repoPath }) => {
    try {
      const repoId = _getRepoId(repoPath);
      if (!repoId) return [];
      return _queryObjs(
        'SELECT id, path, language FROM indexed_files WHERE repo_id = ? ORDER BY path',
        [repoId]
      );
    } catch (err) {
      console.error('[codebaseChat] getFiles error:', err);
      return [];
    }
  });

  ipcMain.handle('codebaseChat:getSymbols', async (event, { repoPath, filePath }) => {
    try {
      const repoId = _getRepoId(repoPath);
      if (!repoId) return [];
      return _queryObjs(
        `SELECT s.name, s.type, s.line, s.signature
         FROM symbols s
         JOIN indexed_files f ON s.file_id = f.id
         WHERE f.repo_id = ? AND f.path = ?
         ORDER BY s.line`,
        [repoId, filePath]
      );
    } catch (err) {
      console.error('[codebaseChat] getSymbols error:', err);
      return [];
    }
  });

  ipcMain.handle('codebaseChat:getDependencies', async (event, { repoPath, filePath }) => {
    try {
      const repoId = _getRepoId(repoPath);
      if (!repoId) return [];
      const fileId = _getFileId(repoId, filePath);
      if (!fileId) return [];
      return _queryObjs(
        `SELECT fi.import_path, fi.import_type, fi.imported_symbols, f.path as resolved_path
         FROM file_imports fi
         LEFT JOIN indexed_files f ON f.id = fi.resolved_file_id
         WHERE fi.file_id = ?
         ORDER BY fi.line`,
        [fileId]
      );
    } catch (err) {
      console.error('[codebaseChat] getDependencies error:', err);
      return [];
    }
  });

  ipcMain.handle('codebaseChat:getDependents', async (event, { repoPath, filePath }) => {
    try {
      const repoId = _getRepoId(repoPath);
      if (!repoId) return [];
      const fileId = _getFileId(repoId, filePath);
      if (!fileId) return [];
      return _queryObjs(
        `SELECT f.path, fi.import_type, fi.imported_symbols
         FROM file_imports fi
         JOIN indexed_files f ON f.id = fi.file_id
         WHERE fi.resolved_file_id = ? AND fi.repo_id = ?
         ORDER BY f.path`,
        [fileId, repoId]
      );
    } catch (err) {
      console.error('[codebaseChat] getDependents error:', err);
      return [];
    }
  });

  ipcMain.handle('codebaseChat:getImportChain', async (event, { repoPath, filePath }) => {
    try {
      const repoId = _getRepoId(repoPath);
      if (!repoId) return null;
      const visited = new Set();
      const maxDepth = 6;

      function dfs(path, depth) {
        if (depth > maxDepth || visited.has(path)) return { path, children: [], cycle: visited.has(path) };
        visited.add(path);
        const fileId = _getFileId(repoId, path);
        if (!fileId) return { path, children: [] };
        const deps = _queryObjs(
          `SELECT f.path FROM file_imports fi
           JOIN indexed_files f ON f.id = fi.resolved_file_id
           WHERE fi.file_id = ? AND fi.resolved_file_id IS NOT NULL`,
          [fileId]
        );
        const children = deps.map(d => dfs(d.path, depth + 1));
        return { path, children };
      }

      return dfs(filePath, 0);
    } catch (err) {
      console.error('[codebaseChat] getImportChain error:', err);
      return null;
    }
  });

  ipcMain.handle('codebaseChat:getCircularDeps', async (event, { repoPath, filePath }) => {
    try {
      const repoId = _getRepoId(repoPath);
      if (!repoId) return [];
      const cycles = [];
      const visitStack = [];
      const visited = new Set();

      function dfs(path) {
        if (visitStack.includes(path)) {
          const idx = visitStack.indexOf(path);
          cycles.push([...visitStack.slice(idx), path]);
          return;
        }
        if (visited.has(path)) return;
        visited.add(path);
        visitStack.push(path);
        const fileId = _getFileId(repoId, path);
        if (fileId) {
          const deps = _queryObjs(
            `SELECT f.path FROM file_imports fi
             JOIN indexed_files f ON f.id = fi.resolved_file_id
             WHERE fi.file_id = ? AND fi.resolved_file_id IS NOT NULL`,
            [fileId]
          );
          for (const d of deps) dfs(d.path);
        }
        visitStack.pop();
      }

      dfs(filePath);
      return cycles;
    } catch (err) {
      console.error('[codebaseChat] getCircularDeps error:', err);
      return [];
    }
  });
}

module.exports = { register };
