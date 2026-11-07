'use strict';

const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { app, ipcMain, webContents } = require('electron');

const IS_WIN = process.platform === 'win32';
const SAMPLER_TAG = 'HTPERFSAMPLER';
const SCAN_TIMEOUT_MS = 20000;
const WAKEUP_WEIGHT = 0.1;
const SLOW_IPC_MS = 250;
const SLOW_KEEP = 30;
const SLOW_WINDOW_MS = 120000;

const LONG_RUNNING = /^(select-repo|select-folder|save-file-dialog|opencode:(run|selectFile)|harness:run|(image|video):(pick|compress|gif|render|preview|convert)|gmail:(addAccount|reAuthAccount)|github:generateBundle|generate)$/;

const CHANNEL_FEATURES = [
  ['git:', 'gitTool'],
  ['symbolIndex:', 'symbolIndex'],
  ['graphify:', 'graphify'],
  ['opencode:', 'codeswampChat'],
  ['gemini:', 'codeswampChat'],
  ['terminal:', 'terminalTool'],
  ['error-cop:', 'terminalTool'],
  ['watcher:', 'ecosystemWatcher'],
  ['eco:', 'ecosystemWatcher'],
  ['harness:', 'harnessTool'],
  ['profile:', 'profileTool'],
  ['team-activity:', 'teamActivityTool'],
  ['blueprint:', 'blueprintLibraryTool'],
  ['kit:', 'blueprintLibraryTool'],
  ['motherbox:', 'blueprintLibraryTool'],
  ['docker:', 'dockerTool'],
  ['gmail:', 'gmailTool'],
  ['chat:', 'gmailTool'],
  ['video:', 'videoTool'],
  ['image:', 'videoTool'],
  ['canvas:', 'canvasTool'],
  ['dbInspector:', 'dbInspector'],
  ['port-manager:', 'portManagerTool'],
  ['env:', 'envManager'],
  ['github:', 'githubExplorer'],
  ['automation:', 'automationSketch'],
  ['researcher:', 'researcherTool'],
  ['researcherAssist:', 'researcherTool'],
  ['loc:', 'locDetector'],
  ['fileseeder:', 'fileSeeder'],
  ['codebaseChat:', 'codebbaseChat'],
  ['codebaseMap:', 'codebaseMap'],
  ['projectInspector:', 'projectInspector'],
  ['secrets-', 'secretHolder'],
  ['apiTool', 'apiTool'],
  ['workspace', 'workspaceTool'],
  ['prompts-', 'promptTool'],
  ['shortcut:', 'shortcutMode'],
  ['repoConsole:', 'commands'],
];
CHANNEL_FEATURES.push(['ide:', 'ideMode'], ['wakatime:', 'ideMode'], ['gitAccounts:', 'gitTool']);


const SHELL_NAMES = /^(powershell|pwsh|cmd|bash|zsh|sh|fish|wsl|ubuntu)$/;
const PTY_HOSTS = /^(conhost|openconsole|winpty-agent|conpty)/;

const _ipc = new Map();
const _ipcPrev = new Map();
const _slow = [];
let _prevCpu = new Map();
let _lastAt = null;
let _inflight = null;
let _installed = false;

const norm = (s) => String(s || '').toLowerCase().replace(/\\/g, '/');

function featureForChannel(channel) {
  for (const [prefix, feature] of CHANNEL_FEATURES) {
    if (channel.startsWith(prefix)) return feature;
  }
  return 'core';
}

function recordIpc(channel, ms) {
  const feature = featureForChannel(channel);
  let s = _ipc.get(feature);
  if (!s) {
    s = { ms: 0, calls: 0 };
    _ipc.set(feature, s);
  }
  s.calls += 1;
  if (LONG_RUNNING.test(channel)) return;
  s.ms += ms;
  if (ms >= SLOW_IPC_MS) {
    _slow.push({ channel, ms: Math.round(ms), at: Date.now() });
    if (_slow.length > SLOW_KEEP) _slow.shift();
  }
}

function hookIpc() {
  const orig = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = function (channel, handler) {
    if (typeof channel !== 'string' || channel.startsWith('perf:')) return orig(channel, handler);
    return orig(channel, async function (event, ...args) {
      const t0 = process.hrtime.bigint();
      try {
        return await handler.call(this, event, ...args);
      } finally {
        recordIpc(channel, Number(process.hrtime.bigint() - t0) / 1e6);
      }
    });
  };
}

function execFileP(file, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(file, args, opts, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });
}

