const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const EventEmitter = require('events');

function uuid() { return crypto.randomUUID(); }

const STOP_GRACE_MS = 3000;

let _child = null;
let _pending = new Map();
let _rl = null;
let _restartTimer = null;
let _restartDelay = 1000;
let _ready = false;
let _queue = [];
let _dbPath = null;
let _disabled = false;
let _asleep = false;
const _events = new EventEmitter();

function _getIndexerPath() {
  return path.join(__dirname, '..', 'indexer-service', 'indexer.js');
}

function _terminate(child) {
  if (!child) return;
  try { child.stdin.end(); } catch (_) {}
  const timer = setTimeout(() => { try { child.kill(); } catch (_) {} }, STOP_GRACE_MS);
  if (timer.unref) timer.unref();
  child.once('exit', () => clearTimeout(timer));
}

function _spawn() {
  if (_child) { try { _child.kill(); } catch (_) {}; _child = null; }

  _asleep = false;
  const indexPath = _getIndexerPath();
  const args = [indexPath];
  if (_dbPath) args.push(_dbPath);
  const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  _child = child;
  _ready = false;

  child.stdin.on('error', () => {});

  _rl = readline.createInterface({ input: child.stdout, terminal: false });
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

  child.stderr.on('data', (chunk) => {
    console.error('[indexer] ' + chunk.toString().trim());
  });

  child.on('exit', (code) => {
    console.warn('[indexer] Exited with code ' + code);
    if (_child !== child) return;
    _ready = false; _child = null; _rl = null;
    for (const [, p] of _pending) p.reject(new Error('Indexer process exited'));
    _pending.clear();
    _scheduleRestart();
  });

  child.on('error', (err) => {
    console.error('[indexer] Spawn error:', err.message);
    if (_child !== child) return;
    _scheduleRestart();
  });
}

function _scheduleRestart() {
  if (_disabled || _asleep || _restartTimer) return;
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
    const timer = setTimeout(() => { _pending.delete(id); reject(new Error('Indexer request timed out: ' + msg.type)); }, timeout);
    _pending.set(id, { resolve: (res) => { clearTimeout(timer); resolve(res); }, reject: (err) => { clearTimeout(timer); reject(err); } });
    _child.stdin.write(JSON.stringify(msg) + '\n');
  });
}

function _queueOrSend(msg, timeout) {
  if (_disabled) return Promise.reject(new Error('Indexer is turned off'));
  if (_asleep) wake();
  if (_ready) return _send(msg, timeout);
  return new Promise((resolve, reject) => { _queue.push({ msg, timeout, resolve, reject }); });
}

function start(dbPath) {
  _disabled = false;
  _asleep = false;
  if (dbPath) _dbPath = dbPath;
  if (_restartTimer) { clearTimeout(_restartTimer); _restartTimer = null; }
  if (!_child) _spawn();
}

function stop() {
  _disabled = true;
  _asleep = false;
  if (_restartTimer) { clearTimeout(_restartTimer); _restartTimer = null; }
  const child = _child;
  _child = null;
  _rl = null;
  _ready = false;
  const err = new Error('Indexer stopped');
  for (const [, p] of _pending) p.reject(err);
  _pending.clear();
  const queued = _queue;
  _queue = [];
  for (const item of queued) item.reject(err);
  _terminate(child);
}

function isBusy() {
  return _pending.size > 0 || _queue.length > 0;
}

function sleep(force) {
  if (_disabled) return { ok: true, already: true };
  if (!_child && !_restartTimer) return { ok: true, already: true };
  if (isBusy() && !force) return { ok: false, busy: true };
  _asleep = true;
  if (_restartTimer) { clearTimeout(_restartTimer); _restartTimer = null; }
  const child = _child;
  _child = null;
  _rl = null;
  _ready = false;
  const err = new Error('Indexer went to sleep');
  for (const [, p] of _pending) p.reject(err);
  _pending.clear();
  const queued = _queue;
  _queue = [];
  for (const item of queued) item.reject(err);
  _terminate(child);
  return { ok: true };
}

function wake() {
  if (!_asleep) return false;
  _asleep = false;
  if (!_disabled && !_child) _spawn();
  return true;
}

function isAsleep() { return _asleep; }

function isReady() { return _ready; }

async function send(type, payload, timeout) {
  const res = await _queueOrSend({ type, payload }, timeout);
  if (!res.ok) throw new Error(res.error || 'Indexer error');
  return res.data || null;
}

function onProgress(cb) { _events.on('progress', cb); }
function offProgress(cb) { _events.off('progress', cb); }

module.exports = { start, stop, sleep, wake, isAsleep, isBusy, isReady, send, onProgress, offProgress };