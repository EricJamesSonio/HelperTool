/**
 * ipc/graphify_ipc.js
 * Spawns and manages the graphify-service child process.
 * Follows the same pattern as indexerProxy.js.
 *
 * IPC channels exposed:
 *   graphify:start   — spawns the server (pass repoPath so it can resolve dbPath)
 *   graphify:stop    — kills the server
 *   graphify:status  — returns { running, port }
 *   graphify:getPort — returns the port number
 */

'use strict';

const { ipcMain } = require('electron');
const { spawn }   = require('child_process');
const path        = require('path');
const readline    = require('readline');

const DEFAULT_PORT = 3333;

let _child     = null;
let _port      = DEFAULT_PORT;
let _ready     = false;
let _dbPath    = null;
let _repoPath  = null;

function _getServerPath() {
  return path.join(__dirname, '..', 'graphify-service', 'server.js');
}

/**
 * Resolve the symbol index DB path from userData.
 * Mirrors the logic in database/db.js → getDbPath().
 */
function _resolveDbPath(app) {
  return path.join(app.getPath('userData'), 'symbol-index', 'index.db');
}

function _spawn(app) {
  if (_child) return; // already running

  _dbPath = _resolveDbPath(app);
  _ready  = false;

  const serverPath = _getServerPath();
  _child = spawn(
    process.execPath,
    [serverPath, _dbPath, String(_port)],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }
  );

  // The server writes { ready: true, port } as the first stdout line
  const rl = readline.createInterface({ input: _child.stdout, terminal: false });
  rl.on('line', (line) => {
    line = line.trim();
    if (!line) return;
    try {
      const msg = JSON.parse(line);
      if (msg.ready) {
        _ready = true;
        _port  = msg.port || _port;
        console.log(`[graphify_ipc] Server ready on port ${_port}`);
      }
    } catch (_) {}
  });

  _child.stderr.on('data', (chunk) => {
    console.log(`[graphify] ${chunk.toString().trim()}`);
  });

  _child.on('exit', (code) => {
    console.warn(`[graphify_ipc] Server exited with code ${code}`);
    _child = null;
    _ready = false;
  });

  _child.on('error', (err) => {
    console.error(`[graphify_ipc] Spawn error: ${err.message}`);
    _child = null;
    _ready = false;
  });
}

function _stop() {
  if (_child) {
    try { _child.kill('SIGTERM'); } catch (_) {}
    _child = null;
  }
  _ready = false;
}

function register({ app }) {
  ipcMain.handle('graphify:start', async (_, repoPath) => {
    _repoPath = repoPath || null;
    _spawn(app);
    return { ok: true, port: _port };
  });

  ipcMain.handle('graphify:stop', async () => {
    _stop();
    return { ok: true };
  });

  ipcMain.handle('graphify:status', async () => {
    return { running: !!_child && _ready, port: _port };
  });

  ipcMain.handle('graphify:getPort', async () => {
    return { port: _port };
  });
}

// Kill child on app quit
function shutdown() {
  _stop();
}

module.exports = { register, shutdown };