const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fileDb = require('../database/indexedFiles');
const repoDb = require('../database/repositories');
const db = require('../database/db');

let _watchers = new Map();

function createWatcher(repoPath, onDirty, onError) {
  destroyWatcher(repoPath);

  const repo = repoDb.getByPath(repoPath);
  if (!repo) return null;

  let config = {};
  try { config = JSON.parse(repo.config_json || '{}'); } catch (e) { config = {}; }
  const ignoredFolders = config.ignoredFolders || ['node_modules', 'dist', 'build', '.git'];

  const ignorePattern = ignoredFolders.map(f => `**/${f}/**`);

  const watcher = chokidar.watch(repoPath, {
    ignored: ignorePattern,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('change', (filePath) => {
    const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
    fileDb.markDirty(repo.id, relPath);
    db.save();
    const count = fileDb.countDirtyByRepo(repo.id);
    if (onDirty) onDirty(count);
  });

  watcher.on('add', (filePath) => {
    const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
    const existing = fileDb.getByRepoAndPath(repo.id, relPath);
    if (existing) {
      fileDb.markDirty(repo.id, relPath);
    } else {
      const ext = path.extname(relPath).toLowerCase();
      const langMap = { '.js': 'javascript', '.ts': 'typescript', '.tsx': 'tsx', '.py': 'python', '.html': 'html', '.css': 'css' };
      const language = langMap[ext] || null;

      const now = new Date().toISOString();
      try {
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        const hash = crypto.createHash('md5').update(content).digest('hex');

        fileDb.insert(repo.id, relPath, language, hash, stat.mtime.toISOString());
        fileDb.markDirty(repo.id, relPath);
        db.save();
      } catch (e) {
        // File may have been deleted between event and handling
      }
    }
    if (onDirty) onDirty(fileDb.countDirtyByRepo(repo.id));
  });

  watcher.on('unlink', (filePath) => {
    const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
    fileDb.removeByPath(repo.id, relPath);
    db.save();
    if (onDirty) onDirty(fileDb.countDirtyByRepo(repo.id));
  });

  watcher.on('error', (err) => {
    if (onError) onError(err.message);
  });

  _watchers.set(repoPath, watcher);
  return watcher;
}

function destroyWatcher(repoPath) {
  const existing = _watchers.get(repoPath);
  if (existing) {
    existing.close();
    _watchers.delete(repoPath);
  }
}

function destroyAllWatchers() {
  for (const [repoPath, watcher] of _watchers) {
    watcher.close();
  }
  _watchers.clear();
}

module.exports = { createWatcher, destroyWatcher, destroyAllWatchers };
