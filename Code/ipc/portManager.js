const { ipcMain } = require('electron');
const { exec } = require('child_process');
const util = require('util');
const prefetchService = require('./prefetchService.js');

const execAsync = util.promisify(exec);

const PROTECTED_NAMES = ['system', 'svchost', 'lsass', 'csrss', 'wininit', 'services', 'smss'];

// ── Process metadata cache ──────────────────────────────────
const _pidMetaCache = new Map(); // pid -> { name, startTime }
let _lastFullRefresh = 0;
let _cachedResponse = null;
const FULL_REFRESH_MS = 60_000;

function _buildGroups(byPid) {
  const groups = {};
  let totalProcesses = 0;

  for (const [pidStr, info] of Object.entries(byPid)) {
    const pid = Number(pidStr);
    const meta = _pidMetaCache.get(pid) || {};
    const name = meta.name || 'Unknown';
    const startTime = meta.startTime || null;
    const protected_flag = isProtected(pid, name);

    for (const port of info.ports) {
      if (!groups[port]) groups[port] = [];
      groups[port].push({ pid, name, protected: protected_flag, startTime });
      totalProcesses++;
    }
  }

  const sortedPorts = Object.keys(groups).sort((a, b) => {
    const aMaxTime = groups[a].reduce((max, e) => e.startTime ? Math.max(max, new Date(e.startTime).getTime()) : max, 0);
    const bMaxTime = groups[b].reduce((max, e) => e.startTime ? Math.max(max, new Date(e.startTime).getTime()) : max, 0);
    if (aMaxTime !== bMaxTime) return bMaxTime - aMaxTime;
    const aMaxPid = Math.max(...groups[a].map(e => e.pid));
    const bMaxPid = Math.max(...groups[b].map(e => e.pid));
    return bMaxPid - aMaxPid;
  });

  const sorted = {};
  for (const port of sortedPorts) {
    sorted[port] = groups[port].slice().sort((a, b) => {
      const aT = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bT = b.startTime ? new Date(b.startTime).getTime() : 0;
      if (aT !== bT) return bT - aT;
      return b.pid - a.pid;
    });
  }

  return {
    groups: sorted,
    counts: { ports: Object.keys(sorted).length, processes: totalProcesses },
  };
}

function isProtected(pid, name) {
  if (pid <= 4) return true;
  const lower = (name || '').toLowerCase().replace('.exe', '');
  return PROTECTED_NAMES.some(p => lower.includes(p));
}

async function parseListeningPorts() {
  const { stdout } = await execAsync('netstat -ano', { timeout: 5000 });
  const lines = stdout.split('\n');
  const byPid = {};

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const state = parts[parts.length - 2];
    if (state !== 'LISTENING') continue;

    const proto = parts[0];
    const addr = parts[1];
    const pidStr = parts[parts.length - 1];
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid)) continue;

    const colIdx = addr.lastIndexOf(':');
    if (colIdx === -1) continue;
    const port = addr.slice(colIdx + 1);
    if (!port) continue;

    if (!byPid[pid]) {
      byPid[pid] = { ports: new Set(), proto };
    }
    byPid[pid].ports.add(port);
  }

  return byPid;
}

async function _fetchAllProcessNames() {
  try {
    const { stdout } = await execAsync('tasklist /FO CSV /NH', { timeout: 5000 });
    const names = {};
    for (const line of stdout.split('\n')) {
      const match = line.match(/"([^"]+)","(\d+)"/);
      if (!match) continue;
      names[parseInt(match[2], 10)] = match[1];
    }
    return names;
  } catch {
    return {};
  }
}

async function _fetchAllCreationTimes() {
  try {
    const { stdout } = await execAsync('wmic process get ProcessId,CreationDate /FORMAT:CSV', { timeout: 5000 });
    const times = {};
    const lines = stdout.split('\n').slice(1); // skip header
    for (const line of lines) {
      const parts = line.trim().split(',');
      if (parts.length < 2) continue;
      const pid = parseInt(parts[1], 10);
      if (isNaN(pid)) continue;
      const rawDate = parts[2];
      if (rawDate && rawDate.length >= 14) {
        times[pid] = `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}T${rawDate.slice(8,10)}:${rawDate.slice(10,12)}:${rawDate.slice(12,14)}`;
      }
    }
    return times;
  } catch {
    return {};
  }
}

async function _fetchNewPids(pidList) {
  const [nameMap, timeMap] = await Promise.all([
    _fetchAllProcessNames(),
    _fetchAllCreationTimes(),
  ]);
  for (const pid of pidList) {
    _pidMetaCache.set(pid, {
      name: nameMap[pid] || 'Unknown',
      startTime: timeMap[pid] || null,
    });
  }
}

async function listHandler() {
  const cached = prefetchService.get('portManager');
  if (cached) return cached;

  // Delegate to worker first
  try {
    const workerProxy = require('./workerProxy');
    if (workerProxy.isReady()) {
      const result = await workerProxy.send('portManager', {});
      return result;
    }
  } catch (_) {}

  // Fallback to main-process scanning
  const now = Date.now();
  const byPid = await parseListeningPorts();
  const currentPids = new Set(Object.keys(byPid).map(Number));

  const forceFull = (now - _lastFullRefresh) > FULL_REFRESH_MS;

  const newPids = [];
  for (const pid of currentPids) {
    if (!_pidMetaCache.has(pid) || forceFull) {
      newPids.push(pid);
    }
  }

  for (const pid of _pidMetaCache.keys()) {
    if (!currentPids.has(pid)) {
      _pidMetaCache.delete(pid);
    }
  }

  if (newPids.length > 0) {
    await _fetchNewPids(newPids);
  }

  if (forceFull) {
    _lastFullRefresh = now;
  }

  _cachedResponse = _buildGroups(byPid);
  return _cachedResponse;
}

async function killHandler({ pid }) {
  if (pid <= 4) return { success: false, error: 'Cannot kill system process' };

  try {
    await execAsync(`taskkill /PID ${pid} /F`, { timeout: 5000 });
    return { success: true };
  } catch (err) {
    const msg = err.stderr || err.message || '';
    if (msg.includes('not found') || msg.includes('no running')) {
      return { success: true };
    }
    return { success: false, error: msg.trim() || 'Failed to kill process' };
  }
}

function register() {
  ipcMain.handle('port-manager:list', listHandler);
  ipcMain.handle('port-manager:kill', (event, { pid }) => killHandler({ pid }));
}

module.exports = { register };