function winScript(rootPid) {
  return [
    "$ProgressPreference='SilentlyContinue'",
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
    "$tag='" + SAMPLER_TAG + "'",
    '$root=' + rootPid,
    '$all=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize,PrivatePageCount,KernelModeTime,UserModeTime)',
    '$keep=@{}',
    '$keep[[int]$root]=$true',
    '$grew=$true',
    'while($grew){$grew=$false;foreach($p in $all){$pp=[int]$p.ParentProcessId;$id=[int]$p.ProcessId;if($keep.ContainsKey($pp) -and -not $keep.ContainsKey($id)){$keep[$id]=$true;$grew=$true}}}',
    '$out=@(foreach($p in $all){if($keep.ContainsKey([int]$p.ProcessId)){[pscustomobject]@{pid=[int]$p.ProcessId;ppid=[int]$p.ParentProcessId;name=[string]$p.Name;cmd=[string]$p.CommandLine;ws=[double]$p.WorkingSetSize;priv=[double]$p.PrivatePageCount;cpu=([double]$p.KernelModeTime+[double]$p.UserModeTime)}}})',
    'ConvertTo-Json -InputObject $out -Compress -Depth 3',
  ].join(';');
}

async function scanWindows(rootPid) {
  const stdout = await execFileP(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command', winScript(rootPid)],
    { windowsHide: true, timeout: SCAN_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }
  );
  const text = stdout.replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  let data = JSON.parse(text);
  if (!Array.isArray(data)) data = [data];
  return data.map((x) => ({
    pid: Number(x.pid) || 0,
    ppid: Number(x.ppid) || 0,
    name: String(x.name || ''),
    cmd: String(x.cmd || '').slice(0, 500),
    ws: Number(x.ws) || 0,
    priv: Number(x.priv) || 0,
    cpu: Number(x.cpu) || 0,
  }));
}

function parseCpuTime(text) {
  let days = 0;
  let rest = text;
  const d = text.split('-');
  if (d.length === 2) {
    days = Number(d[0]) || 0;
    rest = d[1];
  }
  let sec = 0;
  for (const part of rest.split(':')) sec = sec * 60 + (Number(part) || 0);
  return (days * 86400 + sec) * 1000;
}

function descendants(rows, rootPid) {
  const kids = new Map();
  for (const r of rows) {
    if (!kids.has(r.ppid)) kids.set(r.ppid, []);
    kids.get(r.ppid).push(r);
  }
  const out = [];
  const rootRow = rows.find((r) => r.pid === rootPid);
  if (rootRow) out.push(rootRow);
  const seen = new Set([rootPid]);
  const stack = [rootPid];
  while (stack.length) {
    const p = stack.pop();
    for (const c of kids.get(p) || []) {
      if (seen.has(c.pid)) continue;
      seen.add(c.pid);
      out.push(c);
      stack.push(c.pid);
    }
  }
  return out;
}

async function scanPosix(rootPid) {
  const stdout = await execFileP('ps', ['-A', '-o', 'pid=,ppid=,rss=,time=,args='], {
    timeout: SCAN_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  const rows = [];
  for (const line of stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const args = m[5];
    rows.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      name: path.basename(args.split(' ')[0]),
      cmd: args.slice(0, 500),
      ws: Number(m[3]) * 1024,
      priv: Number(m[3]) * 1024,
      cpu: parseCpuTime(m[4]) * 10000,
    });
  }
  return descendants(rows, rootPid);
}

function runScan(rootPid) {
  return IS_WIN ? scanWindows(rootPid) : scanPosix(rootPid);
}

function limitedRows(metrics, rootPid) {
  const out = [];
  for (const m of metrics.values()) {
    out.push({ pid: m.pid, ppid: m.pid === rootPid ? 0 : rootPid, name: m.type || 'electron', cmd: '', ws: 0, priv: 0, cpu: 0 });
  }
  if (!out.some((r) => r.pid === rootPid)) {
    out.push({ pid: rootPid, ppid: 0, name: 'Browser', cmd: '', ws: 0, priv: 0, cpu: 0 });
  }
  return out;
}

