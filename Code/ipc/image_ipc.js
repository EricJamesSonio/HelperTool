const { ipcMain, dialog } = require('electron');
const workerProxy = require('./workerProxy.js');

const IMAGE_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'tiff', 'svg'] }
];

function register({ getMainWindow }) {
  ipcMain.handle('image:getMetadata', async (event, { inputPath }) => {
    try {
      const sharp = require('sharp');
      const fs = require('fs');
      const metadata = await sharp(inputPath).metadata();
      const stat = fs.statSync(inputPath);
      return {
        success: true,
        resolution: `${metadata.width}x${metadata.height}`,
        fileSize: stat.size,
        width: metadata.width,
        height: metadata.height,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('image:pickOutputFolder', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Output Folder',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('image:revealFile', async (event, { filePath }) => {
    const { shell } = require('electron');
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  ipcMain.handle('image:pickFiles', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Images',
      filters: IMAGE_FILTERS,
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || !result.filePaths.length) return [];
    return result.filePaths;
  });

  ipcMain.handle('image:convert', async (event, payload) => {
    const win = getMainWindow();
    try {
      const progressHandler = (progress) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('image:convertProgress', progress);
        }
      };
      workerProxy.onProgress(progressHandler);
      const result = await workerProxy.send('image:convert', payload);
      workerProxy.offProgress(progressHandler);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
