const { ipcMain } = require('electron');
const path = require('path');
const parser = require('../indexer/parser');
const indexer = require('../indexer/indexer');
const watcher = require('../indexer/watcher');
const indexerProxy = require('./indexerProxy.js');

let _getMainWindow = null;
let _activeRepoPath = null;
let _userDataPath = null;

const _statusCache = new Map();

function invalidateCache(repoPath) {
  _statusCache.delete(repoPath);
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
      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('db:checkRepo', { repoPath });
          if (data) return data;
        } catch (_) {}
      }
      return { indexed: false };
    } catch (err) {
      return { indexed: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:startIndexing', async (_, repoPath) => {
    try {
      _activeRepoPath = repoPath;
      indexer.resetIndex(repoPath);

      if (indexerProxy.isReady()) {
        try { await indexerProxy.send('clear'); } catch (_) {}
      }

      const allFiles = [];
      indexer.walkDir(repoPath, allFiles, repoPath, docignoreUtils);
      const totalFiles = allFiles.length;

      const repoName = path.basename(repoPath);
      let repoId = null;
      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('db:upsertRepo', { repoPath, name: repoName, config: {} });
          repoId = data?.repo_id;
        } catch (_) {}
      }

      if (indexerProxy.isReady()) {
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
          if (repoId && result) {
            try { await indexerProxy.send('db:markIndexed', { repoId, totalFiles, totalSymbols: result.totalSymbols || 0 }); } catch (_) {}
          }
          watcher.createWatcher(repoPath, (repoPath, relPath) => {
            if (indexerProxy.isReady()) {
              indexerProxy.send('db:markDirty', { repoPath, filePath: relPath }).then(data => {
                const count = data?.dirty_count ?? 0;
                invalidateCache(repoPath);
                const w = getMainWindow();
                if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:dirtyChanged', count);
              }).catch(() => {});
            }
          });
          invalidateCache(repoPath);
          return { success: true, totalFiles, symbolCount: result?.totalSymbols || 0 };
        } finally {
          indexerProxy.offProgress(onProgress);
        }
      } else {
        const result = await indexer.indexRepo(repoPath, docignoreUtils,
          (p) => { const w = getMainWindow(); if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:progress', p); },
          (e) => { const w = getMainWindow(); if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:error', e); }
        );
        if (repoId && result) {
          try { await indexerProxy.send('db:markIndexed', { repoId, totalFiles, totalSymbols: result.symbolCount || 0 }); } catch (_) {}
        }
        watcher.createWatcher(repoPath, (repoPath, relPath) => {
          if (indexerProxy.isReady()) {
            indexerProxy.send('db:markDirty', { repoPath, filePath: relPath }).then(data => {
              const count = data?.dirty_count ?? 0;
              invalidateCache(repoPath);
              const w = getMainWindow();
              if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:dirtyChanged', count);
            }).catch(() => {});
          }
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
          watcher.createWatcher(repoPath, (repoPath, relPath) => {
            if (indexerProxy.isReady()) {
              indexerProxy.send('db:markDirty', { repoPath, filePath: relPath }).then(data => {
                const count = data?.dirty_count ?? 0;
                invalidateCache(repoPath);
                const w = getMainWindow();
                if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:dirtyChanged', count);
              }).catch(() => {});
            }
          });
        }
        return cached;
      }

      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('db:getStatus', { repoPath });
          if (data) {
            if (data.exists && data.indexed) {
              watcher.createWatcher(repoPath, (repoPath, relPath) => {
                if (indexerProxy.isReady()) {
                  indexerProxy.send('db:markDirty', { repoPath, filePath: relPath }).then(data => {
                    const count = data?.dirty_count ?? 0;
                    invalidateCache(repoPath);
                    const w = getMainWindow();
                    if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:dirtyChanged', count);
                  }).catch(() => {});
                }
              });
            }
            _statusCache.set(repoPath, data);
            return data;
          }
        } catch (_) {}
      }

      return { exists: false };
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
      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('db:getStatus', { repoPath });
          if (data) return { count: data.dirty_count || 0 };
        } catch (_) {}
      }
      return { count: 0 };
    } catch (err) {
      return { count: 0, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:reindexDirty', async (_, repoPath) => {
    try {
      let repoId = null;
      if (indexerProxy.isReady()) {
        try {
          const status = await indexerProxy.send('db:getStatus', { repoPath });
          if (status && status.exists) repoId = status.repo_id;
        } catch (_) {}
      }
      if (!repoId) return { success: true, totalFiles: 0, symbolCount: 0 };

      let dirtyFiles = [];
      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('db:getDirtyFiles', { repoId });
          dirtyFiles = data?.files || [];
        } catch (_) {}
      }
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
          if (dirtyFiles.length > 0) {
            try { await indexerProxy.send('db:markClean', { ids: dirtyFiles.map(df => df.id) }); } catch (_) {}
          }
          invalidateCache(repoPath);
          return { success: true, totalFiles: paths.length, symbolCount: result?.totalSymbols || 0 };
        } finally {
          indexerProxy.offProgress(onProgress);
        }
      } else {
        const result = await indexer.reindexDirty(repoPath, (p) => {
          const w = getMainWindow(); if (w && !w.isDestroyed()) w.webContents.send('symbolIndex:progress', p);
        });
        if (dirtyFiles.length > 0) {
          try { await indexerProxy.send('db:markClean', { ids: dirtyFiles.map(df => df.id) }); } catch (_) {}
        }
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
      if (indexerProxy.isReady()) {
        try { await indexerProxy.send('clear'); } catch (_) {}
        try { await indexerProxy.send('db:reset', { repoPath }); } catch (_) {}
      }
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
      if (indexerProxy.isReady()) {
        try { await indexerProxy.send('clear'); } catch (_) {}
        try { await indexerProxy.send('db:delete', { repoPath }); } catch (_) {}
      }
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
      if (indexerProxy.isReady()) {
        try {
          const data = await indexerProxy.send('db:getManaged');
          if (data && data.repos) {
            const repos = Object.entries(data.repos).map(([repoPath, id]) => ({ repo_path: repoPath, id }));
            return { repos };
          }
        } catch (_) {}
      }
      return { repos: [] };
    } catch (err) {
      return { repos: [], error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getIndexedFileList', async (_, repoPath, limit, offset) => {
    try {
      if (indexerProxy.isReady()) {
        try {
          const result = await indexerProxy.send('db:getFileList', { repoPath, limit: limit || 50, offset: offset || 0 });
          if (result && result.files) return result;
        } catch (_) {}
      }
      return { files: [], total: 0 };
    } catch (err) {
      return { files: [], error: err.message, total: 0 };
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
      if (indexerProxy.isReady()) {
        try {
          const status = await indexerProxy.send('db:getStatus', { repoPath });
          if (status && status.repo_id) {
            const data = await indexerProxy.send('db:getDirtyFiles', { repoId: status.repo_id });
            if (data) return { files: data.files || [] };
          }
        } catch (_) {}
      }
      return { files: [] };
    } catch (err) {
      return { files: [], error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:reindexFile', async (_, repoPath, filePath) => {
    try {
      const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');

      if (indexerProxy.isReady()) {
        try {
          const result = await indexerProxy.send('db:reindexFile', { repoPath, filePath: relPath });
          if (result && result.ok !== false) {
            invalidateCache(repoPath);
            return { success: true, symbolsCount: result.symbols || 0 };
          }
        } catch (_) {}
      }

      return { success: false, error: 'Indexer not available' };
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

        try {
          const dbData = await indexerProxy.send('db:getFileDeps', { repoPath, filePath: relPath, mode: mode || 'file' });
          if (dbData && (dbData.imports?.length || dbData.imported_by?.length)) {
            const result = { exists: true, file_path: filePath };
            if (mode === 'function') {
              Object.assign(result, { mode: 'function', funcImports: dbData.funcImports || [], funcReverse: dbData.funcReverse || [] });
            } else {
              Object.assign(result, { imports: dbData.imports || [], imported_by: dbData.imported_by || [] });
            }
            return result;
          }
        } catch (_) {}
      }

      return { exists: false };
    } catch (err) {
      return { exists: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:proxyIndexFile', async (_, repoPath, filePath) => {
    try {
      if (indexerProxy.isReady()) {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath);
        const relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/');
        try {
          const content = require('fs').readFileSync(fullPath, 'utf-8');
          const result = await indexerProxy.send('indexFile', { filePath: relPath, content });
          if (result) {
            try { await indexerProxy.send('db:insertFile', { repoPath, filePath: relPath }); } catch (_) {}
            try { await indexerProxy.send('db:markDirty', { repoPath, filePath: relPath }); } catch (_) {}
            invalidateCache(repoPath);
          }
          return { success: true, symbolsCount: result?.symbols || 0 };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
      return { success: false, error: 'Indexer not available' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:proxySearch', async (_, query, limit) => {
    try {
      if (indexerProxy.isReady()) {
        const data = await indexerProxy.send('search', { query, limit: limit || 200, offset: 0 });
        if (data && Array.isArray(data.results)) return { results: data.results };
      }
      return { results: [] };
    } catch (err) {
      return { results: [], error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:proxyGetSymbols', async (_, filePath) => {
    try {
      if (indexerProxy.isReady()) {
        const data = await indexerProxy.send('symbols:get', { filePath, limit: 200, offset: 0 });
        if (data && Array.isArray(data.symbols)) return { symbols: data.symbols };
      }
      return { symbols: [] };
    } catch (err) {
      return { symbols: [], error: err.message };
    }
  });

  ipcMain.handle('symbolIndex:getSymbolTypes', async (_, repoPath) => {
    try {
      if (indexerProxy.isReady()) {
        try {
          const status = await indexerProxy.send('db:getStatus', { repoPath });
          if (status && status.repo_id) {
            const data = await indexerProxy.send('db:getSymbolTypes', { repoId: status.repo_id });
            if (data) return { types: data.types || [] };
          }
        } catch (_) {}
      }
      return { types: [] };
    } catch (err) {
      return { types: [], error: err.message };
    }
  });
}

module.exports = { register };
