const { ipcMain, BrowserWindow } = require('electron');

const _statuses = {};

function updateService(id, status, detail) {
  console.log('[ServiceTracker] update', id, status, detail || '');
  _statuses[id] = { status, detail: detail || '', ts: Date.now() };
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('serviceTracker:update', { id, status, detail: detail || '' });
    }
  });
}

function register() {
  ipcMain.handle('serviceTracker:getAll', () => {
    console.log('[ServiceTracker] getAll returning', Object.keys(_statuses).length, 'entries');
    return _statuses;
  });
}

module.exports = { register, updateService };
