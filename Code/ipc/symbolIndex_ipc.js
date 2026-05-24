const { ipcMain } = require('electron');
const path = require('path');
const db = require('../database/db');
const repoDb = require('../database/repositories');
const fileDb = require('../database/indexedFiles');
const symbolDb = require('../database/symbols');
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
}

module.exports = { register };
