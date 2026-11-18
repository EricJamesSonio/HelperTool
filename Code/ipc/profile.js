const { ipcMain, app } = require('electron');
const { execFile } = require('child_process');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { getDb, save } = require('../database/db.js');
const prefetchService = require('./prefetchService.js');
const { updateService } = require('./serviceTracker_ipc.js');
const { makeQueries, localDate } = require('../utils/profileQueries.js');
const { collectRepos, runGit } = require('../utils/repoOverview.js');
const { makeDeployStore } = require('../utils/deployStore.js');

const FLUSH_MS = 3000;
const BULK_LIMIT = 300;
const KEEP_DAYS = 7;
const PRUNE_EVERY_MS = 6 * 60 * 60 * 1000;
const MAX_WATCHERS = 6;
const SYNC_START_DELAY_MS = 8000;
const SYNC_GAP_MS = 400;
const OVERVIEW_TTL_MS = 20000;
const DAY_CACHE_TTL_MS = 300000;
const DAY_CACHE_MAX = 50;

let _watchers = new Map();
let _saveBatch = [];
let _flushTimer = null;
let _pruneTimer = null;
let _overviewCache = { range: '', at: 0, data: null };
const _syncing = new Set();
const _synced = new Map();
const _dayCache = new Map();

function db() {
  return getDb();
}

function queries() {
  return makeQueries(getDb());
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

function _scalar(sql, params) {
  const rows = _query(sql, params);
  return rows.length && rows[0].values.length ? rows[0].values[0][0] : 0;
}

function _exec(stmt, params) {
  stmt.bind(params);
  stmt.step();
  stmt.reset();
}

function _metaGet(key) {
  const rows = _query('SELECT value FROM profile_meta WHERE key=?', [key]);
  return rows.length && rows[0].values.length ? rows[0].values[0][0] : null;
}

function _metaSet(key, value) {
  db().run('INSERT OR REPLACE INTO profile_meta (key, value) VALUES (?, ?)', [key, String(value)]);
}

function _activationDate() {
  const stored = _metaGet('activation_date');
  if (stored) return stored;
  const today = localDate();
  _metaSet('activation_date', today);
  save();
  return today;
}

function _dayBounds(date) {
  const start = new Date(date + 'T00:00:00');
  const end = new Date(start.getTime() + 86400000);
  return [start.toISOString(), end.toISOString()];
}

function _norm(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function _readConfig(config) {
  try {
    return (config && config.readConfig()) || {};
  } catch (_) {
    return {};
  }
}

function _getActiveRepo(config) {
  const cfg = _readConfig(config);
  if (cfg.activeProject) {
    return { repoPath: cfg.activeProject, name: path.basename(cfg.activeProject) };
  }
  return null;
}

function _gitConfigValue(key) {
  return new Promise((resolve) => {
    execFile('git', ['config', '--global', '--get', key], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      resolve(err ? '' : String(stdout).trim());
    });
  });
}

function _readProfileRow() {
  const rows = db().exec('SELECT * FROM profile WHERE id=1');
  return rows.length && rows[0].values.length ? rows[0].values[0] : null;
}

function _profileFromRow(r) {
  if (!r) return null;
  return {
    id: r[0],
    name: r[1],
    email: r[2],
    avatarColor: r[3] || '#4F8EF7',
    facebook: r[4],
    tiktok: r[5],
    linkedin: r[6],
    wakatime: r[7],
    bio: r[10] || '',
    website: r[11] || '',
  };
}

async function _ensureProfile() {
  let row = _readProfileRow();
  if (!row || !row[2]) {
    const name = await _gitConfigValue('user.name');
    const email = await _gitConfigValue('user.email');
    if (!row) {
      db().run('INSERT OR IGNORE INTO profile (id, name, email) VALUES (1, ?, ?)', [name, email]);
    } else {
      db().run('UPDATE profile SET name=?, email=? WHERE id=1', [name || row[1] || '', email]);
    }
    save();
    row = _readProfileRow();
  }
  return _profileFromRow(row);
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.turbo', '.cache', '.swc', 'dist', 'build',
  'target', 'coverage', 'vendor', '.svelte-kit', '.parcel-cache',
]);
const IGNORE_FILE = /\.(png|jpe?g|gif|ico|exe|dll|wasm|zip|tar|gz|mp[34]|avi|mov|wav|ttf|woff2?|eot|pdf|lock|tsbuildinfo|log|map|tmp|swp|eslintcache)$|[\/\\](next-env\.d\.ts|\.DS_Store|Thumbs\.db)$/i;

