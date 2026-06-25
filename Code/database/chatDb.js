const initSqlJs = require('sql.js/dist/sql-wasm.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_DIR = 'helperchat';
const DB_FILE = 'chat.db';

let _db = null;
let _appRef = null;
let _saveTimer = null;
let _pendingSave = false;

function getDbPath() {
  const dir = path.join(_appRef.getPath('userData'), DB_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, DB_FILE);
}

async function initChatDb(app) {
  if (_db) return _db;
  _appRef = app;

  const SQL = await initSqlJs();
  const dbPath = getDbPath();

  let buffer = null;
  if (fs.existsSync(dbPath)) {
    buffer = fs.readFileSync(dbPath);
  }

  _db = new SQL.Database(buffer);
  _db.run('PRAGMA journal_mode=WAL');
  _db.run('PRAGMA foreign_keys=ON');

  _db.run(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_path   TEXT NOT NULL,
      title       TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK(role IN ('user','bot')),
      content         TEXT NOT NULL,
      query_type      TEXT,
      file_ref        TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.run('CREATE INDEX IF NOT EXISTS idx_chat_conv_repo ON chat_conversations(repo_path)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id)');

  _db.run(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id          TEXT PRIMARY KEY,
      repo_path   TEXT NOT NULL,
      title       TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      model       TEXT DEFAULT 'opencode'
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS chat_session_messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content     TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      created_at  INTEGER NOT NULL
    )
  `);

  _db.run('CREATE INDEX IF NOT EXISTS idx_chat_sess_repo ON chat_sessions(repo_path)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_chat_sess_msg_session ON chat_session_messages(session_id)');

  try { _db.run('ALTER TABLE chat_sessions ADD COLUMN opencode_session_id TEXT'); } catch (_) {}

  _flush();
  save();

  return _db;
}

function getChatDb() {
  if (!_db) throw new Error('Chat database not initialized');
  return _db;
}

function _flush() {
  if (!_db) return;
  _pendingSave = false;
  const data = _db.export();
  const buffer = Buffer.from(data);
  const dbPath = getDbPath();
  fs.writeFileSync(dbPath, buffer);
}

function save() {
  if (!_db) return;
  if (_saveTimer) { _pendingSave = true; return; }
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    _flush();
    if (_pendingSave) {
      _pendingSave = false;
      _saveTimer = setTimeout(() => { _saveTimer = null; _flush(); }, 5000);
    }
  }, 5000);
}

function closeChatDb() {
  if (_db) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _flush();
    _db.close();
    _db = null;
  }
}

function createSession(repoPath, model = 'opencode') {
  const db = getChatDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  db.run(
    'INSERT INTO chat_sessions (id, repo_path, title, created_at, updated_at, model) VALUES (?, ?, ?, ?, ?, ?)',
    [id, repoPath, null, now, now, model]
  );
  save();
  return { id, repoPath, title: null, createdAt: now, updatedAt: now, model };
}

function getSessions(repoPath) {
  const db = getChatDb();
  const stmt = db.prepare(
    'SELECT id, repo_path, title, created_at, updated_at, model FROM chat_sessions WHERE repo_path = ? ORDER BY updated_at DESC'
  );
  stmt.bind([repoPath]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function getMessages(sessionId) {
  const db = getChatDb();
  const stmt = db.prepare(
    'SELECT id, session_id, role, content, attachments, created_at FROM chat_session_messages WHERE session_id = ? ORDER BY created_at ASC'
  );
  stmt.bind([sessionId]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows.map(r => ({ ...r, attachments: JSON.parse(r.attachments || '[]') }));
}

function saveMessage(sessionId, role, content, attachments = []) {
  const db = getChatDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  db.run(
    'INSERT INTO chat_session_messages (id, session_id, role, content, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, sessionId, role, content, JSON.stringify(attachments), now]
  );
  save();
  return { id, sessionId, role, content, createdAt: now };
}

function updateSessionTitle(sessionId, title) {
  const db = getChatDb();
  const now = Math.floor(Date.now() / 1000);
  db.run('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?', [title, now, sessionId]);
  save();
}

function updateSessionTimestamp(sessionId) {
  const db = getChatDb();
  const now = Math.floor(Date.now() / 1000);
  db.run('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);
  save();
}

function deleteSession(sessionId) {
  const db = getChatDb();
  db.run('DELETE FROM chat_session_messages WHERE session_id = ?', [sessionId]);
  db.run('DELETE FROM chat_sessions WHERE id = ?', [sessionId]);
  save();
}

function getSession(sessionId) {
  const db = getChatDb();
  const stmt = db.prepare('SELECT id, repo_path, title, created_at, updated_at, model, opencode_session_id FROM chat_sessions WHERE id = ?');
  stmt.bind([sessionId]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row || null;
}

function setOpencodeSessionId(sessionId, opencodeId) {
  const db = getChatDb();
  db.run('UPDATE chat_sessions SET opencode_session_id = ? WHERE id = ?', [opencodeId, sessionId]);
  save();
}

module.exports = { initChatDb, getChatDb, save, closeChatDb, getDbPath, createSession, getSessions, getMessages, saveMessage, updateSessionTitle, updateSessionTimestamp, deleteSession, getSession, setOpencodeSessionId };
