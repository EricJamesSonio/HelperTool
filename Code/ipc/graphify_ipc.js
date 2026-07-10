'use strict';

const { ipcMain } = require('electron');
const { spawn }   = require('child_process');
const path        = require('path');
const readline    = require('readline');
const http        = require('http');

const DEFAULT_PORT = 3333;
const START_TIMEOUT = 10000;

let _child     = null;
let _port      = DEFAULT_PORT;
let _ready     = false;
let _repoPath  = null;
let _app       = null;

function _getServerPath() {
  return path.join(__dirname, '..', 'graphify-service', 'server.js');
}

function _resolveDbPath(app) {
  return path.join(app.getPath('userData'), 'symbol-index', 'index.db');
}

function _isChildAlive() {
  return _child && _child.exitCode === null && !_child.killed;
}

function _spawn(app) {
  return new Promise((resolve, reject) => {
    if (_isChildAlive()) {
      resolve({ port: _port });
      return;
    }
    // Clean up any stale child reference
    _child = null;
    _ready = false;

    const serverPath = _getServerPath();
    const dbPath = _resolveDbPath(app);
    const args = [serverPath, _repoPath || '', String(_port), dbPath];
    _child = spawn(
      process.execPath,
      args,
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      }
    );

    const rl = readline.createInterface({ input: _child.stdout, terminal: false });
    rl.on('line', (line) => {
      line = line.trim();
      if (!line) return;
      try {
        const msg = JSON.parse(line);
        if (msg.ready) {
          _ready = true;
          _port  = msg.port || _port;
          rl.close();
          console.log(`[graphify_ipc] Server ready on port ${_port}`);
          resolve({ port: _port });
        }
      } catch (_) {}
    });

    _child.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.log(`[graphify] ${text}`);
    });

    _child.on('exit', (code) => {
      console.warn(`[graphify_ipc] Server exited with code ${code}`);
      _child = null;
      _ready = false;
      if (code !== 0 && code !== null) {
        console.warn(`[graphify_ipc] Server crashed (exit=${code}). It can be restarted via the Graphify UI.`);
      }
      reject(new Error(`Server exited with code ${code}`));
    });

    _child.on('error', (err) => {
      console.error(`[graphify_ipc] Spawn error: ${err.message}`);
      _child = null;
      _ready = false;
      reject(err);
    });

    setTimeout(() => {
      if (!_ready) {
        _stop();
        reject(new Error('Server did not become ready within timeout'));
      }
    }, START_TIMEOUT);
  });
}

function _stop() {
  if (_child) {
    try { _child.kill('SIGTERM'); } catch (_) {}
    _child = null;
  }
  _ready = false;
}

function _restart(app) {
  _stop();
  return new Promise(r => setTimeout(r, 300)).then(() => _spawn(app));
}

function _fetchInfo() {
  return new Promise((resolve) => {
    if (!_child || !_ready) {
      resolve({ error: 'Server not running', ready: false });
      return;
    }

    const req = http.get(`http://127.0.0.1:${_port}/info`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ error: 'Failed to parse info response' });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message });
    });

    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ error: 'Info request timed out' });
    });
  });
}

function register({ app }) {
  _app = app;

  ipcMain.handle('graphify:start', async (_, repoPath) => {
    _repoPath = repoPath || null;
    try {
      const result = await _spawn(app);
      return { ok: true, port: result.port };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('graphify:stop', async () => {
    _stop();
    return { ok: true };
  });

  ipcMain.handle('graphify:restart', async (_, repoPath) => {
    _repoPath = repoPath || null;
    try {
      const result = await _restart(app);
      return { ok: true, port: result.port };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('graphify:status', async () => {
    return { running: !!_child && _ready, port: _port };
  });

  ipcMain.handle('graphify:getPort', async () => {
    return { port: _port };
  });

  ipcMain.handle('graphify:getInfo', async () => {
    return await _fetchInfo();
  });
}

function shutdown() {
  _stop();
}

module.exports = { register, shutdown };
