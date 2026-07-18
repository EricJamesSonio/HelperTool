class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  register(def) {
    if (this._tools.has(def.id)) {
      console.warn(`[ToolRegistry] Tool "${def.id}" already registered — overwriting`);
    }
    this._tools.set(def.id, def);
  }

  getAll() {
    return Array.from(this._tools.values());
  }

  get(id) {
    return this._tools.get(id);
  }

  async statusAll() {
    const results = {};
    for (const [id, tool] of this._tools) {
      try {
        results[id] = await tool.statusFn();
      } catch {
        results[id] = 'error';
      }
    }
    return results;
  }

  async startAll(repoPath) {
    const results = {};
    for (const [id, tool] of this._tools) {
      try {
        results[id] = await tool.startFn(repoPath);
      } catch (e) {
        results[id] = { error: e.message };
      }
    }
    return results;
  }

  async stopAll() {
    const results = {};
    for (const [id, tool] of this._tools) {
      try {
        results[id] = await tool.stopFn();
      } catch (e) {
        results[id] = { error: e.message };
      }
    }
    return results;
  }
}

export default new ToolRegistry();
