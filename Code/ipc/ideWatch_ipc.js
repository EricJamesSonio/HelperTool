const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');

const MAX_ENTRIES = 5000;
const MAX_FILES = 6000;
const MAX_DIRS = 80;
const TOP_TTL = 60000;
const NOTREPO_TTL = 15000;

const CONFLICT = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);
const topCache = new Map();
const inflight = new Map();

function byName(a, b) {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

async function entryType(dirent, fullPath) {
  if (dirent.isDirectory()) return 'folder';
  if (dirent.isSymbolicLink()) {
    try {
      const st = await fs.promises.stat(fullPath);
      return st.isDirectory() ? 'folder' : 'file';
    } catch (_) {
      return 'file';
    }
  }
  return 'file';
}

async function readDir(dirPath) {
  const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const entries = await Promise.all(dirents.map(async (d) => {
    const full = path.join(dirPath, d.name);
    return { name: d.name, path: full, type: await entryType(d, full) };
  }));
  entries.sort(byName);
  const truncated = entries.length > MAX_ENTRIES;
  return { entries: truncated ? entries.slice(0, MAX_ENTRIES) : entries, truncated };
}

async function topLevel(git, root) {
  const hit = topCache.get(root);
  if (hit && Date.now() - hit.at < (hit.top ? TOP_TTL : NOTREPO_TTL)) return hit.top;
  let top = null;
  try {
    top = (await git.raw(['rev-parse', '--show-toplevel'])).trim();
  } catch (_) {
    top = null;
  }
  topCache.set(root, { top: top || null, at: Date.now() });
  return top || null;
}

async function rawStatus(git) {
  const args = ['status', '--porcelain=v1', '-z', '-unormal'];
  try {
    return await git.raw(['--no-optional-locks'].concat(args));
  } catch (_) {
    return git.raw(args);
  }
}

function parseStatus(out, topN, rootN) {
  const parts = out.split('\0');
  const files = [];
  const dirs = [];
  const inside = (a) => {
    const l = a.toLowerCase();
    return l === rootN || l.indexOf(rootN + '/') === 0;
  };
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e || e.length < 4) continue;
    const xy = e.slice(0, 2);
    const x = xy[0];
    const y = xy[1];
    const rel = e.slice(3);
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') i++;
    if (xy === '!!') continue;
    const isDir = rel.charAt(rel.length - 1) === '/';
    const abs = topN + '/' + rel.replace(/\/+$/, '');
    if (!inside(abs)) continue;
    if (xy === '??') {
      if (isDir) dirs.push(abs);
      else if (files.length < MAX_FILES) files.push({ p: abs, s: 'U' });
      continue;
    }
    let s = 'M';
    if (CONFLICT.has(xy)) s = 'C';
    else if (x === 'D' || y === 'D') s = 'D';
    else if (x === 'A' || y === 'A') s = 'A';
    else if (x === 'R' || y === 'R' || x === 'C' || y === 'C') s = 'R';
    if (files.length < MAX_FILES) files.push({ p: abs, s });
  }
  return { files, dirs };
}

async function runStatus(root) {
  let st;
  try {
    st = await fs.promises.stat(root);
  } catch (err) {
    return { success: false, error: err.message };
  }
  if (!st.isDirectory()) return { success: false, error: 'Not a folder' };
  const git = simpleGit({ baseDir: root, timeout: { block: 10000 } });
  const top = await topLevel(git, root);
  if (!top) return { success: true, isRepo: false, files: [], dirs: [] };
  let out;
  try {
    out = await rawStatus(git);
  } catch (err) {
    return { success: false, error: err.message };
  }
  const topN = top.replace(/\\/g, '/').replace(/\/+$/, '');
  const rootN = root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const parsed = parseStatus(out, topN, rootN);
  return { success: true, isRepo: true, files: parsed.files, dirs: parsed.dirs };
}

function statusShared(root) {
  const pending = inflight.get(root);
  if (pending) return pending;
  const p = runStatus(root).finally(() => inflight.delete(root));
  inflight.set(root, p);
  return p;
}

function register() {
  ipcMain.handle('ideWatch:status', async (_event, root) => {
    try {
      if (typeof root !== 'string' || !root) return { success: false, error: 'No folder opened' };
      return await statusShared(root);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ideWatch:dirs', async (_event, list) => {
    try {
      if (!Array.isArray(list)) return { success: false, error: 'Invalid list' };
      const paths = list.filter((p) => typeof p === 'string' && p).slice(0, MAX_DIRS);
      const out = {};
      await Promise.all(paths.map(async (p) => {
        try {
          out[p] = await readDir(p);
        } catch (err) {
          out[p] = { error: err.message };
        }
      }));
      return { success: true, dirs: out };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };