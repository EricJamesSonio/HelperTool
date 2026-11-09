const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 5000;

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.cache', '__pycache__', '.swc',
  'playwright-report', 'test-results', '.turbo', '.parcel-cache', '.nuxt', '.svelte-kit',
  'vendor', '.venv', 'venv', 'target', '.gradle', '.idea',
]);
const SKIP_EXT = new Set('png jpg jpeg gif webp bmp ico icns pdf zip gz tgz rar 7z exe dll so dylib node wasm mp3 mp4 mov avi mkv webm woff woff2 ttf otf eot db sqlite bin class jar map'.split(' '));
const SKIP_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

const MAX_FILES = 20000;
const MAX_FILE_BYTES = 1000000;
const CORPUS_CHARS = 60000000;
const FRESH_MS = 15000;
const LIST_TTL = 60000;
const WARM_GAP = 10000;
const BATCH = 40;
const PER_FILE = 25;
const PER_FILE_NEAR = 10;
const HARD_CAP = 1500;
const NEAR_THRESHOLD = 40;
const NEAR_CAP = 800;
const FLUSH_MS = 70;

const WORD = /[A-Za-z0-9_$]/;
const WORD_RE = /[A-Za-z0-9_$]+/g;

const sessions = new Map();
let listCache = { root: null, at: 0, files: null };
let corpus = { root: null, map: new Map(), chars: 0 };
let warming = null;
let lastWarm = { root: null, at: 0 };

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

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

