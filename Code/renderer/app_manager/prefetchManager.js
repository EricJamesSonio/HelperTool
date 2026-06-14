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

const cache = new PrefetchCache();

export function startPrefetch(repoPath) {
  if (!repoPath) return;
  cache.invalidate('teamActivity:' + repoPath);
  cache.invalidate('branches:' + repoPath);
}

export function getPrefetchCache() {
  return cache;
}
