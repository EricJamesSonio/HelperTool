const MAX_ENTRIES = 200;

const store = new Map();

function keyOf(repoPath, kind) {
  return String(kind) + '\u0001' + String(repoPath);
}

export function peekEntry(repoPath, kind) {
  return store.get(keyOf(repoPath, kind)) || null;
}

export function isFresh(entry) {
  return !!entry && !entry.stale;
}

export function getEntry(repoPath, kind) {
  const entry = peekEntry(repoPath, kind);
  return isFresh(entry) ? entry : null;
}

export function setCached(repoPath, kind, data) {
  const key = keyOf(repoPath, kind);
  store.delete(key);
  store.set(key, {
    repoPath: String(repoPath),
    kind: String(kind),
    data,
    at: Date.now(),
    stale: false,
  });
  while (store.size > MAX_ENTRIES) {
    store.delete(store.keys().next().value);
  }
  return data;
}

export function needsRefresh(entry) {
  return !isFresh(entry);
}

export function invalidate(repoPath, kindPrefix) {
  const prefix = kindPrefix || '';
  const repo = String(repoPath);
  for (const entry of store.values()) {
    if (entry.repoPath === repo && entry.kind.startsWith(prefix)) {
      entry.stale = true;
    }
  }
}

export function dropRepo(repoPath) {
  const repo = String(repoPath);
  for (const [key, entry] of Array.from(store.entries())) {
    if (entry.repoPath === repo) store.delete(key);
  }
}