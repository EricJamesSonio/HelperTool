const initSqlJs = require('sql.js/dist/sql-wasm.js');
const path = require('path');
const fs = require('fs');

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

module.exports = { initChatDb, getChatDb, save, closeChatDb, getDbPath };
