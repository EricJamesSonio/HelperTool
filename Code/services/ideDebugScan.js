'use strict';

const fs = require('fs');
const path = require('path');
const diagnostics = require('./ideDiagnostics.js');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.cache', '__pycache__', '.swc',
  'playwright-report', 'test-results', '.turbo', '.parcel-cache', '.nuxt', '.svelte-kit',
  'vendor', '.venv', 'venv', 'target', '.gradle', '.idea',
]);
const MAX_FILES = 6000;
const MAX_BYTES = 600000;
const FLUSH_MS = 80;

const sessions = new Map();

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function extOf(lower) {
  const i = lower.lastIndexOf('.');
  return i < 0 ? '' : lower.slice(i + 1);
}

function isSkippedName(lower) {
  if (lower === 'package-lock.json') return true;
  if (/\.min\.[a-z0-9]+$/.test(lower)) return true;
  return /[.-]bundle\.[a-z0-9]+$/.test(lower);
}

function relOf(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

async function listFiles(root, extSet, cancelled) {
  const files = [];
  let truncated = false;
  const stack = [root];
  while (stack.length) {
    if (cancelled()) return null;
    const dir = stack.pop();
    let dirents;
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const d of dirents) {
      if (d.isDirectory()) {
        if (!SKIP_DIRS.has(d.name.toLowerCase())) stack.push(path.join(dir, d.name));
        continue;
      }
      if (!d.isFile()) continue;
      const lower = d.name.toLowerCase();
      if (isSkippedName(lower)) continue;
      if (!extSet.has(extOf(lower))) continue;
      if (files.length >= MAX_FILES) {
        truncated = true;
        break;
      }
      files.push(path.join(dir, d.name));
    }
    if (truncated) break;
  }
  files.sort();
  return { files, truncated };
}

async function readText(file) {
  let st;
  try {
    st = await fs.promises.stat(file);
  } catch (_) {
    return null;
  }
  if (st.size === 0 || st.size > MAX_BYTES) return null;
  let text;
  try {
    text = await fs.promises.readFile(file, 'utf8');
  } catch (_) {
    return null;
  }
  if (text.indexOf('\u0000') !== -1) return null;
  if (text.indexOf('\r\n') !== -1) text = text.replace(/\r\n/g, '\n');
  return text;
}

async function run(sender, session, opts) {
  const t0 = Date.now();
  const cancelled = () => session.cancelled || sender.isDestroyed();
  const counts = { total: 0, scanned: 0, clean: 0, skipped: 0 };
  let buf = [];
  let lastSend = 0;

  const send = (extra) => {
    if (cancelled()) return;
    const payload = Object.assign({
      id: opts.id,
      files: buf,
      total: counts.total,
      scanned: counts.scanned,
      clean: counts.clean,
      skipped: counts.skipped,
    }, extra || {});
    buf = [];
    lastSend = Date.now();
    sender.send('ideDebug:batch', payload);
  };

  try {
    const extSet = new Set(opts.exts);
    const listed = await listFiles(opts.root, extSet, cancelled);
    if (!listed || cancelled()) return;
    counts.total = listed.files.length;
    send({ truncated: listed.truncated });
    for (const file of listed.files) {
      if (cancelled()) return;
      const text = await readText(file);
      if (text === null) {
        counts.skipped++;
      } else {
        counts.scanned++;
        let diags = [];
        try {
          diags = await diagnostics.diagnose({ file, text, exts: opts.ids });
        } catch (_) {
          diags = [];
        }
        if (!diags.length) {
          counts.clean++;
        } else {
          let e = 0;
          let w = 0;
          let n = 0;
          for (const d of diags) {
            if (d.sev === 'error') e++;
            else if (d.sev === 'warning') w++;
            else n++;
          }
          buf.push({ file, rel: relOf(opts.root, file), e, w, i: n, diags });
        }
      }
      if (Date.now() - lastSend >= FLUSH_MS) send();
      await tick();
    }
    send({ done: true, ms: Date.now() - t0, truncated: listed.truncated });
  } catch (err) {
    if (!cancelled()) {
      sender.send('ideDebug:batch', {
        id: opts.id,
        files: [],
        total: counts.total,
        scanned: counts.scanned,
        clean: counts.clean,
        skipped: counts.skipped,
        done: true,
        ms: Date.now() - t0,
        error: err && err.message ? err.message : 'Scan failed',
      });
    }
  } finally {
    if (sessions.get(sender.id) === session) sessions.delete(sender.id);
  }
}

function start(sender, opts) {
  const prev = sessions.get(sender.id);
  if (prev) prev.cancelled = true;
  const session = { cancelled: false, id: opts.id };
  sessions.set(sender.id, session);
  run(sender, session, opts);
}

function cancel(sender, id) {
  const s = sessions.get(sender.id);
  if (!s) return;
  if (id && s.id !== id) return;
  s.cancelled = true;
}

module.exports = { start, cancel };