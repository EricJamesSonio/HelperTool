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

async function listHandler() {
  const byPid = await parseListeningPorts();
  const pids = Object.keys(byPid).map(Number);

  const nameMap = {};
  const BATCH_SIZE = 10;
  for (let i = 0; i < pids.length; i += BATCH_SIZE) {
    const batch = pids.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(pid => getProcessName(pid)));
    results.forEach((r, idx) => {
      const pid = batch[idx];
      nameMap[pid] = r.status === 'fulfilled' ? r.value : 'Unknown';
    });
  }

  const groups = {};
  let totalProcesses = 0;

  for (const [pidStr, info] of Object.entries(byPid)) {
    const pid = Number(pidStr);
    const name = nameMap[pid];
    const protected_flag = isProtected(pid, name);

    for (const port of info.ports) {
      if (!groups[port]) groups[port] = [];
      groups[port].push({ pid, name, protected: protected_flag });
      totalProcesses++;
    }
  }

  const sortedPorts = Object.keys(groups).sort((a, b) => Number(a) - Number(b));
  const sorted = {};
  for (const port of sortedPorts) {
    sorted[port] = groups[port];
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
