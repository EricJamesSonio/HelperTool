const STORAGE_PREFIX = 'git-commits-';
const MAX_BYTES = 100 * 1024 * 1024;

function repoKey(repoPath) {
  return STORAGE_PREFIX + repoPath.replace(/[^a-zA-Z0-9]/g, '_');
}

function estimateBytes(str) {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function getTotalBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(STORAGE_PREFIX)) {
      const val = localStorage.getItem(key);
      if (val) total += estimateBytes(key) + estimateBytes(val);
    }
  }
  return total;
}

function pruneOldest() {
  let targetKey = null;
  let oldestTime = Infinity;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(STORAGE_PREFIX)) continue;
    try {
      const commits = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(commits) || commits.length === 0) {
        localStorage.removeItem(key);
        continue;
      }
      const t = new Date(commits[commits.length - 1].timestamp).getTime();
      if (!isNaN(t) && t < oldestTime) {
        oldestTime = t;
        targetKey = key;
      }
    } catch {
      localStorage.removeItem(key);
    }
  }

  if (!targetKey) return false;

  try {
    const commits = JSON.parse(localStorage.getItem(targetKey) || '[]');
    if (!Array.isArray(commits) || commits.length === 0) {
      localStorage.removeItem(targetKey);
      return false;
    }
    const removeCount = Math.max(1, Math.ceil(commits.length * 0.1));
    commits.splice(-removeCount);
    if (commits.length === 0) {
      localStorage.removeItem(targetKey);
    } else {
      localStorage.setItem(targetKey, JSON.stringify(commits));
    }
    return true;
  } catch {
    return false;
  }
}

function enforceLimit() {
  let safety = 0;
  while (getTotalBytes() > MAX_BYTES && safety < 100) {
    if (!pruneOldest()) break;
    safety++;
  }
}

export function loadCommits(repoPath) {
  try {
    const raw = localStorage.getItem(repoKey(repoPath));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCommits(repoPath, commits) {
  if (!Array.isArray(commits) || commits.length === 0) {
    localStorage.removeItem(repoKey(repoPath));
    return true;
  }
  try {
    localStorage.setItem(repoKey(repoPath), JSON.stringify(commits));
    enforceLimit();
    return true;
  } catch {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!pruneOldest()) break;
      try {
        localStorage.setItem(repoKey(repoPath), JSON.stringify(commits));
        return true;
      } catch {}
    }
    return false;
  }
}