function relOf(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function editDistance(a, b, max) {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  let prev = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[bl];
}

function isSubsequence(q, w) {
  let qi = 0;
  for (let i = 0; i < w.length && qi < q.length; i++) {
    if (w[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function snippetOf(line, col, len) {
  const start = Math.max(0, col - 50);
  const raw = line.slice(start, start + 200);
  const trimmed = raw.replace(/^\s+/, '');
  const lead = raw.length - trimmed.length;
  const text = trimmed.replace(/\s+$/, '');
  return { text, hs: Math.max(0, col - start - lead), hl: len, more: start > 0 };
}

function mk(root, file, lineNo, line, col, len, score, kind) {
  const sn = snippetOf(line, col, len);
  return {
    file,
    rel: relOf(root, file),
    line: lineNo,
    col,
    len,
    text: sn.text,
    hs: sn.hs,
    hl: sn.hl,
    more: sn.more,
    score,
    kind,
  };
}

function exactScore(ll, idx, len, total) {
  let s = 100;
  const before = idx === 0 ? '' : ll[idx - 1];
  const after = ll[idx + len] || '';
  const bOk = !before || !WORD.test(before);
  const aOk = !after || !WORD.test(after);
  if (bOk && aOk) s += 15;
  else if (bOk) s += 6;
  s -= Math.min(20, idx / 8);
  if (total > 220) s -= 5;
  return s;
}

function useRoot(root) {
  if (corpus.root !== root) corpus = { root, map: new Map(), chars: 0 };
}

function dropFromCorpus(files) {
  if (!Array.isArray(files)) return;
  for (const f of files) {
    if (typeof f !== 'string') continue;
    const e = corpus.map.get(f);
    if (e) {
      corpus.chars -= e.cost || 0;
      corpus.map.delete(f);
    }
  }
}

async function listFiles(root, isCancelled) {
  const now = Date.now();
  if (listCache.root === root && listCache.files && now - listCache.at < LIST_TTL) return listCache.files;
  const files = [];
  const stack = [root];
  while (stack.length) {
    if (isCancelled()) return null;
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
      if (SKIP_NAMES.has(lower)) continue;
      const dot = lower.lastIndexOf('.');
      const ext = dot < 0 ? '' : lower.slice(dot + 1);
      if (SKIP_EXT.has(ext)) continue;
      files.push(path.join(dir, d.name));
      if (files.length >= MAX_FILES) {
        stack.length = 0;
        break;
      }
    }
  }
  files.sort();
  listCache = { root, at: Date.now(), files };
  return files;
}

async function getEntry(file) {
  const now = Date.now();
  const e = corpus.map.get(file);
  if (e && now - e.at < FRESH_MS) return e.skip ? null : e;
  let st;
  try {
    st = await fs.promises.stat(file);
  } catch (_) {
    if (e) {
      corpus.chars -= e.cost || 0;
      corpus.map.delete(file);
    }
    return null;
  }
  if (e && e.mtime === st.mtimeMs && e.size === st.size) {
    e.at = now;
    return e.skip ? null : e;
  }
  if (e) {
    corpus.chars -= e.cost || 0;
    corpus.map.delete(file);
  }
  if (st.size === 0 || st.size > MAX_FILE_BYTES) {
    corpus.map.set(file, { skip: true, mtime: st.mtimeMs, size: st.size, at: now, cost: 0 });
    return null;
  }
  let buf;
  try {
    buf = await fs.promises.readFile(file);
  } catch (_) {
    return null;
  }
  const probe = Math.min(buf.length, 4000);
  for (let i = 0; i < probe; i++) {
    if (buf[i] === 0) {
      corpus.map.set(file, { skip: true, mtime: st.mtimeMs, size: st.size, at: now, cost: 0 });
      return null;
    }
  }
  const text = buf.toString('utf8');
  const entry = { file, text, lower: text.toLowerCase(), mtime: st.mtimeMs, size: st.size, at: now, cost: text.length * 2 };
  if (corpus.chars + entry.cost <= CORPUS_CHARS) {
    corpus.map.set(file, entry);
    corpus.chars += entry.cost;
  }
  return entry;
}

function scanExact(root, file, text, lower, ctx, out) {
  const lines = text.split(/\r?\n/);
  const lcl = lower.split(/\r?\n/);
  let count = 0;
  for (let i = 0; i < lines.length && count < PER_FILE; i++) {
    const ll = lcl[i];
    if (!ll) continue;
    const src = lines[i] || '';
    const idx = ll.indexOf(ctx.q);
    if (idx !== -1) {
      out.push(mk(root, file, i + 1, src, idx, ctx.q.length, exactScore(ll, idx, ctx.q.length, src.length), 'exact'));
      count++;
      continue;
    }
    if (ctx.tokens.length > 1) {
      let first = -1;
      let firstLen = 0;
      let ok = true;
      for (const t of ctx.tokens) {
        const p = ll.indexOf(t);
        if (p === -1) {
          ok = false;
          break;
        }
        if (first === -1 || p < first) {
          first = p;
          firstLen = t.length;
        }
      }
      if (ok) {
        out.push(mk(root, file, i + 1, src, first, firstLen, 70, 'all'));
        count++;
      }
    }
  }
  return count;
}

function scanNear(root, file, text, ctx, out) {
  const lines = text.split(/\r?\n/);
  const q = ctx.q;
  const tol = q.length >= 8 ? 2 : 1;
  let count = 0;
  for (let i = 0; i < lines.length && count < PER_FILE_NEAR; i++) {
    const line = lines[i];
    if (!line || line.length > 400) continue;
    if (line.toLowerCase().indexOf(q) !== -1) continue;
    WORD_RE.lastIndex = 0;
    let best = null;
    let m;
    while ((m = WORD_RE.exec(line)) !== null) {
      const w = m[0];
      if (w.length < 3 || w.length > 48) continue;
      const lw = w.toLowerCase();
      if (q.length >= 4 && Math.abs(lw.length - q.length) <= tol) {
        const d = editDistance(lw, q, tol);
        if (d <= tol) {
          const sc = 62 - d * 8;
          if (!best || sc > best.score) best = { score: sc, col: m.index, len: w.length, kind: 'near' };
          continue;
        }
      }
      if (q.length >= 3 && lw.length > q.length && lw[0] === q[0] && isSubsequence(q, lw)) {
        const sc = 38 - Math.min(15, lw.length - q.length);
        if (!best || sc > best.score) best = { score: sc, col: m.index, len: w.length, kind: 'fuzzy' };
      }
    }
    if (best) {
      out.push(mk(root, file, i + 1, line, best.col, best.len, best.score, best.kind));
      count++;
    }
  }
  return count;
}

function fileMatches(root, files, ctx) {
  const out = [];
  for (const f of files) {
    if (out.length >= 60) break;
    const rel = relOf(root, f);
    const rl = rel.toLowerCase();
    const slash = rl.lastIndexOf('/');
    const base = rl.slice(slash + 1);
    const baseOrig = rel.slice(slash + 1);
    const idx = base.indexOf(ctx.q);
    if (idx !== -1) {
      out.push({
        file: f,
        rel,
        line: 1,
        col: 0,
        len: 0,
        text: baseOrig,
        hs: idx,
        hl: ctx.q.length,
        more: false,
        score: 92 + (idx === 0 ? 5 : 0),
        kind: 'file',
      });
    } else if (rl.indexOf(ctx.q) !== -1) {
      out.push({
        file: f,
        rel,
        line: 1,
        col: 0,
        len: 0,
        text: baseOrig,
        hs: 0,
        hl: 0,
        more: false,
        score: 60,
        kind: 'file',
      });
    }
  }
  return out;
}

function extOf(file) {
  const name = path.basename(file).toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot < 0) return '';
  return name.slice(dot + 1);
}

function countExts(files) {
  const map = new Map();
  for (const f of files) {
    const e = extOf(f);
    map.set(e, (map.get(e) || 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 80);
}
async function runSearch(sender, id, root, query, session, extSet) {
  const t0 = Date.now();
  const cancelled = () => session.cancelled || sender.isDestroyed();
  let buf = [];
  let lastSend = 0;
  let phase = 'files';
  let scanned = 0;
  let progress = 0;
  let total = 0;
  let strong = 0;

  const flush = (force, extra) => {
    if (cancelled()) return;
    if (!force && (!buf.length || Date.now() - lastSend < FLUSH_MS)) return;
    const payload = Object.assign({ id, results: buf, phase, scanned, progress }, extra || {});
    buf = [];
    lastSend = Date.now();
    sender.send('ide:searchBatch', payload);
  };

  try {
    useRoot(root);
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const ctx = { q, tokens };
    const allFiles = await listFiles(root, cancelled);
    if (!allFiles || cancelled()) return;
    const files = extSet ? allFiles.filter((f) => extSet.has(extOf(f))) : allFiles;

    const fm = fileMatches(root, files, ctx);
    for (const r of fm) buf.push(r);
    flush(true);

    phase = 'content';
    let truncated = false;
    for (let i = 0; i < files.length; i += BATCH) {
      if (cancelled()) return;
      const batch = files.slice(i, i + BATCH);
      const entries = await Promise.all(batch.map(getEntry));
      for (const e of entries) {
        if (!e) continue;
        scanned++;
        let cand;
        if (tokens.length === 1) cand = e.lower.indexOf(q) !== -1;
        else cand = tokens.every((t) => e.lower.indexOf(t) !== -1);
        if (!cand) continue;
        const n = scanExact(root, e.file, e.text, e.lower, ctx, buf);
        total += n;
        strong += n;
      }
      progress = Math.min(1, (i + BATCH) / files.length);
      flush(false);
      if (total >= HARD_CAP) {
        truncated = true;
        break;
      }
      await tick();
    }

    if (!truncated && tokens.length === 1 && strong < NEAR_THRESHOLD) {
      phase = 'similar';
      progress = 0;
      const entries = [];
      for (const e of corpus.map.values()) {
        if (e.skip || !e.text) continue;
        if (extSet && !extSet.has(extOf(e.file))) continue;
        entries.push(e);
      }
      let nearTotal = 0;
      for (let i = 0; i < entries.length && nearTotal < NEAR_CAP; i++) {
        nearTotal += scanNear(root, entries[i].file, entries[i].text, ctx, buf);
        if (i % 25 === 24) {
          progress = (i + 1) / entries.length;
          flush(false);
          if (cancelled()) return;
          await tick();
        }
      }
    }

    progress = 1;
    flush(true, { done: true, truncated, ms: Date.now() - t0 });
  } catch (err) {
    if (!cancelled()) {
      sender.send('ide:searchBatch', { id, results: [], done: true, error: err && err.message ? err.message : 'Search failed' });
    }
  }
}

async function warmCorpus(root) {
  if (warming && warming.root === root) return;
  if (lastWarm.root === root && Date.now() - lastWarm.at < WARM_GAP) return;
  const token = { root, stop: false };
  warming = token;
  try {
    useRoot(root);
    const files = await listFiles(root, () => token.stop);
    if (!files) return;
    for (let i = 0; i < files.length; i += BATCH) {
      if (token.stop || warming !== token) return;
      await Promise.all(files.slice(i, i + BATCH).map(getEntry));
      await tick();
    }
    lastWarm = { root, at: Date.now() };
  } catch (_) {
    return;
  } finally {
    if (warming === token) warming = null;
  }
}

const { execFile } = require('child_process');

function runGit(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 8000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve({ ok: !err, out: stdout || '' });
    });
  });
}

function parseHunks(text) {
  const hunks = [];
  const re = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  for (const line of text.split('\n')) {
    if (line.charCodeAt(0) !== 64) continue;
    const m = re.exec(line);
    if (!m) continue;
    hunks.push({
      os: Number(m[1]),
      oc: m[2] === undefined ? 1 : Number(m[2]),
      ns: Number(m[3]),
      nc: m[4] === undefined ? 1 : Number(m[4]),
    });
  }
  return hunks;
}

async function gitLineDiff(root, file) {
  const none = { success: true, kind: 'none', hunks: [] };
  const inside = await runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.out.trim() !== 'true') return none;
  const tracked = await runGit(root, ['ls-files', '--error-unmatch', '--', file]);
  if (tracked.ok) {
    const d = await runGit(root, ['diff', 'HEAD', '--unified=0', '--no-color', '--no-ext-diff', '--', file]);
    if (!d.ok) return none;
    return { success: true, kind: 'tracked', hunks: parseHunks(d.out).slice(0, 5000) };
  }
  const ignored = await runGit(root, ['check-ignore', '-q', '--', file]);
  if (ignored.ok) return none;
  return { success: true, kind: 'new', hunks: [] };
}

