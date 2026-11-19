'use strict';

const { ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWin = process.platform === 'win32';
const pidById = new Map();
const suspended = new Set();
let installed = false;
let spawnCount = 0;
let lastPid = 0;
let chain = Promise.resolve();

function winScript(pids, action) {
  const roots = pids
    .map((p) => Number(p))
    .filter((p) => Number.isInteger(p) && p > 0)
    .join(',');
  const act = action === 'resume' ? 'resume' : 'suspend';
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$sig = '[DllImport(\"ntdll.dll\")] public static extern int NtSuspendProcess(System.IntPtr h); [DllImport(\"ntdll.dll\")] public static extern int NtResumeProcess(System.IntPtr h); [DllImport(\"kernel32.dll\")] public static extern System.IntPtr OpenProcess(int a, bool i, int p); [DllImport(\"kernel32.dll\")] public static extern bool CloseHandle(System.IntPtr h);'",
    'Add-Type -Namespace CsProc -Name Native -MemberDefinition $sig',
    '$roots = @(' + roots + ')',
    "$act = '" + act + "'",
    '$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)',
    '$seen = New-Object System.Collections.Generic.List[int]',
    '$queue = New-Object System.Collections.Generic.Queue[int]',
    'foreach ($r in $roots) { $queue.Enqueue([int]$r) }',
    'while ($queue.Count -gt 0) {',
    '  $p = $queue.Dequeue()',
    '  if ($seen.Contains($p)) { continue }',
    '  $seen.Add($p)',
    '  foreach ($c in $all) { if ([int]$c.ParentProcessId -eq $p) { $queue.Enqueue([int]$c.ProcessId) } }',
    '}',
    '$arr = $seen.ToArray()',
    "if ($act -eq 'resume') { [array]::Reverse($arr) }",
    'foreach ($p in $arr) {',
    '  $h = [CsProc.Native]::OpenProcess(2048, $false, $p)',
    '  if ($h -ne [System.IntPtr]::Zero) {',
    "    if ($act -eq 'suspend') { [void][CsProc.Native]::NtSuspendProcess($h) } else { [void][CsProc.Native]::NtResumeProcess($h) }",
    '    [void][CsProc.Native]::CloseHandle($h)',
    '  }',
    '}',
  ].join('\n');
}

function winControl(pids, action) {
  return new Promise((resolve, reject) => {
    const sys = process.env.SystemRoot || 'C:\\Windows';
    const exe = path.join(sys, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const bin = fs.existsSync(exe) ? exe : 'powershell.exe';
    const encoded = Buffer.from(winScript(pids, action), 'utf16le').toString('base64');
    execFile(
      bin,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 30000 },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function posixControl(pids, action) {
  return new Promise((resolve, reject) => {
    execFile('ps', ['-A', '-o', 'pid=,ppid='], { timeout: 10000 }, (err, out) => {
      if (err) {
        reject(err);
        return;
      }
      const kids = new Map();
      String(out)
        .split('\n')
        .forEach((line) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 2) return;
          const pid = Number(parts[0]);
          const ppid = Number(parts[1]);
          if (!kids.has(ppid)) kids.set(ppid, []);
          kids.get(ppid).push(pid);
        });
      const order = [];
      const seen = new Set();
      const queue = pids.slice();
      while (queue.length) {
        const p = queue.shift();
        if (seen.has(p)) continue;
        seen.add(p);
        order.push(p);
        (kids.get(p) || []).forEach((c) => queue.push(c));
      }
      if (action === 'resume') order.reverse();
      const sig = action === 'suspend' ? 'SIGSTOP' : 'SIGCONT';
      order.forEach((p) => {
        try {
          process.kill(p, sig);
        } catch (_) {}
      });
      resolve();
    });
  });
}

async function run(ids, action) {
  const want = action === 'suspend';
  const roots = [];
  for (const id of ids) {
    const pid = pidById.get(id);
    if (!pid) continue;
    if (want === suspended.has(id)) continue;
    roots.push({ id, pid });
  }
  if (!roots.length) return { ok: true, changed: [] };
  if (want) roots.forEach((r) => suspended.add(r.id));
  try {
    const pids = roots.map((r) => r.pid);
    if (isWin) await winControl(pids, action);
    else await posixControl(pids, action);
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
  if (!want) roots.forEach((r) => suspended.delete(r.id));
  return { ok: true, changed: roots.map((r) => r.id) };
}

function control(ids, action) {
  const task = chain.then(() => run(ids, action));
  chain = task.catch(() => {});
  return task;
}

function normIds(ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

function forgetPid(pid) {
  for (const [id, p] of Array.from(pidById.entries())) {
    if (p === pid) {
      pidById.delete(id);
      suspended.delete(id);
    }
  }
}

function wrapSpawn(handler) {
  return function (event, payload) {
    const before = spawnCount;
    const out = handler.call(this, event, payload);
    const pid = spawnCount > before ? lastPid : 0;
    return Promise.resolve(out).then((res) => {
      if (pid && res && res.id !== undefined && !res.error) pidById.set(res.id, pid);
      return res;
    });
  };
}

function wrapKill(handler) {
  return async function (event, id) {
    if (!isWin && suspended.has(id)) await control([id], 'resume');
    suspended.delete(id);
    pidById.delete(id);
    return handler.call(this, event, id);
  };
}

function install() {
  if (installed) return;
  installed = true;

  let pty = null;
  try {
    pty = require('node-pty');
  } catch (_) {
    pty = null;
  }
  if (pty && typeof pty.spawn === 'function') {
    const origSpawn = pty.spawn;
    pty.spawn = function () {
      const term = origSpawn.apply(this, arguments);
      spawnCount += 1;
      lastPid = term && term.pid ? term.pid : 0;
      if (term && typeof term.onExit === 'function') {
        const pid = term.pid;
        term.onExit(() => forgetPid(pid));
      }
      return term;
    };
  }

  const origHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = function (channel, handler) {
    if (channel === 'opencode:termSpawn') return origHandle(channel, wrapSpawn(handler));
    if (channel === 'opencode:termKill') return origHandle(channel, wrapKill(handler));
    return origHandle(channel, handler);
  };

  origHandle('opencode:termSuspend', (_event, ids) => control(normIds(ids), 'suspend'));
  origHandle('opencode:termResume', (_event, ids) => control(normIds(ids), 'resume'));
}

module.exports = { install };