'use strict';

var _spawn = require('child_process').spawn;
var _BrowserWindow = require('electron').BrowserWindow;
var _BrowserDiscovery = require('./terminal/error-cop/browser-discovery').BrowserDiscovery;
var _store = require('./ecoStore');

var _process = null;
var _browser = null;
var _discovery = null;
var _stdoutBuf = [];
var _urlTimeout = null;
var _status = { running: false, url: null, browserConnected: false };

function start(path, command) {
  if (_process) return { success: false, error: 'Already running' };

  _store.clear('consoleLogs');
  _store.clear('apiCalls');
  _store.clear('terminalErrors');
  _store.clear('browserErrors');

  _discovery = new _BrowserDiscovery();
  _stdoutBuf = [];
  _status = { running: false, url: null, browserConnected: false };

  _process = _spawn(command, [], {
    cwd: path,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  _process.stdout.on('data', function (chunk) {
    var lines = chunk.toString().split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      _stdoutBuf.push(line);
      if (_stdoutBuf.length > 200) _stdoutBuf.shift();

      var result = _discovery.scanLine(line, null, _stdoutBuf);
      if (result && !_status.url) {
        _status.url = result.url;
        _openBrowser(result.url);
      }
    }
  });

  _process.stderr.on('data', function (chunk) {
    var text = chunk.toString().trim();
    if (!text) return;
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (l) {
        _store.push('terminalErrors', {
          source: 'process',
          level: 'error',
          text: l,
          ts: Date.now(),
        });
      }
    }
  });

  _process.on('close', function (code) {
    _store.push('terminalErrors', {
      source: 'process',
      level: 'info',
      text: 'Process exited with code ' + code,
      ts: Date.now(),
    });
    _cleanup();
  });

  _process.on('error', function (err) {
    _store.push('terminalErrors', {
      source: 'process',
      level: 'error',
      text: 'Process error: ' + err.message,
      ts: Date.now(),
    });
    _cleanup();
  });

  _urlTimeout = setTimeout(function () {
    if (!_status.url) {
      _store.push('terminalErrors', {
        source: 'system',
        level: 'warn',
        text: 'No URL detected within 30 seconds — you can enter the URL manually above.',
        ts: Date.now(),
      });
    }
  }, 30000);

  _status.running = true;
  return { success: true };
}

function _openBrowser(url) {
  _browser = new _BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  var filter = { urls: ['http://*/*', 'https://*/*'] };

  _browser.webContents.on('console-message', function (e, level, msg) {
    if (msg.indexOf('ECO_JS_ERROR:') === 0) {
      try {
        var data = JSON.parse(msg.slice('ECO_JS_ERROR:'.length));
        _store.push('browserErrors', {
          source: 'browser',
          level: 'error',
          text: data.msg || '',
          details: data.stack || '',
          ts: Date.now(),
        });
      } catch (err) { /* ignore malformed */ }
      return;
    }

    var levels = ['verbose', 'info', 'warning', 'error'];
    _store.push('consoleLogs', {
      source: 'browser',
      level: levels[level] || 'info',
      text: msg,
      ts: Date.now(),
    });
  });

  _browser.webContents.session.webRequest.onCompleted(filter, function (details) {
    _store.push('apiCalls', {
      source: 'browser',
      url: details.url,
      method: details.method,
      status: details.statusCode,
      duration: Date.now() - details.timeStamp,
      text: details.method + ' ' + details.url + ' \u2192 ' + details.statusCode,
      ts: Date.now(),
    });
  });

  _browser.webContents.session.webRequest.onErrorOccurred(filter, function (details) {
    if (!details.url || details.url.indexOf('chrome-extension://') === 0) return;
    _store.push('apiCalls', {
      source: 'browser',
      url: details.url,
      method: details.method || 'GET',
      status: 0,
      error: details.error || 'Unknown',
      text: (details.method || 'GET') + ' ' + details.url + ' \u2192 FAILED: ' + (details.error || 'Unknown'),
      ts: Date.now(),
    });
  });

  _browser.webContents.on('did-finish-load', function () {
    var script = [
      '(function(){',
      'window.__ecoErrors=[];',
      'window.onerror=function(m,s,l,c,e){window.__ecoErrors.push({msg:String(m),stack:e&&e.stack?e.stack:""});};',
      'window.onunhandledrejection=function(e){var r=e.reason||{};window.__ecoErrors.push({msg:String(r.message||r.stack||r),stack:r.stack||""});};',
      'setInterval(function(){',
      'if(window.__ecoErrors.length){',
      'for(var i=0;i<window.__ecoErrors.length;i++){',
      'console.error("ECO_JS_ERROR:"+JSON.stringify(window.__ecoErrors[i]));',
      '}',
      'window.__ecoErrors=[];',
      '}',
      '},500);',
      '})();',
    ].join('');
    _browser.webContents.executeJavaScript(script).catch(function () {});
  });

  _browser.on('closed', function () {
    _browser = null;
    _status.browserConnected = false;
  });

  _browser.loadURL(url);
  _status.browserConnected = true;
}

function stop() {
  if (_process) {
    _process.kill('SIGTERM');
    setTimeout(function () {
      if (_process) {
        try { _process.kill('SIGKILL'); } catch (e) { /* ignore */ }
      }
    }, 5000);
  }
  _closeBrowser();
  _cleanup();
  return { success: true };
}

function _closeBrowser() {
  if (_browser && !_browser.isDestroyed()) {
    try { _browser.close(); } catch (e) { /* ignore */ }
  }
  _browser = null;
}

function _cleanup() {
  _process = null;
  if (_urlTimeout) { clearTimeout(_urlTimeout); _urlTimeout = null; }
  _status = { running: false, url: null, browserConnected: false };
}

function getStatus() {
  var bs = _browser !== null && !_browser.isDestroyed();
  return {
    running: _status.running,
    url: _status.url,
    browserConnected: bs,
    processAlive: _process !== null,
  };
}

module.exports = { start: start, stop: stop, getStatus: getStatus };
