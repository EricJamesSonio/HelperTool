const { execFile } = require('child_process');

const PROTECTED_NAMES = ['system', 'svchost', 'lsass', 'csrss', 'wininit', 'services', 'smss'];

function execAsync(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeout || 10000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve('');
      resolve(stdout);
    });
  });
}

function isProtected(pid, name) {
  if (pid <= 4) return true;
  const lower = (name || '').toLowerCase().replace('.exe', '');
  return PROTECTED_NAMES.some(p => lower.includes(p));
}

async function parseListeningPorts() {
  const stdout = await execAsync('netstat', ['-ano'], 10000);
  const byPid = {};
  for (const line of stdout.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const state = parts[parts.length - 2];
    if (state !== 'LISTENING') continue;
    const addr = parts[1];
    const pid = parseInt(parts[parts.length - 1], 10);
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

async function getAllProcessNames() {
  const stdout = await execAsync('tasklist', ['/FO', 'CSV', '/NH'], 8000);
  const names = {};
  for (const line of stdout.split('\n')) {
    const match = line.match(/"([^"]+)","(\d+)"/);
    if (!match) continue;
    const name = match[1];
    const pid = parseInt(match[2], 10);
    if (!isNaN(pid)) names[pid] = name;
  }
  return names;
}

function buildGroups(byPid, nameMap) {
  const groups = {};
  let totalProcesses = 0;
  for (const [pidStr, info] of Object.entries(byPid)) {
    const pid = Number(pidStr);
    const name = nameMap[pid] || 'Unknown';
    const protectedFlag = isProtected(pid, name);
    for (const port of info.ports) {
      if (!groups[port]) groups[port] = [];
      groups[port].push({ pid, name, protected: protectedFlag });
      totalProcesses++;
    }
  }
  const sortedPorts = Object.keys(groups).sort((a, b) => {
    const aMax = Math.max(...groups[a].map(e => e.pid));
    const bMax = Math.max(...groups[b].map(e => e.pid));
    return bMax - aMax;
  });
  const sorted = {};
  for (const port of sortedPorts) {
    sorted[port] = groups[port].slice().sort((a, b) => b.pid - a.pid);
  }
  return { groups: sorted, counts: { ports: Object.keys(sorted).length, processes: totalProcesses } };
}

async function getPortManagerData() {
  const [byPid, nameMap] = await Promise.all([
    parseListeningPorts(),
    getAllProcessNames(),
  ]);
  return buildGroups(byPid, nameMap);
}

module.exports = async function handle() {
  return getPortManagerData();
};
