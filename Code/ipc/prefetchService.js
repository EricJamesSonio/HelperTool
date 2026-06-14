const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const workerProxy = require('./workerProxy.js');
const { updateService } = require('./serviceTracker_ipc.js');

const TTL = {
  profile: 5 * 60 * 1000,
  teamActivity: 5 * 60 * 1000,
  portManager: 60 * 1000,
  branches: 30 * 1000,
};

const _cache = new Map();
let _dbPath = '';
let _started = false;
let _saveTimer = null;
let _getMainWindow = null;

const _cachePath = (() => {
  try {
    return path.join(app.getPath('userData'), 'prefetch-cache.json');
  } catch { return ''; }
})();

function _now() { return Date.now(); }

async function _loadDiskCache() {
  if (!_cachePath) return;
  try {
    await fs.promises.access(_cachePath);
    const raw = await fs.promises.readFile(_cachePath, 'utf-8');
    const entries = JSON.parse(raw);
    for (const [key, entry] of Object.entries(entries)) {
      if (_now() - entry.ts < entry.ttl) {
        _cache.set(key, entry);
      }
    }
    console.log('[Prefetch] Loaded', _cache.size, 'entries from disk cache');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[Prefetch] Failed to load disk cache:', err.message);
    }
  }
}

function _saveDiskCache() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    try {
      if (!_cachePath) return;
      const obj = {};
      for (const [key, entry] of _cache) {
        if (_now() - entry.ts < entry.ttl) obj[key] = entry;
      }
      fs.writeFileSync(_cachePath, JSON.stringify(obj), 'utf-8');
    } catch (err) {
      console.warn('[Prefetch] Failed to save disk cache:', err.message);
    }
  }, 2000);
}

function _isFresh(key) {
  const entry = _cache.get(key);
  if (!entry) return false;
  return _now() - entry.ts < entry.ttl;
}

