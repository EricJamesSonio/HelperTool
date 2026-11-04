'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findExecutable } = require('./ciPreflight');

const GIT_BASH_PATHS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
];

const POWERSHELL_HEAD = "$ErrorActionPreference = 'stop'\n";
const POWERSHELL_TAIL = '\nif ((Test-Path -LiteralPath variable:\\LASTEXITCODE)) { exit $LASTEXITCODE }';

const SHELLS = {
  bash: {
    bins: ['bash'],
    ext: '.sh',
    head: '',
    tail: '',
    posix: true,
    args: (file) => ['--noprofile', '--norc', '-eo', 'pipefail', file],
  },
  sh: {
    bins: ['sh'],
    ext: '.sh',
    head: '',
    tail: '',
    posix: true,
    args: (file) => ['-e', file],
  },
  pwsh: {
    bins: ['pwsh'],
    ext: '.ps1',
    head: POWERSHELL_HEAD,
    tail: POWERSHELL_TAIL,
    posix: false,
    args: (file) => ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
  },
  powershell: {
    bins: ['powershell'],
    ext: '.ps1',
    head: POWERSHELL_HEAD,
    tail: POWERSHELL_TAIL,
    posix: false,
    args: (file) => ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
  },
  cmd: {
    bins: ['cmd'],
    ext: '.cmd',
    head: '',
    tail: '',
    posix: false,
    args: (file) => ['/D', '/E:ON', '/V:OFF', '/C', file],
  },
  python: {
    bins: ['python3', 'python'],
    ext: '.py',
    head: '',
    tail: '',
    posix: false,
    args: (file) => [file],
  },
};

function locate(name, platform, find, exists) {
  const def = SHELLS[name];
  for (const bin of def.bins) {
    const found = find(bin);
    if (!found) continue;
    if (name === 'bash' && platform === 'win32' && /[\\/]system32[\\/]/i.test(found)) continue;
    return found;
  }
  if (name === 'bash' && platform === 'win32') {
    for (const candidate of GIT_BASH_PATHS) {
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

function resolveShell(options) {
  const o = options || {};
  const platform = o.platform || process.platform;
  const find = o.find || ((name) => findExecutable(name));
  const exists = o.exists || ((file) => fs.existsSync(file));
  const requested = typeof o.shell === 'string' ? o.shell.trim().toLowerCase() : '';

  if (requested && (/\s|\{0\}/.test(requested) || !SHELLS[requested])) {
    return { ok: false, reason: 'The shell "' + o.shell + '" is not supported by the local runner.' };
  }

  let order;
  if (requested) order = [requested];
  else if (platform === 'win32') order = ['bash', 'pwsh', 'powershell', 'cmd'];
  else order = ['bash', 'sh'];

  for (const name of order) {
    const bin = locate(name, platform, find, exists);
    if (!bin) continue;
    const def = SHELLS[name];
    return {
      ok: true,
      name,
      bin,
      ext: def.ext,
      head: def.head,
      tail: def.tail,
      posix: def.posix,
      args: def.args,
    };
  }

  return {
    ok: false,
    reason: requested
      ? 'The shell "' + requested + '" was not found on PATH.'
      : 'No supported shell was found on PATH (looked for ' + order.join(', ') + ').',
  };
}

function writeScript(dir, shellInfo, body) {
  const file = path.join(dir, crypto.randomBytes(8).toString('hex') + shellInfo.ext);
  let text = shellInfo.head + String(body) + shellInfo.tail + '\n';
  if (shellInfo.name === 'cmd') text = text.replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
  return file;
}

function invocation(shellInfo, file, platform) {
  const current = platform || process.platform;
  const target = shellInfo.posix && current === 'win32' ? file.split(path.sep).join('/') : file;
  return [shellInfo.bin].concat(shellInfo.args(target));
}

module.exports = { resolveShell, writeScript, invocation };