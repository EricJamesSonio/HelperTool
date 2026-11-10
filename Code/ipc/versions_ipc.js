const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');

const FILES = ['README.md', 'UI-Preview.md'];
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_NEW_IMAGES = 60;
const IMG_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
const NEW_IMG_EXT = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp' };

let _bundled = null;
let _registered = false;

function candidates() {
  const list = [];
  if (process.resourcesPath) {
    list.push(path.join(process.resourcesPath, '.Versions'));
    list.push(path.join(process.resourcesPath, 'Versions'));
  }
  list.push(path.join(__dirname, '..', '..', '.Versions'));
  list.push(path.join(__dirname, '..', '.Versions'));
  try {
    const appPath = app.getAppPath();
    list.push(path.join(appPath, '.Versions'));
    list.push(path.join(appPath, '..', '.Versions'));
    list.push(path.join(appPath, '..', '..', '.Versions'));
  } catch (_) {}
  return list;
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (_) {
    return false;
  }
}

function isWritable(p) {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function findBundled() {
  if (_bundled && isDir(_bundled)) return _bundled;
  _bundled = null;
  for (const c of candidates()) {
    if (isDir(c)) {
      _bundled = path.resolve(c);
      return _bundled;
    }
  }
  return null;
}

function userRoot() {
  return path.resolve(path.join(app.getPath('userData'), 'Versions'));
}

function allRoots() {
  const out = [];
  const b = findBundled();
  if (b) out.push(b);
  const u = userRoot();
  if (isDir(u) && u !== b) out.push(u);
  return out;
}

function rootFor(id) {
  for (const r of allRoots()) {
    if (isDir(path.join(r, id))) return r;
  }
  return null;
}

function targetRoot() {
  const b = findBundled();
  if (b && isWritable(b)) return { root: b, user: false };
  return { root: userRoot(), user: true };
}

function fail(error) {
  return { success: false, error };
}

function firstHeading(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) return m[1];
  }
  return '';
}

async function countImages(root, id) {
  try {
    const names = await fs.promises.readdir(path.join(root, 'assets', id));
    return names.filter((n) => IMG_MIME[path.extname(n).toLowerCase()]).length;
  } catch (_) {
    return 0;
  }
}

async function listVersions() {
  const seen = new Set();
  const versions = [];
  for (const root of allRoots()) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const m = /^v(\d+)$/i.exec(e.name);
      if (!m) continue;
      const key = e.name.toLowerCase();
      if (seen.has(key)) continue;
      const dir = path.join(root, e.name);
      const files = FILES.filter((f) => fs.existsSync(path.join(dir, f)));
      if (!files.length) continue;
      seen.add(key);
      let title = '';
      if (files.includes('README.md')) {
        try {
          title = firstHeading(await fs.promises.readFile(path.join(dir, 'README.md'), 'utf8'));
        } catch (_) {}
      }
      const images = await countImages(root, e.name);
      versions.push({ id: e.name, num: Number(m[1]), files, title, images });
    }
  }
  versions.sort((a, b) => b.num - a.num);
  const t = targetRoot();
  return { success: true, versions, target: t.root, userFolder: t.user };
}

async function readVersionFile(id, file) {
  if (!/^v\d+$/i.test(String(id)) || !FILES.includes(file)) {
    return fail('Invalid request.');
  }
  const root = rootFor(id);
  if (!root) return fail('Version ' + id + ' was not found.');
  const text = await fs.promises.readFile(path.join(root, id, file), 'utf8');
  return { success: true, text };
}

