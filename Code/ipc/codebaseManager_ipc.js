const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function register() {
  ipcMain.handle('cm:renameFile', async (_e, { filePath, newName }) => {
    try {
      if (!filePath) return { success: false, error: 'No file path' };
      if (!newName || !newName.trim()) return { success: false, error: 'Name cannot be empty' };
      const dir = path.dirname(filePath);
      const newFull = path.join(dir, newName.trim());
      if (filePath === newFull) return { success: true };
      try { await fs.promises.access(newFull); return { success: false, error: 'A file with that name already exists' }; } catch {}
      await fs.promises.rename(filePath, newFull);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cm:deleteFile', async (_e, { filePath }) => {
    try {
      if (!filePath) return { success: false, error: 'No file path' };
      await fs.promises.rm(filePath, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cm:moveFile', async (_e, { sourcePath, targetDir }) => {
    try {
      if (!sourcePath) return { success: false, error: 'No source path' };
      if (!targetDir) return { success: false, error: 'No target directory' };
      const dstFull = path.join(targetDir, path.basename(sourcePath));
      if (sourcePath === dstFull) return { success: true };
      await fs.promises.mkdir(path.dirname(dstFull), { recursive: true });
      try { await fs.promises.access(dstFull); return { success: false, error: 'Target file already exists' }; } catch {}
      await fs.promises.rename(sourcePath, dstFull);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
