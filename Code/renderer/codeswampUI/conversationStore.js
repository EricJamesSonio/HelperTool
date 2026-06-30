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
    console.log('[CS] renameConversation called:', { repoPath, convId, newTitle });
    if (!repoPath || !convId || !newTitle) return;
    const arr = this._load(repoPath);
    const idx = arr.findIndex(c => c.id === convId);
    console.log('[CS] renameConversation found idx:', idx, 'existing title:', arr[idx]?.title);
    if (idx >= 0) {
      arr[idx].title = newTitle;
      arr[idx].customTitle = true;
      this._save(repoPath);
      const raw = localStorage.getItem(getKey(repoPath));
      console.log('[CS] renameConversation localStorage after save:', raw ? JSON.parse(raw).map(c => ({ id: c.id, title: c.title, customTitle: c.customTitle })) : 'null');
    }
  },

  mergeConversations(repoPath, convs) {
    if (!repoPath || !convs) return;
    const arr = this._load(repoPath);
    console.log('[CS] mergeConversations pre-merge arr:', arr.map(c => ({ id: c.id, title: c.title, customTitle: c.customTitle })));
    console.log('[CS] mergeConversations incoming convs:', convs.map(c => ({ id: c.id, title: c.title })));
    const seen = new Set(arr.map(c => c.id));
    for (const conv of convs) {
      if (!conv || !conv.id) continue;
      if (seen.has(conv.id)) {
        const idx = arr.findIndex(c => c.id === conv.id);
        const local = arr[idx];
        console.log('[CS] mergeConversations merging conv', conv.id, 'local.customTitle:', local?.customTitle, 'local.title:', local?.title, 'server.title:', conv.title);
        if (local && local.customTitle) {
          const { title, ...rest } = conv;
          arr[idx] = { ...local, ...rest, title: local.title, customTitle: true };
          console.log('[CS] mergeConversations preserving customTitle, result:', { id: arr[idx].id, title: arr[idx].title, customTitle: arr[idx].customTitle });
        } else {
          arr[idx] = { ...arr[idx], ...conv };
          console.log('[CS] mergeConversations server overwrite, result:', { id: arr[idx].id, title: arr[idx].title, customTitle: arr[idx].customTitle });
        }
      } else {
        arr.push({ ...conv });
        seen.add(conv.id);
        console.log('[CS] mergeConversations added new conv:', { id: conv.id, title: conv.title });
      }
    }
    arr.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    console.log('[CS] mergeConversations post-merge arr:', arr.map(c => ({ id: c.id, title: c.title, customTitle: c.customTitle })));
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
