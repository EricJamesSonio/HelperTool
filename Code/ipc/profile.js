const { ipcMain } = require('electron');
const { getDb, save } = require('../database/db.js');
const simpleGit = require('simple-git');
const chokidar = require('chokidar');
const path = require('path');

let _watchers = [];
let _saveDebounce = {};

function db() { return getDb(); }

function _getIndexedRepos() {
  const rows = db().exec('SELECT repo_path, name FROM repositories');
  if (!rows.length) return [];
  return rows[0].values.map(r => ({ repoPath: r[0], name: r[1] }));
}

async function _syncRepoCommits(repoPath, repoName, email) {
  if (!email) return;
  try {
    const git = simpleGit(repoPath);
    const raw = await git.raw(['log', `--author=${email}`, '--format=%H|%aI', '--numstat', '--max-count=200']);
    if (!raw) return;
    const lines = raw.split('\n');
    let currentHash = '';
    let filesTouched = 0, linesAdded = 0, linesRemoved = 0;
    let date = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.includes('|')) {
        if (currentHash && date) {
          _upsertActivity(repoPath, repoName, date, 1, filesTouched, linesAdded, linesRemoved);
        }
        const parts = trimmed.split('|');
        currentHash = parts[0];
        date = parts[1] ? parts[1].slice(0, 10) : '';
        filesTouched = 0; linesAdded = 0; linesRemoved = 0;
      } else if (trimmed.includes('\t')) {
        const parts = trimmed.split('\t');
        const add = parseInt(parts[0], 10);
        const rem = parseInt(parts[1], 10);
        if (!isNaN(add)) linesAdded += add;
        if (!isNaN(rem)) linesRemoved += rem;
        filesTouched++;
      }
    }
    if (currentHash && date) {
      _upsertActivity(repoPath, repoName, date, 1, filesTouched, linesAdded, linesRemoved);
    }
    save();
  } catch (err) {
    console.warn('[Profile] Git sync error for', repoPath, err.message);
  }
}

function _upsertActivity(repoPath, repoName, date, commits, filesTouched, linesAdded, linesRemoved) {
  const rows = db().exec('SELECT commits, files_touched, lines_added, lines_removed FROM activity_days WHERE date=? AND repo_path=?', [date, repoPath]);
  if (rows.length && rows[0].values.length) {
    const r = rows[0].values[0];
    db().run(`UPDATE activity_days SET commits=?, files_touched=?, lines_added=?, lines_removed=?
               WHERE date=? AND repo_path=?`,
      [r[0] + commits, r[1] + filesTouched, r[2] + linesAdded, r[3] + linesRemoved, date, repoPath]);
  } else {
    db().run(`INSERT INTO activity_days (date, repo_path, repo_name, commits, files_touched, lines_added, lines_removed)
              VALUES (?, ?, ?, ?, ?, ?, ?)`, [date, repoPath, repoName, commits, filesTouched, linesAdded, linesRemoved]);
  }
}

