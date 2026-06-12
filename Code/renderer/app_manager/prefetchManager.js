/**
 * Prefetch Manager
 * Loads data in the background after app startup so tools open instantly.
 * Concurrency-limited queue + TTL cache — each tool checks the cache first.
 */

const TTL = {
  TEAM_ACTIVITY: 300000,
  PROFILE: 300000,
  PORT_MANAGER: 60000,
  BLUEPRINT_CATEGORIES: 300000,
  DB_CONNECTIONS: 300000,
  DOCKER: 30000,
  CANVAS_BOARDS: 300000,
};

class PrefetchCache {
  constructor() { this._store = new Map(); }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttl) {
      this._store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data, ttl) {
    if (data) this._store.set(key, { data, ts: Date.now(), ttl });
  }

  invalidate(key) { this._store.delete(key); }
  clear() { this._store.clear(); }
}

class PrefetchQueue {
  constructor(concurrency = 3) {
    this._concurrency = concurrency;
    this._queue = [];
    this._running = 0;
  }

  enqueue(name, fn) {
    this._queue.push({ name, fn });
    this._tick();
  }

  async _tick() {
    if (this._running >= this._concurrency) return;
    this._running++;
    while (this._queue.length > 0) {
      const { name, fn } = this._queue.shift();
      try {
        await fn();
      } catch (err) {
        if (err.name !== 'AbortError') console.warn(`[Prefetch] ${name}:`, err.message);
      }
    }
    this._running--;
  }
}

const cache = new PrefetchCache();
const queue = new PrefetchQueue(3);

export function startPrefetch(repoPath) {
  if (!repoPath) return;

  setTimeout(() => {
    if (window.electronAPI.teamActivityLog) {
      queue.enqueue('teamActivity', async () => {
        const r = await window.electronAPI.teamActivityLog(repoPath);
        if (r && !r.error) cache.set('teamActivity', r, TTL.TEAM_ACTIVITY);
      });
    }

    if (window.electronAPI.profile?.getAll) {
      queue.enqueue('profile', async () => {
        const [all, avatar] = await Promise.all([
          window.electronAPI.profile.getAll({
            statsRange: 'all', heatmapYear: new Date().getFullYear(), donutRange: 'all',
            historyPage: 1, historyRepo: '',
          }).catch(() => null),
          window.electronAPI.profile.getAvatar().catch(() => null),
        ]);
        if (all) cache.set('profile', { all, avatar: avatar?.dataUrl || null }, TTL.PROFILE);
      });
    }

    if (window.electronAPI.portManagerList) {
      queue.enqueue('portManager', async () => {
        const r = await window.electronAPI.portManagerList();
        if (r) cache.set('portManager', r, TTL.PORT_MANAGER);
      });
    }

    if (window.electronAPI.blueprint?.getCategories) {
      queue.enqueue('blueprintCategories', async () => {
        const r = await window.electronAPI.blueprint.getCategories();
        if (r) cache.set('blueprintCategories', r, TTL.BLUEPRINT_CATEGORIES);
      });
    }

    if (window.electronAPI.dbInspector?.listConnections) {
      queue.enqueue('dbConnections', async () => {
        const r = await window.electronAPI.dbInspector.listConnections();
        if (r) cache.set('dbConnections', r, TTL.DB_CONNECTIONS);
      });
    }

    if (window.dockerAPI?.ping) {
      queue.enqueue('docker', async () => {
        const ping = await window.dockerAPI.ping();
        const [containers, images] = await Promise.all([
          window.dockerAPI.listContainers().catch(() => []),
          window.dockerAPI.listImages().catch(() => []),
        ]);
        cache.set('docker', { ping, containers, images }, TTL.DOCKER);
      });
    }

    if (window.electronAPI.canvas?.listBoards) {
      queue.enqueue('canvasBoards', async () => {
        const r = await window.electronAPI.canvas.listBoards(repoPath);
        if (r) cache.set('canvasBoards', r.boards || [], TTL.CANVAS_BOARDS);
      });
    }
  }, 1000);
}

export function getPrefetchCache() {
  return cache;
}
