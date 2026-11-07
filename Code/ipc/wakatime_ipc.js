const { ipcMain, BrowserWindow, powerMonitor } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const HOME = os.homedir();
const DIR = path.join(HOME, '.wakatime');
const CFG = path.join(HOME, '.wakatime.cfg');
const PLUGIN = 'helpertool/1.0 helpertool-wakatime/1.0';
const APP_NAME = 'Helper Tool';
const SAME_GAP = 100000;
const WRITE_GAP = 5000;
const TICK_MS = 30000;
const IDLE_LIMIT = 120;
const FLUSH_MS = 5000;
const FLUSH_MAX = 3;
const WATCH_GAP = 60000;
const BURST_LIMIT = 300;
const MAX_QUEUE = 12;
const KEY_RE = /^(waka_)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.cache', '__pycache__', '.swc',
  '.turbo', '.parcel-cache', '.nuxt', '.svelte-kit', 'vendor', '.venv', 'venv', 'target', '.gradle',
  '.idea', 'playwright-report', 'test-results',
]);
const SKIP_EXT = new Set('png jpg jpeg gif webp bmp ico icns pdf zip gz tgz rar 7z exe dll so dylib node wasm mp3 mp4 mov avi mkv webm woff woff2 ttf otf eot db sqlite bin class jar map log tmp'.split(' '));
const SKIP_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

let installing = null;
let started = false;
let ctx = { repo: '', file: '', line: 0, col: 0, lines: 0, paused: false };
const beats = new Map();
const pending = new Set();
let watcher = null;
let watchedRoot = '';
let flushTimer = 0;
let eventCount = 0;
let cliBusy = false;
const cliQueue = [];


function platformName() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'darwin';
  return 'linux';
}

function archName() {
  if (process.arch === 'arm64') return 'arm64';
  if (process.arch === 'ia32') return '386';
  return 'amd64';
}

function binaryName() {
  return 'wakatime-cli-' + platformName() + '-' + archName() + (process.platform === 'win32' ? '.exe' : '');
}

function cliPath() {
  const p = path.join(DIR, binaryName());
  try {
    return fs.existsSync(p) ? p : null;
  } catch (_) {
    return null;
  }
}

function readCfg() {
  try {
    return fs.readFileSync(CFG, 'utf-8');
  } catch (_) {
    return '';
  }
}

function cfgValue(name) {
  const re = new RegExp('^\\s*' + name + '\\s*=\\s*(.*?)\\s*$', 'mi');
  const m = re.exec(readCfg());
  return m ? m[1] : '';
}

function getKey() {
  const env = String(process.env.WAKATIME_API_KEY || '').trim();
  if (env) return env;
  return cfgValue('api_key');
}

function hasKey() {
  return !!getKey() || !!cfgValue('api_key_vault_cmd');
}

function writeKey(key) {
  let text = readCfg();
  if (/^\s*api_key\s*=.*$/mi.test(text)) {
    text = text.replace(/^\s*api_key\s*=.*$/mi, 'api_key = ' + key);
  } else if (/^\s*\[settings\]\s*$/mi.test(text)) {
    text = text.replace(/^\s*\[settings\]\s*$/mi, '[settings]\napi_key = ' + key);
  } else {
    text = (text ? text.replace(/\s*$/, '\n') : '') + '[settings]\napi_key = ' + key + '\n';
  }
  fs.writeFileSync(CFG, text, { encoding: 'utf-8', mode: 0o600 });
}

function run(cmd, args, timeout) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: timeout || 30000 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err && typeof err.code === 'number' ? err.code : 0,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        message: err ? err.message : '',
      });
    });
  });
}

