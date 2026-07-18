const { getSqlJs } = require('./sharedSqlJs');
const path = require('path');
const fs = require('fs');

const DB_DIR = 'helperchat';
const DB_FILE = 'chat.db';

const WRITE_WORKER_CODE = `
const { parentPort } = require('worker_threads');
const fs = require('fs');
parentPort.on('message', ({ buffer, path }) => {
  try {
    fs.writeFileSync(path, buffer);
    parentPort.postMessage({ ok: true });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err.message });
  }
});
`;

let _db = null;
let _appRef = null;
let _saveTimer = null;
let _pendingSave = false;
let _writeWorker = null;
let _writeWorkerBusy = false;
let _pendingWrite = null;
let _dirty = false;

function getDbPath() {
  const dir = path.join(_appRef.getPath('userData'), DB_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, DB_FILE);
}

async function initChatDb(app) {
  if (_db) return _db;
  _appRef = app;

  const SQL = await getSqlJs();
  const dbPath = getDbPath();

  let buffer = null;
  if (fs.existsSync(dbPath)) {
    buffer = fs.readFileSync(dbPath);
  }

  _db = new SQL.Database(buffer);
  _db.run('PRAGMA journal_mode=WAL');
  _db.run('PRAGMA foreign_keys=ON');
  _dirty = false;

  _db = new Proxy(_db, {
    get(target, prop) {
      const val = target[prop];
      if (typeof val === 'function' && (prop === 'run' || prop === 'exec' || prop === 'prepare')) {
        return function (...args) {
          _dirty = true;
          return val.apply(target, args);
        };
      }
      return val;
    }
  });

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

function _getWriteWorker() {
  if (_writeWorker) return _writeWorker;
  const { Worker } = require('worker_threads');
  _writeWorker = new Worker(WRITE_WORKER_CODE, { eval: true });
  _writeWorker.on('message', () => {
    _writeWorkerBusy = false;
    if (_pendingWrite) {
      const { buffer, path } = _pendingWrite;
      _pendingWrite = null;
      _writeWorkerBusy = true;
      _writeWorker.postMessage({ buffer, path });
    }
  });
  _writeWorker.on('error', (err) => {
    console.error('[ChatDB] Write worker error:', err.message);
    _writeWorkerBusy = false;
    _writeWorker = null;
  });
  _writeWorker.on('exit', () => {
    _writeWorker = null;
    _writeWorkerBusy = false;
  });
  return _writeWorker;
}

function _flush() {
  if (!_db || !_dirty) return;
  _pendingSave = false;
  _dirty = false;
  const data = _db.export();
  const buffer = Buffer.from(data);
  const dbPath = getDbPath();
  const worker = _getWriteWorker();
  if (_writeWorkerBusy) {
    _pendingWrite = { buffer, path: dbPath };
    return;
  }
  _writeWorkerBusy = true;
  worker.postMessage({ buffer, path: dbPath });
}

function _flushSync() {
  if (!_db || !_dirty) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(getDbPath(), buffer);
}

function save() {
  if (!_db || !_dirty) return;
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
    _flushSync();
    _db.close();
    _db = null;
  }
  if (_writeWorker) { try { _writeWorker.terminate(); } catch (_) {} _writeWorker = null; }
}

module.exports = { initChatDb, getChatDb, save, closeChatDb, getDbPath };
