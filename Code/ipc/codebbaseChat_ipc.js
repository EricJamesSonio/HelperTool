const { ipcMain } = require('electron');
const { getDb } = require('../database/db');
const { getChatDb, save: saveChatDb } = require('../database/chatDb');
const gmailIpc = require('./gmail_ipc.js');
const symbolsJson = require('../database/symbolsJsonLoader');

function db() { return getDb(); }
function cdb() { return getChatDb(); }

function register() {

  // ── Symbol queries from symbols.json ──────────────────────────────────

  ipcMain.handle('codebaseChat:getFiles', async (event, { repoPath }) => {
    return symbolsJson.getFiles(repoPath);
  });

  ipcMain.handle('codebaseChat:getSymbols', async (event, { repoPath, filePath }) => {
    return symbolsJson.getSymbols(repoPath, filePath);
  });

  ipcMain.handle('codebaseChat:getDependencies', async (event, { repoPath, filePath }) => {
    return symbolsJson.getDependencies(repoPath, filePath);
  });

  ipcMain.handle('codebaseChat:getDependents', async (event, { repoPath, filePath }) => {
    return symbolsJson.getDependents(repoPath, filePath);
  });

  ipcMain.handle('codebaseChat:getImportChain', async (event, { repoPath, filePath }) => {
    return symbolsJson.getImportChain(repoPath, filePath);
  });

  ipcMain.handle('codebaseChat:getCircularDeps', async (event, { repoPath, filePath }) => {
    return symbolsJson.getCircularDeps(repoPath, filePath);
  });

  // ── Gmail data (unchanged) ───────────────────────────────────────────

  ipcMain.handle('chat:getEmailData', async (event, { email, queryType, params }) => {
    try {
      if (email === 'all') {
        const all = gmailIpc.getAllCachedMessages();
        return { success: true, accounts: all };
      }
      const data = gmailIpc.getCachedMessages(email);
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('chat:getConnectedGmailAccounts', async () => {
    try {
      const accounts = gmailIpc.getConnectedAccounts();
      return { success: true, accounts };
    } catch (err) {
      return { success: false, accounts: [] };
    }
  });

  // ── Conversation persistence (unchanged) ─────────────────────────────

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
