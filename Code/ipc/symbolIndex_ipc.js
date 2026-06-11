const { ipcMain } = require('electron');
const fs = require('fs');
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
let _ripgrep = null;

// Main-process caches
const _fileListCache = new Map();
const _fileSymbolsCache = new Map();
const _searchCache = new Map();
const _SEARCH_CACHE_MAX = 20;
const _statusCache = new Map();

function _safeFilename(repoPath) {
  return 'si-cache-' + Buffer.from(repoPath).toString('base64').replace(/[/+=]/g, '_');
}

function _tsvPath(repoPath) {
  return path.join(_userDataPath, _safeFilename(repoPath) + '.tsv');
}

function _ensureSymbolTsv(repoPath) {
  const tsv = _tsvPath(repoPath);
  if (fs.existsSync(tsv)) return tsv;

  const repo = repoDb.getByPath(repoPath);
  if (!repo || !repo.indexed) return null;

  const symbols = symbolDb.getAllByRepo(repo.id);
  if (symbols.length === 0) return null;

  const lines = symbols.map(s =>
    [s.name || '', s.type || '', s.file_path || '', s.line || 0, s.signature || '', s.class_name || ''].join('\t')
  ).join('\n');
  if (lines) fs.writeFileSync(tsv, lines, 'utf8');
  return lines ? tsv : null;
}

function _parseTsvLines(text) {
  if (!text) return [];
  return text.split('\n').filter(Boolean).map(line => {
    const parts = line.split('\t');
    if (parts.length < 4) return null;
    return {
      name: parts[0],
      type: parts[1],
      file_path: parts[2],
      line: parseInt(parts[3], 10) || 0,
      signature: parts[4] || undefined,
      class_name: parts[5] || undefined,
    };
  }).filter(Boolean);
}

function _invalidateTsv(repoPath) {
  try {
    const tsv = _tsvPath(repoPath);
    if (fs.existsSync(tsv)) fs.unlinkSync(tsv);
  } catch (err) {
    // silent
  }
}

function invalidateCache(repoPath) {
  _statusCache.delete(repoPath);
  _fileListCache.delete(repoPath);
  for (const key of _fileSymbolsCache.keys()) {
    if (key.startsWith(repoPath + '::')) {
      _fileSymbolsCache.delete(key);
    }
  }
  _searchCache.clear();
  if (_userDataPath) _invalidateTsv(repoPath);
}

