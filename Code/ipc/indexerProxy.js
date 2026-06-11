const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const EventEmitter = require('events');

function uuid() { return crypto.randomUUID(); }

let _child = null;
let _pending = new Map();
let _rl = null;
let _restartTimer = null;
let _restartDelay = 1000;
let _ready = false;
let _queue = [];
const _events = new EventEmitter();

function _getIndexerPath() {
  return path.join(__dirname, '..', 'indexer-service', 'indexer.js');
}

function _spawn() {
  if (_child) { try { _child.kill(); } catch (_) {}; _child = null; }

  const indexPath = _getIndexerPath();
  _child = spawn('node', [indexPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  _ready = false;

  _rl = readline.createInterface({ input: _child.stdout, terminal: false });
  _rl.on('line', (line) => {
    line = line.trim();
    if (!line) return;
    try {
      const msg = JSON.parse(line);
      if (msg.id === 'bootstrap' && msg.type === 'ready') {
        _ready = true;
        _restartDelay = 1000;
        _flushQueue();
        return;
      }
      // Progress messages are unsolicited — emit as events
      if (msg.type === 'progress') {
        _events.emit('progress', msg.data || {});
        return;
      }
      const pending = _pending.get(msg.id);
      if (pending) {
        _pending.delete(msg.id);
        pending.resolve(msg);
      }
    } catch (_) {}
  });

  _child.stderr.on('data', (chunk) => {
    console.error(`[indexer] ${chunk.toString().trim()}`);
  });

  _child.on('exit', (code) => {
    console.warn(`[indexer] Exited with code ${code}`);
    _ready = false; _child = null; _rl = null;
    for (const [, p] of _pending) p.reject(new Error('Indexer process exited'));
    _pending.clear();
    _scheduleRestart();
  });

  _child.on('error', (err) => {
    console.error(`[indexer] Spawn error:`, err.message);
    _scheduleRestart();
  });
}

function _scheduleRestart() {
  if (_restartTimer) return;
  _restartTimer = setTimeout(() => { _restartTimer = null; _spawn(); }, _restartDelay);
  _restartDelay = Math.min(_restartDelay * 2, 30000);
}

function _flushQueue() {
  const items = _queue.splice(0);
  for (const item of items) _send(item.msg, item.timeout).then(item.resolve).catch(item.reject);
}

function _send(msg, timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (!_child) { reject(new Error('Indexer not running')); return; }
    const id = msg.id || uuid();
    msg.id = id;
    const timer = setTimeout(() => { _pending.delete(id); reject(new Error(`Indexer request timed out: ${msg.type}`)); }, timeout);
    _pending.set(id, { resolve: (res) => { clearTimeout(timer); resolve(res); }, reject: (err) => { clearTimeout(timer); reject(err); } });
    _child.stdin.write(JSON.stringify(msg) + '\n');
  });
}

function _queueOrSend(msg, timeout) {
  if (_ready) return _send(msg, timeout);
  return new Promise((resolve, reject) => { _queue.push({ msg, timeout, resolve, reject }); });
}

// ── Public API ──

function start() { if (!_child) _spawn(); }

function stop() {
  if (_restartTimer) { clearTimeout(_restartTimer); _restartTimer = null; }
  if (_child) { try { _child.kill(); } catch (_) {}; _child = null; }
  _ready = false; _pending.clear(); _queue = [];
}

function isReady() { return _ready; }

async function send(type, payload, timeout) {
  const res = await _queueOrSend({ type, payload }, timeout);
  if (!res.ok) throw new Error(res.error || 'Indexer error');
  return res.data || null;
}

function onProgress(cb) { _events.on('progress', cb); }
function offProgress(cb) { _events.off('progress', cb); }

module.exports = { start, stop, isReady, send, onProgress, offProgress };
