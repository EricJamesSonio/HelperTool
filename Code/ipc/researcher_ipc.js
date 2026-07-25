const { BrowserView, ipcMain } = require('electron');

let _view = null;
let _viewAccountId = null;
let _mainWindow = null;

// The only two things the renderer is allowed to tell us — pure layout
// choices (how wide the left panel is, how far down the header pushes
// content). Everything else (the actual x/y/width/height of the
// BrowserView) is computed HERE from the window's real content bounds,
// so it can never drift out of sync with the window or overflow it.
let _layout = { leftPanelWidth: 480, topOffset: 84 };
let _hidden = false;

/**
 * Single source of truth for BrowserView bounds. Always derived from
 * win.getContentBounds() — the actual, current, authoritative size of
 * the window's content area (never the renderer's possibly-stale
 * window.innerWidth, never a separately-measured rect that can
 * disagree with the window).
 */
function computeBounds(win) {
  if (_hidden) return { x: 0, y: 0, width: 0, height: 0 };
  const content = win.getContentBounds(); // { x, y, width, height } — x/y always 0 here since we only need width/height
  const { leftPanelWidth, topOffset } = _layout;

  const x = leftPanelWidth;
  const y = topOffset;
  const width = Math.max(100, content.width - leftPanelWidth);
  const height = Math.max(100, content.height - topOffset);

  return { x, y, width, height };
}

function applyBounds() {
  if (!_view || !_mainWindow) return;
  const win = _mainWindow();
  if (!win) return;
  try {
    _view.setBounds(computeBounds(win));
  } catch (err) {
    console.error('[researcher_ipc] applyBounds failed:', err.message);
  }
}

let _resizeListenersAttached = false;

// Self-healing: whenever the window itself changes size for ANY reason
// (drag-resize, maximize, unmaximize, moved to a different monitor),
// immediately re-fit the BrowserView using the last known layout. This
// is what makes it stop drifting — main no longer waits for the
// renderer to notice and tell it. Idempotent + deferred so it works
// regardless of whether the window exists yet when register() runs.
function ensureResizeListeners() {
  if (_resizeListenersAttached) return;
  const win = _mainWindow && _mainWindow();
  if (!win) return;
  win.on('resize', applyBounds);
  win.on('maximize', applyBounds);
  win.on('unmaximize', applyBounds);
  win.on('move', applyBounds); // catches cross-monitor DPI changes
  _resizeListenersAttached = true;
}

function register({ getMainWindow }) {
  _mainWindow = getMainWindow;
  ensureResizeListeners();

  ipcMain.handle('researcher:createBrowserView', (event, { url, accountId, layout }) => {
    try {
      const winNow = _mainWindow();
      if (!winNow) return { success: false, error: 'no main window' };
      ensureResizeListeners(); // safe no-op if already attached

      if (layout) _layout = { ..._layout, ...layout };

      // Destroy current view if switching to a different account
      if (_view && _viewAccountId !== accountId) {
        winNow.removeBrowserView(_view);
        _view.webContents.destroy();
        _view = null;
        _viewAccountId = null;
      }

      // Reuse existing view if same account
      if (_view) {
        _view.webContents.loadURL(url);
        applyBounds();
        return { success: true };
      }

      const webPreferences = {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      };

      // Isolate sessions per account so each keeps its own login cookies
      if (accountId) {
        webPreferences.partition = 'persist:researcher-' + accountId;
      }

      _view = new BrowserView({ webPreferences });
      _viewAccountId = accountId;

      winNow.setBrowserView(_view);
      _view.webContents.loadURL(url);
      applyBounds();

      _view.webContents.on('destroyed', () => { _view = null; _viewAccountId = null; });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('researcher:resizeBrowserView', (event, { layout } = {}) => {
    try {
      if (!_view) return { success: false, error: 'no browser view' };
      if (layout) _layout = { ..._layout, ...layout };
      applyBounds();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('researcher:destroyBrowserView', () => {
    try {
      if (!_view) return { success: true };
      const winNow = _mainWindow();
      if (winNow) winNow.removeBrowserView(_view);
      _view.webContents.destroy();
      _view = null;
      _viewAccountId = null;
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

  ipcMain.handle('researcher:hideBrowserView', () => {
    _hidden = true;
    applyBounds();
  });

  ipcMain.handle('researcher:showBrowserView', () => {
    _hidden = false;
    applyBounds();
  });
}

function cleanup() {
  try {
    if (_view) {
      const win = _mainWindow();
      if (win) win.removeBrowserView(_view);
      _view.webContents.destroy();
      _view = null;
      _viewAccountId = null;
    }
  } catch (_) {}
}

module.exports = { register, cleanup };