async function register({ app, docignoreUtils, getMainWindow }) {
  _getMainWindow = getMainWindow;
  _userDataPath = app.getPath('userData');
  _ripgrep = (await import('ripgrep')).ripgrep;

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

      // Also clear indexer service cache
      if (indexerProxy.isReady()) {
        try { await indexerProxy.send('clear'); } catch (_) {}
      }

      // Scan files (fast sync — I/O only, no parsing)
      const allFiles = [];
      indexer.walkDir(repoPath, allFiles, repoPath, docignoreUtils);
      const totalFiles = allFiles.length;
      let symbolCount = 0;

      if (indexerProxy.isReady()) {
        // === INDEXER SERVICE PATH (child process does ALL parsing) ===
        const BATCH_SIZE = 20;
        let indexedCount = 0;
        let lastReportedPct = -1;

        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
          const batch = allFiles.slice(i, i + BATCH_SIZE);

          // Read batch files in parallel (async I/O — non-blocking)
          const fileResults = await Promise.allSettled(batch.map(async (relPath) => {
            const fullPath = path.join(repoPath, relPath);
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            return { filePath: relPath, content };
          }));
          const files = fileResults.filter(r => r.status === 'fulfilled').map(r => r.value);

          // Send to indexer child process for regex-based parsing
          if (files.length > 0) {
            try {
              const result = await indexerProxy.send('indexFiles', { files });
              if (result && result.totalSymbols) symbolCount += result.totalSymbols;
            } catch (_) {}
          }

          indexedCount += batch.length;
          const pct = Math.round((indexedCount / totalFiles) * 100);
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send('symbolIndex:progress', {
                current: indexedCount, total: totalFiles, phase: 'indexing', percent: pct,
              });
            }
          }
        }
      } else {
        // === FALLBACK: old tree-sitter path (kept for compatibility) ===
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
        symbolCount = result.symbolCount || 0;
      }

      // Common: setup watcher, update metadata
      watcher.createWatcher(repoPath, (dirtyCount) => {
        invalidateCache(repoPath);
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('symbolIndex:dirtyChanged', dirtyCount);
        }
      });

      const repo = repoDb.getByPath(repoPath);
      if (repo) {
        repoDb.markIndexed(repo.id, totalFiles, symbolCount);
        db.save();
      }

      invalidateCache(repoPath);
      return { success: true, totalFiles, symbolCount };
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
            if (w && !w.isDestroyed()) {
              w.webContents.send('symbolIndex:dirtyChanged', count);
            }
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
          if (w && !w.isDestroyed()) {
            w.webContents.send('symbolIndex:dirtyChanged', count);
          }
        });
      }

      const result = {
        exists: true,
        indexed: !!repo.indexed,
        total_files: repo.total_files,
        total_symbols: repo.total_symbols,
        last_indexed: repo.last_indexed,
        dirty_count: dirtyCount,
      };
      _statusCache.set(repoPath, result);
      return result;
    } catch (err) {
      return { exists: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:search', async (_, repoPath, query, limit) => {
    try {
      // Try indexer service first (decoupled path)
      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('search', { query, limit: limit || 200, offset: 0 });
          if (data && Array.isArray(data.results)) {
            return { results: data.results };
          }
        } catch (_) {
          // Indexer failed, fall through
        }
      }

      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { results: [] };

      const cacheKey = repoPath + '::' + query + '::' + (limit || 200);
      const cached = _searchCache.get(cacheKey);
      if (cached) {
        _searchCache.delete(cacheKey);
        _searchCache.set(cacheKey, cached);
        return { results: cached };
      }

      const tsv = _ensureSymbolTsv(repoPath);
      if (!tsv) return { results: [] };

      const args = ['-i', '-N', '--color', 'never', '--no-heading'];
      if (limit) args.push('-m', String(limit));
      args.push(query, tsv);

      const { stdout } = await _ripgrep(args, { buffer: true });
      const results = _parseTsvLines(stdout);

      if (_searchCache.size >= _SEARCH_CACHE_MAX) {
        const firstKey = _searchCache.keys().next().value;
        _searchCache.delete(firstKey);
      }
      _searchCache.set(cacheKey, results);
      return { results };
    } catch (err) {
      // If ripgrep fails (e.g. WASM compile), fall back to SQL search
      try {
        const repo2 = repoDb.getByPath(repoPath);
        if (!repo2) return { results: [] };
        const all = symbolDb.getAllByRepo(repo2.id);
        const lower = query.toLowerCase();
        const results = all.filter(s => s.name.toLowerCase().includes(lower)).slice(0, limit || 200);
        return { results };
      } catch (err2) {
        return { results: [], error: err2.message };
      }
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
      let symbolCount = 0;

      if (indexerProxy.isReady()) {
        // === INDEXER SERVICE PATH ===
        const BATCH_SIZE = 20;
        let lastReportedPct = -1;

        for (let i = 0; i < dirtyFiles.length; i += BATCH_SIZE) {
          const batch = dirtyFiles.slice(i, i + BATCH_SIZE);

          const fileResults = await Promise.allSettled(batch.map(async (df) => {
            const fullPath = path.join(repoPath, df.path);
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            return { filePath: df.path, content };
          }));
          const files = fileResults.filter(r => r.status === 'fulfilled').map(r => r.value);

          if (files.length > 0) {
            try {
              const result = await indexerProxy.send('indexFiles', { files });
              if (result && result.totalSymbols) symbolCount += result.totalSymbols;
            } catch (_) {}
          }

          for (const df of batch) fileDb.markClean(df.id);

          const done = Math.min(i + BATCH_SIZE, dirtyFiles.length);
          const pct = Math.round((done / dirtyFiles.length) * 100);
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send('symbolIndex:progress', {
                current: done, total: dirtyFiles.length, phase: 'reindex-dirty', percent: pct,
              });
            }
          }
        }
        db.save();
      } else {
        // === FALLBACK: old tree-sitter path ===
        const result = await indexer.reindexDirty(repoPath, (progress) => {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('symbolIndex:progress', progress);
          }
        });
        symbolCount = result.symbolCount || 0;
      }

      invalidateCache(repoPath);
      return { success: true, totalFiles: dirtyFiles.length, symbolCount };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:reset', async (_, repoPath) => {
    try {
      indexer.resetIndex(repoPath);
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
      if (indexerProxy.isReady()) {
        try {
          const result = await indexerProxy.send('getFileList');
          if (result && result.files && result.files.length > 0) {
            const files = result.files.map(f => ({ ...f, language: _detectLang(f.path) }));
            _fileListCache.set(repoPath, files);
            return { files };
          }
        } catch (_) {}
      }
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { files: [] };
      const files = symbolDb.getByRepoGrouped(repo.id);
      return { files };
    } catch (err) {
      return { files: [], error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getIndexedFileList', async (_, repoPath) => {
    try {
      if (indexerProxy.isReady()) {
        try {
          const result = await indexerProxy.send('getFileList');
          if (result && result.files && result.files.length > 0) {
            const files = result.files.map(f => ({ ...f, language: _detectLang(f.path) }));
            _fileListCache.set(repoPath, files);
            return { files };
          }
        } catch (_) {}
      }
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { files: [] };
      const cached = _fileListCache.get(repoPath);
      if (cached) return { files: cached };
      const files = symbolDb.getByRepoGroupedLight(repo.id);
      _fileListCache.set(repoPath, files);
      return { files };
    } catch (err) {
      return { files: [], error: err.message };
    }
  });

  function _detectLang(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = { '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.ts': 'typescript', '.tsx': 'tsx', '.py': 'python', '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'css', '.less': 'css' };
    return map[ext] || '';
  }

  ipcMain.handle('symbolIndex:getFileSymbols', async (_, repoPath, filePath) => {
    try {
      // Try indexer service first (decoupled path)
      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('symbols:get', { filePath, limit: 200, offset: 0 });
          if (data && Array.isArray(data.symbols)) {
            return { symbols: data.symbols };
          }
        } catch (_) {
          // Indexer failed, fall through to main-process path
        }
      }

      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { symbols: [] };

      const cacheKey = repoPath + '::' + filePath;
      const cached = _fileSymbolsCache.get(cacheKey);
      if (cached) {
        _fileSymbolsCache.delete(cacheKey);
        _fileSymbolsCache.set(cacheKey, cached);
        return { symbols: cached };
      }

      // Try TSV via ripgrep (fast file_path match)
      const tsv = _ensureSymbolTsv(repoPath);
      if (tsv) {
        const args = ['-F', '-N', '--color', 'never', '--no-heading', '-m', '500', filePath, tsv];
        const { stdout } = await _ripgrep(args, { buffer: true });
        const symbols = _parseTsvLines(stdout).filter(s => s.file_path === filePath);
        _fileSymbolsCache.set(cacheKey, symbols);
        if (_fileSymbolsCache.size > 50) {
          const firstKey = _fileSymbolsCache.keys().next().value;
          _fileSymbolsCache.delete(firstKey);
        }
        return { symbols };
      }

      // Fallback to SQL
      const symbols = symbolDb.getByRepoAndFile(repo.id, filePath);
      _fileSymbolsCache.set(cacheKey, symbols);
      if (_fileSymbolsCache.size > 50) {
        const firstKey = _fileSymbolsCache.keys().next().value;
        _fileSymbolsCache.delete(firstKey);
      }
      return { symbols };
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
      let symbolsCount = 0;

      if (indexerProxy.isReady()) {
        // === INDEXER SERVICE PATH ===
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const result = await indexerProxy.send('indexFile', { filePath: relPath, content });
        symbolsCount = result?.symbols || 0;
      } else {
        // === FALLBACK: old tree-sitter path ===
        const result = await indexer.indexFile(repo.id, repoPath, filePath);
        symbolsCount = result?.symbolsCount || 0;
      }

      const file = fileDb.getByRepoAndPath(repo.id, relPath);
      if (file) fileDb.markClean(file.id);
      db.save();
      invalidateCache(repoPath);
      return { success: true, symbolsCount };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getFileDeps', async (_, repoPath, filePath, mode) => {
    try {
      const repo = repoDb.getByPath(repoPath);
      if (!repo) return { exists: false };
      const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');
      const file = fileDb.getByRepoAndPath(repo.id, relPath);
      if (!file) return { exists: false };

      const imports = importDb.getByFile(file.id);
      const reverseDeps = importDb.getReverseDeps(file.id, repo.id);

      if (mode === 'function') {
        const funcData = buildFuncDeps(file, imports, reverseDeps, repo);
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

ipcMain.handle('symbolIndex:proxyIndexFile', async (_, repoPath, filePath) => {
    try {
      if (!indexerProxy.isReady()) return { success: false, error: 'Indexer not ready' };
      const absPath = path.join(repoPath, filePath);
      const content = fs.readFileSync(absPath, 'utf-8');
      const result = await indexerProxy.send('indexFile', { filePath, content });
      return { success: true, symbols: result?.symbols || 0, imports: result?.imports || 0 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

ipcMain.handle('symbolIndex:proxySearch', async (_, query, limit) => {
    try {
      if (!indexerProxy.isReady()) return { results: [], error: 'Indexer not ready' };
      const data = await indexerProxy.send('search', { query, limit: limit || 200, offset: 0 });
      return { results: data?.results || [], total: data?.total || 0 };
    } catch (err) {
      return { results: [], error: err.message };
    }
  });

ipcMain.handle('symbolIndex:proxyGetSymbols', async (_, filePath) => {
    try {
      if (!indexerProxy.isReady()) return { symbols: [], error: 'Indexer not ready' };
      const data = await indexerProxy.send('symbols:get', { filePath, limit: 200, offset: 0 });
      return { symbols: data?.symbols || [], total: data?.total || 0 };
    } catch (err) {
      return { symbols: [], error: err.message };
    }
  });

ipcMain.handle('symbolIndex:proxyIndexBatch', async (_, files) => {
    try {
      if (!indexerProxy.isReady()) return { success: false, error: 'Indexer not ready' };
      const indexed = [];
      for (const { filePath, repoPath } of files) {
        const absPath = path.join(repoPath, filePath);
        const content = fs.readFileSync(absPath, 'utf-8');
        indexed.push({ filePath, content });
      }
      const result = await indexerProxy.send('indexFiles', { files: indexed });
      return { success: true, indexed: result?.indexed || 0, total: result?.total || files.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

module.exports = { register };
