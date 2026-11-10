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
let _idle = false;
let _stopped = false;

const _events = new EventEmitter();

function _getWorkerPath() {
  return path.join(__dirname, '..', 'worker-service', 'worker.js');
}

function _rejectAll(err) {
  for (const [, p] of _pending) p.reject(err);
  _pending.clear();
  const items = _queue;
  _queue = [];
  for (const item of items) item.reject(err);
}

function _killWorker(reason) {
  if (_restartTimer) {
    clearTimeout(_restartTimer);
    _restartTimer = null;
  }
  const child = _worker;
  _worker = null;
  _ready = false;
  _rejectAll(new Error(reason));
  if (child) {
    try { child.kill(); } catch (_) {}
  }
}

function _spawn() {
  if (_worker) {
    const old = _worker;
    _worker = null;
    try { old.kill(); } catch (_) {}
  }
  _idle = false;
  _stopped = false;
  _ready = false;
  updateService('worker', 'running', 'Starting worker process...');

  const child = fork(_getWorkerPath(), [], { silent: false });
  _worker = child;

  child.on('message', (msg) => {
    if (msg.id === 'bootstrap' && msg.type === 'ready') {
      _ready = true;
      _restartDelay = 1000;
      _flushQueue();
      updateService('worker', 'done');
      return;
    }

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

  child.on('exit', (code) => {
    console.warn('[Worker] Exited with code ' + code);
    if (_worker !== child) return;
    _ready = false;
    _worker = null;
    updateService('worker', 'failed', 'Exited with code ' + code);
    _rejectAll(new Error('Worker process exited'));
    _scheduleRestart();
  });

  child.on('error', (err) => {
    console.error('[Worker] Spawn error:', err.message);
    if (_worker !== child) return;
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
      reject(new Error('Worker request timed out: ' + msg.type));
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
  if (_restartTimer || _idle || _stopped) return;
  _restartTimer = setTimeout(() => {
    _restartTimer = null;
    _spawn();
  }, _restartDelay);
  _restartDelay = Math.min(_restartDelay * 2, 30000);
}

function start() {
  _stopped = false;
  _idle = false;
  if (!_worker) _spawn();
}

function stop() {
  _stopped = true;
  _killWorker('Worker stopped');
}

function isBusy() {
  return _pending.size > 0 || _queue.length > 0;
}

function sleep(force) {
  if (!_worker && !_restartTimer) {
    _idle = true;
    return { ok: true, already: true };
  }
  if (isBusy() && !force) return { ok: false, busy: true };
  _idle = true;
  _killWorker('Worker went to sleep');
  updateService('worker', 'done', 'Asleep');
  return { ok: true };
}

function wake() {
  if (!_idle) return false;
  _idle = false;
  if (!_worker && !_stopped) _spawn();
  return true;
}

function isAsleep() {
  return _idle;
}

function isReady() {
  return _ready;
}

async function send(type, payload, timeout) {
  if (!_worker && !_restartTimer && !_stopped) _spawn();
  const res = await _queueOrSend({ type, payload }, timeout);
  return res;
}

function onProgress(cb) {
  _events.on('progress', cb);
}

function offProgress(cb) {
  _events.off('progress', cb);
}

module.exports = { start, stop, sleep, wake, isAsleep, isBusy, isReady, send, onProgress, offProgress };