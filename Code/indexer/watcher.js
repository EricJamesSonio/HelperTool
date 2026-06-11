const chokidar = require('chokidar');
const path = require('path');
const repoDb = require('../database/repositories');

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
    if (onDirty) onDirty(repoPath, relPath);
  });

  watcher.on('add', (filePath) => {
    const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
    if (onDirty) onDirty(repoPath, relPath);
  });

  watcher.on('unlink', (filePath) => {
    const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
    if (onDirty) onDirty(repoPath, relPath);
  });

  watcher.on('error', (err) => {
    if (onError) onError(err.message);
  });

  watcher.on('raw', (event, filePath) => {
    if (event === 'rename' && filePath) {
      const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
      if (onDirty) onDirty(repoPath, relPath);
    }
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
