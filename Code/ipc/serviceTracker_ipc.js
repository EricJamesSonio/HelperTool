const { ipcMain, BrowserWindow } = require('electron');

const _statuses = {};
let _mainWindow = null;

function setWindow(win) {
  _mainWindow = win;
}

function updateService(id, status, detail) {
  console.log('[ServiceTracker] update', id, status, detail || '');
  _statuses[id] = { status, detail: detail || '', ts: Date.now() };

  if (_mainWindow && !_mainWindow.isDestroyed()) {
    if (_mainWindow.webContents.isLoading()) {
      _mainWindow.webContents.once('did-finish-load', () => {
        if (!_mainWindow.isDestroyed()) {
          _mainWindow.webContents.send('serviceTracker:update', { id, status, detail: detail || '' });
        }
      });
    } else {
      _mainWindow.webContents.send('serviceTracker:update', { id, status, detail: detail || '' });
    }
  }
}

function register() {
  ipcMain.handle('serviceTracker:getAll', () => {
    console.log('[ServiceTracker] getAll returning', Object.keys(_statuses).length, 'entries:', JSON.stringify(_statuses));
    return _statuses;
  });
}

module.exports = { register, updateService, setWindow };
