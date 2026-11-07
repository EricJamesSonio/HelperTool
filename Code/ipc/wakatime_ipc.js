const { ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const HOME = os.homedir();
const DIR = path.join(HOME, '.wakatime');
const CFG = path.join(HOME, '.wakatime.cfg');
const PLUGIN = 'helpertool/1.0 helpertool-wakatime/1.0';
const SAME_FILE_GAP = 120000;
const KEY_RE = /^(waka_)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

let lastBeat = { file: '', at: 0 };
let installing = null;

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

function hasKey() {
  if (String(process.env.WAKATIME_API_KEY || '').trim()) return true;
  const m = /^\s*api_key\s*=\s*(\S+)/mi.exec(readCfg());
  return !!(m && m[1]);
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

function heartbeat(p) {
  const bin = cliPath();
  if (!bin || !p || typeof p.file !== 'string' || !p.file) return { success: false };
  if (!path.isAbsolute(p.file)) return { success: false };
  const now = Date.now();
  const write = !!p.write;
  if (!write && p.file === lastBeat.file && now - lastBeat.at < SAME_FILE_GAP) {
    return { success: true, skipped: true };
  }
  lastBeat = { file: p.file, at: now };
  const args = ['--entity', p.file, '--entity-type', 'file', '--plugin', PLUGIN, '--category', 'coding'];
  if (write) args.push('--write');
  if (Number.isFinite(p.line) && p.line > 0) args.push('--lineno', String(Math.floor(p.line)));
  if (Number.isFinite(p.col) && p.col > 0) args.push('--cursorpos', String(Math.floor(p.col)));
  if (Number.isFinite(p.lines) && p.lines > 0) args.push('--lines-in-file', String(Math.floor(p.lines)));
  if (typeof p.repo === 'string' && p.repo) args.push('--project-folder', p.repo);
  execFile(bin, args, { windowsHide: true, timeout: 30000 }, (err, _out, stderr) => {
    if (err) console.warn('[WakaTime] heartbeat failed:', String(stderr || err.message).slice(0, 300));
  });
  return { success: true };
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
      return heartbeat(payload);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('wakatime:today', async () => {
    const bin = cliPath();
    if (!bin) return { success: false, error: 'Not installed' };
    const res = await run(bin, ['--today'], 20000);
    if (!res.ok) return { success: false, error: res.stderr || res.message };
    return { success: true, text: res.stdout };
  });
}

module.exports = { register };