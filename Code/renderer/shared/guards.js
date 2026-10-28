// renderer/shared/guards.js
export const GUARDS = {
  NORMAL_GAP_MS: 500,
  APPLY_GAP_MS: 1200,
  PROCESS_GAP_MS: 800,
  SEED_GAP_MS: 1500,
  PREVIEW_DEBOUNCE_MS: 250,
  IPC_TIMEOUT_MS: 30000,
};

const _locks = new Map();
const _lastRun = new Map();

export function guardAsync(fn, { key, minGapMs = GUARDS.NORMAL_GAP_MS, lockWhileRunning = true } = {}) {
  return async (...args) => {
    const now = Date.now();
    const last = _lastRun.get(key) || 0;
    if (now - last < minGapMs) {
      showToast('Please wait');
      return;
    }
    if (lockWhileRunning && _locks.get(key)) {
      showToast('Working...');
      return;
    }
    if (lockWhileRunning) _locks.set(key, true);
    _lastRun.set(key, now);
    try {
      return await fn(...args);
    } catch (err) {
      _lastRun.delete(key);
      throw err;
    } finally {
      if (lockWhileRunning) _locks.delete(key);
    }
  };
}

export function debounce(fn, ms = GUARDS.PREVIEW_DEBOUNCE_MS) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
}

export function throttle(fn, ms = GUARDS.NORMAL_GAP_MS) {
  let last = 0;
  let t = null;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    } else if (!t) {
      t = setTimeout(() => { t = null; last = Date.now(); fn(...args); }, ms - (now - last));
    }
  };
}

export function withTimeout(promise, ms = GUARDS.IPC_TIMEOUT_MS, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms)),
  ]);
}

let _toastTimer = null;
export function showToast(msg) {
  let el = document.getElementById('htToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'htToast';
    el.style.cssText = 'position:fixed;bottom:16px;right:16px;padding:8px 14px;background:#222;color:#fff;border-radius:6px;z-index:99999;font-size:13px;opacity:0;transition:opacity .2s;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1200);
}