function _ignoredFor(repoPath) {
  return (p) => {
    const rel = path.relative(repoPath, p);
    if (!rel || rel.startsWith('..')) return false;
    const parts = rel.split(/[\\/]/);
    for (let i = 0; i < parts.length; i++) {
      if (IGNORE_DIRS.has(parts[i].toLowerCase())) return true;
    }
    return IGNORE_FILE.test(p);
  };
}

function _profileEnabled() {
  try {
    const feats = require('../config/config.js').readConfig()?.features ?? null;
    return !feats || feats.profileTool !== false;
  } catch (_) {
    return true;
  }
}

function _startWatcher(repoPath, repoName) {
  if (!_profileEnabled() || !repoPath) return;
  if (_watchers.has(repoPath)) {
    const existing = _watchers.get(repoPath);
    _watchers.delete(repoPath);
    _watchers.set(repoPath, existing);
    updateService('profileWatcher', 'done');
    return;
  }
  while (_watchers.size >= MAX_WATCHERS) {
    const oldest = _watchers.keys().next().value;
    const old = _watchers.get(oldest);
    _watchers.delete(oldest);
    try {
      old.close();
    } catch (_) {}
  }

  const name = repoName || path.basename(repoPath);
  const watcher = chokidar.watch(repoPath, {
    ignored: _ignoredFor(repoPath),
    ignoreInitial: true,
    persistent: true,
    usePolling: false,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    depth: 5,
    disableGlobbing: false,
  });

  const record = (filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.includes('/.git/')) return;
    const now = new Date();
    _saveBatch.push({
      ts: now.toISOString(),
      date: localDate(now),
      repoPath,
      repoName: name,
      filePath,
      ext: (path.extname(filePath) || '').toLowerCase(),
    });
    if (!_flushTimer) {
      _flushTimer = setTimeout(() => {
        _flushTimer = null;
        _flushSaveBatch();
      }, FLUSH_MS);
    }
  };

  watcher.on('ready', () => updateService('profileWatcher', 'done'));
  watcher.on('change', record);
  watcher.on('add', record);
  watcher.on('error', (err) => console.warn('[Profile] watcher error:', err && err.message));
  _watchers.set(repoPath, watcher);
}

function _stopWatchers() {
  for (const w of _watchers.values()) {
    try {
      w.close();
    } catch (_) {}
  }
  _watchers = new Map();
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  _flushSaveBatch();
  _synced.clear();
}