function _startWatcher(repoPath, repoName) {
  const ignores = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/target/**', '**/.next/**'];
  const watcher = chokidar.watch(repoPath, { ignored: ignores, ignoreInitial: true, persistent: true });
  watcher.on('change', (filePath) => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const ts = now.toISOString();
    const ext = path.extname(filePath) || '';

    const key = filePath + '|' + date;
    const last = _saveDebounce[key];
    if (last && (now - last) < 2000) return;
    _saveDebounce[key] = now;

    db().run('INSERT INTO file_save_events (timestamp, repo_path, repo_name, file_path, file_ext) VALUES (?, ?, ?, ?, ?)',
      [ts, repoPath, repoName, filePath, ext]);
    db().run(`INSERT INTO activity_days (date, repo_path, repo_name, file_saves, files_touched)
              VALUES (?, ?, ?, 1, 1)
              ON CONFLICT(date, repo_path) DO UPDATE SET file_saves=file_saves+1, files_touched=files_touched+1`,
      [date, repoPath, repoName]);
    save();
  });
  _watchers.push(watcher);
}

function register(shared) {
  ipcMain.handle('profile:get', () => {
    const rows = db().exec('SELECT * FROM profile WHERE id=1');
    if (!rows.length || !rows[0].values.length) {
      let name = '', email = '';
      try {
        const repos = _getIndexedRepos();
        if (repos.length) {
          const git = simpleGit(repos[0].repoPath);
          name = (git.listConfig() || {}).values?.['user.name'] || '';
          email = (git.listConfig() || {}).values?.['user.email'] || '';
        }
      } catch (_) {}
      db().run('INSERT INTO profile (id, name, email) VALUES (1, ?, ?)', [name, email]);
      save();
      return { id: 1, name, email, avatarColor: '#4F8EF7', facebook: '', tiktok: '', linkedin: '', wakatime: '' };
    }
    const r = rows[0].values[0];
    return { id: r[0], name: r[1], email: r[2], avatarColor: r[3], facebook: r[4], tiktok: r[5], linkedin: r[6], wakatime: r[7] };
  });

  ipcMain.handle('profile:update', (event, data) => {
    db().run(`UPDATE profile SET name=?, email=?, avatar_color=?, facebook=?, tiktok=?, linkedin=?, wakatime=?, updated_at=datetime('now') WHERE id=1`,
      [data.name || '', data.email || '', data.avatarColor || '#4F8EF7', data.facebook || '',
       data.tiktok || '', data.linkedin || '', data.wakatime || '']);
    save();
    return { success: true };
  });

  ipcMain.handle('profile:getHeatmap', (event, { year }) => {
    const y = year || new Date().getFullYear();
    const start = y + '-01-01';
    const end = y + '-12-31';
    const rows = db().exec(`SELECT date, SUM(commits + file_saves + files_touched) AS total,
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
      c = typeRows[0].values[0] || 0; s = typeRows[0].values[1] || 0; f = typeRows[0].values[2] || 0;
    }
    const typeData = [
      { label: 'File Saves', value: s },
      { label: 'Commits', value: c },
      { label: 'Files Touched', value: f },
    ];

    return { repo: repoData, ext: extData, type: typeData };
  });

  ipcMain.handle('profile:getHistory', (event, { page, repoPath }) => {
    const pageSize = 20;
    const offset = ((page || 1) - 1) * pageSize;
    let where = '';
    const params = [];
    if (repoPath) { where = 'WHERE repo_path=?'; params.push(repoPath); }
    const rows = db().exec(`SELECT date, repo_name, commits, files_touched, file_saves FROM activity_days ${where} ORDER BY date DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]);
    const countRows = db().exec(`SELECT COUNT(*) FROM activity_days ${where}`, params);
    const total = (countRows.length && countRows[0].values.length) ? countRows[0].values[0][0] : 0;
    const items = rows.length ? rows[0].values.map(r => ({
      date: r[0], repoName: r[1], commits: r[2] || 0, files: r[3] || 0, saves: r[4] || 0,
    })) : [];
    return { items, total, page: page || 1, pageSize };
  });

  ipcMain.handle('profile:getDayDetail', (event, { date }) => {
    const rows = db().exec(`SELECT repo_name, commits, files_touched, file_saves, lines_added, lines_removed
                            FROM activity_days WHERE date=?`, [date]);
    const repos = rows.length ? rows[0].values.map(r => ({
      repo: r[0], commits: r[1] || 0, files: r[2] || 0, saves: r[3] || 0, added: r[4] || 0, removed: r[5] || 0,
    })) : [];

    const saveRows = db().exec(`SELECT file_path, repo_name, COUNT(*) AS cnt FROM file_save_events
                                WHERE timestamp >= ? AND timestamp < ? GROUP BY file_path ORDER BY cnt DESC LIMIT 30`,
      [date + 'T00:00:00', date + 'T23:59:59']);
    const files = saveRows.length ? saveRows[0].values.map(r => ({ path: r[0], repo: r[1], saves: r[2] || 0 })) : [];

    return { repos, files };
  });

  ipcMain.handle('profile:syncCommits', async () => {
    const profileRows = db().exec('SELECT email FROM profile WHERE id=1');
    const email = profileRows.length && profileRows[0].values.length ? profileRows[0].values[0][0] : '';
    if (!email) return { synced: 0 };
    const repos = _getIndexedRepos();
    let count = 0;
    for (const repo of repos) {
      await _syncRepoCommits(repo.repoPath, repo.name, email);
      count++;
    }
    return { synced: count };
  });

  ipcMain.handle('profile:initWatcher', () => {
    const repos = _getIndexedRepos();
    for (const repo of repos) {
      const alreadyWatching = _watchers.some(w => w._watchingPaths?.has?.(repo.repoPath));
      if (!alreadyWatching) _startWatcher(repo.repoPath, repo.name);
    }
    return { watching: repos.length };
  });

  ipcMain.handle('profile:stopWatcher', () => {
    for (const w of _watchers) { try { w.close(); } catch (_) {} }
    _watchers = [];
    _saveDebounce = {};
    return { success: true };
  });
}

module.exports = { register };
