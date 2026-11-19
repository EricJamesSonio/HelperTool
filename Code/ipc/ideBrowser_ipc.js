const { ipcMain, webContents } = require('electron');

function num(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function guestFor(win, id) {
  const wc = webContents.fromId(Number(id));
  if (!wc || wc.isDestroyed() || !win || win.isDestroyed()) return null;
  if (wc.getType() !== 'webview') return null;
  if (wc.hostWebContents !== win.webContents) return null;
  return wc;
}

function register(deps) {
  const getMainWindow = deps && deps.getMainWindow;
  ipcMain.handle('ideBrowser:emulate', (event, payload) => {
    const p = payload || {};
    const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
    if (!win || win.isDestroyed() || event.sender !== win.webContents) {
      return { ok: false, error: 'not allowed' };
    }
    const wc = guestFor(win, p.id);
    if (!wc) return { ok: false, error: 'view not found' };
    try {
      if (!p.enabled) {
        wc.disableDeviceEmulation();
        return { ok: true };
      }
      const width = Math.round(num(p.width, 200, 2400, 390));
      const height = Math.round(num(p.height, 200, 2400, 844));
      const dpr = num(p.dpr, 1, 4, 2);
      wc.enableDeviceEmulation({
        screenPosition: 'mobile',
        screenSize: { width, height },
        viewPosition: { x: 0, y: 0 },
        deviceScaleFactor: dpr,
        viewSize: { width, height },
        scale: 1,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

module.exports = { register };