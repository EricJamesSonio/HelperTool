'use strict';

const os = require('os');
const fs = require('fs');
const pty = require('node-pty');
const { BrowserDiscovery } = require('../../terminal/error-cop/browser-discovery');
const { processChunk } = require('./log-adapter');
const session = require('../session');
const { log } = require('../constants');

// ─── Constants ───
const MAX_OUTPUT_LINES = 5000;
const RUNNER_PREFIX = 'runner_';

const RUNNER_STATUS = Object.freeze({
  RUNNING: 'running',
  ENDED: 'ended',
  FAILED: 'failed',
  KILLED: 'killed',
});

// ─── Private State ───
let _runners = null;
let _nextId = 1;

function _init() {
  if (_runners) return;
  _runners = new Map();
}

function _nextRunnerId() {
  return RUNNER_PREFIX + (_nextId++);
}

function _defaultShell() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || 'bash';
}

// ─── Ring Buffer for raw output ───
function _createOutputBuffer(capacity) {
  const cap = capacity || MAX_OUTPUT_LINES;
  const buf = new Array(cap);
  let head = 0;
  let count = 0;

  function push(line) {
    buf[head] = line;
    head = (head + 1) % cap;
    if (count < cap) count++;
  }

  function getLast(n) {
    const limit = Math.min(n || 100, count);
    const start = Math.max(0, count - limit);
    const result = [];
    const tail = head - count;
    for (let i = start; i < count; i++) {
      const idx = (tail + i + cap) % cap;
      result.push(buf[idx]);
    }
    return result;
  }

  function size() { return count; }
  function clear() { head = 0; count = 0; }

  return { push, getLast, size, clear };
}

// ─── Public API ───

function run({ command, cwd, shell } = {}) {
  if (!command) return { success: false, error: 'command is required' };
  _init();

  const resolvedCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  const shellCmd = shell || _defaultShell();
  const runnerId = _nextRunnerId();
  const discovery = new BrowserDiscovery();
  const outputBuf = _createOutputBuffer(MAX_OUTPUT_LINES);

  // Create watcher session
  let watcherSession;
  try {
    watcherSession = session.createSession(runnerId, {
      source: 'user',
      command: command.slice(0, 200),
      cwd: resolvedCwd,
    });
  } catch (e) {
    console.error('[ProcessRunner] createSession failed:', e.message);
    return { success: false, error: 'Failed to create session: ' + e.message };
  }

  const p = pty.spawn(shellCmd, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: resolvedCwd,
    env: Object.assign({}, process.env),
  });

  const entry = {
    runnerId,
    sessionId: runnerId,
    pty: p,
    command,
    cwd: resolvedCwd,
    shell: shellCmd,
    outputBuf,
    discovery,
    startedAt: Date.now(),
    status: RUNNER_STATUS.RUNNING,
    exitCode: null,
    detectedUrls: [],
    _closed: false,
  };

  _runners.set(runnerId, entry);

  const onData = function (data) {
    if (entry._closed) return;

    // Raw output ring buffer
    const lines = data.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) outputBuf.push(lines[i]);
    }

    // Process as watcher events via log-adapter
    // perf: processChunk() avg 0.01ms per chunk
    processChunk(data, runnerId, function (sid, events) {
      session.pushEvents(sid, events);
    });

    // URL detection via BrowserDiscovery
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      try {
        const info = discovery.scanLine(lines[i], runnerId, outputBuf.getLast(200));
        if (info) {
          const dup = entry.detectedUrls.find(function (u) { return u.port === info.port; });
          if (!dup) {
            entry.detectedUrls.push({
              port: info.port,
              url: info.url,
              framework: info.framework,
              detectedAt: Date.now(),
            });
            log('Detected URL:', info.url, 'framework:', info.framework);
          }
        }
      } catch (e) {
        console.error('[ProcessRunner] scanLine error:', e.message);
      }
    }
  };

  const onExit = function (exitCode) {
    if (entry._closed) return;
    entry._closed = true;
    entry.status = exitCode === 0 ? RUNNER_STATUS.ENDED : RUNNER_STATUS.FAILED;
    entry.exitCode = exitCode;

    try {
      session.endSession(runnerId);
    } catch (e) {
      console.error('[ProcessRunner] endSession error:', e.message);
    }

    log('Process exited:', runnerId, 'code:', exitCode);
  };

  p.onData(onData);
  p.onExit(onExit);

  // Write command to the PTY
  p.write(command + '\n');

  log('Process started:', runnerId, 'command:', command.slice(0, 80));
  return { success: true, data: { runnerId, sessionId: runnerId, command, cwd: resolvedCwd } };
}

function stop(runnerId) {
  if (!_runners) return { success: false, error: 'No runners' };
  const entry = _runners.get(runnerId);
  if (!entry) return { success: false, error: 'Runner not found: ' + runnerId };

  if (!entry._closed) {
    entry._closed = true;
    try { entry.pty.kill(); } catch (e) {
      console.error('[ProcessRunner] kill error:', e.message);
    }
    entry.status = RUNNER_STATUS.KILLED;
    try {
      session.endSession(runnerId);
    } catch (e) {
      console.error('[ProcessRunner] endSession on stop error:', e.message);
    }
  }

  _runners.delete(runnerId);
  log('Process stopped:', runnerId);
  return { success: true };
}

function list() {
  if (!_runners) return { success: true, data: [] };
  const result = [];
  for (const [, entry] of _runners) {
    result.push({
      runnerId: entry.runnerId,
      sessionId: entry.sessionId,
      command: entry.command,
      cwd: entry.cwd,
      status: entry.status,
      exitCode: entry.exitCode,
      startedAt: entry.startedAt,
      uptime: entry._closed ? null : Math.floor((Date.now() - entry.startedAt) / 1000),
      detectedUrls: entry.detectedUrls,
      outputLineCount: entry.outputBuf.size(),
    });
  }
  return { success: true, data: result };
}

function getStatus(runnerId) {
  if (!_runners) return null;
  const entry = _runners.get(runnerId);
  if (!entry) return null;
  return {
    runnerId: entry.runnerId,
    sessionId: entry.sessionId,
    command: entry.command,
    cwd: entry.cwd,
    status: entry.status,
    exitCode: entry.exitCode,
    startedAt: entry.startedAt,
    uptime: entry._closed ? null : Math.floor((Date.now() - entry.startedAt) / 1000),
    detectedUrls: entry.detectedUrls,
    outputLineCount: entry.outputBuf.size(),
  };
}

function getOutput(runnerId, tail) {
  if (!_runners) return { success: true, data: '' };
  const entry = _runners.get(runnerId);
  if (!entry) return { success: true, data: '' };
  const lines = entry.outputBuf.getLast(tail || 100);
  return { success: true, data: lines.join('\n') };
}

function stopAll() {
  if (!_runners) return;
  for (const [id] of _runners) {
    stop(id);
  }
  _runners = null;
  log('All runners stopped');
}

module.exports = {
  run,
  stop,
  list,
  getStatus,
  getOutput,
  stopAll,
  RUNNER_STATUS,
};