function _get(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (!_isFresh(key)) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function _set(key, data, ttl) {
  const resolvedTtl = ttl || TTL.profile;
  _cache.set(key, { data, ts: _now(), ttl: resolvedTtl });
  _saveDiskCache();
  try {
    const w = typeof _getMainWindow === 'function' && _getMainWindow();
    if (w && !w.isDestroyed()) w.webContents.send('prefetch:update', { key, data, ttl: resolvedTtl });
  } catch (_) {}
}

function _clearKey(key) {
  _cache.delete(key);
  _saveDiskCache();
}

async function _fetchFromWorker(type, payload) {
  if (!workerProxy.isReady()) return null;
  try {
    const result = await workerProxy.send(type, payload, 120000);
    return result;
  } catch (err) {
    console.error('[Prefetch] Worker fetch failed:', type, err.message);
    return null;
  }
}

async function _prefetchProfile() {
  updateService('prefetchProfile', 'running', 'Fetching profile data...');
  try {
    const dbPath = _dbPath;
    const year = new Date().getFullYear();

    const [profile, stats, heatmap, donuts, history] = await Promise.all([
      _fetchFromWorker('profileData', { action: 'getProfile', dbPath, params: {} }),
      _fetchFromWorker('profileData', { action: 'getStats', dbPath, params: { range: 'all' } }),
      _fetchFromWorker('profileData', { action: 'getHeatmap', dbPath, params: { year } }),
      _fetchFromWorker('profileData', { action: 'getDonutData', dbPath, params: { range: 'all' } }),
      _fetchFromWorker('profileData', { action: 'getHistory', dbPath, params: { page: 1, repoPath: '' } }),
    ]);

    if (profile || stats) {
      const data = { profile, avatar: null, stats, heatmap, donuts, history };
      _set('profile', data, TTL.profile);
      console.log('[Prefetch] Profile data cached');
      updateService('prefetchProfile', 'done');
    } else {
      updateService('prefetchProfile', 'failed', 'No data returned');
    }
  } catch (err) {
    console.error('[Prefetch] _prefetchProfile error:', err.message);
    updateService('prefetchProfile', 'failed', err.message);
  }
}

async function _prefetchTeamActivity(repoPath) {
  if (!repoPath) return;
  updateService('prefetchTeam', 'running', 'Fetching team activity...');
  const data = await _fetchFromWorker('teamActivity', { repoPath });
  if (data) {
    _set('teamActivity:' + repoPath, data, TTL.teamActivity);
    console.log('[Prefetch] Team activity cached for', repoPath);
    updateService('prefetchTeam', 'done');
  } else {
    updateService('prefetchTeam', 'failed', 'No data returned');
  }
}

async function _prefetchPortManager() {
  updateService('prefetchPorts', 'running', 'Scanning ports...');
  const data = await _fetchFromWorker('portManager', {});
  if (data) {
    _set('portManager', data, TTL.portManager);
    console.log('[Prefetch] Port manager data cached');
    updateService('prefetchPorts', 'done');
  } else {
    updateService('prefetchPorts', 'failed', 'No data returned');
  }
}

async function _prefetchBranches(repoPath) {
  if (!repoPath) return;
  const data = await _fetchFromWorker('gitBranches', { repoPath });
  if (data) {
    _set('branches:' + repoPath, data, TTL.branches);
    console.log('[Prefetch] Branches cached for', repoPath);
  }
}

function _pushCachedToRenderer() {
  const w = typeof _getMainWindow === 'function' && _getMainWindow();
  if (!w || w.isDestroyed()) return;
  for (const [key, entry] of _cache) {
    if (_now() - entry.ts < entry.ttl) {
      w.webContents.send('prefetch:update', { key, data: entry.data, ttl: entry.ttl });
    }
  }
}

async function start(dbPath, repoPath, getMainWindow) {
  if (_started) return;
  _started = true;
  _dbPath = dbPath || '';
  _getMainWindow = getMainWindow || null;

  await _loadDiskCache();
  _pushCachedToRenderer();

  const _launchPrefetch = () => {
    setTimeout(() => _doPrefetch(repoPath), 1500);
  };

  if (!workerProxy.isReady()) {
    const check = setInterval(() => {
      if (workerProxy.isReady()) {
        clearInterval(check);
        _launchPrefetch();
      }
    }, 500);
    setTimeout(() => clearInterval(check), 30000);
  } else {
    _launchPrefetch();
  }
}

async function _triggerProfileSync(repoPath) {
  if (!repoPath) {
    updateService('profileSync', 'failed', 'No repo selected');
    return;
  }
  try {
    updateService('profileSync', 'running', 'Syncing commits...');
    const profileIpc = require('./profile.js');
    const repoName = require('path').basename(repoPath);
    await profileIpc.triggerCommitSync(repoPath, repoName);
    updateService('profileSync', 'done');
  } catch (err) {
    updateService('profileSync', 'failed', err.message);
  }
}

async function _startProfileWatcher(repoPath) {
  if (!repoPath) {
    updateService('profileWatcher', 'failed', 'No repo selected');
    return;
  }
  try {
    updateService('profileWatcher', 'running', 'Starting file watcher...');
    const profileIpc = require('./profile.js');
    const repoName = require('path').basename(repoPath);
    profileIpc.startWatcher(repoPath, repoName);
    updateService('profileWatcher', 'done');
  } catch (err) {
    updateService('profileWatcher', 'failed', err.message);
  }
}

async function _doPrefetch(repoPath) {
  console.log('[Prefetch] Starting background refresh...');

  const phase1 = Promise.allSettled([
    _prefetchProfile(),
    _prefetchTeamActivity(repoPath),
  ]);

  await new Promise(r => setTimeout(r, 500));

  const phase2 = Promise.allSettled([
    _prefetchPortManager(),
    _prefetchBranches(repoPath),
  ]);

  await Promise.allSettled([phase1, phase2]);

  setTimeout(() => {
    _startProfileWatcher(repoPath).catch(err =>
      console.warn('[Prefetch] Profile watcher failed:', err.message)
    );
  }, 3000);

  setTimeout(() => {
    _triggerProfileSync(repoPath).catch(err =>
      console.warn('[Prefetch] Profile sync failed:', err.message)
    );
  }, 8000);

  console.log('[Prefetch] Background refresh scheduled');
}

function get(key) {
  return _get(key);
}

async function refresh(key, repoPath) {
  _clearKey(key);
  switch (true) {
    case key === 'profile':
      await _prefetchProfile();
      return _get(key);
    case key.startsWith('teamActivity:'):
      await _prefetchTeamActivity(repoPath || key.replace('teamActivity:', ''));
      return _get(key);
    case key === 'portManager':
      await _prefetchPortManager();
      return _get(key);
    case key.startsWith('branches:'):
      await _prefetchBranches(repoPath || key.replace('branches:', ''));
      return _get(key);
    default:
      return null;
  }
}

function invalidate(key) {
  _clearKey(key);
}

function stop() {
  _started = false;
  _cache.clear();
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = null;
  try { if (_cachePath && fs.existsSync(_cachePath)) fs.unlinkSync(_cachePath); } catch (_) {}
}

module.exports = { start, get, refresh, invalidate, stop };