function classifyTop(top, subtree, ctx) {
  const cmd = norm(top.cmd);
  const name = String(top.name || '').toLowerCase().replace(/\.exe$/, '');
  if (cmd.includes(SAMPLER_TAG.toLowerCase())) return 'performanceTracker';

  const m = ctx.metrics.get(top.pid);
  if (m) {
    if (m.type === 'Tab') return ctx.wc.get(top.pid) === 'browserView' ? 'researcherTool' : 'core';
    return m.type === 'Browser' ? 'core' : 'electron';
  }
  if (cmd.includes('--type=renderer')) return ctx.wc.get(top.pid) === 'browserView' ? 'researcherTool' : 'core';
  if (cmd.includes('--type=')) return 'electron';

  if (cmd.includes('worker-service/worker.js')) return 'workerService';
  if (cmd.includes('indexer-service/indexer.js')) return 'symbolIndex';
  if (cmd.includes('graphify-service/server.js')) return 'graphify';

  const isShellTop = SHELL_NAMES.test(name);
  const oneShot = /\s(\/c|-c|-command|-encodedcommand)(\s|$)/.test(' ' + cmd);
  const hasOpencode = subtree.some((p) => norm(p.cmd).includes('opencode') || String(p.name || '').toLowerCase().includes('opencode'));
  const hasPtyHost = PTY_HOSTS.test(name) || subtree.some((p) => PTY_HOSTS.test(String(p.name || '').toLowerCase()));

  if (cmd.includes('-noexit')) return 'codeswampChat';
  if (hasOpencode) return isShellTop && oneShot ? 'harnessTool' : 'codeswampChat';
  if (/^(ffmpeg|ffprobe)/.test(name)) return 'videoTool';
  if (/^git(-|$)/.test(name)) return 'gitTool';
  if (/^(netstat|tasklist|taskkill|lsof|ss)$/.test(name)) return 'portManagerTool';
  if (/^docker/.test(name)) return 'dockerTool';
  if (isShellTop && oneShot) return 'commands';
  if (hasPtyHost || isShellTop) return 'terminalTool';
  return 'other';
}

