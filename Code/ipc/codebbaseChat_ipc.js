const { ipcMain } = require('electron');
const path = require('path');
const indexerProxy = require('./indexerProxy.js');
const { getDb } = require('../database/db');
const { getChatDb, save: saveChatDb } = require('../database/chatDb');

function db() { return getDb(); }
function cdb() { return getChatDb(); }

function _getRepoId(repoPath) {
  const stmt = db().prepare('SELECT id FROM repositories WHERE repo_path = ?');
  stmt.bind([repoPath]);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r.id; }
  stmt.free();
  return null;
}

function _getLocalFileId(repoId, filePath) {
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
      const data = await indexerProxy.send('db:getFiles', { repoPath });
      if (data && data.length > 0) return data;
    } catch (_) {}
    // Fallback: main process DB
    const repoId = _getRepoId(repoPath);
    if (!repoId) return [];
    return _queryObjs('SELECT id, path, language FROM indexed_files WHERE repo_id = ? ORDER BY path', [repoId]);
  });

  ipcMain.handle('codebaseChat:getSymbols', async (event, { repoPath, filePath }) => {
    try {
      const data = await indexerProxy.send('db:getChatSymbols', { repoPath, filePath });
      if (data && data.length > 0) return data;
    } catch (_) {}
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
  });

  ipcMain.handle('codebaseChat:getDependencies', async (event, { repoPath, filePath }) => {
    try {
      const data = await indexerProxy.send('db:getChatDependencies', { repoPath, filePath });
      if (data && data.length > 0) return data;
    } catch (_) {}
    const repoId = _getRepoId(repoPath);
    if (!repoId) return [];
    const fileId = _getLocalFileId(repoId, filePath);
    if (!fileId) return [];
    return _queryObjs(
      `SELECT fi.import_path, fi.import_type, fi.imported_symbols, f.path as resolved_path
       FROM file_imports fi
       LEFT JOIN indexed_files f ON f.id = fi.resolved_file_id
       WHERE fi.file_id = ?
       ORDER BY fi.line`,
      [fileId]
    );
  });

  ipcMain.handle('codebaseChat:getDependents', async (event, { repoPath, filePath }) => {
    try {
      const data = await indexerProxy.send('db:getChatDependents', { repoPath, filePath });
      if (data && data.length > 0) return data;
    } catch (_) {}
    const repoId = _getRepoId(repoPath);
    if (!repoId) return [];
    const fileId = _getLocalFileId(repoId, filePath);
    if (!fileId) return [];
    return _queryObjs(
      `SELECT f.path, fi.import_type, fi.imported_symbols
       FROM file_imports fi
       JOIN indexed_files f ON f.id = fi.file_id
       WHERE fi.resolved_file_id = ? AND fi.repo_id = ?
       ORDER BY f.path`,
      [fileId, repoId]
    );
  });

  ipcMain.handle('codebaseChat:getImportChain', async (event, { repoPath, filePath }) => {
    try {
      const data = await indexerProxy.send('db:getChatImportChain', { repoPath, filePath });
      if (data) return data;
    } catch (_) {}
    const repoId = _getRepoId(repoPath);
    if (!repoId) return null;
    const visited = new Set();
    const maxDepth = 6;
    function dfs(path, depth) {
      if (depth > maxDepth || visited.has(path)) return { path, children: [], cycle: visited.has(path) };
      visited.add(path);
      const fileId = _getLocalFileId(repoId, path);
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
  });

  ipcMain.handle('codebaseChat:getCircularDeps', async (event, { repoPath, filePath }) => {
    try {
      const data = await indexerProxy.send('db:getChatCircularDeps', { repoPath, filePath });
      if (data && data.length > 0) return data;
    } catch (_) {}
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
      const fileId = _getLocalFileId(repoId, path);
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
  });

  // ── Conversation persistence ──────────────────────────────────────────

  ipcMain.handle('codebaseChat:getConversations', async (event, { repoPath }) => {
    try {
      const stmt = cdb().prepare('SELECT id, title, created_at, updated_at FROM chat_conversations WHERE repo_path = ? ORDER BY updated_at DESC');
      stmt.bind([repoPath]);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch (err) {
      console.error('[codebaseChat] getConversations error:', err);
      return [];
    }
  });

  ipcMain.handle('codebaseChat:newConversation', async (event, { repoPath, title }) => {
    try {
      const now = new Date().toISOString();
      cdb().run('INSERT INTO chat_conversations (repo_path, title, created_at, updated_at) VALUES (?, ?, ?, ?)', [repoPath, title, now, now]);
      const id = cdb().exec('SELECT last_insert_rowid()')[0].values[0][0];
      saveChatDb();
      return { id, title, created_at: now };
    } catch (err) {
      console.error('[codebaseChat] newConversation error:', err);
      return null;
    }
  });

  ipcMain.handle('codebaseChat:getMessages', async (event, { conversationId }) => {
    try {
      const stmt = cdb().prepare('SELECT id, role, content, query_type, file_ref, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC');
      stmt.bind([conversationId]);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch (err) {
      console.error('[codebaseChat] getMessages error:', err);
      return [];
    }
  });

  ipcMain.handle('codebaseChat:saveMessage', async (event, { conversationId, role, content, queryType, fileRef }) => {
    try {
      const now = new Date().toISOString();
      cdb().run('INSERT INTO chat_messages (conversation_id, role, content, query_type, file_ref, created_at) VALUES (?, ?, ?, ?, ?, ?)', [conversationId, role, content, queryType || null, fileRef || null, now]);
      cdb().run('UPDATE chat_conversations SET updated_at = ? WHERE id = ?', [now, conversationId]);
      const id = cdb().exec('SELECT last_insert_rowid()')[0].values[0][0];
      saveChatDb();
      return { id };
    } catch (err) {
      console.error('[codebaseChat] saveMessage error:', err);
      return null;
    }
  });

  ipcMain.handle('codebaseChat:renameConversation', async (event, { conversationId, title }) => {
    try {
      cdb().run('UPDATE chat_conversations SET title = ? WHERE id = ?', [title, conversationId]);
      saveChatDb();
      return { success: true };
    } catch (err) {
      console.error('[codebaseChat] renameConversation error:', err);
      return { success: false };
    }
  });

  ipcMain.handle('codebaseChat:deleteConversation', async (event, { conversationId }) => {
    try {
      cdb().run('DELETE FROM chat_messages WHERE conversation_id = ?', [conversationId]);
      cdb().run('DELETE FROM chat_conversations WHERE id = ?', [conversationId]);
      saveChatDb();
      return { success: true };
    } catch (err) {
      console.error('[codebaseChat] deleteConversation error:', err);
      return { success: false };
    }
  });
}

module.exports = { register };
