const { ipcMain, app } = require('electron');
const { getDb, save } = require('../database/db.js');
const simpleGit = require('simple-git');
const gitService = require('./gitService.js');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const prefetchService = require('./prefetchService.js');
const { updateService } = require('./serviceTracker_ipc.js');

let _watchers = [];
let _saveBatch = [];
let _flushTimer = null;
const _FLUSH_INTERVAL = 3000;
let _syncInProgress = false;
let _lastSyncDate = null;
const _watchedPaths = new Set();

function db() { return getDb(); }

function _getOrSetActivationDate() {
  const rows = db().exec("SELECT value FROM profile_meta WHERE key='activation_date'");
  if (rows.length && rows[0].values.length) {
    return rows[0].values[0][0];
  }
  const today = new Date().toISOString().slice(0, 10);
  db().run("INSERT INTO profile_meta (key, value) VALUES ('activation_date', ?)", [today]);
  save();
  return today;
}

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
  if (_watchedPaths.has(repoPath)) {
    updateService('profileWatcher', 'done');
    return;
  }
  _watchedPaths.add(repoPath);
  const watcher = chokidar.watch(repoPath, {
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/target/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/coverage/**',
      '**/vendor/**',
      /node_modules/,
      /[\/\\]\.git[\/\\]/,
      /\.(png|jpe?g|gif|ico|exe|dll|wasm|zip|tar|gz|mp[34]|avi|mov|wav|ttf|woff2?|eot|pdf|lock)$/i,
    ],
    ignoreInitial: true,
    persistent: true,
    usePolling: false,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    depth: 5,
    disableGlobbing: false,
  });
  watcher.on('ready', () => {
    updateService('profileWatcher', 'done');
  });
  watcher.on('change', (filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.includes('/.git/')) return;

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const ts = now.toISOString();
    const ext = path.extname(filePath) || '';

    _saveBatch.push({ ts, date, repoPath, repoName, filePath, ext });

    if (!_flushTimer) {
      _flushTimer = setTimeout(() => {
        _flushTimer = null;
        _flushSaveBatch();
      }, _FLUSH_INTERVAL);
    }
  });
  _watchers.push(watcher);
}

function _flushSaveBatch() {
  if (_saveBatch.length === 0) return;
  const batch = _saveBatch;
  _saveBatch = [];
  try {
    const db = getDb();
    db.run('BEGIN');
    for (const { ts, date, repoPath, repoName, filePath, ext } of batch) {
      db.run('INSERT INTO file_save_events (timestamp, repo_path, repo_name, file_path, file_ext) VALUES (?, ?, ?, ?, ?)',
        [ts, repoPath, repoName, filePath, ext]);
    }
    const dates = new Set(batch.map(e => e.date + '|' + e.repoPath + '|' + e.repoName));
    const stmt = db.prepare(`INSERT INTO activity_days (date, repo_path, repo_name, file_saves, files_touched)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(date, repo_path) DO UPDATE SET file_saves=file_saves+?, files_touched=files_touched+?`);
    for (const key of dates) {
      const [date, rp, rn] = key.split('|');
      const count = batch.filter(e => e.date === date && e.repoPath === rp).length;
      stmt.bind([date, rp, rn, count, count, count, count]);
      stmt.step();
      stmt.reset();
    }
    stmt.free();
    db.run('COMMIT');
  } catch (err) {
    console.warn('[Profile] flush error:', err.message);
    try { getDb().run('ROLLBACK'); } catch (_) {}
  }
}

async function _syncCommits(repoPath, repoName) {
  console.log('[SyncCommits] called repoPath:', JSON.stringify(repoPath), 'inProgress:', _syncInProgress, 'lastSyncDate:', _lastSyncDate);
  console.log('[SyncCommits] stack:', new Error().stack.split('\n').slice(1,4).join(' | '));
  const today = new Date().toISOString().slice(0, 10);
  if (_syncInProgress || _lastSyncDate === today + repoPath) {
    console.log('[SyncCommits] SKIPPED');
    return;
  }
  _syncInProgress = true;
  _lastSyncDate = today + repoPath;
  updateService('profileSync', 'running', 'Syncing commits...');

  try {
    const activationDate = _getOrSetActivationDate();
    const workerProxy = require('./workerProxy');

    let dates = [];

    if (workerProxy.isReady()) {
      const result = await workerProxy.send('profileSync', {
        repoPath,
        activationDate,
      }, 120000);
      dates = result?.dates || [];
    } else {
      const git = simpleGit(repoPath);
      const today = new Date().toISOString().slice(0, 10);
      const log = await git.raw([
        'log', '--format=>>>%H|%ad', '--date=short', '--no-merges', '--name-only',
        '--after=' + activationDate + 'T00:00:00',
        '--before=' + today + 'T23:59:59',
      ]);
      if (log.trim()) {
        const dateCounts = {}, dateFiles = {};
        let currentDate = null;
        for (const line of log.split('\n')) {
          if (line.startsWith('>>>')) {
            const pipeIdx = line.indexOf('|');
            currentDate = pipeIdx >= 0 ? line.substring(pipeIdx + 1).trim() : null;
            if (currentDate && currentDate >= activationDate) {
              dateCounts[currentDate] = (dateCounts[currentDate] || 0) + 1;
              if (!dateFiles[currentDate]) dateFiles[currentDate] = new Set();
            } else currentDate = null;
          } else if (currentDate && line.trim()) {
            dateFiles[currentDate].add(line.trim());
          }
        }
        dates = Object.entries(dateCounts).map(([date, count]) => ({
          date, commits: count, files: dateFiles[date]?.size || 0,
        }));
      }
    }

    if (!dates.length) {
      updateService('profileSync', 'done');
      _syncInProgress = false;
      return;
    }

    const BATCH_SIZE = 10;
    db().run('BEGIN');
    for (let i = 0; i < dates.length; i++) {
      const { date, commits, files } = dates[i];
      db().run(
        `INSERT INTO activity_days (date, repo_path, repo_name, commits, files_touched)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(date, repo_path) DO UPDATE SET commits=?, files_touched=?`,
        [date, repoPath, repoName, commits, files, commits, files]
      );

      if ((i + 1) % BATCH_SIZE === 0 && i + 1 < dates.length) {
        db().run('COMMIT');
        save();
        await new Promise(r => setImmediate(r));
        db().run('BEGIN');
      }
    }
    db().run('COMMIT');
    save();

    prefetchService.invalidate('profile');
    updateService('profileSync', 'done');

  } catch (err) {
    console.error('[Profile] _syncCommits error:', err.message);
    try { db().run('ROLLBACK'); } catch (_) {}
    updateService('profileSync', 'failed', err.message);
  }

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
    prefetchService.invalidate('profile');
    return { success: true };
  });

  ipcMain.handle('profile:getHeatmap', async (event, { year }) => {
    try {
      const workerProxy = require('./workerProxy');
      if (workerProxy.isReady()) {
        const dbPath = require('../database/db.js').getDbPath();
        return await workerProxy.send('profileData', { action: 'getHeatmap', dbPath, params: { year } });
      }
    } catch (_) {}
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

  ipcMain.handle('profile:getStats', async (event, { range }) => {
    try {
      const workerProxy = require('./workerProxy');
      if (workerProxy.isReady()) {
        const dbPath = require('../database/db.js').getDbPath();
        return await workerProxy.send('profileData', { action: 'getStats', dbPath, params: { range: range || 'all' } });
      }
    } catch (_) {}
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

  ipcMain.handle('profile:getDonutData', async (event, { range }) => {
    try {
      const workerProxy = require('./workerProxy');
      if (workerProxy.isReady()) {
        const dbPath = require('../database/db.js').getDbPath();
        return await workerProxy.send('profileData', { action: 'getDonutData', dbPath, params: { range: range || 'all' } });
      }
    } catch (_) {}
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

  ipcMain.handle('profile:getHistory', async (event, { page, repoPath }) => {
    try {
      const workerProxy = require('./workerProxy');
      if (workerProxy.isReady()) {
        const dbPath = require('../database/db.js').getDbPath();
        return await workerProxy.send('profileData', { action: 'getHistory', dbPath, params: { page, repoPath } });
      }
    } catch (_) {}
    const pageSize = 20;
    const offset = ((page || 1) - 1) * pageSize;
    let where = '';
    const params = [];
    if (repoPath) { where = 'WHERE repo_path=?'; params.push(repoPath); }
    const hasDataFilter = '(commits > 0 OR files_touched > 0 OR file_saves > 0)';
    const cacheKey = repoPath || '__all__';
    const now = Date.now();
    let total = _histCountCache.val;
    if (_histCountCache.cacheKey !== cacheKey || now - _histCountCache.ts > 5000) {
      const countRows = _query(`SELECT COUNT(*) FROM activity_days ${where ? where + ' AND' : 'WHERE'} ${hasDataFilter}`, params);
      total = (countRows.length && countRows[0].values.length) ? countRows[0].values[0][0] : 0;
      _histCountCache = { val: total, ts: now, cacheKey };
    }
    const rows = _query(`SELECT date, repo_name, commits, files_touched, file_saves FROM activity_days ${where ? where + ' AND' : 'WHERE'} ${hasDataFilter} ORDER BY date DESC LIMIT ? OFFSET ?`,
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

  let _dayCommitCache = new Map();
  const DAY_COMMIT_CACHE_TTL = 300000; // 5 min
  const DAY_COMMIT_CACHE_MAX = 50;

  function _dayCommitLruGet(cacheKey) {
    if (!_dayCommitCache.has(cacheKey)) return undefined;
    const value = _dayCommitCache.get(cacheKey);
    _dayCommitCache.delete(cacheKey);
    _dayCommitCache.set(cacheKey, value);
    return value;
  }

  function _dayCommitLruSet(cacheKey, data) {
    if (_dayCommitCache.has(cacheKey)) _dayCommitCache.delete(cacheKey);
    _dayCommitCache.set(cacheKey, data);
    if (_dayCommitCache.size > DAY_COMMIT_CACHE_MAX) {
      const first = _dayCommitCache.keys().next().value;
      _dayCommitCache.delete(first);
    }
  }

  ipcMain.handle('profile:getDayCommits', async (event, { date }) => {
    try {
      const repo = _getActiveRepo(config);
      if (!repo) return [];
      const rp = repo.repoPath;
      const cacheKey = rp + '|' + date;
      const cached = _dayCommitLruGet(cacheKey);
      if (cached && Date.now() - cached.ts < DAY_COMMIT_CACHE_TTL) {
        return cached.data;
      }
      const log = await gitService.getCommits(rp, {
        format: '%H|%at|%s', since: date + 'T00:00:00', until: date + 'T23:59:59',
        noMerges: false, ttl: 30000,
      });
      if (!log.trim()) { _dayCommitLruSet(cacheKey, { data: [], ts: Date.now() }); return []; }
      const commits = log.trim().split('\n').map(line => {
        const [hash, at, ...msgParts] = line.split('|');
        const time = new Date(parseInt(at) * 1000);
        const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return { hash, shortHash: hash.substring(0, 7), time: timeStr, timestamp: parseInt(at), message: msgParts.join('|') || '(no message)' };
      });

      // Batch: fetch all commit file lists in a single git log --name-only command
      const hashList = commits.map(c => c.hash);
      const batchOut = await gitService.getCommits(rp, {
        format: '---COMMIT:%H---', noMerges: false,
        since: date + 'T00:00:00', until: date + 'T23:59:59',
        nameOnly: true, ttl: 60000,
      });
      const fileMap = {};
      let currentHash = null;
      for (const line of (batchOut || '').split('\n')) {
        const m = line.match(/^---COMMIT:(.+?)---$/);
        if (m) { currentHash = m[1]; fileMap[currentHash] = []; continue; }
        if (currentHash && line.trim()) {
          const parts = line.split('\t');
          fileMap[currentHash].push({ status: parts[0] || 'M', path: parts.slice(1).join('\t') || line.trim() });
        }
      }
      for (const c of commits) c.files = fileMap[c.hash] || [];
      _dayCommitLruSet(cacheKey, { data: commits, ts: Date.now() });
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
    db().run("DELETE FROM profile_meta WHERE key='activation_date'");
    _getOrSetActivationDate();
    save();
    return { success: true };
  });

  const AVATAR_PATH = path.join(app.getPath('userData'), 'profile-avatar.png');

  ipcMain.handle('profile:getAvatar', async () => {
    try {
      if (fs.existsSync(AVATAR_PATH)) {
        const data = await fs.promises.readFile(AVATAR_PATH, { encoding: 'base64' });
        return { dataUrl: 'data:image/png;base64,' + data };
      }
    } catch (_) {}
    return { dataUrl: null };
  });

  ipcMain.handle('profile:uploadAvatar', async (event, { dataUrl }) => {
    try {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      await fs.promises.writeFile(AVATAR_PATH, Buffer.from(base64, 'base64'));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('profile:getAll', async (event, { statsRange, heatmapYear, donutRange, historyPage, historyRepo }) => {
    const cached = prefetchService.get('profile');
    if (cached) {
      cached._cachedAt = cached._cachedAt || Date.now();
      const defaultYear = new Date().getFullYear();
      // Return cached immediately for default params (prefetch scenario); filter-change calls bypass cache
      if (
        (!statsRange || statsRange === 'all') &&
        (!heatmapYear || heatmapYear === defaultYear) &&
        (!donutRange || donutRange === 'all') &&
        (!historyPage || historyPage === 1) &&
        !historyRepo
      ) {
        if (Date.now() - (cached._cachedAt || 0) < 120000) {
          return cached;
        }
      }
    }
    const y = heatmapYear || new Date().getFullYear();
    const statsDateFilter = '';
    const donutDateFilter = '';
    const heatmapStart = y + '-01-01';
    const heatmapEnd = y + '-12-31';

    // profile — backfill name/email from git global config if missing (must run first)
    let pRows = db().exec('SELECT * FROM profile WHERE id=1');
    let stored = pRows.length && pRows[0].values.length ? pRows[0].values[0] : null;

    if (!stored || !stored[2]) {
      let name = '', email = '';
      try {
        const git = simpleGit();
        const gitCfg = await git.listConfig('global');
        name = gitCfg.all['user.name'] || '';
        email = gitCfg.all['user.email'] || '';
      } catch (_) {}

      if (!stored) {
        db().run('INSERT OR IGNORE INTO profile (id, name, email) VALUES (1, ?, ?)', [name, email]);
      } else {
        db().run('UPDATE profile SET name=?, email=? WHERE id=1', [name || stored[1], email]);
      }
      save();

      const refreshed = db().exec('SELECT * FROM profile WHERE id=1');
      stored = refreshed.length && refreshed[0].values.length ? refreshed[0].values[0] : stored;
    }

    // Build filter clauses
    let sFilter = '';
    if (statsRange === 'week') sFilter = "WHERE date >= datetime('now', '-7 days')";
    else if (statsRange === 'month') sFilter = "WHERE date >= datetime('now', '-30 days')";
    else if (statsRange === 'year') sFilter = "WHERE date >= datetime('now', '-365 days')";

    let dFilter = '';
    if (donutRange === 'week') dFilter = "WHERE date >= datetime('now', '-7 days')";
    else if (donutRange === 'month') dFilter = "WHERE date >= datetime('now', '-30 days')";
    else if (donutRange === 'year') dFilter = "WHERE date >= datetime('now', '-365 days')";

    // Run all data queries in parallel
    const [sRes, hRes, repoRes, extRes, typeRes, histRes, countRes] = await Promise.all([
      new Promise(r => r(db().exec(`SELECT COALESCE(SUM(commits),0), COALESCE(SUM(files_touched),0), COALESCE(SUM(file_saves),0), COUNT(DISTINCT repo_path) FROM activity_days ${sFilter}`))),
      new Promise(r => r(_query(`SELECT date, SUM(commits + file_saves + files_touched) AS total, SUM(commits) AS commits, SUM(file_saves) AS saves, SUM(files_touched) AS files FROM activity_days WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date`, [heatmapStart, heatmapEnd]))),
      new Promise(r => r(db().exec(`SELECT repo_name, SUM(commits+file_saves+files_touched) AS total FROM activity_days ${dFilter} GROUP BY repo_path ORDER BY total DESC`))),
      new Promise(r => r(db().exec(`SELECT file_ext, COUNT(*) AS cnt FROM file_save_events GROUP BY file_ext ORDER BY cnt DESC LIMIT 10`))),
      new Promise(r => r(db().exec(`SELECT COALESCE(SUM(commits),0) AS c, COALESCE(SUM(file_saves),0) AS s, COALESCE(SUM(files_touched),0) AS f FROM activity_days ${dFilter}`))),
      (() => {
        const pageSize = 20;
        const offset = ((historyPage || 1) - 1) * pageSize;
        let hWhere = '';
        const hParams = [];
        if (historyRepo) { hWhere = 'WHERE repo_path=?'; hParams.push(historyRepo); }
        const hFilter = '(commits > 0 OR files_touched > 0 OR file_saves > 0)';
        return _query(`SELECT date, repo_name, commits, files_touched, file_saves FROM activity_days ${hWhere ? hWhere + ' AND' : 'WHERE'} ${hFilter} ORDER BY date DESC LIMIT ? OFFSET ?`, [...hParams, pageSize, offset]);
      })(),
      (() => {
        let hWhere = '';
        const hParams = [];
        if (historyRepo) { hWhere = 'WHERE repo_path=?'; hParams.push(historyRepo); }
        const hFilter = '(commits > 0 OR files_touched > 0 OR file_saves > 0)';
        return _query(`SELECT COUNT(*) FROM activity_days ${hWhere ? hWhere + ' AND' : 'WHERE'} ${hFilter}`, hParams);
      })(),
    ]);

    // Process stats
    const statsRows = sRes.length && sRes[0].values.length ? sRes[0].values : null;
    const stats = statsRows ? { commits: statsRows[0][0], files: statsRows[0][1], saves: statsRows[0][2], repos: statsRows[0][3] } : { commits: 0, files: 0, saves: 0, repos: 0 };

    // Process heatmap
    const heatmap = {};
    if (hRes.length && hRes[0].values) {
      for (const r of hRes[0].values) heatmap[r[0]] = { total: r[1] || 0, commits: r[2] || 0, saves: r[3] || 0, files: r[4] || 0 };
    }

    // Process donuts
    const donuts = {
      repo: repoRes.length && repoRes[0].values ? repoRes[0].values.map(r => ({ label: r[0], value: r[1] || 0 })) : [],
      ext: extRes.length && extRes[0].values ? extRes[0].values.map(r => ({ label: r[0] || '(none)', value: r[1] || 0 })) : [],
      type: (typeRes.length && typeRes[0].values.length) ? [
        { label: 'File Saves', value: typeRes[0].values[0][1] || 0 },
        { label: 'Commits', value: typeRes[0].values[0][0] || 0 },
        { label: 'Files Touched', value: typeRes[0].values[0][2] || 0 },
      ] : [],
    };

    // Process history
    const history = {
      items: histRes.length && histRes[0].values ? histRes[0].values.map(r => ({ date: r[0], repoName: r[1], commits: r[2] || 0, files: r[3] || 0, saves: r[4] || 0 })) : [],
      total: (countRes.length && countRes[0].values.length) ? countRes[0].values[0][0] : 0,
      page: historyPage || 1, pageSize: 20,
    };

    return { profile: stored ? { id: stored[0], name: stored[1], email: stored[2], avatarColor: stored[3], facebook: stored[4], tiktok: stored[5], linkedin: stored[6], wakatime: stored[7], bio: stored[10] || '', website: stored[11] || '' } : null, avatar: null, stats, heatmap, donuts, history, _cachedAt: Date.now() };
  });

  ipcMain.handle('profile:initWatcher', () => {
    const repo = _getActiveRepo(config);
    if (!repo) return { watching: 0 };
    const alreadyWatching = _watchers.length > 0;
    if (alreadyWatching) return { watching: 1 };
    _startWatcher(repo.repoPath, repo.name);
    return { watching: 1 };
  });

  ipcMain.handle('profile:stopWatcher', () => {
    for (const w of _watchers) { try { w.close(); } catch (_) {} }
    _watchers = [];
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    _flushSaveBatch();
    _watchedPaths.clear();
    _lastSyncDate = null;
    return { success: true };
  });

  // Cleanup stale zero-rows inserted during partial syncs
  try {
    db().run(`DELETE FROM activity_days WHERE commits = 0 AND files_touched = 0 AND file_saves = 0`);
    save();
  } catch (_) {}
}

module.exports = { register, triggerCommitSync: _syncCommits, startWatcher: _startWatcher };
