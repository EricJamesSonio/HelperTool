const simpleGit = require('simple-git');

class GitService {
  constructor() {
    this._cache = new Map();
    this._gitInstances = new Map();
    this._stats = { hits: 0, misses: 0 };
  }

  _git(repoPath) {
    let inst = this._gitInstances.get(repoPath);
    if (!inst) {
      inst = simpleGit(repoPath);
      this._gitInstances.set(repoPath, inst);
    }
    return inst;
  }

  _key(repoPath, args) {
    return repoPath + '\0' + args.join('\0');
  }

  async raw(repoPath, args, ttlMs) {
    const key = this._key(repoPath, args);
    const now = Date.now();
    const entry = this._cache.get(key);
    if (entry && now - entry.fetchedAt < entry.ttl) {
      this._stats.hits++;
      return entry.data;
    }
    this._stats.misses++;
    const data = await this._git(repoPath).raw(args);
    this._cache.set(key, { data, fetchedAt: now, ttl: ttlMs || 30000 });
    return data;
  }

  async getCommits(repoPath, opts = {}) {
    const args = ['log', '--format=' + (opts.format || '%H|%at|%s')];
    if (opts.all) args.push('--all');
    if (opts.dateFormat) args.push('--date=' + opts.dateFormat);
    if (opts.since) args.push('--since=' + opts.since);
    if (opts.until) args.push('--until=' + opts.until);
    if (opts.after) args.push('--after=' + opts.after);
    if (opts.noMerges !== false) args.push('--no-merges');
    if (opts.maxCount) args.push('-n' + opts.maxCount);
    if (opts.extra) args.push(...opts.extra);
    return this.raw(repoPath, args, opts.ttl || 60000);
  }

  async getCommitFiles(repoPath, hash, opts = {}) {
    const args = ['diff-tree', '--no-commit-id', '-r', opts.format || '--name-status', hash];
    return this.raw(repoPath, args, opts.ttl || 60000);
  }

  async show(repoPath, ref, opts = {}) {
    const args = ['show', ref];
    if (opts.filePath) args.push('--', opts.filePath);
    return this.raw(repoPath, args, opts.ttl || 30000);
  }

  async showFileAtCommit(repoPath, hash, filePath, opts = {}) {
    return this.raw(repoPath, ['show', hash + ':' + filePath], opts.ttl || 60000).catch(() => '');
  }

  async diff(repoPath, diffArgs, opts = {}) {
    return this.raw(repoPath, ['diff', ...diffArgs], opts.ttl || 10000);
  }

  async revParse(repoPath, ref, opts = {}) {
    return this.raw(repoPath, ['rev-parse', ref], opts.ttl || 120000);
  }

  async getNumstat(repoPath, hash, opts = {}) {
    return this.raw(repoPath, ['diff-tree', '--no-commit-id', '-r', '--numstat', hash], opts.ttl || 60000);
  }

  clearCache(repoPath) {
    if (repoPath) {
      const prefix = repoPath + '\0';
      for (const key of this._cache.keys()) {
        if (key.startsWith(prefix)) this._cache.delete(key);
      }
    } else {
      this._cache.clear();
    }
  }

  getStats() {
    return { ...this._stats, entries: this._cache.size, instances: this._gitInstances.size };
  }
}

module.exports = new GitService();
