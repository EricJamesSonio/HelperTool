const { ipcMain, BrowserWindow } = require('electron');

const _statuses = {};

function updateService(id, status, detail) {
  _statuses[id] = { status, detail: detail || '', ts: Date.now() };
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('serviceTracker:update', { id, status, detail: detail || '' });
    }
  });
}

function register() {
  ipcMain.handle('serviceTracker:getAll', () => _statuses);
}

module.exports = { register, updateService };
