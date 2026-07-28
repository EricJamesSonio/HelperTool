const { ipcMain } = require('electron');
const { runHarness } = require('../harness/loop');
const { discover } = require('./opencode_ipc');

function register({ getMainWindow }) {
  ipcMain.handle('harness:checkStatus', async () => {
    const { binaryPath, version } = await discover();
    return {
      found: binaryPath !== 'opencode',
      binaryPath,
      version,
    };
  });

  ipcMain.handle('harness:run', async (event, config) => {
    const win = getMainWindow();

    const send = (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('harness:event', data);
      }
    };

    try {
      await runHarness(config, send);
    } catch (err) {
      send({ type: 'log', attempt: 0, message: `[Error] ${err.message}` });
      send({ type: 'final', success: false, attempts: 0, output: '', error: err.message });
    }
  });

  ipcMain.handle('harness:stop', async () => {});
}

module.exports = { register };