function _flushSaveBatch() {
  if (_saveBatch.length === 0) return;
  const batch = _saveBatch;
  _saveBatch = [];
  if (batch.length > BULK_LIMIT) {
    console.warn('[Profile] ignored a bulk change of ' + batch.length + ' files (branch switch or mass rewrite)');
    return;
  }

  const d = db();
  try {
    d.run('BEGIN');

    const insEvent = d.prepare('INSERT INTO file_save_events (timestamp, repo_path, repo_name, file_path, file_ext) VALUES (?, ?, ?, ?, ?)');
    for (const e of batch) _exec(insEvent, [e.ts, e.repoPath, e.repoName, e.filePath, e.ext]);
    insEvent.free();

    const groups = new Map();
    for (const e of batch) {
      const key = e.date + '\u0000' + e.repoPath;
      let g = groups.get(key);
      if (!g) {
        g = { date: e.date, repoPath: e.repoPath, repoName: e.repoName, saves: 0, exts: new Map() };
        groups.set(key, g);
      }
      g.saves += 1;
      g.exts.set(e.ext, (g.exts.get(e.ext) || 0) + 1);
    }

    const upDay = d.prepare(
      'INSERT INTO activity_days (date, repo_path, repo_name, file_saves, files_touched) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(date, repo_path) DO UPDATE SET file_saves = file_saves + excluded.file_saves, ' +
        'files_touched = MAX(files_touched, excluded.files_touched)'
    );
    const upExt = d.prepare(
      'INSERT INTO activity_ext_days (date, repo_path, ext, saves) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(date, repo_path, ext) DO UPDATE SET saves = saves + excluded.saves'
    );

    for (const g of groups.values()) {
      const bounds = _dayBounds(g.date);
      const distinct = _scalar(
        'SELECT COUNT(DISTINCT file_path) FROM file_save_events WHERE repo_path = ? AND timestamp >= ? AND timestamp < ?',
        [g.repoPath, bounds[0], bounds[1]]
      );
      _exec(upDay, [g.date, g.repoPath, g.repoName, g.saves, distinct]);
      for (const [ext, n] of g.exts) _exec(upExt, [g.date, g.repoPath, ext, n]);
    }
    upDay.free();
    upExt.free();

    d.run('COMMIT');
    save();
  } catch (err) {
    console.warn('[Profile] flush error:', err.message);
    try {
      d.run('ROLLBACK');
    } catch (_) {}
  }
}

function _writeCommitDays(repoPath, repoName, dates) {
  const d = db();
  try {
    d.run('BEGIN');
    const stmt = d.prepare(
      'INSERT INTO activity_days (date, repo_path, repo_name, commits, files_touched) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(date, repo_path) DO UPDATE SET commits = excluded.commits, ' +
        'files_touched = MAX(files_touched, excluded.files_touched), repo_name = excluded.repo_name'
    );
    for (const x of dates) _exec(stmt, [x.date, repoPath, repoName, x.commits, x.files]);
    stmt.free();
    d.run('COMMIT');
    save();
  } catch (err) {
    console.warn('[Profile] commit write error:', err.message);
    try {
      d.run('ROLLBACK');
    } catch (_) {}
  }
}

async function _syncCommits(repoPath, repoName, force) {
  if (!repoPath || _syncing.has(repoPath)) return;
  const today = localDate();
  if (!force && _synced.get(repoPath) === today) return;

  _syncing.add(repoPath);
  updateService('profileSync', 'running', 'Syncing commits...');
  try {
    const activationDate = _activationDate();
    const workerProxy = require('./workerProxy');
    let result;
    if (workerProxy.isReady()) {
      result = await workerProxy.send('profileSync', { repoPath, activationDate }, 120000);
    } else {
      result = await require('../worker-service/tasks/profileSync.js')({ repoPath, activationDate });
    }
    const dates = (result && result.dates) || [];
    if (dates.length) _writeCommitDays(repoPath, repoName || path.basename(repoPath), dates);
    _synced.set(repoPath, today);
    prefetchService.invalidate('profile');
    updateService('profileSync', 'done');
  } catch (err) {
    console.error('[Profile] _syncCommits error:', err.message);
    updateService('profileSync', 'failed', err.message);
  } finally {
    _syncing.delete(repoPath);
  }
}

async function _syncAllRepos(config) {
  const cfg = _readConfig(config);
  const projects = Object.keys(cfg.projects || {});
  for (const repoPath of projects) {
    if (!fs.existsSync(path.join(repoPath, '.git'))) continue;
    await _syncCommits(repoPath, path.basename(repoPath));
    await new Promise((resolve) => setTimeout(resolve, SYNC_GAP_MS));
  }
}

function _ensureTables() {
  db().run(
    'CREATE TABLE IF NOT EXISTS activity_ext_days (' +
      'date TEXT NOT NULL, repo_path TEXT NOT NULL, ext TEXT NOT NULL, saves INTEGER DEFAULT 0, ' +
      'PRIMARY KEY (date, repo_path, ext))'
  );
  db().run('CREATE INDEX IF NOT EXISTS idx_activity_ext_days_date ON activity_ext_days(date)');
}

