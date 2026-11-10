const { ipcMain, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];

async function pathExists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch (_) {
    return false;
  }
}

async function uniqueName(dir, name) {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let cand = name;
  for (let n = 1; n < 1000; n++) {
    if (!(await pathExists(path.join(dir, cand)))) return cand;
    cand = stem + ' (' + n + ')' + ext;
  }
  return null;
}

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

  ipcMain.handle('cm:createFiles', async (_e, { parentPath, fileNames }) => {
    try {
      if (!parentPath) return { success: false, error: 'No parent path' };
      if (!fileNames || !fileNames.length) return { success: false, error: 'No file names provided' };
      const created = [];
      const errors = [];
      for (const name of fileNames) {
        const fullPath = path.join(parentPath, name);
        try {
          await fs.promises.writeFile(fullPath, '', 'utf-8');
          created.push({ fileName: name, path: fullPath });
        } catch (err) {
          errors.push({ fileName: name, error: err.message });
        }
      }
      return { success: true, created, errors };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cm:createFolder', async (_e, { parentPath, folderName }) => {
    try {
      if (!parentPath) return { success: false, error: 'No parent path' };
      if (!folderName || !folderName.trim()) return { success: false, error: 'Folder name cannot be empty' };
      const fullPath = path.join(parentPath, folderName.trim());
      try { await fs.promises.access(fullPath); return { success: false, error: 'A folder with that name already exists' }; } catch {}
      await fs.promises.mkdir(fullPath, { recursive: true });
      return { success: true, path: fullPath };
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

  ipcMain.handle('cm:pickFiles', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const opts = {
        title: 'Select files to add',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Images', extensions: IMAGE_EXTS },
          { name: 'All Files', extensions: ['*'] },
        ],
      };
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      if (res.canceled || !res.filePaths || !res.filePaths.length) {
        return { success: true, canceled: true, files: [] };
      }
      const files = [];
      for (const p of res.filePaths) {
        try {
          const st = await fs.promises.stat(p);
          if (!st.isFile()) continue;
          files.push({ path: p, name: path.basename(p), size: st.size });
        } catch (_) {
          continue;
        }
      }
      return { success: true, canceled: false, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cm:importFiles', async (_e, { targetDir, sources }) => {
    try {
      if (!targetDir || typeof targetDir !== 'string' || !path.isAbsolute(targetDir)) {
        return { success: false, error: 'Invalid target folder' };
      }
      if (!Array.isArray(sources) || !sources.length) {
        return { success: false, error: 'No files selected' };
      }
      let dirSt;
      try {
        dirSt = await fs.promises.stat(targetDir);
      } catch (_) {
        return { success: false, error: 'Target folder does not exist' };
      }
      if (!dirSt.isDirectory()) return { success: false, error: 'Target is not a folder' };

      const copied = [];
      const errors = [];
      for (const src of sources) {
        if (typeof src !== 'string' || !path.isAbsolute(src)) {
          errors.push({ fileName: String(src), error: 'Invalid path' });
          continue;
        }
        const base = path.basename(src);
        try {
          const st = await fs.promises.stat(src);
          if (!st.isFile()) {
            errors.push({ fileName: base, error: 'Not a file' });
            continue;
          }
          const finalName = await uniqueName(targetDir, base);
          if (!finalName) {
            errors.push({ fileName: base, error: 'Could not find a free name' });
            continue;
          }
          const dest = path.join(targetDir, finalName);
          await fs.promises.copyFile(src, dest, fs.constants.COPYFILE_EXCL);
          copied.push({ fileName: finalName, path: dest, renamed: finalName !== base });
        } catch (err) {
          errors.push({ fileName: base, error: err.message });
        }
      }
      if (!copied.length) {
        const msg = errors.length ? errors[0].fileName + ': ' + errors[0].error : 'Nothing was copied';
        return { success: false, error: msg, copied, errors };
      }
      return { success: true, copied, errors };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };