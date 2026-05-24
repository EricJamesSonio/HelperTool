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

let _getMainWindow = null;
let _activeRepoPath = null;

function register({ app, docignoreUtils, getMainWindow }) {
  _getMainWindow = getMainWindow;

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
      return {
        indexed: !!repo.indexed,
        total_files: repo.total_files,
        total_symbols: repo.total_symbols,
        last_indexed: repo.last_indexed,
      };
    } catch (err) {
      return { indexed: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:startIndexing', async (_, repoPath) => {
    try {
      _activeRepoPath = repoPath;
      indexer.resetIndex(repoPath);
      const result = await indexer.indexRepo(repoPath, docignoreUtils, (progress) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('symbolIndex:progress', progress);
        }
      }, (errorMsg) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('symbolIndex:error', errorMsg);
        }
      });

      watcher.createWatcher(repoPath, (dirtyCount) => {
        console.log('[SI IPC] indexing watcher dirty changed:', dirtyCount);
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('symbolIndex:dirtyChanged', dirtyCount);
        }
      });

      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getStatus', async (_, repoPath) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { exists: false };
      const dirtyCount = repo.id ? fileDb.countDirtyByRepo(repo.id) : 0;

      // Start the watcher if the repo is indexed
      if (repo.id && repo.indexed) {
        console.log('[SI IPC] Starting watcher for:', repoPath);
        watcher.createWatcher(repoPath, (count) => {
          const w = getMainWindow();
          if (w && !w.isDestroyed()) {
            console.log('[SI IPC] Sending dirtyChanged:', count);
            w.webContents.send('symbolIndex:dirtyChanged', count);
          } else {
            console.log('[SI IPC] Main window not available, dirty:', count);
          }
        });
      }

      return {
        exists: true,
        indexed: !!repo.indexed,
        total_files: repo.total_files,
        total_symbols: repo.total_symbols,
        last_indexed: repo.last_indexed,
        dirty_count: dirtyCount,
      };
    } catch (err) {
      return { exists: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:search', async (_, repoPath, query, limit) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { results: [] };
      const results = symbolDb.search(repo.id, query, limit || 20);
      return { results };
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
      const result = await indexer.reindexDirty(repoPath, (progress) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('symbolIndex:progress', progress);
        }
      });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:reset', async (_, repoPath) => {
    try {
      indexer.resetIndex(repoPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:delete', async (_, repoPath) => {
    try {
      watcher.destroyWatcher(repoPath);
      indexer.deleteIndex(repoPath);
      if (_activeRepoPath === repoPath) _activeRepoPath = null;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:stopWatcher', async (_, repoPath) => {
    watcher.destroyWatcher(repoPath);
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

  ipcMain.handle('symbolIndex:getSymbolTypes', async (_, repoPath) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { types: {} };
      const types = symbolDb.countByType(repo.id);
      return { types };
    } catch (err) {
      return { types: {}, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getIndexedFiles', async (_, repoPath) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { files: [] };
      const files = symbolDb.getByRepoGrouped(repo.id);
      return { files };
    } catch (err) {
      return { files: [], error: err.message };
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
      const result = await indexer.indexFile(repo.id, repoPath, filePath);
      if (result && !result.error) {
      const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
      const file = fileDb.getByRepoAndPath(repo.id, relPath);
        if (file) fileDb.markClean(file.id);
        db.save();
        return { success: true, symbolsCount: result.symbolsCount };
      }
      return { success: false, error: result?.error || 'Reindex failed' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getFileDeps', async (_, repoPath, filePath, mode) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) {
        console.log('[SI IPC] getFileDeps: repo not found for', repoPath);
        return { exists: false };
      }
      const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
      console.log('[SI IPC] getFileDeps: absolutePath=%s relPath=%s', filePath, relPath);
      const file = fileDb.getByRepoAndPath(repo.id, relPath);
      if (!file) {
        console.log('[SI IPC] getFileDeps: file not found in DB:', relPath);
        return { exists: false };
      }
      console.log('[SI IPC] getFileDeps: found file id=%s path=%s', file.id, file.path);

      const imports = importDb.getByFile(file.id);
      const reverseDeps = importDb.getReverseDeps(file.id, repo.id);

      console.log('[SI IPC] getFileDeps: imports=%d reverseDeps=%d', imports.length, reverseDeps.length);

      // For function mode, return symbol-level cross-refs
      if (mode === 'function') {
        const funcData = buildFuncDeps(file, imports, reverseDeps, repo);
        console.log('[SI IPC] getFileDeps: funcImports=%d funcReverse=%d',
          funcData.funcImports.length, funcData.funcReverse.length);
        return {
          exists: true,
          file_path: filePath,
          mode: 'function',
          ...funcData,
        };
      }

      // File mode (default)
      const enrichedImports = imports.map(imp => ({
        import_path: imp.import_path,
        import_type: imp.import_type,
        line: imp.line,
        resolved: !!imp.resolved_file_id,
        resolved_path: imp.resolved_path || null,
        imported_symbols: imp.imported_symbols || [],
      }));

      const enrichedReverse = reverseDeps.map(rd => ({
        source_path: rd.source_path,
        import_path: rd.import_path,
        import_type: rd.import_type,
        imported_symbols: rd.imported_symbols || [],
      }));

      return {
        exists: true,
        file_path: filePath,
        imports: enrichedImports,
        imported_by: enrichedReverse,
      };
    } catch (err) {
      return { exists: false, error: err.message };
    }
  });
}

function buildFuncDeps(file, imports, reverseDeps, repo) {
  const funcImports = [];
  const funcReverse = [];

  // For each resolved import, look up which symbols from the target are used
  for (const imp of imports) {
    if (!imp.resolved_file_id) continue;
    const symbols = imp.imported_symbols || [];
    if (symbols.length === 0) continue;

    // Get the symbol details from the resolved file
    const resolvedSymbols = symbolDb.getByFile(imp.resolved_file_id);
    const matched = resolvedSymbols.filter(s => symbols.includes(s.name));
    funcImports.push({
      import_path: imp.import_path,
      resolved_path: imp.resolved_path || imp.import_path,
      import_type: imp.import_type,
      symbols: matched.length > 0
        ? matched.map(s => ({ name: s.name, type: s.type, line: s.line }))
        : symbols.map(n => ({ name: n, type: 'unknown', line: null })),
    });
  }

  // Reverse: for each file that imports this file, get which symbols of ours they use
  const ourSymbols = symbolDb.getByFile(file.id);
  const ourSymbolNames = new Set(ourSymbols.map(s => s.name));

  for (const rd of reverseDeps) {
    const symbols = rd.imported_symbols || [];
    if (symbols.length === 0) {
      // If no specific symbols imported, show all our exports
      funcReverse.push({
        source_path: rd.source_path,
        import_type: rd.import_type,
        symbols: ourSymbols.map(s => ({ name: s.name, type: s.type, line: s.line })),
      });
    } else {
      const matched = ourSymbols.filter(s => symbols.includes(s.name));
      funcReverse.push({
        source_path: rd.source_path,
        import_type: rd.import_type,
        symbols: matched.length > 0
          ? matched.map(s => ({ name: s.name, type: s.type, line: s.line }))
          : symbols.map(n => ({ name: n, type: 'unknown', line: null })),
      });
    }
  }

  return { funcImports, funcReverse };
}

module.exports = { register };
