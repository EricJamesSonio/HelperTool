const { ipcMain } = require('electron');
const path = require('path');
const indexerProxy = require('./indexerProxy.js');
const { getDb } = require('../database/db');

function db() { return getDb(); }

function register() {

  ipcMain.handle('codebaseChat:getFiles', async (event, { repoPath }) => {
    try {
      const files = await indexerProxy.send('db:getFiles', { repoPath });
      return files || [];
    } catch (err) {
      console.error('[codebaseChat] getFiles error:', err);
      return [];
    }
  });

  ipcMain.handle('codebaseChat:getSymbols', async (event, { repoPath, filePath }) => {
    try {
      const symbols = await indexerProxy.send('db:getChatSymbols', { repoPath, filePath });
      return symbols || [];
    } catch (err) {
      console.error('[codebaseChat] getSymbols error:', err);
      return [];
    }
  });

  ipcMain.handle('codebaseChat:getDependencies', async (event, { repoPath, filePath }) => {
    try {
      const deps = await indexerProxy.send('db:getChatDependencies', { repoPath, filePath });
      return deps || [];
    } catch (err) {
      console.error('[codebaseChat] getDependencies error:', err);
      return [];
    }
  });

  ipcMain.handle('codebaseChat:getDependents', async (event, { repoPath, filePath }) => {
    try {
      const deps = await indexerProxy.send('db:getChatDependents', { repoPath, filePath });
      return deps || [];
    } catch (err) {
      console.error('[codebaseChat] getDependents error:', err);
      return [];
    }
  });

  ipcMain.handle('codebaseChat:getImportChain', async (event, { repoPath, filePath }) => {
    try {
      const chain = await indexerProxy.send('db:getChatImportChain', { repoPath, filePath });
      return chain || null;
    } catch (err) {
      console.error('[codebaseChat] getImportChain error:', err);
      return null;
    }
  });

  ipcMain.handle('codebaseChat:getCircularDeps', async (event, { repoPath, filePath }) => {
    try {
      const cycles = await indexerProxy.send('db:getChatCircularDeps', { repoPath, filePath });
      return cycles || [];
    } catch (err) {
      console.error('[codebaseChat] getCircularDeps error:', err);
      return [];
    }
  });

  // ── Conversation persistence ──────────────────────────────────────────

  ipcMain.handle('codebaseChat:getConversations', async (event, { repoPath }) => {
    try {
      const stmt = db().prepare('SELECT id, title, created_at, updated_at FROM chat_conversations WHERE repo_path = ? ORDER BY updated_at DESC');
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
      db().run('INSERT INTO chat_conversations (repo_path, title, created_at, updated_at) VALUES (?, ?, ?, ?)', [repoPath, title, now, now]);
      const id = db().exec('SELECT last_insert_rowid()')[0].values[0][0];
      return { id, title, created_at: now };
    } catch (err) {
      console.error('[codebaseChat] newConversation error:', err);
      return null;
    }
  });

  ipcMain.handle('codebaseChat:getMessages', async (event, { conversationId }) => {
    try {
      const stmt = db().prepare('SELECT id, role, content, query_type, file_ref, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC');
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
      db().run('INSERT INTO chat_messages (conversation_id, role, content, query_type, file_ref, created_at) VALUES (?, ?, ?, ?, ?, ?)', [conversationId, role, content, queryType || null, fileRef || null, now]);
      db().run('UPDATE chat_conversations SET updated_at = ? WHERE id = ?', [now, conversationId]);
      const id = db().exec('SELECT last_insert_rowid()')[0].values[0][0];
      return { id };
    } catch (err) {
      console.error('[codebaseChat] saveMessage error:', err);
      return null;
    }
  });

  ipcMain.handle('codebaseChat:renameConversation', async (event, { conversationId, title }) => {
    try {
      db().run('UPDATE chat_conversations SET title = ? WHERE id = ?', [title, conversationId]);
      return { success: true };
    } catch (err) {
      console.error('[codebaseChat] renameConversation error:', err);
      return { success: false };
    }
  });

  ipcMain.handle('codebaseChat:deleteConversation', async (event, { conversationId }) => {
    try {
      db().run('DELETE FROM chat_messages WHERE conversation_id = ?', [conversationId]);
      db().run('DELETE FROM chat_conversations WHERE id = ?', [conversationId]);
      return { success: true };
    } catch (err) {
      console.error('[codebaseChat] deleteConversation error:', err);
      return { success: false };
    }
  });
}

module.exports = { register };
