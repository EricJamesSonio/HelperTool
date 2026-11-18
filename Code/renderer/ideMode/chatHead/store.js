const LS_KEY = 'helpertool-ide-chathead';

function read() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && Array.isArray(data.fns)) return data;
  } catch (_) {
    return { fns: [] };
  }
  return { fns: [] };
}

function write(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (_) {}
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function listFunctions() {
  return read().fns;
}

export function saveFunction(fn) {
  const data = read();
  const i = data.fns.findIndex((x) => x.id === fn.id);
  if (i < 0) data.fns.push(fn);
  else data.fns[i] = fn;
  write(data);
}

export function removeFunction(id) {
  const data = read();
  data.fns = data.fns.filter((x) => x.id !== id);
  write(data);
}

export function parseFolders(text) {
  const seen = new Set();
  const out = [];
  const parts = String(text || '').split(/[\n,]+/);
  for (const raw of parts) {
    const clean = raw.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!clean || clean.split('/').indexOf('..') !== -1) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}