const { ipcMain, app } = require('electron');
const { getDb, save } = require('../database/db.js');
const simpleGit = require('simple-git');
const gitService = require('./gitService.js');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

let _watchers = [];
let _saveDebounce = {};
let _lastSyncHash = null;
let _syncInProgress = false;

function db() { return getDb(); }

function _query(sql, params) {
  if (!params || params.length === 0) return db().exec(sql);
  const stmt = db().prepare(sql);
  stmt.bind(params);
  let columns = [];
  const values = [];
  while (stmt.step()) {
    if (columns.length === 0) columns = stmt.getColumnNames();
    values.push(stmt.get());
  }
  stmt.free();
  return columns.length > 0 ? [{ columns, values }] : [];
}

function _getActiveRepo(config) {
  try {
    const cfg = config ? config.readConfig() : null;
    if (cfg && cfg.activeProject) {
      return { repoPath: cfg.activeProject, name: path.basename(cfg.activeProject) };
    }
  } catch (_) {}
  return null;
}

function _startWatcher(repoPath, repoName) {
  const ignores = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/target/**', '**/.next/**'];
  const watcher = chokidar.watch(repoPath, { ignored: ignores, ignoreInitial: true, persistent: true });
  watcher.on('change', (filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.includes('/.git/')) return;

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const ts = now.toISOString();
    const ext = path.extname(filePath) || '';

    const key = filePath + '|' + date;
    const last = _saveDebounce[key];
    if (last && (now - last) < 2000) return;
    _saveDebounce[key] = now;

    db().run('BEGIN');
    db().run('INSERT INTO file_save_events (timestamp, repo_path, repo_name, file_path, file_ext) VALUES (?, ?, ?, ?, ?)',
      [ts, repoPath, repoName, filePath, ext]);
    db().run(`INSERT INTO activity_days (date, repo_path, repo_name, file_saves, files_touched)
              VALUES (?, ?, ?, 1, 1)
              ON CONFLICT(date, repo_path) DO UPDATE SET file_saves=file_saves+1, files_touched=files_touched+1`,
      [date, repoPath, repoName]);
    db().run('COMMIT');
    save();
  });
  _watchers.push(watcher);
}

async function _syncCommits(repoPath, repoName, force) {
  if (_syncInProgress) return;
  _syncInProgress = true;
  try {
    let since = '';
    if (!force && _lastSyncHash) {
      try {
        const parent = await gitService.revParse(repoPath, _lastSyncHash + '~1', { ttl: 120000 });
        since = '--after=' + parent.trim();
      } catch (_) { since = '--after=365.days.ago'; }
    } else {
      since = '--after=365.days.ago';
    }
    const log = await gitService.raw(repoPath, ['log', since, '--format=%H|%ad', '--date=short', '--no-merges'], 120000);
    if (!log.trim()) { _syncInProgress = false; return; }
    const dateCounts = {};
    let latestHash = _lastSyncHash;
    for (const line of log.trim().split('\n')) {
      const pipeIdx = line.indexOf('|');
      if (pipeIdx < 0) continue;
      const hash = line.substring(0, pipeIdx);
      const date = line.substring(pipeIdx + 1);
      if (date) dateCounts[date] = (dateCounts[date] || 0) + 1;
      if (!latestHash) latestHash = hash;
    }
    db().run('BEGIN');
    for (const [date, count] of Object.entries(dateCounts)) {
      db().run(`INSERT INTO activity_days (date, repo_path, repo_name, commits)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(date, repo_path) DO UPDATE SET commits=?`,
        [date, repoPath, repoName, count, count]);
    }
    db().run('COMMIT');
    save();
    if (latestHash) _lastSyncHash = latestHash;
  } catch (_) {}
  _syncInProgress = false;
}

function register(shared) {
  const config = shared ? shared.config : null;

ipcMain.handle('profile:get', async () => {
  const rows = db().exec('SELECT * FROM profile WHERE id=1');

  // always attempt to backfill if email is missing
  const stored = rows.length && rows[0].values.length ? rows[0].values[0] : null;
  const storedEmail = stored ? stored[2] : '';

  if (!stored || !storedEmail) {
    let name = '', email = '';
    try {
      const git = simpleGit();
      const config = await git.listConfig('global');
      name = config.all['user.name'] || '';
      email = config.all['user.email'] || '';
    } catch (_) {}

    if (!stored) {
      db().run('INSERT OR IGNORE INTO profile (id, name, email) VALUES (1, ?, ?)', [name, email]);
    } else {
      db().run('UPDATE profile SET name=?, email=? WHERE id=1', [name || stored[1], email]);
    }
    save();

    return {
      id: 1,
      name: name || (stored ? stored[1] : ''),
      email,
      avatarColor: stored ? stored[3] : '#4F8EF7',
      facebook: stored ? stored[4] : null,
      tiktok: stored ? stored[5] : null,
      linkedin: stored ? stored[6] : null,
      wakatime: stored ? stored[7] : null,
      bio: stored ? stored[10] || '' : '',
      website: stored ? stored[11] || '' : '',
    };
  }

  return {
    id: stored[0], name: stored[1], email: stored[2],
    avatarColor: stored[3], facebook: stored[4],
    tiktok: stored[5], linkedin: stored[6], wakatime: stored[7],
    bio: stored[10] || '', website: stored[11] || '',
  };
});
  ipcMain.handle('profile:update', (event, data) => {
    db().run(`UPDATE profile SET name=?, email=?, avatar_color=?, facebook=?, tiktok=?, linkedin=?, wakatime=?, bio=?, website=?, updated_at=datetime('now') WHERE id=1`,
      [data.name || '', data.email || '', data.avatarColor || '#4F8EF7', data.facebook || '',
       data.tiktok || '', data.linkedin || '', data.wakatime || '',
       data.bio || '', data.website || '']);
    save();
    return { success: true };
  });

  ipcMain.handle('profile:getHeatmap', (event, { year }) => {
    const y = year || new Date().getFullYear();
    const start = y + '-01-01';
    const end = y + '-12-31';
    const rows = _query(`SELECT date, SUM(commits + file_saves + files_touched) AS total,
                         SUM(commits) AS commits, SUM(file_saves) AS saves, SUM(files_touched) AS files
                         FROM activity_days WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date`,
      [start, end]);
    const map = {};
    if (rows.length) {
      for (const r of rows[0].values) {
        map[r[0]] = { total: r[1] || 0, commits: r[2] || 0, saves: r[3] || 0, files: r[4] || 0 };
      }
    }
    return map;
  });

  ipcMain.handle('profile:getStats', (event, { range }) => {
    let dateFilter = '';
    if (range === 'week') dateFilter = "WHERE date >= datetime('now', '-7 days')";
    else if (range === 'month') dateFilter = "WHERE date >= datetime('now', '-30 days')";
    else if (range === 'year') dateFilter = "WHERE date >= datetime('now', '-365 days')";
    const rows = db().exec(`SELECT COALESCE(SUM(commits),0), COALESCE(SUM(files_touched),0), COALESCE(SUM(file_saves),0),
                            COUNT(DISTINCT repo_path) FROM activity_days ${dateFilter}`);
    if (!rows.length || !rows[0].values.length) return { commits: 0, files: 0, saves: 0, repos: 0 };
    const r = rows[0].values[0];
    return { commits: r[0], files: r[1], saves: r[2], repos: r[3] };
  });

  ipcMain.handle('profile:getDonutData', (event, { range }) => {
    let dateFilter = '';
    if (range === 'week') dateFilter = "WHERE date >= datetime('now', '-7 days')";
    else if (range === 'month') dateFilter = "WHERE date >= datetime('now', '-30 days')";
    else if (range === 'year') dateFilter = "WHERE date >= datetime('now', '-365 days')";
    const repoRows = db().exec(`SELECT repo_name, SUM(commits+file_saves+files_touched) AS total
                                FROM activity_days ${dateFilter} GROUP BY repo_path ORDER BY total DESC`);
    const repoData = repoRows.length ? repoRows[0].values.map(r => ({ label: r[0], value: r[1] || 0 })) : [];

    const extRows = db().exec(`SELECT file_ext, COUNT(*) AS cnt FROM file_save_events GROUP BY file_ext ORDER BY cnt DESC LIMIT 10`);
    const extData = extRows.length ? extRows[0].values.map(r => ({ label: r[0] || '(none)', value: r[1] || 0 })) : [];

    const typeRows = db().exec(`SELECT
      COALESCE(SUM(commits),0) AS c, COALESCE(SUM(file_saves),0) AS s, COALESCE(SUM(files_touched),0) AS f
      FROM activity_days ${dateFilter}`);
    let c = 0, s = 0, f = 0;
    if (typeRows.length && typeRows[0].values.length) {
      const typeRow = typeRows[0].values[0];
c = typeRow[0] || 0;
s = typeRow[1] || 0;
f = typeRow[2] || 0;
    }
    const typeData = [
      { label: 'File Saves', value: s },
      { label: 'Commits', value: c },
      { label: 'Files Touched', value: f },
    ];

    return { repo: repoData, ext: extData, type: typeData };
  });

  let _histCountCache = { val: 0, ts: 0 };

  ipcMain.handle('profile:getHistory', (event, { page, repoPath }) => {
    const pageSize = 20;
    const offset = ((page || 1) - 1) * pageSize;
    let where = '';
    const params = [];
    if (repoPath) { where = 'WHERE repo_path=?'; params.push(repoPath); }
    const cacheKey = repoPath || '__all__';
    const now = Date.now();
    let total = _histCountCache.val;
    if (_histCountCache.cacheKey !== cacheKey || now - _histCountCache.ts > 5000) {
      const countRows = _query(`SELECT COUNT(*) FROM activity_days ${where}`, params);
      total = (countRows.length && countRows[0].values.length) ? countRows[0].values[0][0] : 0;
      _histCountCache = { val: total, ts: now, cacheKey };
    }
    const rows = _query(`SELECT date, repo_name, commits, files_touched, file_saves FROM activity_days ${where} ORDER BY date DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]);
    const items = rows.length ? rows[0].values.map(r => ({
      date: r[0], repoName: r[1], commits: r[2] || 0, files: r[3] || 0, saves: r[4] || 0,
    })) : [];
    return { items, total, page: page || 1, pageSize };
  });

  ipcMain.handle('profile:getDayDetail', (event, { date }) => {
    const rows = _query(`SELECT repo_name, commits, files_touched, file_saves, lines_added, lines_removed
                         FROM activity_days WHERE date=?`, [date]);
    const repos = rows.length ? rows[0].values.map(r => ({
      repo: r[0], commits: r[1] || 0, files: r[2] || 0, saves: r[3] || 0, added: r[4] || 0, removed: r[5] || 0,
    })) : [];

    const saveRows = _query(`SELECT file_path, repo_name, repo_path, COUNT(*) AS cnt FROM file_save_events
                             WHERE timestamp >= ? AND timestamp < ? GROUP BY file_path ORDER BY cnt DESC LIMIT 30`,
      [date + 'T00:00:00', date + 'T23:59:59']);
    const files = saveRows.length ? saveRows[0].values.map(r => ({
      path: path.relative(r[2], r[0]).replace(/\\/g, '/'),
      repo: r[1], saves: r[3] || 0,
    })) : [];

    return { repos, files };
  });

  ipcMain.handle('profile:getDayCommits', async (event, { date }) => {
    try {
      const repo = _getActiveRepo(config);
      if (!repo) return [];
      const rp = repo.repoPath;
      const log = await gitService.getCommits(rp, {
        format: '%H|%at|%s', since: date + 'T00:00:00', until: date + 'T23:59:59',
        noMerges: false, ttl: 30000,
      });
      if (!log.trim()) return [];
      const commits = log.trim().split('\n').map(line => {
        const [hash, at, ...msgParts] = line.split('|');
        const time = new Date(parseInt(at) * 1000);
        const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return { hash, shortHash: hash.substring(0, 7), time: timeStr, timestamp: parseInt(at), message: msgParts.join('|') || '(no message)' };
      });
      const fileResults = await Promise.all(commits.map(c =>
        gitService.getCommitFiles(rp, c.hash, { ttl: 60000 })
          .then(out => out.trim().split('\n').filter(Boolean).map(line => {
            const [status, ...pathParts] = line.split('\t');
            return { status, path: pathParts.join('\t') };
          }))
          .catch(() => [])
      ));
      for (let i = 0; i < commits.length; i++) commits[i].files = fileResults[i];
      return commits;
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('profile:fileDiff', async (event, { filePath, repoPath, commitHash }) => {
    try {
      const repoDir = repoPath || path.dirname(filePath);
      const relPath = path.relative(repoDir, filePath).replace(/\\/g, '/');
      let diff, content;
      if (commitHash) {
        const [raw, cnt] = await Promise.all([
          gitService.show(repoDir, commitHash, { filePath, ttl: 30000 }),
          gitService.showFileAtCommit(repoDir, commitHash, relPath, { ttl: 60000 }),
        ]);
        const idx = raw.indexOf('\ndiff --git');
        diff = idx >= 0 ? raw.substring(idx + 1) : raw;
        content = cnt;
      } else {
        const [d, c] = await Promise.all([
          gitService.diff(repoDir, ['HEAD', '--', filePath], { ttl: 10000 }),
          gitService.showFileAtCommit(repoDir, 'HEAD', relPath, { ttl: 60000 }),
        ]);
        diff = d; content = c;
      }
      return { diff, content };
    } catch (err) {
      return { diff: '', content: '', error: err.message };
    }
  });

  ipcMain.handle('profile:resetStats', () => {
    db().run('DELETE FROM activity_days');
    db().run('DELETE FROM file_save_events');
    save();
    return { success: true };
  });

  const AVATAR_PATH = path.join(app.getPath('userData'), 'profile-avatar.png');

  ipcMain.handle('profile:getAvatar', async () => {
    try {
      if (fs.existsSync(AVATAR_PATH)) {
        const data = fs.readFileSync(AVATAR_PATH, { encoding: 'base64' });
        return { dataUrl: 'data:image/png;base64,' + data };
      }
    } catch (_) {}
    return { dataUrl: null };
  });

  ipcMain.handle('profile:uploadAvatar', async (event, { dataUrl }) => {
    try {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(AVATAR_PATH, Buffer.from(base64, 'base64'));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('profile:getAll', (event, { statsRange, heatmapYear, donutRange, historyPage, historyRepo }) => {
    const y = heatmapYear || new Date().getFullYear();
    const statsDateFilter = '';
    const donutDateFilter = '';
    const heatmapStart = y + '-01-01';
    const heatmapEnd = y + '-12-31';

    // profile
    const pRows = db().exec('SELECT * FROM profile WHERE id=1');
    const stored = pRows.length && pRows[0].values.length ? pRows[0].values[0] : null;

    // stats
    let sFilter = '';
    if (statsRange === 'week') sFilter = "WHERE date >= datetime('now', '-7 days')";
    else if (statsRange === 'month') sFilter = "WHERE date >= datetime('now', '-30 days')";
    else if (statsRange === 'year') sFilter = "WHERE date >= datetime('now', '-365 days')";
    const sRows = db().exec(`SELECT COALESCE(SUM(commits),0), COALESCE(SUM(files_touched),0), COALESCE(SUM(file_saves),0),
                             COUNT(DISTINCT repo_path) FROM activity_days ${sFilter}`);

    // heatmap
    const hRows = _query(`SELECT date, SUM(commits + file_saves + files_touched) AS total,
                          SUM(commits) AS commits, SUM(file_saves) AS saves, SUM(files_touched) AS files
                          FROM activity_days WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date`,
      [heatmapStart, heatmapEnd]);
    const heatmap = {};
    if (hRows.length) for (const r of hRows[0].values) heatmap[r[0]] = { total: r[1] || 0, commits: r[2] || 0, saves: r[3] || 0, files: r[4] || 0 };

    // donuts
    let dFilter = '';
    if (donutRange === 'week') dFilter = "WHERE date >= datetime('now', '-7 days')";
    else if (donutRange === 'month') dFilter = "WHERE date >= datetime('now', '-30 days')";
    else if (donutRange === 'year') dFilter = "WHERE date >= datetime('now', '-365 days')";
    const repoRows = db().exec(`SELECT repo_name, SUM(commits+file_saves+files_touched) AS total FROM activity_days ${dFilter} GROUP BY repo_path ORDER BY total DESC`);
    const extRows = db().exec(`SELECT file_ext, COUNT(*) AS cnt FROM file_save_events GROUP BY file_ext ORDER BY cnt DESC LIMIT 10`);
    const typeRows = db().exec(`SELECT COALESCE(SUM(commits),0) AS c, COALESCE(SUM(file_saves),0) AS s, COALESCE(SUM(files_touched),0) AS f FROM activity_days ${dFilter}`);

    // history
    const pageSize = 20;
    const offset = ((historyPage || 1) - 1) * pageSize;
    let hWhere = '';
    const hParams = [];
    if (historyRepo) { hWhere = 'WHERE repo_path=?'; hParams.push(historyRepo); }
    const histRows = _query(`SELECT date, repo_name, commits, files_touched, file_saves FROM activity_days ${hWhere} ORDER BY date DESC LIMIT ? OFFSET ?`, [...hParams, pageSize, offset]);
    const countRows = _query(`SELECT COUNT(*) FROM activity_days ${hWhere}`, hParams);

    const stats = (sRows.length && sRows[0].values.length) ? { commits: sRows[0].values[0][0], files: sRows[0].values[0][1], saves: sRows[0].values[0][2], repos: sRows[0].values[0][3] } : { commits: 0, files: 0, saves: 0, repos: 0 };
    const donuts = {
      repo: repoRows.length ? repoRows[0].values.map(r => ({ label: r[0], value: r[1] || 0 })) : [],
      ext: extRows.length ? extRows[0].values.map(r => ({ label: r[0] || '(none)', value: r[1] || 0 })) : [],
      type: (typeRows.length && typeRows[0].values.length) ? [
        { label: 'File Saves', value: typeRows[0].values[0][1] || 0 },
        { label: 'Commits', value: typeRows[0].values[0][0] || 0 },
        { label: 'Files Touched', value: typeRows[0].values[0][2] || 0 },
      ] : [],
    };
    const history = {
      items: histRows.length ? histRows[0].values.map(r => ({ date: r[0], repoName: r[1], commits: r[2] || 0, files: r[3] || 0, saves: r[4] || 0 })) : [],
      total: (countRows.length && countRows[0].values.length) ? countRows[0].values[0][0] : 0,
      page: historyPage || 1, pageSize,
    };

    return { profile: stored ? { id: stored[0], name: stored[1], email: stored[2], avatarColor: stored[3], facebook: stored[4], tiktok: stored[5], linkedin: stored[6], wakatime: stored[7], bio: stored[10] || '', website: stored[11] || '' } : null, avatar: null, stats, heatmap, donuts, history };
  });

  ipcMain.handle('profile:initWatcher', () => {
    const repo = _getActiveRepo(config);
    if (!repo) return { watching: 0 };
    const alreadyWatching = _watchers.some(w => w._watchingPaths?.has?.(repo.repoPath));
    if (!alreadyWatching) _startWatcher(repo.repoPath, repo.name);
    setImmediate(() => _syncCommits(repo.repoPath, repo.name, false));
    return { watching: 1 };
  });

  ipcMain.handle('profile:stopWatcher', () => {
    for (const w of _watchers) { try { w.close(); } catch (_) {} }
    _watchers = [];
    _saveDebounce = {};
    return { success: true };
  });
}

module.exports = { register, triggerCommitSync: _syncCommits };
