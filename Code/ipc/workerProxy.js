const { fork } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const { updateService } = require('./serviceTracker_ipc.js');

let _worker = null;
let _pending = new Map();
let _requestId = 0;
let _restartTimer = null;
let _restartDelay = 1000;
let _ready = false;
let _queue = [];

const _events = new EventEmitter();

function _getWorkerPath() {
  return path.join(__dirname, '..', 'worker-service', 'worker.js');
}

function _spawn() {
  if (_worker) {
    try { _worker.kill(); } catch (_) {}
    _worker = null;
  }
  _ready = false;
  updateService('worker', 'running', 'Starting worker process...');

  const workerPath = _getWorkerPath();
  _worker = fork(workerPath, [], { silent: false });

  _worker.on('message', (msg) => {
    if (msg.id === 'bootstrap' && msg.type === 'ready') {
      _ready = true;
      _restartDelay = 1000;
      _flushQueue();
      updateService('worker', 'done');
      return;
    }

    // Progress is an unsolicited event
    if (msg.type === 'progress') {
      _events.emit('progress', msg.data || {});
      return;
    }

    const resolver = _pending.get(msg.id);
    if (!resolver) return;
    _pending.delete(msg.id);

    if (msg.type === 'result') {
      resolver.resolve(msg.data);
    } else {
      resolver.reject(new Error(msg.message || 'Worker error'));
    }
  });

  _worker.on('exit', (code) => {
    console.warn(`[Worker] Exited with code ${code}`);
    _ready = false;
    updateService('worker', 'failed', `Exited with code ${code}`);
    _worker = null;
    for (const [, p] of _pending) p.reject(new Error('Worker process exited'));
    _pending.clear();
    for (const item of _queue) item.reject(new Error('Worker process exited'));
    _queue = [];
    _scheduleRestart();
  });

  _worker.on('error', (err) => {
    console.error('[Worker] Spawn error:', err.message);
    updateService('worker', 'failed', err.message);
    _scheduleRestart();
  });
}

function _flushQueue() {
  const items = _queue.splice(0);
  for (const item of items) {
    _sendRaw(item.msg, item.timeout).then(item.resolve).catch(item.reject);
  }
}

function _sendRaw(msg, timeout) {
  return new Promise((resolve, reject) => {
    if (!_worker) { reject(new Error('Worker not running')); return; }
    const id = ++_requestId;
    const resolvedTimeout = timeout || 120000;

    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error(`Worker request timed out: ${msg.type}`));
    }, resolvedTimeout);

    _pending.set(id, {
      resolve: (res) => { clearTimeout(timer); resolve(res); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });

    _worker.send({ id, type: msg.type, payload: msg.payload });
  });
}

function _queueOrSend(msg, timeout) {
  if (_ready) return _sendRaw(msg, timeout);
  return new Promise((resolve, reject) => {
    _queue.push({ msg, timeout, resolve, reject });
  });
}

function _scheduleRestart() {
  if (_restartTimer) return;
  _restartTimer = setTimeout(() => {
    _restartTimer = null;
    _spawn();
  }, _restartDelay);
  _restartDelay = Math.min(_restartDelay * 2, 30000);
}

function start() {
  if (!_worker) _spawn();
}

function stop() {
  if (_restartTimer) {
    clearTimeout(_restartTimer);
    _restartTimer = null;
  }
  if (_worker) {
    try { _worker.kill(); } catch (_) {}
    _worker = null;
  }
  _ready = false;
  _pending.clear();
  _queue = [];
}

function isReady() {
  return _ready;
}

async function send(type, payload, timeout) {
  const res = await _queueOrSend({ type, payload }, timeout);
  return res;
}

function onProgress(cb) {
  _events.on('progress', cb);
}

function offProgress(cb) {
  _events.off('progress', cb);
}

module.exports = { start, stop, isReady, send, onProgress, offProgress };