function _tzModifier() {
  const offset = -new Date().getTimezoneOffset();
  return (offset >= 0 ? '+' : '-') + Math.abs(offset) + ' minutes';
}

function _rebuildFromEvents() {
  if (_metaGet('tracking_v2')) return true;
  const d = db();
  const count = _scalar('SELECT COUNT(*) FROM file_save_events', []);
  if (count > 0) {
    const mod = _tzModifier();
    try {
      d.run('BEGIN');
      d.run('DELETE FROM activity_ext_days');
      d.run(
        'INSERT INTO activity_ext_days (date, repo_path, ext, saves) ' +
          'SELECT date(timestamp, ?), repo_path, file_ext, COUNT(*) FROM file_save_events WHERE 1 GROUP BY 1, 2, 3',
        [mod]
      );
      d.run('UPDATE activity_days SET file_saves = 0, files_touched = 0');
      d.run(
        'INSERT INTO activity_days (date, repo_path, repo_name, file_saves, files_touched) ' +
          'SELECT date(timestamp, ?) AS d, repo_path, MAX(repo_name), COUNT(*), COUNT(DISTINCT file_path) ' +
          'FROM file_save_events WHERE 1 GROUP BY d, repo_path ' +
          'ON CONFLICT(date, repo_path) DO UPDATE SET file_saves = excluded.file_saves, files_touched = excluded.files_touched',
        [mod]
      );
      d.run('DELETE FROM activity_days WHERE commits = 0 AND file_saves = 0 AND files_touched = 0');
      d.run('COMMIT');
    } catch (err) {
      console.warn('[Profile] rebuild failed, keeping old totals:', err.message);
      try {
        d.run('ROLLBACK');
      } catch (_) {}
      return false;
    }
  }
  _metaSet('tracking_v2', '1');
  save();
  return true;
}

function _prune() {
  try {
    if (!_metaGet('tracking_v2')) return;
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
    db().run('DELETE FROM file_save_events WHERE timestamp < ?', [cutoff]);
    db().run('DELETE FROM activity_days WHERE commits = 0 AND files_touched = 0 AND file_saves = 0');
    save();
  } catch (err) {
    console.warn('[Profile] prune failed:', err.message);
  }
}

function _maintain() {
  try {
    _ensureTables();
    _rebuildFromEvents();
    _prune();
  } catch (err) {
    console.warn('[Profile] maintenance failed:', err.message);
  }
}

function _reposForDay(date) {
  const rows = _query('SELECT repo_path, repo_name FROM activity_days WHERE date=? AND (commits > 0 OR file_saves > 0)', [date]);
  const out = rows.length ? rows[0].values.map((r) => ({ repoPath: r[0], repoName: r[1] })) : [];
  return out.filter((t) => fs.existsSync(path.join(t.repoPath, '.git')));
}

async function _commitsForDay(repoPath, repoName, date) {
  const raw = await runGit(repoPath, [
    'log', '--branches', '--no-color',
    '--since=' + date + 'T00:00:00',
    '--until=' + date + 'T23:59:59',
    '--format=@@%H%x1f%at%x1f%s',
    '--name-status',
  ]).catch(() => '');

  const commits = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('@@')) {
      const parts = line.slice(2).split('\x1f');
      const at = Number(parts[1]) || 0;
      cur = {
        hash: parts[0],
        shortHash: String(parts[0]).slice(0, 7),
        timestamp: at,
        time: new Date(at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        message: parts.slice(2).join('\x1f') || '(no message)',
        repoPath,
        repoName,
        files: [],
      };
      commits.push(cur);
    } else if (cur && line.trim()) {
      const cols = line.split('\t');
      cur.files.push({ status: (cols[0] || 'M').charAt(0), path: cols[cols.length - 1] });
    }
  }
  return commits;
}

function _dayCacheGet(key) {
  const hit = _dayCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > DAY_CACHE_TTL_MS) {
    _dayCache.delete(key);
    return null;
  }
  _dayCache.delete(key);
  _dayCache.set(key, hit);
  return hit.data;
}

