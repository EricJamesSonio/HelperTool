const fs = require('fs');
const { getSqlJs } = require('../workerSqlJs');
const { makeQueries, allRows } = require('../../utils/profileQueries');

let _db = null;
let _dbPath = null;
const IDLE_MS = 60000;
const RECHECK_MS = 20000;
let _mtime = 0;
let _lastCheck = 0;
let _idleTimer = null;
let _opening = null;

function _closeDb() {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_db) {
    try { _db.close(); } catch (_) {}
  }
  _db = null;
  _dbPath = null;
  _mtime = 0;
  _lastCheck = 0;
}

function _touch() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(_closeDb, IDLE_MS);
  if (_idleTimer.unref) _idleTimer.unref();
}

async function _doOpen(filePath) {
  const now = Date.now();
  if (_db && _dbPath === filePath && now - _lastCheck < RECHECK_MS) {
    _touch();
    return _db;
  }
  let info;
  try {
    info = fs.statSync(filePath);
  } catch (_) {
    throw new Error('DB not found: ' + filePath);
  }
  _lastCheck = now;
  if (_db && _dbPath === filePath && _mtime === info.mtimeMs) {
    _touch();
    return _db;
  }
  _closeDb();
  const SQL = await getSqlJs();
  let buffer = fs.readFileSync(filePath);
  const after = fs.statSync(filePath);
  if (after.mtimeMs !== info.mtimeMs || after.size !== buffer.length) {
    await new Promise((r) => setTimeout(r, 400));
    info = fs.statSync(filePath);
    buffer = fs.readFileSync(filePath);
  }
  _db = new SQL.Database(buffer);
  _dbPath = filePath;
  _mtime = info.mtimeMs;
  _lastCheck = Date.now();
  _touch();
  return _db;
}

async function _openDb(filePath) {
  if (_opening) return _opening;
  _opening = _doOpen(filePath).finally(() => {
    _opening = null;
  });
  return _opening;
}

function getProfile() {
  const rows = allRows(_db, 'SELECT * FROM profile WHERE id=1');
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r[0], name: r[1], email: r[2],
    avatarColor: r[3] || '#4F8EF7', facebook: r[4], tiktok: r[5],
    linkedin: r[6], wakatime: r[7], bio: r[10] || '', website: r[11] || '',
  };
}

function getAvatar() {
  try {
    const rows = allRows(_db, 'SELECT avatar_data FROM profile WHERE id=1 AND avatar_data IS NOT NULL');
    if (rows.length && rows[0][0]) return { dataUrl: rows[0][0] };
  } catch (_) {}
  return { dataUrl: null };
}

module.exports = async function handle(payload) {
  const { action, dbPath, params } = payload || {};
  await _openDb(dbPath);
  const q = makeQueries(_db);
  const p = params || {};
  switch (action) {
    case 'getAll':
      return {
        profile: getProfile(),
        avatar: null,
        stats: q.getStats(p.statsRange || 'all'),
        heatmap: q.getHeatmap(p.heatmapYear),
        donuts: q.getDonutData(p.donutRange || 'all'),
        history: q.getHistory(p.historyPage, p.historyRepo),
      };
    case 'getProfile':
      return getProfile();
    case 'getStats':
      return q.getStats(p.range || 'all');
    case 'getHeatmap':
      return q.getHeatmap(p.year);
    case 'getDonutData':
      return q.getDonutData(p.range || 'all');
    case 'getHistory':
      return q.getHistory(p.page, p.repoPath);
    case 'getAvatar':
      return getAvatar();
    default:
      throw new Error('Unknown profileData action: ' + action);
  }
};