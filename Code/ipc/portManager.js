const { ipcMain } = require('electron');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

const PROTECTED_NAMES = ['system', 'svchost', 'lsass', 'csrss', 'wininit', 'services', 'smss'];

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

async function getProcessName(pid) {
  try {
    const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { timeout: 3000 });
    const match = stdout.match(/"([^"]+)"/);
    return match ? match[1] : 'Unknown';
  } catch {
    return 'Unknown';
  }
}

async function getProcessCreationTime(pid) {
  try {
    const { stdout } = await execAsync(`wmic process where "ProcessId=${pid}" get CreationDate /FORMAT:VALUE`, { timeout: 3000 });
    const match = stdout.match(/CreationDate=(\d{14})/);
    if (match) {
      const s = match[1];
      return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function listHandler() {
  const byPid = await parseListeningPorts();
  const pids = Object.keys(byPid).map(Number);

  const metaMap = {};
  const BATCH_SIZE = 10;
  for (let i = 0; i < pids.length; i += BATCH_SIZE) {
    const batch = pids.slice(i, i + BATCH_SIZE);
    const nameResults = await Promise.allSettled(batch.map(pid => getProcessName(pid)));
    const timeResults = await Promise.allSettled(batch.map(pid => getProcessCreationTime(pid)));
    nameResults.forEach((r, idx) => {
      const pid = batch[idx];
      const name = r.status === 'fulfilled' ? r.value : 'Unknown';
      const startTime = timeResults[idx]?.status === 'fulfilled' ? timeResults[idx].value : null;
      metaMap[pid] = { name, startTime };
    });
  }

  const groups = {};
  let totalProcesses = 0;

  for (const [pidStr, info] of Object.entries(byPid)) {
    const pid = Number(pidStr);
    const { name, startTime } = metaMap[pid] || {};
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
