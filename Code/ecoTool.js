'use strict';

var _spawn = require('child_process').spawn;
var _BrowserWindow = require('electron').BrowserWindow;
var _BrowserDiscovery = require('./terminal/error-cop/browser-discovery').BrowserDiscovery;
var _store = require('./ecoStore');

var _process = null;
var _terminalId = null;
var _browser = null;
var _discovery = null;
var _ctxBuf = [];
var _lineBuf = '';
var _urlTimeout = null;
var _onTerminalData = null;
var _onTerminalExit = null;
var _status = { running: false, url: null, browserConnected: false };

function start(path, command, terminalId) {
  if (_process || _terminalId) return { success: false, error: 'Already running' };

  _store.clear('consoleLogs');
  _store.clear('apiCalls');
  _store.clear('apiErrors');
  _store.clear('terminalErrors');
  _store.clear('browserErrors');

  _discovery = new _BrowserDiscovery();
  _ctxBuf = [];
  _lineBuf = '';
  _status = { running: false, url: null, browserConnected: false };

  if (terminalId != null) {
    _terminalId = terminalId;
    _attachToTerminal(terminalId);
  } else {
    _spawnProcess(path, command);
  }

  _urlTimeout = setTimeout(function () {
    if (!_status.url) {
      _status.url = '__MANUAL_INPUT_REQUIRED__';
      _store.push('terminalErrors', {
        source: 'system',
        level: 'warn',
        text: 'No URL detected within 30 seconds.',
        ts: Date.now(),
      });
    }
  }, 30000);

  _status.running = true;
  return { success: true };
}

function _spawnProcess(path, command) {
  _process = _spawn(command, [], {
    cwd: path,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  _process.stdout.on('data', function (chunk) {
    _processOutput(chunk.toString());
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
}

function _attachToTerminal(id) {
  var termApi = require('./ipc/terminal_ipc');

  _onTerminalData = function (data) {
    _processOutput(data);
  };

  _onTerminalExit = function (code) {
    _store.push('terminalErrors', {
      source: 'terminal',
      level: 'info',
      text: 'Terminal session exited with code ' + code,
      ts: Date.now(),
    });
    _cleanup();
  };

  termApi.addDataListener(id, _onTerminalData);
  termApi.addExitListener(id, _onTerminalExit);

  var backfill = termApi.getTerminalBuffer(id);
  if (backfill) _processOutput(backfill);
}

function _detectUrl(text) {
  if (!text) return null;

  var m = text.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/i);
  if (m) {
    var port = parseInt(m[1], 10);
    if (port >= 1024) return 'http://' + m[0];
  }

  m = text.match(/port[:\s]*(\d{4,5})/i);
  if (m) {
    port = parseInt(m[1], 10);
    if (port >= 1024) return 'http://localhost:' + port;
  }

  m = text.match(/(?:listening|running|started|serve)\D*(\d{4,5})/i);
  if (m) {
    port = parseInt(m[1], 10);
    if (port >= 1024) return 'http://localhost:' + port;
  }

  return null;
}

function _processOutput(data) {
  _lineBuf += data;
  var parts = _lineBuf.split('\n');
  _lineBuf = parts.pop();

  for (var i = 0; i < parts.length; i++) {
    var line = parts[i];
    _ctxBuf.push(line);
    if (_ctxBuf.length > 200) _ctxBuf.shift();

    var result = _discovery.scanLine(line, null, _ctxBuf);
    if (result && !_status.url) {
      _status.url = result.url;
      _openBrowser(result.url);
    }

    if (!_status.url) {
      var urlFromLine = _detectUrl(trimmed);
      if (urlFromLine) {
        _status.url = urlFromLine;
        _openBrowser(urlFromLine);
      }
    }

    var trimmed = line.trim();
    if (trimmed) {
      var lower = trimmed.toLowerCase();
      if (lower.indexOf('error') !== -1 || lower.indexOf('failed') !== -1 ||
          lower.indexOf('exception') !== -1 || lower.indexOf('traceback') !== -1 ||
          lower.indexOf('killed') !== -1 || lower.indexOf('refused') !== -1) {
        _store.push('terminalErrors', {
          source: 'terminal',
          level: 'error',
          text: trimmed,
          ts: Date.now(),
        });
      }
    }
  }
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
    if (details.statusCode >= 400) {
      _store.push('apiErrors', {
        source: 'browser',
        level: details.statusCode >= 500 ? 'error' : 'warn',
        text: details.method + ' ' + details.url + ' returned ' + details.statusCode,
        details: 'HTTP ' + details.statusCode + ' response for ' + details.method + ' ' + details.url,
        ts: Date.now(),
      });
    }
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
    _store.push('apiErrors', {
      source: 'browser',
      level: 'error',
      text: (details.method || 'GET') + ' ' + details.url + ' failed: ' + (details.error || 'Unknown'),
      details: 'Network error: ' + (details.error || 'Unknown') + ' for ' + (details.method || 'GET') + ' ' + details.url,
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
  _store.clear('consoleLogs');
  _store.clear('apiCalls');
  _store.clear('apiErrors');
  _store.clear('terminalErrors');
  _store.clear('browserErrors');

  if (_process) {
    _process.kill('SIGTERM');
    setTimeout(function () {
      if (_process) {
        try { _process.kill('SIGKILL'); } catch (e) { /* ignore */ }
      }
    }, 5000);
  }

  if (_terminalId) {
    var termApi = require('./ipc/terminal_ipc');
    termApi.killTerminal(_terminalId);
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
  if (_terminalId) {
    var termApi = require('./ipc/terminal_ipc');
    if (_onTerminalData) termApi.removeDataListener(_terminalId, _onTerminalData);
    if (_onTerminalExit) termApi.removeExitListener(_terminalId, _onTerminalExit);
    _terminalId = null;
    _onTerminalData = null;
    _onTerminalExit = null;
  }
  _process = null;
  _ctxBuf = [];
  _lineBuf = '';
  if (_urlTimeout) { clearTimeout(_urlTimeout); _urlTimeout = null; }
  _status = { running: false, url: null, browserConnected: false };
}

function getStatus() {
  var bs = _browser !== null && !_browser.isDestroyed();
  return {
    running: _status.running,
    url: _status.url,
    browserConnected: bs,
    processAlive: _process !== null || _terminalId !== null,
  };
}

function setUrl(url) {
  if (!url || _status.url && _status.url !== '__MANUAL_INPUT_REQUIRED__') return { success: false, error: 'Already connected' };
  _status.url = url;
  _openBrowser(url);
  if (_urlTimeout) { clearTimeout(_urlTimeout); _urlTimeout = null; }
  return { success: true };
}

module.exports = { start: start, stop: stop, getStatus: getStatus, setUrl: setUrl };
