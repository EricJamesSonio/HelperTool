'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..', '..');
const READY_TIMEOUT_MS = 20000;
const DEFAULT_TIMEOUT_MS = 120000;
const IDLE_MS = 5 * 60 * 1000;
const EXE_NAME = process.platform === 'win32' ? 'pdf-master-engine.exe' : 'pdf-master-engine';

let _proc = null;
let _info = null;
let _starting = null;
let _idleTimer = null;
const _pending = new Map();

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function unpacked(p) {
  return String(p).replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked');
}

function candidates() {
  const list = [];
  if (process.resourcesPath) {
    list.push({
      kind: 'bundled',
      cmd: path.join(process.resourcesPath, 'pdf-master-engine', EXE_NAME),
      args: [],
    });
  }
  list.push({
    kind: 'bundled',
    cmd: path.join(ROOT, 'pdf-master', 'dist', 'pdf-master-engine', EXE_NAME),
    args: [],
  });
  const script = unpacked(path.join(ROOT, 'pdf-master', 'engine', 'main.py'));
  const custom = process.env.PDF_MASTER_PYTHON;
  if (custom) {
    list.push({ kind: 'python', cmd: custom, args: [script], script });
  }
  if (process.platform === 'win32') {
    list.push({ kind: 'python', cmd: 'py', args: ['-3', script], script });
  }
  list.push({ kind: 'python', cmd: 'python', args: [script], script });
  list.push({ kind: 'python', cmd: 'python3', args: [script], script });
  return list;
}

function engineEnv() {
  return Object.assign({}, process.env, {
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
  });
}

function killProc(proc) {
  if (!proc) return;
  try { proc.stdin.end(); } catch (_) {}
  try { proc.kill(); } catch (_) {}
}

function clearIdle() {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
}

function scheduleIdle() {
  clearIdle();
  if (!_proc) return;
  _idleTimer = setTimeout(() => {
    if (_pending.size === 0) shutdown();
  }, IDLE_MS);
  if (_idleTimer.unref) _idleTimer.unref();
}

function finish(requestId, err, value) {
  const entry = _pending.get(requestId);
  if (!entry) return;
  _pending.delete(requestId);
  clearTimeout(entry.timer);
  if (err) entry.reject(err);
  else entry.resolve(value);
  if (_pending.size === 0) scheduleIdle();
}

function route(line) {
  const text = String(line || '').trim();
  if (!text) return;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch (_) {
    return;
  }
  if (!msg || typeof msg.requestId !== 'string') return;
  const entry = _pending.get(msg.requestId);
  if (!entry) return;
  if (msg.type === 'progress') {
    if (entry.onProgress) {
      try {
        entry.onProgress({ stage: msg.stage, percent: msg.percent, message: msg.message });
      } catch (_) {}
    }
    return;
  }
  if (msg.type === 'result') {
    finish(msg.requestId, null, msg.payload);
    return;
  }
  if (msg.type === 'error') {
    finish(msg.requestId, fail(msg.code || 'ENGINE_ERROR', msg.message || 'The engine reported an error.'));
  }
}

function onExit(proc, code) {
  if (_proc !== proc) return;
  _proc = null;
  _info = null;
  for (const id of Array.from(_pending.keys())) {
    finish(id, fail('ENGINE_EXITED', 'The document engine stopped unexpectedly (code ' + code + ').'));
  }
}

function resetEngine(cancelJobId) {
  const proc = _proc;
  _proc = null;
  _info = null;
  clearIdle();
  for (const [id, entry] of Array.from(_pending)) {
    const cancelled = cancelJobId && entry.jobId === cancelJobId;
    finish(id, cancelled ? fail('CANCELLED', 'Cancelled.') : fail('ENGINE_RESET', 'The engine was restarted. Please try again.'));
  }
  killProc(proc);
}

function launch(candidate) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(candidate.cmd, candidate.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
        cwd: path.dirname(candidate.script || candidate.cmd),
        env: engineEnv(),
      });
    } catch (e) {
      reject(fail('SPAWN_FAILED', e.message));
      return;
    }
    let settled = false;
    let stderrTail = '';
    const rl = readline.createInterface({ input: proc.stdout, terminal: false });
    const done = (err, info) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        try { rl.close(); } catch (_) {}
        killProc(proc);
        reject(err);
        return;
      }
      resolve({ proc, info });
    };
    const timer = setTimeout(() => done(fail('START_TIMEOUT', 'The document engine did not start in time.')), READY_TIMEOUT_MS);
    proc.stdin.on('error', () => {});
    proc.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-1500);
    });
    proc.on('error', (e) => {
      done(fail(e && e.code === 'ENOENT' ? 'NOT_FOUND' : 'SPAWN_FAILED', e ? e.message : 'Spawn failed'));
    });
    proc.on('exit', (code) => {
      if (!settled) {
        setTimeout(() => {
          done(fail('EXITED', 'The engine exited with code ' + code + '. ' + stderrTail.trim()));
        }, 50);
        return;
      }
      onExit(proc, code);
    });
    rl.on('line', (line) => {
      if (!settled) {
        let msg = null;
        try {
          msg = JSON.parse(String(line).trim());
        } catch (_) {
          return;
        }
        if (!msg || msg.type !== 'ready') return;
        if (msg.ok === false) {
          done(fail(msg.code || 'ENGINE_ERROR', msg.message || 'The engine could not start.'));
          return;
        }
        done(null, { version: msg.version || '', python: msg.python || '' });
        return;
      }
      if (_proc === proc) route(line);
    });
  });
}

