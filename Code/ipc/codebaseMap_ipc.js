const { ipcMain } = require('electron');
const repositories = require('../database/repositories');
const indexedFiles = require('../database/indexedFiles');
const symbols = require('../database/symbols');
const imports = require('../database/imports');
const indexerProxy = require('./indexerProxy');
const { buildCodebaseMap } = require('../database/codebaseMap');

async function _tryProxy(repoPath) {
  if (!indexerProxy.isReady()) return null;
  try {
    const data = await indexerProxy.send('db:getCodebaseMapData', { repoPath });
    if (!data) return null;
    return { files: data.files || [], symbols: data.symbols || [], imports: data.imports || [], repoPath };
  } catch (err) {
    console.error('[CodebaseMap] proxy query failed:', err?.message);
    return null;
  }
}

function _tryMainDb(repoPath) {
  const repo = repositories.getByPath(repoPath);
  if (!repo) return null;
  return {
    files: indexedFiles.getByRepo(repo.id),
    symbols: symbols.getAllByRepo(repo.id),
    imports: imports.getAllByRepo(repo.id),
    repoPath,
  };
}

function register() {
  ipcMain.handle('codebaseMap:generate', async (_, { repoPath }) => {
    try {
      const data = (await _tryProxy(repoPath)) || _tryMainDb(repoPath);
      if (!data) return { error: 'Repository not found' };
      return buildCodebaseMap(data);
    } catch (err) {
      console.error('[CodebaseMap] generate error:', err);
      return { error: err.message };
    }
  });
}

module.exports = { register };
