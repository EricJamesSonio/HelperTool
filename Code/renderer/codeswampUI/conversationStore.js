const STORE_PREFIX = 'cs_conv_v2_';

function normPath(p) {
  return (p || '').replace(/\\/g, '/').toLowerCase();
}

function getKey(repoPath) {
  return STORE_PREFIX + normPath(repoPath);
}

export const convStore = {
  _cache: {},

  _load(repoPath) {
    if (!repoPath) return [];
    const key = getKey(repoPath);
    if (!(key in this._cache)) {
      try {
        const raw = localStorage.getItem(key);
        this._cache[key] = raw ? JSON.parse(raw) : [];
      } catch {
        this._cache[key] = [];
      }
    }
    return this._cache[key];
  },

  _save(repoPath) {
    const key = getKey(repoPath);
    try {
      localStorage.setItem(key, JSON.stringify(this._cache[key] || []));
    } catch {}
  },

  getConversations(repoPath) {
    return this._load(repoPath);
  },

  addConversation(repoPath, conv) {
    if (!repoPath || !conv || !conv.id) return;
    const arr = this._load(repoPath);
    const idx = arr.findIndex(c => c.id === conv.id);
    if (idx >= 0) {
      const local = arr[idx];
      if (local && local.customTitle) {
        const { title, ...rest } = conv;
        arr[idx] = { ...local, ...rest, title: local.title, customTitle: true };
      } else {
        arr[idx] = { ...arr[idx], ...conv };
      }
    } else {
      arr.unshift({
        provider: 'opencode',
        messageCount: 0,
        ...conv,
        title: conv.title || conv.id,
        date: conv.date || new Date().toISOString(),
      });
    }
    this._save(repoPath);
  },

  renameConversation(repoPath, convId, newTitle) {
    if (!repoPath || !convId || !newTitle) return;
    const arr = this._load(repoPath);
    const idx = arr.findIndex(c => c.id === convId);
    if (idx >= 0) {
      arr[idx].title = newTitle;
      arr[idx].customTitle = true;
      this._save(repoPath);
    }
  },

  touchConversation(repoPath, convId) {
    if (!repoPath || !convId) return;
    const arr = this._load(repoPath);
    const idx = arr.findIndex(c => c.id === convId);
    if (idx >= 0) {
      arr[idx].date = new Date().toISOString();
      const item = arr.splice(idx, 1)[0];
      arr.unshift(item);
      this._save(repoPath);
    }
  },

  mergeConversations(repoPath, convs) {
    if (!repoPath || !convs) return;
    const arr = this._load(repoPath);
    const idxMap = new Map(arr.map((c, i) => [c.id, i]));
    for (const conv of convs) {
      if (!conv || !conv.id) continue;
      const idx = idxMap.get(conv.id);
      if (idx !== undefined) {
        const local = arr[idx];
        if (local && local.customTitle) {
          const { title, ...rest } = conv;
          arr[idx] = { ...local, ...rest, title: local.title, customTitle: true };
        } else {
          arr[idx] = { ...arr[idx], ...conv };
        }
      } else {
        idxMap.set(conv.id, arr.length);
        arr.push({ ...conv });
      }
    }
    arr.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    this._save(repoPath);
  },

  removeConversation(repoPath, convId) {
    if (!repoPath || !convId) return;
    const arr = this._load(repoPath);
    const idx = arr.findIndex(c => c.id === convId);
    if (idx >= 0) {
      arr.splice(idx, 1);
      this._save(repoPath);
    }
  },

  clear(repoPath) {
    const key = getKey(repoPath);
    this._cache[key] = [];
    try { localStorage.removeItem(key); } catch {}
  },
};
