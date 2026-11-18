'use strict';

const BOOT_POLL_MS = 500;
const BOOT_CAP_MS = 25000;
const CALM_SAMPLE_MS = 100;
const CALM_LAG_MS = 40;
const CALM_NEEDED = 3;
const CALM_CAP_MS = 8000;
const TASK_GAP_MS = 400;
const BOOT_PROBE = "!!document.getElementById('app') && !document.getElementById('appLoadingOverlay')";

let _getWindow = null;
let _bootPromise = null;
let _queue = [];
let _running = false;

function init(getWindow) {
  if (typeof getWindow === 'function') _getWindow = getWindow;
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function _windowOf() {
  try {
    return _getWindow ? _getWindow() : null;
  } catch (_) {
    return null;
  }
}

function whenBooted() {
  if (_bootPromise) return _bootPromise;
  _bootPromise = new Promise((resolve) => {
    const started = Date.now();
    const tick = async () => {
      if (Date.now() - started > BOOT_CAP_MS) {
        resolve();
        return;
      }
      const win = _windowOf();
      if (win && (win.isDestroyed() || win.webContents.isDestroyed())) {
        resolve();
        return;
      }
      if (win && !win.webContents.isLoading()) {
        try {
          if (await win.webContents.executeJavaScript(BOOT_PROBE)) {
            resolve();
            return;
          }
        } catch (_) {}
      }
      setTimeout(tick, BOOT_POLL_MS);
    };
    tick();
  });
  return _bootPromise;
}

function _calm() {
  return new Promise((resolve) => {
    const started = Date.now();
    let calm = 0;
    let last = Date.now();
    const sample = () => {
      const now = Date.now();
      const lag = now - last - CALM_SAMPLE_MS;
      last = now;
      calm = lag <= CALM_LAG_MS ? calm + 1 : 0;
      if (calm >= CALM_NEEDED || now - started > CALM_CAP_MS) {
        resolve();
        return;
      }
      setTimeout(sample, CALM_SAMPLE_MS);
    };
    setTimeout(sample, CALM_SAMPLE_MS);
  });
}

async function _pump() {
  if (_running) return;
  _running = true;
  try {
    await whenBooted();
    while (_queue.length) {
      await _calm();
      const task = _queue.shift();
      if (!task) break;
      try {
        await task.fn();
      } catch (err) {
        console.warn('[Startup] task failed:', task.name, err && err.message ? err.message : err);
      }
      await _sleep(TASK_GAP_MS);
    }
  } finally {
    _running = false;
  }
}

function enqueue(name, fn, priority) {
  const p = Number.isFinite(priority) ? priority : 5;
  let i = _queue.length;
  while (i > 0 && _queue[i - 1].priority > p) i -= 1;
  _queue.splice(i, 0, { name, fn, priority: p });
  _pump();
}

module.exports = { init, enqueue, whenBooted };