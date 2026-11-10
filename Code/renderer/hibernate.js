const nativeSetInterval = window.setInterval.bind(window);
const nativeSetTimeout = window.setTimeout.bind(window);
const nativeClearTimeout = window.clearTimeout.bind(window);

const POLL_MIN_MS = 1000;
const LONG_MIN_MS = 5000;
const REARM_MS = 2000;
const QUIET_MS = 120000;

let asleep = false;
const rearm = new Map();

window.setInterval = function (fn, ms, ...args) {
  if (typeof fn !== 'function' || !(Number(ms) >= POLL_MIN_MS)) {
    return nativeSetInterval(fn, ms, ...args);
  }
  return nativeSetInterval(function () {
    if (asleep) return;
    fn.apply(window, args);
  }, ms);
};

window.setTimeout = function (fn, ms, ...args) {
  if (typeof fn !== 'function' || !(Number(ms) >= LONG_MIN_MS)) {
    return nativeSetTimeout(fn, ms, ...args);
  }
  let id = 0;
  const run = function () {
    if (asleep) {
      rearm.set(id, nativeSetTimeout(run, REARM_MS));
      return;
    }
    rearm.delete(id);
    fn.apply(window, args);
  };
  id = nativeSetTimeout(run, ms);
  return id;
};

window.clearTimeout = function (id) {
  const cur = rearm.get(id);
  if (cur !== undefined) {
    nativeClearTimeout(cur);
    rearm.delete(id);
  }
  nativeClearTimeout(id);
};

export function isAsleep() {
  return asleep;
}

async function closeIdleCodeSwamp() {
  if (!document.getElementById('ocPanel')) return;
  const tm = await import('./codeswampUI/terminalManager.js');
  const list = tm.getTerminalInstances();
  const now = Date.now();
  let closed = 0;
  for (const key of Object.keys(list)) {
    const inst = list[key];
    if (!inst) continue;
    if (now - (inst.lastDataAt || 0) < QUIET_MS) continue;
    tm.killSlot(Number(key));
    closed += 1;
  }
  if (!closed) return;
  if (Object.keys(tm.getTerminalInstances()).length === 0) {
    const wrapper = document.getElementById('ocTerminal');
    const welcome = document.getElementById('ocWelcome');
    if (wrapper) {
      wrapper.classList.remove('oc-terminal--stage');
      wrapper.style.display = 'none';
    }
    if (welcome) welcome.style.display = '';
  }
  document.dispatchEvent(new CustomEvent('cs:slept', { detail: {} }));
}

function setAsleep(next) {
  if (next === asleep) return;
  asleep = next;
  if (document.documentElement) document.documentElement.classList.toggle('app-asleep', asleep);
  if (asleep) {
    closeIdleCodeSwamp().catch(() => {});
  }
  document.dispatchEvent(new CustomEvent(asleep ? 'app:hibernate' : 'app:wake'));
}

function applyState(state) {
  const data = state || {};
  setAsleep(!!data.asleep);
  document.dispatchEvent(new CustomEvent('app:hibernate-state', { detail: data }));
}

function syncFromMain() {
  if (!window.hibernateAPI) return;
  window.hibernateAPI.getState().then(applyState).catch(() => {});
}

if (window.hibernateAPI) {
  window.hibernateAPI.onState(applyState);
  syncFromMain();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncFromMain();
});
window.addEventListener('focus', syncFromMain);