function download(url, dest, hops) {
  return new Promise((resolve, reject) => {
    if (hops > 6) {
      reject(new Error('Too many redirects'));
      return;
    }
    const req = https.get(url, { headers: { 'User-Agent': 'HelperTool/1.0' } }, (res) => {
      const code = res.statusCode;
      if ([301, 302, 303, 307, 308].indexOf(code) !== -1 && res.headers.location) {
        res.resume();
        resolve(download(new URL(res.headers.location, url).toString(), dest, hops + 1));
        return;
      }
      if (code !== 200) {
        res.resume();
        reject(new Error('Download failed (' + code + ')'));
        return;
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('Download timed out')));
  });
}

async function doInstall() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const name = 'wakatime-cli-' + platformName() + '-' + archName();
    const url = 'https://github.com/wakatime/wakatime-cli/releases/latest/download/' + name + '.zip';
    const zip = path.join(DIR, 'helpertool-cli.zip');
    await download(url, zip, 0);
    let res;
    if (process.platform === 'win32') {
      const q = (s) => s.replace(/'/g, "''");
      res = await run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Expand-Archive -LiteralPath '" + q(zip) + "' -DestinationPath '" + q(DIR) + "' -Force",
      ], 120000);
    } else {
      res = await run('unzip', ['-o', zip, '-d', DIR], 120000);
    }
    try { fs.unlinkSync(zip); } catch (_) {}
    if (!res.ok) return { success: false, error: 'Could not unpack the download: ' + (res.stderr || res.message) };
    const bin = cliPath();
    if (!bin) return { success: false, error: 'The download did not contain the expected program.' };
    if (process.platform !== 'win32') {
      try { fs.chmodSync(bin, 0o755); } catch (_) {}
    }
    const ver = await run(bin, ['--version'], 15000);
    if (!ver.ok) return { success: false, error: 'The program was installed but does not start: ' + (ver.stderr || ver.message) };
    return { success: true, version: ver.stdout };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function install() {
  if (installing) return installing;
  installing = doInstall().finally(() => { installing = null; });
  return installing;
}

function windowOpen() {
  try {
    return BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized());
  } catch (_) {
    return false;
  }
}

function userActive() {
  try {
    return powerMonitor.getSystemIdleTime() < IDLE_LIMIT;
  } catch (_) {
    return true;
  }
}

function runQueue() {
  if (cliBusy || !cliQueue.length) return;
  const job = cliQueue.shift();
  cliBusy = true;
  const child = execFile(job.bin, job.args, { windowsHide: true, timeout: 20000 }, (err, _out, stderr) => {
    if (err) console.warn('[WakaTime] heartbeat failed:', String(stderr || err.message).slice(0, 300));
    cliBusy = false;
    runQueue();
  });
  try {
    if (child && child.pid) os.setPriority(child.pid, os.constants.priority.PRIORITY_LOW);
  } catch (_) {}
}

function enqueueBeat(bin, args, key) {
  if (cliQueue.some((j) => j.key === key)) return false;
  if (cliQueue.length >= MAX_QUEUE) cliQueue.shift();
  cliQueue.push({ bin, args, key });
  runQueue();
  return true;
}
function sendBeat(p) {
  const bin = cliPath();
  if (!bin || ctx.paused || !hasKey()) return false;
  const isApp = !!p.app;
  if (!isApp && (typeof p.file !== 'string' || !path.isAbsolute(p.file))) return false;
  const entity = isApp ? APP_NAME : p.file;
  const key = (isApp ? 'app:' : 'file:') + entity;
  const now = Date.now();
  const gap = Number(p.gap) || (p.write ? WRITE_GAP : SAME_GAP);
  if (now - (beats.get(key) || 0) < gap) return false;
  beats.set(key, now);
  if (beats.size > 400) {
    let n = 0;
    for (const k of beats.keys()) {
      beats.delete(k);
      n++;
      if (n >= 100) break;
    }
  }
  const repo = typeof p.repo === 'string' ? p.repo : '';
  const args = ['--entity', entity, '--entity-type', isApp ? 'app' : 'file', '--plugin', PLUGIN, '--category', 'coding'];
  if (!isApp) {
    if (p.write) args.push('--write');
    if (Number.isFinite(p.line) && p.line > 0) args.push('--lineno', String(Math.floor(p.line)));
    if (Number.isFinite(p.col) && p.col > 0) args.push('--cursorpos', String(Math.floor(p.col)));
    if (Number.isFinite(p.lines) && p.lines > 0) args.push('--lines-in-file', String(Math.floor(p.lines)));
  }
  if (repo) args.push('--project-folder', repo);
  else if (isApp) args.push('--project', APP_NAME);
  return enqueueBeat(bin, args, key + (p.write ? ':w' : ''));
}

function tick() {
  if (ctx.paused || !windowOpen() || !userActive()) return;
  if (ctx.file) {
    sendBeat({ file: ctx.file, repo: ctx.repo, line: ctx.line, col: ctx.col, lines: ctx.lines });
  } else {
    sendBeat({ app: true, repo: ctx.repo });
  }
}

async function flushPending() {
  flushTimer = 0;
  const burst = eventCount;
  eventCount = 0;
  const files = Array.from(pending);
  pending.clear();
  if (!files.length || burst > BURST_LIMIT || ctx.paused || !windowOpen() || !userActive()) return;
  let sent = 0;
  for (let i = files.length - 1; i >= 0 && sent < FLUSH_MAX; i--) {
    let info;
    try {
      info = await fs.promises.stat(files[i]);
    } catch (_) {
      continue;
    }
    if (!info.isFile()) continue;
    if (sendBeat({ file: files[i], write: true, repo: ctx.repo, gap: WATCH_GAP })) sent++;
  }
}