ipcMain.handle('ide:gitLines', async (_event, args) => {
  const root = args && args.root;
  const file = args && args.file;
  if (typeof root !== 'string' || typeof file !== 'string' || !root || !file) {
    return { success: false, error: 'Invalid arguments' };
  }
  try {
    return await gitLineDiff(root, file);
  } catch (err) {
    return { success: false, error: err.message };
  }
});
async function clipExists(p) {
  try {
    await fs.promises.lstat(p);
    return true;
  } catch (_) {
    return false;
  }
}

function clipSame(a, b) {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

function clipInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function clipCopyName(dir, name, isDir) {
  const dot = name.lastIndexOf('.');
  const hasExt = !isDir && dot > 0;
  const stem = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : '';
  for (let n = 1; n < 1000; n++) {
    const cand = stem + (n === 1 ? ' copy' : ' copy ' + n) + ext;
    if (!(await clipExists(path.join(dir, cand)))) return cand;
  }
  return null;
}
const { shell } = require('electron');

async function opMove(from, to) {
  if (!(await clipExists(from))) return { success: false, error: 'The original is gone' };
  if (await clipExists(to)) return { success: false, error: path.basename(to) + ' already exists there' };
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  try {
    await fs.promises.rename(from, to);
  } catch (err) {
    if (!err || err.code !== 'EXDEV') throw err;
    await fs.promises.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    await fs.promises.rm(from, { recursive: true, force: true });
  }
  return { success: true };
}

async function opCopy(from, to) {
  if (!(await clipExists(from))) return { success: false, error: 'The original is gone' };
  if (await clipExists(to)) return { success: false, error: path.basename(to) + ' already exists there' };
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await fs.promises.cp(from, to, { recursive: true, errorOnExist: true, force: false });
  return { success: true };
}

ipcMain.handle('ide:fsOp', async (_event, args) => {
  const op = args && args.op;
  const isAbs = (v) => typeof v === 'string' && !!v && path.isAbsolute(v);
  try {
    if (op === 'remove') {
      if (!isAbs(args.path)) return { success: false, error: 'Invalid path' };
      if (!(await clipExists(args.path))) return { success: false, error: 'It is already gone' };
      await shell.trashItem(args.path);
      return { success: true };
    }
    if (op === 'move') {
      if (!isAbs(args.from) || !isAbs(args.to)) return { success: false, error: 'Invalid path' };
      return await opMove(args.from, args.to);
    }
    if (op === 'copy') {
      if (!isAbs(args.from) || !isAbs(args.to)) return { success: false, error: 'Invalid path' };
      return await opCopy(args.from, args.to);
    }
    return { success: false, error: 'Unknown operation' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ide:fsPaste', async (_event, args) => {
  const source = args && args.source;
  const targetDir = args && args.targetDir;
  const mode = args && args.mode === 'cut' ? 'cut' : 'copy';
  if (typeof source !== 'string' || typeof targetDir !== 'string' || !source || !targetDir) {
    return { success: false, error: 'Invalid arguments' };
  }
  if (!path.isAbsolute(source) || !path.isAbsolute(targetDir)) {
    return { success: false, error: 'Invalid path' };
  }
  try {
    const srcSt = await fs.promises.lstat(source);
    const dirSt = await fs.promises.stat(targetDir);
    if (!dirSt.isDirectory()) return { success: false, error: 'Target is not a folder' };
    const isDir = srcSt.isDirectory();
    const name = path.basename(source);
    if (isDir && (clipSame(source, targetDir) || clipInside(targetDir, source))) {
      return { success: false, error: 'Cannot paste a folder into itself' };
    }
    const sameParent = clipSame(path.dirname(source), targetDir);
    if (mode === 'cut') {
      if (sameParent) return { success: true, noop: true, to: source };
      const dest = path.join(targetDir, name);
      if (await clipExists(dest)) {
        return { success: false, error: name + ' already exists in that folder' };
      }
      try {
        await fs.promises.rename(source, dest);
      } catch (err) {
        if (!err || err.code !== 'EXDEV') throw err;
        await fs.promises.cp(source, dest, { recursive: true, errorOnExist: true, force: false });
        await fs.promises.rm(source, { recursive: true, force: true });
      }
      return { success: true, to: dest };
    }
    let finalName = name;
    if (await clipExists(path.join(targetDir, name))) {
      finalName = await clipCopyName(targetDir, name, isDir);
      if (!finalName) return { success: false, error: 'Could not find a free name' };
    }
    const to = path.join(targetDir, finalName);
    await fs.promises.cp(source, to, { recursive: true, errorOnExist: true, force: false });
    return { success: true, to };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
function register() {
  ipcMain.handle('ide:readDir', async (_event, dirPath) => {
    try {
      if (typeof dirPath !== 'string' || !dirPath) {
        return { success: false, error: 'Invalid path' };
      }
      const result = await readDir(dirPath);
      return { success: true, entries: result.entries, truncated: result.truncated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ide:searchStart', async (event, args) => {
    const sender = event.sender;
    const prev = sessions.get(sender.id);
    if (prev) prev.cancelled = true;
    const session = { cancelled: false };
    sessions.set(sender.id, session);
    const id = args && args.id;
    const root = args && args.root;
    const query = args && typeof args.query === 'string' ? args.query.trim() : '';
    if (typeof root !== 'string' || !root) return { success: false, error: 'No folder opened' };
    if (query.length < 2 || query.length > 200) {
      sender.send('ide:searchBatch', { id, results: [], done: true, ms: 0 });
      return { success: true };
    }
    try {
      const st = await fs.promises.stat(root);
      if (!st.isDirectory()) return { success: false, error: 'Not a folder' };
    } catch (err) {
      return { success: false, error: err.message };
    }
    useRoot(root);
    dropFromCorpus(args && args.invalidate);
    const rawExts = args && Array.isArray(args.exts) ? args.exts : [];
    const extList = rawExts
      .filter((x) => typeof x === 'string')
      .slice(0, 200)
      .map((x) => x.toLowerCase());
    const extSet = extList.length ? new Set(extList) : null;
    runSearch(sender, id, root, query, session, extSet);
    return { success: true };
  });

  ipcMain.handle('ide:searchCancel', async (event) => {
    const s = sessions.get(event.sender.id);
    if (s) s.cancelled = true;
    return { success: true };
  });

  ipcMain.handle('ide:searchWarm', async (_event, root) => {
    if (typeof root !== 'string' || !root) return { success: false };
    try {
      const files = await listFiles(root, () => false);
      warmCorpus(root);
      return { success: true, exts: files ? countExts(files) : [] };
    } catch (_) {
      return { success: false };
    }
  });

  try {
    require('./wakatime_ipc.js').register();
  } catch (err) {
    console.error('[IPC] wakatime handlers failed to register:', err.message);
  }
}

module.exports = { register };