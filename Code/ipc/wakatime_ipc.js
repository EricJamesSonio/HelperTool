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
const GLOBAL_GAP = 15000;
const BIG_FILE = 2000000;
let lastLaunch = 0;
let humanFlag = true;
let updTried = false;

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
    return BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized() && w.isFocused());
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

function splitLines(t) {
  if (!t) return [];
  const a = String(t).split(/\r?\n/);
  if (a.length && a[a.length - 1] === '') a.pop();
  return a;
}

function countLineChanges(before, after) {
  const a = splitLines(before);
  const b = splitLines(after);
  let s = 0;
  const max = Math.min(a.length, b.length);
  while (s < max && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  const n = ea - s;
  const m = eb - s;
  if (!n) return m;
  if (!m) return n;
  if (n * m > 4000000) return n + m;
  let prev = new Uint32Array(m + 1);
  let cur = new Uint32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    cur[0] = 0;
    const ai = a[s + i - 1];
    for (let j = 1; j <= m; j++) {
      if (ai === b[s + j - 1]) cur[j] = prev[j - 1] + 1;
      else cur[j] = prev[j] > cur[j - 1] ? prev[j] : cur[j - 1];
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  const lcs = prev[m];
  return (n - lcs) + (m - lcs);
}

function stripHuman(args) {
  const i = args.indexOf('--human-line-changes');
  if (i < 0) return args;
  const c = args.slice();
  c.splice(i, 2);
  return c;
}

function handleOldCli(job) {
  console.warn('[WakaTime] this wakatime-cli does not support --human-line-changes');
  const requeue = (extra) => {
    cliQueue.unshift(Object.assign({}, job, extra));
  };
  if (updTried) {
    humanFlag = false;
    requeue({ args: stripHuman(job.args), human: false });
    cliBusy = false;
    runQueue();
    return;
  }
  updTried = true;
  install()
    .then((res) => {
      if (res && res.success) {
        requeue({ bin: cliPath() || job.bin, human: true });
      } else {
        humanFlag = false;
        requeue({ args: stripHuman(job.args), human: false });
      }
    })
    .catch(() => {
      humanFlag = false;
      requeue({ args: stripHuman(job.args), human: false });
    })
    .finally(() => {
      cliBusy = false;
      runQueue();
    });
}

function runQueue() {
  if (cliBusy || !cliQueue.length) return;
  const job = cliQueue.shift();
  cliBusy = true;
  const t0 = Date.now();
  const child = execFile(job.bin, job.args, { windowsHide: true, timeout: 15000 }, (err, _out, stderr) => {
    const ms = Date.now() - t0;
    const text = String(stderr || (err && err.message) || '');
    if (err && job.human && /human-line-changes/i.test(text) && /unknown|unrecognized|flag|usage/i.test(text)) {
      handleOldCli(job);
      return;
    }
    if (err) console.warn('[WakaTime] heartbeat failed after ' + ms + ' ms:', text.slice(0, 300));
    else if (ms > 4000) console.warn('[WakaTime] slow heartbeat: ' + ms + ' ms');
    cliBusy = false;
    runQueue();
  });
  try {
    if (child && child.pid) os.setPriority(child.pid, os.constants.priority.PRIORITY_LOW);
  } catch (_) {}
}

function enqueueBeat(bin, args, key, human) {
  if (!human && cliQueue.some((j) => j.key === key)) return false;
  if (cliQueue.length >= MAX_QUEUE) {
    const i = cliQueue.findIndex((j) => !j.human);
    if (i >= 0) cliQueue.splice(i, 1);
    else if (cliQueue.length >= 80) return false;
  }
  cliQueue.push({ bin, args, key, human: !!human });
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
  if (p.bg && now - lastLaunch < GLOBAL_GAP) return false;
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
  const args = ['--entity', entity, '--entity-type', isApp ? 'app' : 'file', '--plugin', PLUGIN, '--category', 'coding', '--sync-offline-activity', '25'];
  let human = false;
  if (!isApp) {
    if (p.write) args.push('--write');
    if (Number.isFinite(p.line) && p.line > 0) args.push('--lineno', String(Math.floor(p.line)));
    if (Number.isFinite(p.col) && p.col > 0) args.push('--cursorpos', String(Math.floor(p.col)));
    if (Number.isFinite(p.lines) && p.lines > 0) args.push('--lines-in-file', String(Math.floor(p.lines)));
    if (humanFlag && Number.isFinite(p.humanLines) && p.humanLines > 0) {
      args.push('--human-line-changes', String(Math.floor(p.humanLines)));
      human = true;
    }
  }
  if (repo) args.push('--project-folder', repo);
  else if (isApp) args.push('--project', APP_NAME);
  const qkey = human ? key + ':h' + now + ':' + Math.random().toString(36).slice(2, 6) : key + (p.write ? ':w' : '');
  const queued = enqueueBeat(bin, args, qkey, human);
  if (queued && !human) lastLaunch = now;
  return queued;
}

function reportHumanChanges(basePath, files) {
  try {
    if (ctx.paused || !Array.isArray(files)) return 0;
    const jobs = [];
    for (const f of files) {
      if (!f || typeof f.abs !== 'string' || !path.isAbsolute(f.abs) || f.after == null) continue;
      const n = countLineChanges(f.before, f.after);
      if (n > 0) jobs.push({ abs: f.abs, n, lines: splitLines(f.after).length });
    }
    jobs.sort((x, y) => y.n - x.n);
    let sent = 0;
    for (const j of jobs.slice(0, 60)) {
      if (sendBeat({ file: j.abs, write: true, repo: basePath, gap: 1000, humanLines: j.n, lines: j.lines })) sent++;
    }
    return sent;
  } catch (_) {
    return 0;
  }
}

function tick() {
  if (ctx.paused || !windowOpen() || !userActive()) return;
  if (ctx.file) {
    sendBeat({ file: ctx.file, repo: ctx.repo, line: ctx.line, col: ctx.col, lines: ctx.lines, bg: true });
  } else {
    sendBeat({ app: true, repo: ctx.repo, bg: true });
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
    if (!info.isFile() || info.size > BIG_FILE) continue;
    if (sendBeat({ file: files[i], write: true, repo: ctx.repo, gap: WATCH_GAP, bg: true })) sent++;
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

module.exports = { register, reportHumanChanges };