function friendlyName(row, feature, ctx) {
  if (row.pid === ctx.rootPid) return 'Main process';
  const m = ctx.metrics.get(row.pid);
  if (m) {
    if (m.type === 'Tab') return feature === 'researcherTool' ? 'Browser view (researcher)' : 'Window renderer';
    if (m.type === 'GPU') return 'GPU process';
    return 'Electron ' + String(m.type || 'helper').toLowerCase();
  }
  const c = norm(row.cmd);
  if (c.includes('worker-service/worker.js')) return 'Worker service';
  if (c.includes('indexer-service/indexer.js')) return 'Symbol indexer';
  if (c.includes('graphify-service/server.js')) return 'Graphify server';
  const raw = String(row.name || 'process').replace(/\.exe$/i, '');
  if (/^node$/i.test(raw)) {
    const hints = [
      [/next\/dist|\/next\/|\bnext (dev|build|start)/, 'Next.js'],
      [/vite/, 'Vite'],
      [/webpack/, 'Webpack'],
      [/@nestjs|nest (start|build)|\/nest\//, 'NestJS'],
      [/nodemon/, 'Nodemon'],
      [/ts-node|\btsx\b/, 'ts-node'],
      [/tsserver/, 'TypeScript server'],
      [/typescript\/lib\/tsc|\btsc\b/, 'tsc'],
      [/esbuild/, 'esbuild'],
      [/vitest|jest/, 'tests'],
      [/prisma/, 'Prisma'],
      [/react-scripts/, 'React Scripts'],
      [/@angular|ng (serve|build)/, 'Angular'],
      [/metro|expo/, 'Expo'],
      [/npm|pnpm|yarn/, 'package manager'],
    ];
    for (const h of hints) {
      if (h[0].test(c)) return raw + ' (' + h[1] + ')';
    }
  }
  return raw;
}

function bucket(map, id) {
  if (!map[id]) map[id] = { memKB: 0, cpu: 0, power: 0, procs: 0, busyPct: 0, calls: 0 };
  return map[id];
}

async function doSample() {
  const now = Date.now();
  const rootPid = process.pid;
  const first = _lastAt === null;
  const elapsed = first ? 0 : Math.max(250, now - _lastAt);

  const metrics = new Map();
  try {
    for (const m of app.getAppMetrics()) metrics.set(m.pid, m);
  } catch (_) {}

  const wc = new Map();
  try {
    for (const w of webContents.getAllWebContents()) {
      try {
        const pid = w.getOSProcessId();
        if (pid) wc.set(pid, w.getType());
      } catch (_) {}
    }
  } catch (_) {}

  let rows = null;
  let scanError = null;
  try {
    rows = await runScan(rootPid);
  } catch (e) {
    scanError = (e && e.message) || String(e);
  }
  const limited = !rows || rows.length === 0;
  if (limited) rows = limitedRows(metrics, rootPid);

  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const topOf = (pid) => {
    let cur = byPid.get(pid);
    let guard = 0;
    while (cur && cur.pid !== rootPid && cur.ppid !== rootPid && guard++ < 64) {
      const parent = byPid.get(cur.ppid);
      if (!parent) break;
      cur = parent;
    }
    return cur ? cur.pid : pid;
  };

  const subtrees = new Map();
  const tops = new Map();
  for (const r of rows) {
    const t = topOf(r.pid);
    tops.set(r.pid, t);
    if (!subtrees.has(t)) subtrees.set(t, []);
    subtrees.get(t).push(r);
  }

  const ctx = { rootPid, metrics, wc };
  const topFeature = new Map();
  for (const [t, list] of subtrees) {
    topFeature.set(t, t === rootPid ? 'core' : classifyTop(byPid.get(t), list, ctx));
  }

  const features = {};
  const procs = [];
  const total = { memKB: 0, cpu: 0, power: 0, procs: 0 };
  const nextCpu = new Map();

  for (const r of rows) {
    const feature = topFeature.get(tops.get(r.pid)) || 'other';
    const m = metrics.get(r.pid);
    const cpuMs = r.cpu / 10000;
    let memKB;
    let cpu = 0;
    let wake = 0;
    if (m) {
      memKB = (m.memory && (m.memory.privateBytes || m.memory.workingSetSize)) || (r.priv || r.ws) / 1024;
      cpu = (m.cpu && m.cpu.percentCPUUsage) || 0;
      wake = (m.cpu && m.cpu.idleWakeupsPerSecond) || 0;
    } else {
      memKB = (r.priv || r.ws || 0) / 1024;
      const prev = _prevCpu.get(r.pid);
      if (prev && cpuMs >= prev.cpuMs && now > prev.at) cpu = ((cpuMs - prev.cpuMs) / (now - prev.at)) * 100;
    }
    nextCpu.set(r.pid, { cpuMs, at: now });

    memKB = Math.round(memKB);
    cpu = Math.round(cpu * 10) / 10;
    const power = Math.round((cpu + wake * WAKEUP_WEIGHT) * 10) / 10;

    const b = bucket(features, feature);
    b.memKB += memKB;
    b.cpu = Math.round((b.cpu + cpu) * 10) / 10;
    b.power = Math.round((b.power + power) * 10) / 10;
    b.procs += 1;

    total.memKB += memKB;
    total.cpu = Math.round((total.cpu + cpu) * 10) / 10;
    total.power = Math.round((total.power + power) * 10) / 10;
    total.procs += 1;

    procs.push({ pid: r.pid, name: friendlyName(r, feature, ctx), feature, memKB, cpu, power });
  }
  _prevCpu = nextCpu;

  for (const [feature, s] of _ipc) {
    const prev = _ipcPrev.get(feature) || { ms: 0, calls: 0 };
    const b = bucket(features, feature);
    if (!first) {
      b.busyPct = Math.round(Math.min(100, ((s.ms - prev.ms) / elapsed) * 100) * 10) / 10;
      b.calls = s.calls - prev.calls;
    }
    _ipcPrev.set(feature, { ms: s.ms, calls: s.calls });
  }
  _lastAt = now;

  procs.sort((a, b) => b.memKB - a.memKB);
  const slow = _slow
    .filter((s) => now - s.at <= SLOW_WINDOW_MS)
    .slice(-8)
    .reverse()
    .map((s) => ({ channel: s.channel, ms: s.ms, ago: Math.round((now - s.at) / 1000) }));

  return {
    ok: true,
    ts: now,
    cores: os.cpus().length,
    platform: process.platform,
    electron: process.versions.electron || '',
    limited,
    scanError,
    total,
    features,
    processes: procs,
    slow,
  };
}

function sample() {
  if (_inflight) return _inflight;
  _inflight = doSample().finally(() => {
    _inflight = null;
  });
  return _inflight;
}

function reset() {
  _prevCpu = new Map();
  _ipcPrev.clear();
  _lastAt = null;
}

function install() {
  if (_installed) return;
  _installed = true;
  hookIpc();
  ipcMain.handle('perf:sample', async () => {
    try {
      return await sample();
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  });
  ipcMain.handle('perf:reset', () => {
    reset();
    return { ok: true };
  });
}

module.exports = { install };