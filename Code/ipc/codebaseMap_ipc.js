const { ipcMain } = require('electron');
const { buildCodebaseMap } = require('../database/codebaseMap');
const { buildFlowGraph } = require('../database/codebaseFlow');
const symbolsJson = require('../database/symbolsJsonLoader');

function register() {
  ipcMain.handle('codebaseMap:generate', async (_, opts) => {
    const repoPath = opts && opts.repoPath;
    const wantGraph = !!(opts && opts.graph);
    try {
      const data = symbolsJson.getForCodebaseMap(repoPath);
      if (!data) return { error: 'Repository not found. Make sure indexing is complete and symbols.json is available.' };
      if (wantGraph) {
        return buildFlowGraph({
          files: data.files,
          symbols: data.symbols,
          imports: data.imports,
          repoPath: data.repoPath || repoPath,
        });
      }
      return buildCodebaseMap(data);
    } catch (err) {
      console.error('[CodebaseMap] generate error:', err);
      return { error: err.message };
    }
  });
}

module.exports = { register };




