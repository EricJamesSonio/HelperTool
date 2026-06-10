const { ipcMain } = require('electron');
const docker = require('../utils/dockerClient.js');

function register() {
  ipcMain.handle('docker:ping', async () => {
    try { await docker.ping(); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('docker:listContainers', async () => {
    try {
      const list = await docker.listContainers(true);
      return list.map(c => ({
        id: c.Id,
        name: (c.Names || [])[0]?.replace(/^\//, '') || c.Id.slice(0, 12),
        image: c.Image,
        state: c.State,
        status: c.Status,
        created: c.Created,
        ports: c.Ports?.map(p => `${p.PrivatePort || ''}${p.PublicPort ? '->' + p.PublicPort : ''}${p.IP ? '(' + p.IP + ')' : ''}`).filter(Boolean) || [],
      }));
    } catch (err) { return []; }
  });

  ipcMain.handle('docker:startContainer', async (_e, id) => {
    try { await docker.startContainer(id); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('docker:stopContainer', async (_e, id) => {
    try { await docker.stopContainer(id); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('docker:restartContainer', async (_e, id) => {
    try { await docker.restartContainer(id); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('docker:removeContainer', async (_e, id) => {
    try { await docker.removeContainer(id, true); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('docker:listImages', async () => {
    try {
      const list = await docker.listImages();
      return list.map(i => ({
        id: i.Id,
        repoTag: (i.RepoTags || [])[0] || '<none>:<none>',
        size: i.Size,
        created: i.Created,
      }));
    } catch (err) { return []; }
  });

  ipcMain.handle('docker:removeImage', async (_e, id) => {
    try { await docker.removeImage(id, true); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('docker:getStats', async (_e, id) => {
    try {
      const raw = await docker.getStats(id);
      const cpuDelta = raw.cpu_stats?.cpu_usage?.total_usage || 0;
      const sysDelta = raw.cpu_stats?.system_cpu_usage || 0;
      const preCpu = raw.precpu_stats?.cpu_usage?.total_usage || 0;
      const preSys = raw.precpu_stats?.system_cpu_usage || 0;
      const cpuDeltaV = cpuDelta - preCpu;
      const sysDeltaV = sysDelta - preSys;
      const cpuPct = sysDeltaV > 0 && cpuDeltaV > 0 ? (cpuDeltaV / sysDeltaV) * (raw.cpu_stats?.online_cpus || 1) * 100 : 0;
      const mem = raw.memory_stats || {};
      return {
        cpuPct: Math.round(cpuPct * 100) / 100,
        memUsage: mem.usage || 0,
        memLimit: mem.limit || 0,
        memPct: mem.limit > 0 ? Math.round((mem.usage / mem.limit) * 10000) / 100 : 0,
        netRx: raw.networks ? Object.values(raw.networks).reduce((s, n) => s + (n.rx_bytes || 0), 0) : 0,
        netTx: raw.networks ? Object.values(raw.networks).reduce((s, n) => s + (n.tx_bytes || 0), 0) : 0,
        pids: raw.pids_stats?.current || 0,
      };
    } catch (err) { return null; }
  });

  ipcMain.handle('docker:getLogs', async (_e, id, tail) => {
    try {
      const raw = await docker.getLogs(id, tail || 200);
      return raw;
    } catch (err) { return ''; }
  });
}

module.exports = { register };