async function readAsset(rel) {
  const clean = String(rel || '').replace(/\\/g, '/');
  const mime = IMG_MIME[path.extname(clean).toLowerCase()];
  if (!mime) return fail('Unsupported image type.');
  for (const root of allRoots()) {
    const full = path.resolve(root, clean);
    if (full !== root && !full.startsWith(root + path.sep)) continue;
    let stat;
    try {
      stat = await fs.promises.stat(full);
    } catch (_) {
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > MAX_ASSET_BYTES) return fail('Image is too large.');
    const buf = await fs.promises.readFile(full);
    return { success: true, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64') };
  }
  return fail('Image not found.');
}

function oneLine(s) {
  return String(s || '').replace(/[\r\n]+/g, ' ').replace(/[\[\]]/g, '').trim();
}

function prepareImages(images) {
  const prepared = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i] || {};
    const dataUrl = String(img.dataUrl || '');
    const comma = dataUrl.indexOf(',');
    const head = comma > 0 ? dataUrl.slice(0, comma) : '';
    const m = /^data:image\/([\w+.-]+);base64$/i.exec(head);
    if (!m) throw new Error('Image ' + (i + 1) + ' is not a valid image.');
    const ext = NEW_IMG_EXT[m[1].toLowerCase()];
    if (!ext) throw new Error('Image ' + (i + 1) + ' must be PNG, JPG, GIF or WebP.');
    const buf = Buffer.from(dataUrl.slice(comma + 1), 'base64');
    if (!buf.length) throw new Error('Image ' + (i + 1) + ' is empty.');
    if (buf.length > MAX_ASSET_BYTES) throw new Error('Image ' + (i + 1) + ' is larger than 20 MB.');
    prepared.push({
      name: '1.' + (i + 1) + '.' + ext,
      caption: oneLine(img.caption) || 'Screenshot ' + (i + 1),
      buf,
    });
  }
  return prepared;
}

function buildPreviewMd(num, label, id, prepared) {
  const lines = ['# UI Preview', '', '# ' + label + ' V', ''];
  if (!prepared.length) {
    lines.push('No screenshots added yet.', '');
  }
  prepared.forEach((p) => {
    lines.push('- [' + p.caption + ']', '');
    lines.push('![Version ' + num + ' UI](../assets/' + id + '/' + p.name + ')', '');
  });
  lines.push('---', '');
  return lines.join('\n');
}

async function createVersion(payload) {
  const p = payload || {};
  const num = Number(p.num);
  if (!Number.isInteger(num) || num < 1 || num > 999) {
    return fail('Version number must be a whole number from 1 to 999.');
  }
  const id = 'v' + num;
  if (rootFor(id)) return fail(id + ' already exists.');

  const readme = String(p.readme || '').trim();
  if (!readme) return fail('README cannot be empty.');

  const label = oneLine(p.label) || num + '.0.0';
  const images = Array.isArray(p.images) ? p.images : [];
  if (images.length > MAX_NEW_IMAGES) return fail('Too many images (maximum ' + MAX_NEW_IMAGES + ').');

  let prepared;
  try {
    prepared = prepareImages(images);
  } catch (err) {
    return fail(err.message);
  }

  const t = targetRoot();
  const dir = path.join(t.root, id);
  const assetsDir = path.join(t.root, 'assets', id);
  const assetsExisted = isDir(assetsDir);

  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, 'README.md'), readme + '\n', 'utf8');
    if (prepared.length) {
      await fs.promises.mkdir(assetsDir, { recursive: true });
      for (const img of prepared) {
        await fs.promises.writeFile(path.join(assetsDir, img.name), img.buf);
      }
    }
    await fs.promises.writeFile(
      path.join(dir, 'UI-Preview.md'),
      buildPreviewMd(num, label, id, prepared),
      'utf8'
    );
  } catch (err) {
    try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch (_) {}
    if (!assetsExisted) {
      try { await fs.promises.rm(assetsDir, { recursive: true, force: true }); } catch (_) {}
    }
    return fail('Could not save the version: ' + (err && err.message ? err.message : String(err)));
  }

  return { success: true, id, root: t.root, userFolder: t.user };
}

function wrap(fn) {
  return async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return fail(err && err.message ? err.message : String(err));
    }
  };
}

function register() {
  if (_registered) return;
  _registered = true;
  ipcMain.handle('versions:list', wrap(() => listVersions()));
  ipcMain.handle('versions:read', wrap((id, file) => readVersionFile(id, file)));
  ipcMain.handle('versions:asset', wrap((rel) => readAsset(rel)));
  ipcMain.handle('versions:create', wrap((payload) => createVersion(payload)));
}

module.exports = { register };