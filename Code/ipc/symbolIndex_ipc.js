const { ipcMain } = require('electron');
const path = require('path');
const db = require('../database/db');
const repoDb = require('../database/repositories');
const fileDb = require('../database/indexedFiles');
const symbolDb = require('../database/symbols');
const importDb = require('../database/imports');
const indexer = require('../indexer/indexer');
const parser = require('../indexer/parser');
const watcher = require('../indexer/watcher');
const indexerProxy = require('./indexerProxy.js');

let _getMainWindow = null;
let _activeRepoPath = null;
let _userDataPath = null;

const _fileListCache = new Map();
const _statusCache = new Map();

function invalidateCache(repoPath) {
  _statusCache.delete(repoPath);
  _fileListCache.delete(repoPath);
}

function _detectLang(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = { '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.ts': 'typescript', '.tsx': 'tsx', '.py': 'python', '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'css', '.less': 'css' };
  return map[ext] || '';
}

async function register({ app, docignoreUtils, getMainWindow }) {
  _getMainWindow = getMainWindow;
  _userDataPath = app.getPath('userData');

  ipcMain.handle('symbolIndex:init', async () => {
    try {
      await db.initDatabase(app);
      await parser.initParser();
      for (const ext of parser.SUPPORTED_LANGUAGES) {
        await parser.loadLanguage(ext);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:check', async (_, repoPath) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { indexed: false };
      return { indexed: !!repo.indexed, total_files: repo.total_files, total_symbols: repo.total_symbols, last_indexed: repo.last_indexed };
    } catch (err) {
      return { indexed: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:startIndexing', async (_, repoPath) => {
    try {
      _activeRepoPath = repoPath;
      indexer.resetIndex(repoPath);

      // Clear indexer cache
      if (indexerProxy.isReady()) {
        try { await indexerProxy.send('clear'); } catch (_) {}
      }

      // Scan files (fast sync — just readdir, no file reads)
      const allFiles = [];
      indexer.walkDir(repoPath, allFiles, repoPath, docignoreUtils);
      const totalFiles = allFiles.length;

      // Upsert repo record
      const repoName = path.basename(repoPath);
      repoDb.upsert(repoPath, repoName, {});

      if (indexerProxy.isReady()) {
        // Send only file paths — indexer handles reading, hashing, parsing, caching
        const onProgress = (data) => {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('symbolIndex:progress', {
              current: data.current, total: data.total, phase: 'indexing', percent: data.percent,
            });
          }
        };
        indexerProxy.onProgress(onProgress);
        try {
          const result = await indexerProxy.send('index:start', { repoPath, files: allFiles });
          // Update repo metadata (lightweight SQLite write)
          const repo = repoDb.getByPath(repoPath);
          if (repo) {
            repoDb.markIndexed(repo.id, totalFiles, result?.totalSymbols || 0);
            db.save();
          }
          // Setup watcher
          watcher.createWatcher(repoPath, (dirtyCount) => {
            invalidateCache(repoPath);
            const w = getMainWindow();
            if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:dirtyChanged', dirtyCount);
          });
          invalidateCache(repoPath);
          return { success: true, totalFiles, symbolCount: result?.totalSymbols || 0 };
        } finally {
          indexerProxy.offProgress(onProgress);
        }
      } else {
        // Fallback: old tree-sitter path
        const result = await indexer.indexRepo(repoPath, docignoreUtils,
          (p) => { const w = getMainWindow(); if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:progress', p); },
          (e) => { const w = getMainWindow(); if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:error', e); }
        );
        const repo = repoDb.getByPath(repoPath);
        if (repo) { repoDb.markIndexed(repo.id, totalFiles, result.symbolCount || 0); db.save(); }
        watcher.createWatcher(repoPath, (dirtyCount) => {
          invalidateCache(repoPath);
          const w = getMainWindow();
          if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:dirtyChanged', dirtyCount);
        });
        invalidateCache(repoPath);
        return { success: true, totalFiles, symbolCount: result.symbolCount || 0 };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getStatus', async (_, repoPath) => {
    try {
      const cached = _statusCache.get(repoPath);
      if (cached) {
        if (cached.exists && cached.indexed) {
          watcher.createWatcher(repoPath, (count) => {
            invalidateCache(repoPath);
            const w = getMainWindow();
            if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:dirtyChanged', count);
          });
        }
        return cached;
      }
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { exists: false };
      const dirtyCount = repo.id ? fileDb.countDirtyByRepo(repo.id) : 0;
      if (repo.id && repo.indexed) {
        watcher.createWatcher(repoPath, (count) => {
          invalidateCache(repoPath);
          const w = getMainWindow();
          if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:dirtyChanged', count);
        });
      }
      const result = { exists: true, indexed: !!repo.indexed, total_files: repo.total_files, total_symbols: repo.total_symbols, last_indexed: repo.last_indexed, dirty_count: dirtyCount };
      _statusCache.set(repoPath, result);
      return result;
    } catch (err) {
      return { exists: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:search', async (_, repoPath, query, limit) => {
    try {
      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('search', { query, limit: limit || 200, offset: 0 });
          if (data && Array.isArray(data.results)) return { results: data.results };
        } catch (_) {}
      }
      return { results: [] };
    } catch (err) {
      return { results: [], error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getDirtyCount', async (_, repoPath) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { count: 0 };
      return { count: fileDb.countDirtyByRepo(repo.id) };
    } catch (err) {
      return { count: 0, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:reindexDirty', async (_, repoPath) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { success: true, totalFiles: 0, symbolCount: 0 };

      const dirtyFiles = fileDb.getDirtyByRepo(repo.id);
      const paths = dirtyFiles.map(df => df.path);

      if (indexerProxy.isReady() && paths.length > 0) {
        const onProgress = (data) => {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('symbolIndex:progress', {
              current: data.current, total: data.total, phase: 'reindex-dirty', percent: data.percent,
            });
          }
        };
        indexerProxy.onProgress(onProgress);
        try {
          const result = await indexerProxy.send('index:files', { repoPath, files: paths });
          // Mark files clean (fast SQLite write)
          for (const df of dirtyFiles) fileDb.markClean(df.id);
          db.save();
          invalidateCache(repoPath);
          return { success: true, totalFiles: paths.length, symbolCount: result?.totalSymbols || 0 };
        } finally {
          indexerProxy.offProgress(onProgress);
        }
      } else {
        // Fallback path
        const result = await indexer.reindexDirty(repoPath, (p) => {
          const w = getMainWindow(); if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:progress', p);
        });
        for (const df of dirtyFiles) fileDb.markClean(df.id);
        db.save();
        invalidateCache(repoPath);
        return { success: true, totalFiles: paths.length, symbolCount: result.symbolCount || 0 };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:reset', async (_, repoPath) => {
    try {
      indexer.resetIndex(repoPath);
      if (indexerProxy.isReady()) try { await indexerProxy.send('clear'); } catch (_) {}
      invalidateCache(repoPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:delete', async (_, repoPath) => {
    try {
      watcher.destroyWatcher(repoPath);
      indexer.deleteIndex(repoPath);
      if (indexerProxy.isReady()) try { await indexerProxy.send('clear'); } catch (_) {}
      invalidateCache(repoPath);
      if (_activeRepoPath === repoPath) _activeRepoPath = null;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:stopWatcher', async (_, repoPath) => {
    watcher.destroyWatcher(repoPath);
    _statusCache.delete(repoPath);
    return { success: true };
  });

  ipcMain.handle('symbolIndex:getManaged', async () => {
    try {
      const repos = repoDb.getAll();
      return { repos };
    } catch (err) {
      return { repos: [], error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getIndexedFileList', async (_, repoPath) => {
    try {
      if (indexerProxy.isReady()) {
        try {
          const result = await indexerProxy.send('getFileList');
          if (result && result.files && result.files.length > 0) {
            const paths = result.files.map(f => ({ path: f.path }));
            _fileListCache.set(repoPath, paths);
            return { files: paths };
          }
        } catch (_) {}
      }
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { files: [] };
      return { files: [] };
    } catch (err) {
      return { files: [], error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getFileSymbols', async (_, repoPath, filePath) => {
    try {
      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('symbols:get', { filePath, limit: 200, offset: 0 });
          if (data && Array.isArray(data.symbols)) return { symbols: data.symbols };
        } catch (_) {}
      }
      return { symbols: [] };
    } catch (err) {
      return { symbols: [], error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getDirtyFiles', async (_, repoPath) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { files: [] };
      const files = fileDb.getDirtyWithSymbols(repo.id);
      return { files };
    } catch (err) {
      return { files: [], error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:reindexFile', async (_, repoPath, filePath) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { success: false, error: 'Repo not found' };

      const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');

      if (indexerProxy.isReady()) {
        await indexerProxy.send('index:files', { repoPath, files: [relPath] });
      } else {
        // Fallback
        const result = await indexer.indexFile(repo.id, repoPath, filePath);
        if (!result || result.error) return { success: false, error: result?.error || 'Reindex failed' };
      }

      const file = fileDb.getByRepoAndPath(repo.id, relPath);
      if (file) fileDb.markClean(file.id);
      db.save();
      invalidateCache(repoPath);
      return { success: true, symbolsCount: 0 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getFileDeps', async (_, repoPath, filePath, mode) => {
    try {
      const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');

      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('getFileDeps', { filePath: relPath, mode: mode || 'file' });
          if (data) {
            const result = { exists: true, file_path: filePath };
            if (mode === 'function') {
              Object.assign(result, { mode: 'function', funcImports: data.funcImports, funcReverse: data.funcReverse });
            } else {
              Object.assign(result, { imports: data.imports, imported_by: data.imported_by });
            }
            return result;
          }
        } catch (_) {}
      }

      // Fallthrough to SQLite
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { exists: false };
      const file = fileDb.getByRepoAndPath(repo.id, relPath);
      if (!file) return { exists: false };

      const imports = importDb.getByFile(file.id);
      const reverseDeps = importDb.getReverseDeps(file.id, repo.id);

      if (mode === 'function') {
        const funcData = buildFuncDeps(file, imports, reverseDeps, repo);
        return { exists: true, file_path: filePath, mode: 'function', ...funcData };
      }

      return {
        exists: true, file_path: filePath,
        imports: imports.map(i => ({ import_path: i.import_path, import_type: i.import_type, line: i.line, resolved: !!i.resolved_file_id, resolved_path: i.resolved_path || null, imported_symbols: i.imported_symbols || [] })),
        imported_by: reverseDeps.map(rd => ({ source_path: rd.source_path, import_path: rd.import_path, import_type: rd.import_type, imported_symbols: rd.imported_symbols || [] })),
      };
    } catch (err) {
      return { exists: false, error: err.message };
    }
  });
}

function buildFuncDeps(file, imports, reverseDeps, repo) {
  const funcImports = [];
  const funcReverse = [];
  for (const imp of imports) {
    if (!imp.resolved_file_id) continue;
    const symbols = imp.imported_symbols || [];
    if (symbols.length === 0) continue;
    const resolvedSymbols = symbolDb.getByFile(imp.resolved_file_id);
    const matched = resolvedSymbols.filter(s => symbols.includes(s.name));
    funcImports.push({
      import_path: imp.import_path, resolved_path: imp.resolved_path || imp.import_path,
      import_type: imp.import_type,
      symbols: matched.length > 0 ? matched.map(s => ({ name: s.name, type: s.type, line: s.line })) : symbols.map(n => ({ name: n, type: 'unknown', line: null })),
    });
  }
  const ourSymbols = symbolDb.getByFile(file.id);
  for (const rd of reverseDeps) {
    const symbols = rd.imported_symbols || [];
    if (symbols.length === 0) {
      funcReverse.push({ source_path: rd.source_path, import_type: rd.import_type, symbols: ourSymbols.map(s => ({ name: s.name, type: s.type, line: s.line })) });
    } else {
      const matched = ourSymbols.filter(s => symbols.includes(s.name));
      funcReverse.push({ source_path: rd.source_path, import_type: rd.import_type, symbols: matched.length > 0 ? matched.map(s => ({ name: s.name, type: s.type, line: s.line })) : symbols.map(n => ({ name: n, type: 'unknown', line: null })) });
    }
  }
  return { funcImports, funcReverse };
}

module.exports = { register };
