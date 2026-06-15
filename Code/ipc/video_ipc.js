const { ipcMain, dialog } = require('electron');
const workerProxy = require('./workerProxy.js');

function register({ getMainWindow }) {
  ipcMain.handle('video:pickFile', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Video File',
      filters: [
        { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('video:pickOutputFolder', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Output Folder',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('video:revealFile', async (event, { filePath }) => {
    const { shell } = require('electron');
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  ipcMain.handle('video:getMetadata', async (event, { inputPath }) => {
    try {
      const result = await workerProxy.send('video:compress', { inputPath, metadataOnly: true });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('video:compress', async (event, payload) => {
    const win = getMainWindow();
    try {
      const progressHandler = (progress) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('video:progress', progress);
        }
      };
      workerProxy.onProgress(progressHandler);
      const result = await workerProxy.send('video:compress', payload);
      workerProxy.offProgress(progressHandler);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── GIF ──

  ipcMain.handle('video:gif', async (event, payload) => {
    const win = getMainWindow();
    try {
      const progressHandler = (progress) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('video:gifProgress', progress);
        }
      };
      workerProxy.onProgress(progressHandler);
      const result = await workerProxy.send('video:gif', payload);
      workerProxy.offProgress(progressHandler);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };