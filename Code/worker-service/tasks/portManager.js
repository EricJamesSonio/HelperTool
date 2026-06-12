const { execFile } = require('child_process');

const PROTECTED_NAMES = ['system', 'svchost', 'lsass', 'csrss', 'wininit', 'services', 'smss'];

function execAsync(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeout || 10000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

function isProtected(pid, name) {
  if (pid <= 4) return true;
  const lower = (name || '').toLowerCase().replace('.exe', '');
  return PROTECTED_NAMES.some(p => lower.includes(p));
}

function buildGroups(byPid, pidMetaCache) {
  const groups = {};
  let totalProcesses = 0;
  for (const [pidStr, info] of Object.entries(byPid)) {
    const pid = Number(pidStr);
    const meta = pidMetaCache[pid] || {};
    const name = meta.name || 'Unknown';
    const startTime = meta.startTime || null;
    const protectedFlag = isProtected(pid, name);
    for (const port of info.ports) {
      if (!groups[port]) groups[port] = [];
      groups[port].push({ pid, name, protected: protectedFlag, startTime });
      totalProcesses++;
    }
  }
  const sortedPorts = Object.keys(groups).sort((a, b) => {
    const aMaxTime = groups[a].reduce((max, e) => e.startTime ? Math.max(max, new Date(e.startTime).getTime()) : max, 0);
    const bMaxTime = groups[b].reduce((max, e) => e.startTime ? Math.max(max, new Date(e.startTime).getTime()) : max, 0);
    if (aMaxTime !== bMaxTime) return bMaxTime - aMaxTime;
    return Math.max(...groups[b].map(e => e.pid)) - Math.max(...groups[a].map(e => e.pid));
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
  return { groups: sorted, counts: { ports: Object.keys(sorted).length, processes: totalProcesses } };
}

async function parseListeningPorts() {
  const stdout = await execAsync('netstat', ['-ano'], 10000);
  const lines = stdout.split('\n');
  const byPid = {};
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const state = parts[parts.length - 2];
    if (state !== 'LISTENING') continue;
    const addr = parts[1];
    const pidStr = parts[parts.length - 1];
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid)) continue;
    const colIdx = addr.lastIndexOf(':');
    if (colIdx === -1) continue;
    const port = addr.slice(colIdx + 1);
    if (!port) continue;
    if (!byPid[pid]) byPid[pid] = { ports: new Set() };
    byPid[pid].ports.add(port);
  }
  return byPid;
}

async function getProcessMeta(pid) {
  try {
    const stdout = await execAsync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], 3000);
    const match = stdout.match(/"([^"]+)"/);
    return match ? match[1] : 'Unknown';
  } catch { return 'Unknown'; }
}

async function getProcessStartTime(pid) {
  try {
    const stdout = await execAsync('wmic', ['process', 'where', `ProcessId=${pid}`, 'get', 'CreationDate', '/format:value'], 3000);
    const match = stdout.match(/CreationDate=(\d{14})/);
    if (!match) return null;
    const s = match[1];
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`;
  } catch { return null; }
}

async function getPortManagerData() {
  const byPid = await parseListeningPorts();
  const pids = Object.keys(byPid).map(Number);
  const nameResults = await Promise.allSettled(pids.map(pid => getProcessMeta(pid)));
  const timeResults = await Promise.allSettled(pids.map(pid => getProcessStartTime(pid)));
  const pidMetaCache = {};
  for (let i = 0; i < pids.length; i++) {
    const pid = pids[i];
    const name = nameResults[i].status === 'fulfilled' ? nameResults[i].value : 'Unknown';
    const startTime = timeResults[i].status === 'fulfilled' ? timeResults[i].value : null;
    pidMetaCache[pid] = { name, startTime };
  }
  return buildGroups(byPid, pidMetaCache);
}

module.exports = async function handle(payload) {
  return getPortManagerData();
};