function pickError(errors, sawPython) {
  const priority = ['MISSING_DEPENDENCY', 'ENGINE_LOAD_ERROR', 'SCRIPT_MISSING'];
  for (const code of priority) {
    const hit = errors.find((e) => e.code === code);
    if (hit) return hit;
  }
  const exited = errors.find((e) => e.code === 'EXITED');
  if (exited) {
    const text = exited.message.trim();
    const detail = text.length > 500 ? text.slice(-500) : text;
    return fail('ENGINE_START_FAILED', 'The PDF engine crashed on startup. Details: ' + detail);
  }
  let message = 'The PDF engine could not be started.';
  if (sawPython) {
    message += ' Install Python 3.9 or newer and run "pip install -r pdf-master/engine/requirements.txt", or add the bundled pdf-master-engine build.';
  } else {
    message += ' The bundled pdf-master-engine build was not found in this installation.';
  }
  return fail('ENGINE_NOT_FOUND', message);
}

function ensure() {
  if (_proc && _info) return Promise.resolve(_info);
  if (_starting) return _starting;
  const run = async () => {
    const errors = [];
    let sawPython = false;
    for (const candidate of candidates()) {
      if (candidate.kind === 'bundled' && !fs.existsSync(candidate.cmd)) continue;
      if (candidate.kind === 'python') {
        if (!fs.existsSync(candidate.script)) {
          errors.push(fail('SCRIPT_MISSING', 'The PDF engine files were not found at ' + candidate.script));
          continue;
        }
        sawPython = true;
      }
      try {
        const res = await launch(candidate);
        _proc = res.proc;
        _info = Object.assign({ launcher: candidate.kind }, res.info);
        scheduleIdle();
        return _info;
      } catch (e) {
        errors.push(e);
      }
    }
    throw pickError(errors, sawPython);
  };
  const p = run();
  _starting = p;
  const clear = () => {
    if (_starting === p) _starting = null;
  };
  p.then(clear, clear);
  return p;
}

async function status() {
  try {
    const info = await ensure();
    return { available: true, launcher: info.launcher, version: info.version, python: info.python };
  } catch (e) {
    return { available: false, code: e.code || 'ERROR', error: e.message || String(e) };
  }
}

async function request(operation, payload, opts) {
  const options = opts || {};
  await ensure();
  const proc = _proc;
  if (!proc) throw fail('ENGINE_EXITED', 'The document engine is not running.');
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      finish(requestId, fail('TIMEOUT', 'The operation took too long and was stopped.'));
      resetEngine('');
    }, timeoutMs);
    _pending.set(requestId, {
      jobId: options.jobId || '',
      onProgress: options.onProgress || null,
      resolve,
      reject,
      timer,
    });
    clearIdle();
    const body = JSON.stringify({
      type: 'request',
      requestId,
      operation,
      payload: Object.assign({}, payload, { jobId: options.jobId || '' }),
    }) + '\n';
    proc.stdin.write(body, (err) => {
      if (err) finish(requestId, fail('ENGINE_EXITED', 'Could not reach the document engine.'));
    });
  });
}

function cancel(jobId) {
  if (!jobId) return false;
  let found = false;
  for (const entry of _pending.values()) {
    if (entry.jobId === jobId) found = true;
  }
  if (!found) return false;
  resetEngine(jobId);
  return true;
}

function shutdown(force) {
  clearIdle();
  const proc = _proc;
  _proc = null;
  _info = null;
  for (const id of Array.from(_pending.keys())) {
    finish(id, fail('ENGINE_STOPPED', 'The document engine was stopped.'));
  }
  if (!proc) return;
  if (force) {
    killProc(proc);
    return;
  }
  try { proc.stdin.end(); } catch (_) {}
  const timer = setTimeout(() => {
    try { proc.kill(); } catch (_) {}
  }, 2000);
  if (timer.unref) timer.unref();
}

module.exports = { status, request, cancel, shutdown };