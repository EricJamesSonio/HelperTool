const fs = require('fs');
const path = require('path');
const { getSqlJs } = require('../workerSqlJs');

let _db = null;
let _dbPath = null;
async function _openDb(filePath) {
  if (_db && _dbPath === filePath) return _db;
  if (_db) { try { _db.close(); } catch (_) {} }
  const SQL = await getSqlJs();
  if (!fs.existsSync(filePath)) throw new Error('DB not found: ' + filePath);
  const buffer = fs.readFileSync(filePath);
  _db = new SQL.Database(buffer);
  _dbPath = filePath;
  return _db;
}

function _queryAll(sql, params) {
  const stmt = _db.prepare(sql);
  if (params && params.length) stmt.bind(params);
  const cols = stmt.getColumnNames();
  const rows = [];
  while (stmt.step()) rows.push(stmt.get());
  stmt.free();
  if (!cols.length) return [];
  return rows.map(r => {
    const obj = {};
    for (let i = 0; i < cols.length; i++) obj[cols[i]] = r[i];
    return obj;
  });
}

function _queryValues(sql, params) {
  const stmt = _db.prepare(sql);
  if (params && params.length) stmt.bind(params);
  const cols = stmt.getColumnNames();
  const rows = [];
  while (stmt.step()) rows.push(stmt.get());
  stmt.free();
  if (!cols.length) return [];
  return rows;
}

async function getProfile() {
  const rows = _queryValues('SELECT * FROM profile WHERE id=1');
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r[0], name: r[1], email: r[2],
    avatarColor: r[3] || '#4F8EF7', facebook: r[4], tiktok: r[5],
    linkedin: r[6], wakatime: r[7], bio: r[10] || '', website: r[11] || '',
  };
}

async function getStats(range) {
  let filter = '';
  if (range === 'week') filter = "WHERE date >= datetime('now', '-7 days')";
  else if (range === 'month') filter = "WHERE date >= datetime('now', '-30 days')";
  else if (range === 'year') filter = "WHERE date >= datetime('now', '-365 days')";
  const rows = _queryValues(`SELECT COALESCE(SUM(commits),0), COALESCE(SUM(files_touched),0), COALESCE(SUM(file_saves),0),
                             COUNT(DISTINCT repo_path) FROM activity_days ${filter}`);
  if (!rows.length) return { commits: 0, files: 0, saves: 0, repos: 0 };
  const r = rows[0];
  return { commits: r[0], files: r[1], saves: r[2], repos: r[3] };
}

async function getHeatmap(year) {
  const y = year || new Date().getFullYear();
  const start = y + '-01-01';
  const end = y + '-12-31';
  const rows = _queryValues(`SELECT date, SUM(commits + file_saves + files_touched) AS total,
                             SUM(commits) AS commits, SUM(file_saves) AS saves, SUM(files_touched) AS files
                             FROM activity_days WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date`, [start, end]);
  const map = {};
  for (const r of rows) map[r[0]] = { total: r[1] || 0, commits: r[2] || 0, saves: r[3] || 0, files: r[4] || 0 };
  return map;
}

async function getDonutData(range) {
  let filter = '';
  if (range === 'week') filter = "WHERE date >= datetime('now', '-7 days')";
  else if (range === 'month') filter = "WHERE date >= datetime('now', '-30 days')";
  else if (range === 'year') filter = "WHERE date >= datetime('now', '-365 days')";
  const repoRows = _queryValues(`SELECT repo_name, SUM(commits+file_saves+files_touched) AS total FROM activity_days ${filter} GROUP BY repo_path ORDER BY total DESC`);
  const extRows = _queryValues(`SELECT file_ext, COUNT(*) AS cnt FROM file_save_events GROUP BY file_ext ORDER BY cnt DESC LIMIT 10`);
  const typeRows = _queryValues(`SELECT COALESCE(SUM(commits),0) AS c, COALESCE(SUM(file_saves),0) AS s, COALESCE(SUM(files_touched),0) AS f FROM activity_days ${filter}`);
  return {
    repo: repoRows.map(r => ({ label: r[0], value: r[1] || 0 })),
    ext: extRows.map(r => ({ label: r[0] || '(none)', value: r[1] || 0 })),
    type: typeRows.length ? [
      { label: 'File Saves', value: typeRows[0][1] || 0 },
      { label: 'Commits', value: typeRows[0][0] || 0 },
      { label: 'Files Touched', value: typeRows[0][2] || 0 },
    ] : [],
  };
}

async function getHistory(page, repoPathFilter) {
  const pageSize = 20;
  const offset = ((page || 1) - 1) * pageSize;
  let where = '';
  const params = [];
  if (repoPathFilter) { where = 'WHERE repo_path=?'; params.push(repoPathFilter); }
  const countRows = _queryValues(`SELECT COUNT(*) FROM activity_days ${where}`, params);
  const total = countRows.length ? countRows[0][0] : 0;
  const rows = _queryValues(`SELECT date, repo_name, commits, files_touched, file_saves FROM activity_days ${where} ORDER BY date DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]);
  return {
    items: rows.map(r => ({ date: r[0], repoName: r[1], commits: r[2] || 0, files: r[3] || 0, saves: r[4] || 0 })),
    total, page: page || 1, pageSize,
  };
}

async function getAvatar() {
  try {
    const rows = _queryValues('SELECT avatar_data FROM profile WHERE id=1 AND avatar_data IS NOT NULL');
    if (rows.length && rows[0][0]) return { dataUrl: rows[0][0] };
  } catch (_) {}
  return { dataUrl: null };
}

async function getAll(opts) {
  const [profile, stats, heatmap, donuts, history] = await Promise.all([
    getProfile(),
    getStats(opts.statsRange || 'all'),
    getHeatmap(opts.heatmapYear),
    getDonutData(opts.donutRange || 'all'),
    getHistory(opts.historyPage, opts.historyRepo),
  ]);
  return { profile, avatar: null, stats, heatmap, donuts, history };
}

module.exports = async function handle(payload) {
  const { action, dbPath, params } = payload || {};
  await _openDb(dbPath);
  switch (action) {
    case 'getAll':
      return getAll(params || {});
    case 'getProfile':
      return getProfile();
    case 'getStats':
      return getStats(params?.range || 'all');
    case 'getHeatmap':
      return getHeatmap(params?.year);
    case 'getDonutData':
      return getDonutData(params?.range || 'all');
    case 'getHistory':
      return getHistory(params?.page, params?.repoPath);
    case 'getAvatar':
      return getAvatar();
    default:
      throw new Error('Unknown profileData action: ' + action);
  }
};
