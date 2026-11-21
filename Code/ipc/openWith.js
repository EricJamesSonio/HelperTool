'use strict';

const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const MARKER_FILE = 'open-with.json';
const REG_ROOT = 'HKEY_CURRENT_USER\\Software\\Classes';

let getWin = null;
let ready = false;
let pending = [];
let installed = false;

function exePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function argStart() {
  return process.defaultApp ? 2 : 1;
}

function extractFiles(argv, cwd) {
  const out = [];
  const base = cwd || process.cwd();
  const list = Array.isArray(argv) ? argv.slice(argStart()) : [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'string' || raw.charAt(0) === '-') continue;
    const p = path.isAbsolute(raw) ? raw : path.resolve(base, raw);
    try {
      if (fs.statSync(p).isFile() && out.indexOf(p) === -1) out.push(p);
    } catch (_) {}
  }
  return out;
}

function addPending(files) {
  for (const f of files) {
    if (pending.indexOf(f) === -1) pending.push(f);
  }
}

function focusWindow(win) {
  try {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  } catch (_) {}
}

function deliver(files) {
  if (!files.length) return;
  const win = getWin ? getWin() : null;
  const alive = !!win && !win.isDestroyed() && !win.webContents.isDestroyed();
  if (alive) focusWindow(win);
  if (!ready || !alive) {
    addPending(files);
    return;
  }
  try {
    win.webContents.send('openWith:files', files);
  } catch (_) {
    addPending(files);
  }
}

function regQuote(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildRegText(exe) {
  const name = path.basename(exe);
  const cmd = regQuote('"' + exe + '" "%1"');
  const icon = regQuote('"' + exe + '",0');
  const lines = ['Windows Registry Editor Version 5.00', ''];
  const add = (key, values) => {
    lines.push('[' + REG_ROOT + '\\' + key + ']');
    for (const v of values) {
      lines.push((v[0] === '@' ? '@' : '"' + v[0] + '"') + '="' + v[1] + '"');
    }
    lines.push('');
  };
  add('Applications\\' + name, [['FriendlyAppName', 'ES Code']]);
  add('Applications\\' + name + '\\DefaultIcon', [['@', icon]]);
  add('Applications\\' + name + '\\shell\\open', [['FriendlyAppName', 'ES Code']]);
  add('Applications\\' + name + '\\shell\\open\\command', [['@', cmd]]);
  add('*\\OpenWithList\\' + name, []);
  add('*\\shell\\ESCode', [['@', 'Open with ES Code'], ['Icon', icon]]);
  add('*\\shell\\ESCode\\command', [['@', cmd]]);
  return lines.join('\r\n');
}

function runReg(args) {
  return new Promise((resolve, reject) => {
    const sys = process.env.SystemRoot || 'C:\\Windows';
    const bin = path.join(sys, 'System32', 'reg.exe');
    execFile(bin, args, { windowsHide: true, timeout: 20000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function importReg(exe) {
  const file = path.join(app.getPath('temp'), 'escode-open-with.reg');
  const body = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(buildRegText(exe), 'utf16le')]);
  await fs.promises.writeFile(file, body);
  try {
    await runReg(['import', file]);
  } finally {
    fs.promises.unlink(file).catch(() => {});
  }
}

function markerPath() {
  return path.join(app.getPath('userData'), MARKER_FILE);
}

function readMarker() {
  try {
    const data = JSON.parse(fs.readFileSync(markerPath(), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

function writeMarker(data) {
  try {
    fs.writeFileSync(markerPath(), JSON.stringify(data));
  } catch (_) {}
}

function canRegister() {
  return process.platform === 'win32' && (app.isPackaged || !!process.env.PORTABLE_EXECUTABLE_FILE);
}

async function register(force) {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows only' };
  if (!canRegister()) return { ok: false, error: 'Only available in the packaged app' };
  const exe = exePath();
  if (!force && readMarker().exe === exe) return { ok: true, already: true };
  try {
    await importReg(exe);
    writeMarker({ exe });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

async function unregister() {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows only' };
  const name = path.basename(exePath());
  const keys = [
    REG_ROOT + '\\Applications\\' + name,
    REG_ROOT + '\\*\\OpenWithList\\' + name,
    REG_ROOT + '\\*\\shell\\ESCode',
  ];
  for (const key of keys) {
    try {
      await runReg(['delete', key, '/f']);
    } catch (_) {}
  }
  writeMarker({});
  return { ok: true };
}

function install(deps) {
  if (installed) return;
  installed = true;
  getWin = deps && typeof deps.getMainWindow === 'function' ? deps.getMainWindow : null;
  addPending(extractFiles(process.argv, process.cwd()));

  app.on('second-instance', (_event, argv, cwd) => {
    deliver(extractFiles(argv, cwd));
  });

  ipcMain.handle('openWith:take', () => {
    ready = true;
    const files = pending;
    pending = [];
    return files;
  });
  ipcMain.handle('openWith:status', () => ({
    supported: process.platform === 'win32',
    available: canRegister(),
    registered: readMarker().exe === exePath(),
  }));
  ipcMain.handle('openWith:register', () => register(true));
  ipcMain.handle('openWith:unregister', () => unregister());

  if (canRegister()) {
    setTimeout(() => {
      register(false).catch(() => {});
    }, 5000);
  }
}

module.exports = { install, extractFiles };