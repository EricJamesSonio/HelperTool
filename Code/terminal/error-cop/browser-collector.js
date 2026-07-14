const { BrowserWindow } = require('electron');
const crypto = require('crypto');

class BrowserCollector {
  static MAX_WINDOWS = 3;

  constructor(options = {}) {
    this._onError = options.onError || (() => {});
    this._windows = new Map();
    this._bwToPort = new WeakMap();
  }

  attach(port, url, sessionId) {
    if (this._windows.has(port)) return null;

    if (this._windows.size >= BrowserCollector.MAX_WINDOWS) {
      const oldestPort = this._windows.keys().next().value;
      this.detach(oldestPort);
    }

    const bw = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const entry = { bw, sessionId, url, errors: [] };
    this._windows.set(port, entry);
    this._bwToPort.set(bw, port);

    bw.on('closed', () => {
      for (const [p, e] of this._windows) {
        if (e.bw === bw || e.bw.isDestroyed()) {
          this._windows.delete(p);
          break;
        }
      }
    });

    bw.webContents.on('console-message', (_event, level, message) => {
      if (level < 2) return;

      const currentUrl = bw.webContents.getURL();
      const now = new Date().toISOString();

      let errLevel = level === 3 ? 'error' : 'warning';
      let title = errLevel === 'error' ? 'Console Error' : 'Console Warning';
      let cleanMsg = message;

      if (message.startsWith('UNCAUGHT_ERROR:')) {
        title = 'Uncaught Error';
        cleanMsg = message.slice('UNCAUGHT_ERROR:'.length).trim();
        errLevel = 'error';
      } else if (message.startsWith('UNHANDLED_REJECTION:')) {
        title = 'Unhandled Promise Rejection';
        cleanMsg = message.slice('UNHANDLED_REJECTION:'.length).trim();
        errLevel = 'error';
      } else if (message.startsWith('HTTP_ERROR:')) {
        title = 'HTTP Request Failed';
        cleanMsg = message.slice('HTTP_ERROR:'.length).trim();
        errLevel = 'error';
      } else if (message.startsWith('NETWORK_ERROR:')) {
        title = 'Network Request Failed';
        cleanMsg = message.slice('NETWORK_ERROR:'.length).trim();
        errLevel = 'error';
      }

      const fingerprint = crypto.createHash('md5').update(title + '|' + cleanMsg + '|' + currentUrl).digest('hex');

      this._onError({
        sessionId,
        level: errLevel,
        source: 'browser',
        title,
        message: cleanMsg,
        stack: '',
        url: currentUrl,
        fingerprint,
        timestamp: now,
      });
    });

    bw.webContents.session.webRequest.onErrorOccurred((details) => {
      if (!details.url || details.url.startsWith('chrome-extension://') || details.url.startsWith('devtools://')) return;
      const now = new Date().toISOString();
      const fingerprint = crypto.createHash('md5').update('NETWORK:' + details.url + ':' + (details.error || '')).digest('hex');

      this._onError({
        sessionId,
        level: 'error',
        source: 'browser',
        title: 'Network Error',
        message: details.error || 'Request failed',
        stack: '',
        url: details.url,
        fingerprint,
        timestamp: now,
      });
    });

    bw.webContents.on('did-finish-load', () => {
      this._injectErrorCapture(bw.webContents);
    });

    bw.webContents.on('did-fail-load', (_event, _errorCode, errorDescription, validatedUrl) => {
      const now = new Date().toISOString();
      const fingerprint = crypto.createHash('md5').update('NAV_FAIL:' + (validatedUrl || url) + ':' + (errorDescription || '')).digest('hex');

      this._onError({
        sessionId,
        level: 'error',
        source: 'browser',
        title: 'Page Load Failed',
        message: errorDescription || 'Failed to load page',
        stack: '',
        url: validatedUrl || url,
        fingerprint,
        timestamp: now,
      });
    });

    bw.webContents.on('crashed', () => {
      const now = new Date().toISOString();
      this._onError({
        sessionId,
        level: 'error',
        source: 'browser',
        title: 'Browser Renderer Crashed',
        message: 'The browser window for ' + url + ' has crashed. Reload to continue monitoring.',
        stack: '',
        url,
        fingerprint: 'CRASH:' + url,
        timestamp: now,
      });
    });

    bw.loadURL(url);

    return { port, url, sessionId };
  }

  _injectErrorCapture(webContents) {
    const script = `
      (function(){
        window.addEventListener('error',function(e){
          console.error('UNCAUGHT_ERROR:',e.message,e.filename||'',e.lineno||'',e.colno||'',(e.error&&e.error.stack)||'');
          e.preventDefault();
        });
        window.addEventListener('unhandledrejection',function(e){
          var r=e.reason||{};
          console.error('UNHANDLED_REJECTION:',r.message||r.stack||String(r));
          e.preventDefault();
        });
        var _fetch=window.fetch.bind(window);
        window.fetch=function(u,o){
          return _fetch(u,o).then(function(r){
            if(!r.ok) console.error('HTTP_ERROR:',r.status,r.statusText,typeof u==='string'?u:(u&&u.url)||'');
            return r;
          }).catch(function(e){
            console.error('NETWORK_ERROR:',(e&&e.message)||String(e),typeof u==='string'?u:(u&&u.url)||'');
            throw e;
          });
        };
      })();
    `.replace(/\s+/g, ' ');

    webContents.executeJavaScript(script).catch(() => {});
  }

  detach(port) {
    const entry = this._windows.get(port);
    if (!entry) return;
    try { entry.bw.close(); } catch {}
    this._windows.delete(port);
  }

  detachAll() {
    for (const [port] of this._windows) {
      this.detach(port);
    }
  }

  getAttached() {
    const result = {};
    for (const [port, entry] of this._windows) {
      result[port] = { port, url: entry.url, sessionId: entry.sessionId };
    }
    return result;
  }

  isAttached(port) {
    return this._windows.has(port);
  }

  show(port) {
    const entry = this._windows.get(port);
    if (entry && !entry.bw.isDestroyed()) {
      entry.bw.show();
      entry.bw.focus();
    }
  }

  hide(port) {
    const entry = this._windows.get(port);
    if (entry && !entry.bw.isDestroyed()) {
      entry.bw.hide();
    }
  }
}

module.exports = { BrowserCollector };
