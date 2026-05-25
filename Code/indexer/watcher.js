const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fileDb = require('../database/indexedFiles');
const repoDb = require('../database/repositories');
const db = require('../database/db');

let _watchers = new Map();
let _saveTimers = new Map();

function debouncedSave(repoPath) {
  if (_saveTimers.has(repoPath)) {
    clearTimeout(_saveTimers.get(repoPath));
  }
  _saveTimers.set(repoPath, setTimeout(() => {
    db.save();
    _saveTimers.delete(repoPath);
  }, 300));
}

function createWatcher(repoPath, onDirty, onError) {
  destroyWatcher(repoPath);

  const repo = repoDb.getByPath(repoPath);
  if (!repo) {
    console.log('[SI Watcher] No repo found:', repoPath);
    return null;
  }

  let config = {};
  try { config = JSON.parse(repo.config_json || '{}'); } catch (e) { config = {}; }
  const ignoredFolders = config.ignoredFolders || ['node_modules', 'dist', 'build', '.git'];

  const ignorePattern = ignoredFolders.map(f => `**/${f}/**`);

  console.log('[SI Watcher] Starting watcher for:', repoPath, 'ignore:', ignorePattern);

  const watcher = chokidar.watch(repoPath, {
    ignored: ignorePattern,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('change', (filePath) => {
    console.log('[SI Watcher] change:', filePath);
    const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');

    // If file isn't in the index yet, insert it first (was created before watcher started)
    const existing = fileDb.getByRepoAndPath(repo.id, relPath);
    if (!existing) {
      console.log('[SI Watcher] change on unknown file, inserting:', relPath);
      const ext = path.extname(relPath).toLowerCase();
      const langMap = { '.js': 'javascript', '.ts': 'typescript', '.tsx': 'tsx', '.py': 'python', '.html': 'html', '.css': 'css' };
      const language = langMap[ext] || null;
      try {
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        const hash = crypto.createHash('md5').update(content).digest('hex');
        fileDb.insert(repo.id, relPath, language, hash, stat.mtime.toISOString());
      } catch (e) {
        console.log('[SI Watcher] change insert error:', e.message);
      }
    }

    fileDb.markDirty(repo.id, relPath);
    debouncedSave(repoPath);
    const count = fileDb.countDirtyByRepo(repo.id);
    console.log('[SI Watcher] dirty count after change:', count);
    if (onDirty) onDirty(count);
  });

  watcher.on('add', (filePath) => {
    console.log('[SI Watcher] add:', filePath);
    const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
    const existing = fileDb.getByRepoAndPath(repo.id, relPath);
    if (existing) {
      fileDb.markDirty(repo.id, relPath);
      debouncedSave(repoPath);
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
        debouncedSave(repoPath);
        console.log('[SI Watcher] inserted new file:', relPath);
      } catch (e) {
        console.log('[SI Watcher] add error:', e.message);
      }
    }
    const count = fileDb.countDirtyByRepo(repo.id);
    console.log('[SI Watcher] dirty count after add:', count);
    if (onDirty) onDirty(count);
  });

  watcher.on('unlink', (filePath) => {
    console.log('[SI Watcher] unlink:', filePath);
    const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
    fileDb.removeByPath(repo.id, relPath);
    debouncedSave(repoPath);
    const count = fileDb.countDirtyByRepo(repo.id);
    console.log('[SI Watcher] dirty count after unlink:', count);
    if (onDirty) onDirty(count);
  });

  watcher.on('error', (err) => {
    console.log('[SI Watcher] error:', err.message);
    if (onError) onError(err.message);
  });

  _watchers.set(repoPath, watcher);
  console.log('[SI Watcher] Watcher created successfully');
  return watcher;
}

function destroyWatcher(repoPath) {
  const existing = _watchers.get(repoPath);
  if (existing) {
    existing.close();
    _watchers.delete(repoPath);
  }
  if (_saveTimers.has(repoPath)) {
    clearTimeout(_saveTimers.get(repoPath));
    db.save();
    _saveTimers.delete(repoPath);
  }
}

function destroyAllWatchers() {
  for (const [repoPath, watcher] of _watchers) {
    watcher.close();
  }
  _watchers.clear();
  for (const [repoPath, timer] of _saveTimers) {
    clearTimeout(timer);
  }
  _saveTimers.clear();
  db.save();
}

module.exports = { createWatcher, destroyWatcher, destroyAllWatchers };