function onFsEvent(root, filename) {
  if (!filename || ctx.paused) return;
  eventCount++;
  const rel = String(filename);
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (!parts.length) return;
  for (let i = 0; i < parts.length - 1; i++) {
    if (SKIP_DIRS.has(parts[i].toLowerCase())) return;
  }
  const base = parts[parts.length - 1].toLowerCase();
  if (SKIP_NAMES.has(base)) return;
  const dot = base.lastIndexOf('.');
  const ext = dot < 0 ? '' : base.slice(dot + 1);
  if (SKIP_EXT.has(ext)) return;
  if (pending.size < 500) pending.add(path.join(root, rel));
  if (!flushTimer) flushTimer = setTimeout(flushPending, FLUSH_MS);
}

function stopWatch() {
  if (watcher) {
    try { watcher.close(); } catch (_) {}
  }
  watcher = null;
  watchedRoot = '';
  pending.clear();
}

function startWatch(root) {
  stopWatch();
  watchedRoot = root;
  if (!root) return;
  try {
    if (!fs.statSync(root).isDirectory()) return;
    watcher = fs.watch(root, { recursive: true }, (_evt, filename) => onFsEvent(root, filename));
    watcher.on('error', () => {
      try { watcher.close(); } catch (_) {}
      watcher = null;
    });
  } catch (err) {
    console.warn('[WakaTime] file watch unavailable:', err.message);
    watcher = null;
  }
}

function apiGet(urlPath, key) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: 'api.wakatime.com',
      path: urlPath,
      headers: {
        'User-Agent': 'HelperTool/1.0',
        'Accept': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(key).toString('base64'),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(data); } catch (_) { body = null; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('Request timed out')); });
  });
}

async function readToday() {
  const key = getKey();
  if (key && !cfgValue('api_url')) {
    try {
      const res = await apiGet('/api/v1/users/current/status_bar/today', key);
      if (res.status === 200 && res.body && res.body.data && res.body.data.grand_total) {
        const d = res.body.data;
        const projects = (Array.isArray(d.projects) ? d.projects : [])
          .map((p) => ({ name: String(p.name || ''), text: String(p.text || ''), seconds: Number(p.total_seconds) || 0 }))
          .sort((a, b) => b.seconds - a.seconds)
          .slice(0, 5);
        return {
          success: true,
          total: String(d.grand_total.text || '0 mins'),
          seconds: Number(d.grand_total.total_seconds) || 0,
          projects,
        };
      }
      if (res.status === 401) return { success: false, error: 'WakaTime rejected the API key.' };
    } catch (_) {}
  }
  const bin = cliPath();
  if (!bin) return { success: false, error: 'Not installed' };
  const cli = await run(bin, ['--today'], 20000);
  if (!cli.ok) return { success: false, error: cli.stderr || cli.message };
  return { success: true, total: cli.stdout, seconds: 0, projects: [] };
}

function startTicker() {
  if (started) return;
  started = true;
  const timer = setInterval(tick, TICK_MS);
  if (timer.unref) timer.unref();
}

function register() {
  ipcMain.handle('wakatime:status', async () => {
    try {
      return { success: true, installed: !!cliPath(), hasKey: hasKey() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('wakatime:install', async () => install());

  ipcMain.handle('wakatime:setKey', async (_e, payload) => {
    try {
      const key = String((payload && payload.key) || '').trim();
      if (!KEY_RE.test(key)) {
        return { success: false, error: 'That does not look like a WakaTime API key.' };
      }
      writeKey(key);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('wakatime:heartbeat', async (_e, payload) => {
    try {
      return { success: true, sent: sendBeat(payload || {}) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('wakatime:context', async (_e, payload) => {
    try {
      const q = payload || {};
      const repo = typeof q.repo === 'string' ? q.repo : '';
      const file = typeof q.file === 'string' && path.isAbsolute(q.file) ? q.file : '';
      ctx = {
        repo,
        file,
        line: Number(q.line) || 0,
        col: Number(q.col) || 0,
        lines: Number(q.lines) || 0,
        paused: !!q.paused,
      };
      if (repo !== watchedRoot) startWatch(repo);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('wakatime:today', async () => {
    try {
      return await readToday();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  startTicker();
}

module.exports = { register };