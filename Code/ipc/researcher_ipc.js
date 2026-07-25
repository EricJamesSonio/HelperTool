const { BrowserView, ipcMain } = require('electron');

let _view = null;
let _mainWindow = null;

function register({ getMainWindow }) {
  _mainWindow = getMainWindow;

  ipcMain.handle('researcher:createBrowserView', (event, { url, bounds }) => {
    try {
      if (_view) {
        _view.webContents.loadURL(url);
        if (bounds) _view.setBounds(bounds);
        return { success: true };
      }

      _view = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        }
      });

      const win = _mainWindow();
      if (!win) return { success: false, error: 'no main window' };

      win.setBrowserView(_view);
      _view.webContents.loadURL(url);

      if (bounds) _view.setBounds(bounds);

      _view.webContents.on('destroyed', () => { _view = null; });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('researcher:resizeBrowserView', (event, { bounds }) => {
    try {
      if (!_view) return { success: false, error: 'no browser view' };
      _view.setBounds(bounds);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('researcher:destroyBrowserView', () => {
    try {
      if (!_view) return { success: true };
      const win = _mainWindow();
      if (win) win.removeBrowserView(_view);
      _view.webContents.destroy();
      _view = null;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('researcher:navigate', (event, { url }) => {
    try {
      if (!_view) return { success: false, error: 'no browser view' };
      _view.webContents.loadURL(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

function cleanup() {
  try {
    if (_view) {
      const win = _mainWindow();
      if (win) win.removeBrowserView(_view);
      _view.webContents.destroy();
      _view = null;
    }
  } catch (_) {}
}

module.exports = { register, cleanup };