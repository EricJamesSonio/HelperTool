import { state } from '../app_manager/appState.js';

const MAX_CELLS = 6000000;
const CLS = [];
for (let f = 0; f < 32; f++) {
  let c = '';
  if (f & 16) c = ' ide-mk-u';
  else if (f & 1) c = ' ide-mk-a';
  else if (f & 2) c = ' ide-mk-m';
  else if (f & 4) c = ' ide-mk-dt';
  else if (f & 8) c = ' ide-mk-db';
  CLS.push('<div class="ide-mk' + c + '"></div>');
}

let layer = null;
let inner = null;
let taRef = null;
let getTab = null;
let curPath = null;
let savedRef = null;
let git = null;
let marks = null;
let version = 0;
let lastKey = '';
let lastFrom = 0;
let lastTo = -1;
let lastY = 0;
let timer = 0;
let gitTimer = 0;

function align(a, b) {
  const la = a.length;
  const lb = b.length;
  const map = new Int32Array(la).fill(-1);
  const changed = new Uint8Array(lb);
  let p = 0;
  while (p < la && p < lb && a[p] === b[p]) {
    map[p] = p;
    p++;
  }
  let s = 0;
  while (s < la - p && s < lb - p && a[la - 1 - s] === b[lb - 1 - s]) {
    map[la - 1 - s] = lb - 1 - s;
    s++;
  }
  const eb = lb - s;
  const ma = la - s - p;
  const mb = eb - p;
  if (ma === 0 || mb === 0 || ma * mb > MAX_CELLS) {
    for (let j = p; j < eb; j++) changed[j] = 1;
    return { map, changed };
  }
  const w = mb + 1;
  const dp = new Uint16Array((ma + 1) * w);
  for (let i = ma - 1; i >= 0; i--) {
    for (let j = mb - 1; j >= 0; j--) {
      if (a[p + i] === b[p + j]) dp[i * w + j] = dp[(i + 1) * w + j + 1] + 1;
      else dp[i * w + j] = Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < ma && j < mb) {
    if (a[p + i] === b[p + j]) {
      map[p + i] = p + j;
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      i++;
    } else {
      changed[p + j] = 1;
      j++;
    }
  }
  while (j < mb) {
    changed[p + j] = 1;
    j++;
  }
  return { map, changed };
}

function buildMarks(saved, cur, g) {
  const a = saved.split('\n');
  const b = cur.split('\n');
  const out = new Uint8Array(b.length);
  const same = saved === cur;
  let map = null;
  let changed = null;
  if (!same) {
    const r = align(a, b);
    map = r.map;
    changed = r.changed;
  }
  if (g) {
    const gm = new Uint8Array(a.length + 1);
    if (g.kind === 'new') {
      const n = a.length && a[a.length - 1] === '' ? a.length - 1 : a.length;
      for (let j = 0; j < n; j++) gm[j] = 1;
    } else {
      for (const h of g.hunks) {
        if (h.nc > 0) {
          const t = h.oc === 0 ? 1 : 2;
          for (let k = 0; k < h.nc; k++) {
            const idx = h.ns - 1 + k;
            if (idx >= 0 && idx < a.length) gm[idx] |= t;
          }
        } else if (h.ns < a.length) {
          gm[h.ns] |= 4;
        } else if (a.length > 0) {
          gm[a.length - 1] |= 8;
        }
      }
    }
    for (let j = 0; j < a.length; j++) {
      if (!gm[j]) continue;
      const k = same ? j : map[j];
      if (k >= 0 && k < b.length) out[k] |= gm[j];
    }
  }
  if (changed) {
    for (let i = 0; i < b.length; i++) {
      if (changed[i]) out[i] = 16;
    }
  }
  return out;
}

function ensureLayer(ta) {
  if (layer && layer.isConnected) return true;
  const host = ta.parentElement;
  if (!host) return false;
  layer = document.createElement('div');
  layer.className = 'ide-mark-layer';
  inner = document.createElement('div');
  inner.className = 'ide-mark-inner';
  layer.appendChild(inner);
  host.insertBefore(layer, host.firstChild);
  lastKey = '';
  return true;
}

function paint() {
  if (!inner) return;
  const key = lastFrom + ':' + lastTo + ':' + version;
  if (key !== lastKey) {
    lastKey = key;
    if (lastTo < lastFrom) {
      inner.innerHTML = '';
    } else {
      const parts = [];
      for (let i = lastFrom; i <= lastTo; i++) {
        const f = marks && i < marks.length ? marks[i] : 0;
        parts.push(CLS[f]);
      }
      inner.innerHTML = parts.join('');
    }
  }
  inner.style.transform = 'translateY(' + lastY + 'px)';
}

function compute() {
  timer = 0;
  if (!getTab || !taRef) return;
  const t = getTab();
  if (!t || t.path !== curPath) return;
  marks = buildMarks(t.saved, taRef.value, git);
  version++;
  paint();
}

async function fetchGit() {
  gitTimer = 0;
  if (!getTab) return;
  const t = getTab();
  const root = state.selectedRepoPath;
  if (!t || !root || !window.ideLineAPI) return;
  const p = t.path;
  let res = null;
  try {
    res = await window.ideLineAPI.diff(root, p);
  } catch (_) {
    res = null;
  }
  if (curPath !== p) return;
  git = res && res.success && res.kind !== 'none' ? { kind: res.kind, hunks: res.hunks || [] } : null;
  compute();
}

function scheduleGit(ms) {
  clearTimeout(gitTimer);
  gitTimer = setTimeout(fetchGit, ms);
}

export function touch() {
  clearTimeout(timer);
  timer = setTimeout(compute, 150);
}

export function sync(ta, tabFn, from, to, y) {
  if (!ensureLayer(ta)) return;
  taRef = ta;
  getTab = tabFn;
  lastFrom = from;
  lastTo = to;
  lastY = y;
  const t = tabFn();
  const path = t ? t.path : null;
  if (path !== curPath) {
    curPath = path;
    savedRef = t ? t.saved : null;
    git = null;
    marks = null;
    version++;
    if (path) {
      scheduleGit(0);
      touch();
    }
  } else if (t && t.saved !== savedRef) {
    savedRef = t.saved;
    scheduleGit(120);
    touch();
  }
  paint();
}

document.addEventListener('ide:git-changed', () => scheduleGit(0));