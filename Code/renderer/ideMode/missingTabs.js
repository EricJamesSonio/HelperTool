import { closeTab } from './editor.js';

const POLL_MS = 4000;
const QUICK_MS = 500;

let busy = false;
let timer = 0;
let quick = 0;

function dirOf(p) {
  const s = String(p || '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i > 0 ? s.slice(0, i) : '';
}

function nameOf(p) {
  const s = String(p || '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return s.slice(i + 1).toLowerCase();
}

function isIde() {
  return document.body.classList.contains('ide-mode');
}

function openItems() {
  const out = [];
  document.querySelectorAll('.ide-oe-list .ide-oe-item').forEach((el) => {
    const p = el.dataset.path;
    if (!p) return;
    if (el.classList.contains('dirty')) return;
    out.push(p);
  });
  return out;
}

async function listDir(dir) {
  try {
    const res = await window.ideAPI.readDir(dir);
    if (res && res.success) {
      return { ok: true, names: new Set((res.entries || []).map((e) => String(e.name).toLowerCase())) };
    }
    const err = String((res && res.error) || '');
    if (/ENOENT|no such file|not found/i.test(err)) return { ok: true, names: new Set() };
    return { ok: false, names: null };
  } catch (_) {
    return { ok: false, names: null };
  }
}

async function check() {
  if (busy || !isIde()) return;
  if (!window.ideAPI || typeof window.ideAPI.readDir !== 'function') return;
  const paths = openItems();
  if (!paths.length) return;
  busy = true;
  try {
    const byDir = new Map();
    for (const p of paths) {
      const d = dirOf(p);
      if (!d) continue;
      let arr = byDir.get(d);
      if (!arr) {
        arr = [];
        byDir.set(d, arr);
      }
      arr.push(p);
    }
    const gone = [];
    for (const [dir, list] of byDir) {
      const res = await listDir(dir);
      if (!res.ok) continue;
      for (const p of list) {
        if (!res.names.has(nameOf(p))) gone.push(p);
      }
    }
    for (const p of gone) {
      await closeTab(p);
    }
  } catch (err) {
    console.error('[IDE] missing-file check failed:', err);
  } finally {
    busy = false;
  }
}

function soon() {
  clearTimeout(quick);
  quick = setTimeout(check, QUICK_MS);
}

export function init() {
  document.addEventListener('ide:git-changed', soon);
  document.addEventListener('ide:tree-changed', soon);
  document.addEventListener('ide:path-moved', soon);
  document.addEventListener('ide:history-add', soon);
  window.addEventListener('focus', soon);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) soon();
  });
  if (!timer) timer = setInterval(check, POLL_MS);
}