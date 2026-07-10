const { ipcMain } = require('electron');
const { buildCodebaseMap } = require('../database/codebaseMap');
const symbolsJson = require('../database/symbolsJsonLoader');

function register() {
  ipcMain.handle('codebaseMap:generate', async (_, { repoPath }) => {
    try {
      const data = symbolsJson.getForCodebaseMap(repoPath);
      if (!data) return { error: 'Repository not found. Make sure indexing is complete and symbols.json is available.' };
      return buildCodebaseMap(data);
    } catch (err) {
      console.error('[CodebaseMap] generate error:', err);
      return { error: err.message };
    }
  });
}

module.exports = { register };