function _dayCacheSet(key, data) {
  _dayCache.delete(key);
  _dayCache.set(key, { ts: Date.now(), data });
  if (_dayCache.size > DAY_CACHE_MAX) {
    _dayCache.delete(_dayCache.keys().next().value);
  }
}

function register(shared) {
  const config = shared ? shared.config : null;

  _maintain();
  if (!_pruneTimer) {
    _pruneTimer = setInterval(_prune, PRUNE_EVERY_MS);
    if (_pruneTimer.unref) _pruneTimer.unref();
  }
  if (_profileEnabled()) {
    const t = setTimeout(() => _syncAllRepos(config), SYNC_START_DELAY_MS);
    if (t.unref) t.unref();
  }

  ipcMain.handle('profile:get', async () => _ensureProfile());

  ipcMain.handle('profile:update', (event, data) => {
    db().run(
      "UPDATE profile SET name=?, email=?, avatar_color=?, facebook=?, tiktok=?, linkedin=?, wakatime=?, bio=?, website=?, updated_at=datetime('now') WHERE id=1",
      [
        data.name || '', data.email || '', data.avatarColor || '#4F8EF7', data.facebook || '',
        data.tiktok || '', data.linkedin || '', data.wakatime || '',
        data.bio || '', data.website || '',
      ]
    );
    save();
    prefetchService.invalidate('profile');
    return { success: true };
  });

  ipcMain.handle('profile:getHeatmap', (event, { year }) => queries().getHeatmap(year));
  ipcMain.handle('profile:getStats', (event, { range }) => queries().getStats(range || 'all'));
  ipcMain.handle('profile:getDonutData', (event, { range }) => queries().getDonutData(range || 'all'));
  ipcMain.handle('profile:getHistory', (event, { page, repoPath }) => queries().getHistory(page, repoPath));

  ipcMain.handle('profile:getDayDetail', (event, { date }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return { repos: [], files: [] };
    const rows = _query(
      'SELECT repo_name, repo_path, commits, files_touched, file_saves FROM activity_days WHERE date=? ORDER BY (commits + file_saves) DESC',
      [date]
    );
    const repos = rows.length ? rows[0].values.map((r) => ({
      repo: r[0], repoPath: r[1], commits: r[2] || 0, files: r[3] || 0, saves: r[4] || 0,
    })) : [];

    const bounds = _dayBounds(date);
    const saveRows = _query(
      'SELECT file_path, repo_name, repo_path, COUNT(*) AS cnt FROM file_save_events WHERE timestamp >= ? AND timestamp < ? GROUP BY repo_path, file_path ORDER BY cnt DESC LIMIT 30',
      [bounds[0], bounds[1]]
    );
    const files = saveRows.length ? saveRows[0].values.map((r) => ({
      path: path.relative(r[2], r[0]).replace(/\\/g, '/'),
      repo: r[1],
      saves: r[3] || 0,
    })) : [];

    return { repos, files };
  });

  ipcMain.handle('profile:getDayCommits', async (event, { date, repoPath }) => {
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return [];
      const targets = repoPath
        ? [{ repoPath, repoName: path.basename(repoPath) }]
        : _reposForDay(date);
      const key = date + '|' + targets.map((t) => t.repoPath).join(',');
      const cached = _dayCacheGet(key);
      if (cached) return cached;

      const lists = [];
      for (const t of targets) {
        lists.push(await _commitsForDay(t.repoPath, t.repoName, date));
      }
      const commits = [].concat(...lists).sort((a, b) => b.timestamp - a.timestamp);
      _dayCacheSet(key, commits);
      return commits;
    } catch (_) {
      return [];
    }
  });

  ipcMain.handle('profile:fileDiff', async (event, { filePath, repoPath, commitHash }) => {
    try {
      if (!filePath || !repoPath || !fs.existsSync(path.join(repoPath, '.git'))) {
        return { diff: '', content: '' };
      }
      const rel = (path.isAbsolute(filePath) ? path.relative(repoPath, filePath) : filePath).replace(/\\/g, '/');
      if (commitHash) {
        if (!/^[0-9a-f]{7,40}$/i.test(String(commitHash))) return { diff: '', content: '' };
        const [diff, content] = await Promise.all([
          runGit(repoPath, ['show', '--format=', '--no-color', commitHash, '--', rel]).catch(() => ''),
          runGit(repoPath, ['show', commitHash + ':' + rel]).catch(() => ''),
        ]);
        return { diff, content };
      }
      const [diff, content] = await Promise.all([
        runGit(repoPath, ['diff', '--no-color', 'HEAD', '--', rel]).catch(() => ''),
        runGit(repoPath, ['show', 'HEAD:' + rel]).catch(() => ''),
      ]);
      return { diff, content };
    } catch (err) {
      return { diff: '', content: '', error: err.message };
    }
  });

  ipcMain.handle('profile:resetStats', () => {
    db().run('DELETE FROM activity_days');
    db().run('DELETE FROM file_save_events');
    db().run('DELETE FROM activity_ext_days');
    db().run("DELETE FROM profile_meta WHERE key='activation_date'");
    _synced.clear();
    _overviewCache = { range: '', at: 0, data: null };
    _activationDate();
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

  ipcMain.handle('profile:getAll', async (event, opts) => {
    const o = opts || {};
    const q = queries();
    const profile = await _ensureProfile();
    return {
      profile,
      avatar: null,
      stats: q.getStats(o.statsRange || 'all'),
      heatmap: q.getHeatmap(o.heatmapYear),
      donuts: q.getDonutData(o.donutRange || 'all'),
      history: q.getHistory(o.historyPage, o.historyRepo),
      _cachedAt: Date.now(),
    };
  });

  ipcMain.handle('profile:getOverview', async (event, opts) => {
    const o = opts || {};
    const range = o.range === 'month' ? 'month' : 'week';
    if (!o.fresh && _overviewCache.range === range && Date.now() - _overviewCache.at < OVERVIEW_TTL_MS) {
      return _overviewCache.data;
    }

    const cfg = _readConfig(config);
    const q = queries();
    const stats = new Map(q.getRepoStats(range).map((r) => [_norm(r.repoPath), r]));

    const paths = new Map();
    for (const p of Object.keys(cfg.projects || {})) paths.set(_norm(p), p);
    for (const r of stats.values()) {
      if (!paths.has(_norm(r.repoPath))) paths.set(_norm(r.repoPath), r.repoPath);
    }

    const gitRows = await collectRepos(Array.from(paths.values()), 4);
    const deployStore = makeDeployStore({ app });
    const active = _norm(cfg.activeProject);

    const repos = gitRows.map((g) => {
      const s = stats.get(_norm(g.repoPath)) || {};
      let deploy = [];
      try {
        deploy = deployStore.view(g.repoPath).targets.map((t) => ({
          role: t.role === 'custom' ? (t.roleLabel || 'Custom') : t.role,
          name: t.name,
        }));
      } catch (_) {
        deploy = [];
      }
      return Object.assign({}, g, {
        commits: s.commits || 0,
        saves: s.saves || 0,
        files: s.files || 0,
        activeDays: s.days || 0,
        deploy,
        isActive: _norm(g.repoPath) === active,
      });
    });

    const data = { success: true, range, repos, daily: q.getDaily(30), generatedAt: Date.now() };
    _overviewCache = { range, at: Date.now(), data };
    return data;
  });

  ipcMain.handle('profile:initWatcher', () => {
    const repo = _getActiveRepo(config);
    if (repo) _startWatcher(repo.repoPath, repo.name);
    return { watching: _watchers.size };
  });

  ipcMain.handle('profile:stopWatcher', () => {
    _stopWatchers();
    return { success: true };
  });
}

module.exports = {
  register,
  startWatcher: _startWatcher,
  stopWatcher: _stopWatchers,
  triggerCommitSync(repoPath, repoName) {
    if (!_profileEnabled()) return Promise.resolve();
    return _syncCommits(repoPath, repoName);
  },
};