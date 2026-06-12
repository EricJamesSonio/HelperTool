const { ipcMain, shell } = require('electron');
const fs = require('fs');
const workerProxy = require('./workerProxy.js');

function register({ docignoreUtils }) {
  ipcMain.handle('loc:scan', async (event, { rootPath, threshold, mode }) => {
    try {
      if (!rootPath || !fs.existsSync(rootPath)) {
        return { success: false, error: 'Invalid directory path.' };
      }
      const ignoreRules = await docignoreUtils.getIgnoreRules(rootPath);
      return await workerProxy.send('loc:scan', { rootPath, threshold, mode, ignoreRules });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('loc:openFile', async (event, filePath) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
