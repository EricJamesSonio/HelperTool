const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const CACHE_TTL = 5 * 60 * 1000;
const _cache = new Map();

function _getStoreDir() {
  const dir = path.join(app.getPath('userData'), 'project-inspector');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function _hashPath(repoPath) {
  return crypto.createHash('md5').update(repoPath).digest('hex');
}

function _filePath(repoPath) {
  return path.join(_getStoreDir(), _hashPath(repoPath) + '.json');
}

function saveInspection(repoPath, data) {
  const filePath = _filePath(repoPath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  _cache.set(repoPath, { data, ts: Date.now() });
}

function loadInspection(repoPath) {
  const cached = _cache.get(repoPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const filePath = _filePath(repoPath);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    _cache.set(repoPath, { data, ts: Date.now() });
    return data;
  } catch {
    return null;
  }
}

function deleteInspection(repoPath) {
  _cache.delete(repoPath);
  const filePath = _filePath(repoPath);
  try { fs.unlinkSync(filePath); } catch {}
}

function listInspections() {
  const dir = _getStoreDir();
  let entries;
  try { entries = fs.readdirSync(dir); }
  catch { return []; }

  const results = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, entry), 'utf-8');
      const data = JSON.parse(raw);
      results.push({
        repoPath: data.repoPath,
        name: data.repoPath ? data.repoPath.split(/[/\\]/).filter(Boolean).pop() : 'Unknown',
        inspectedAt: data.inspectedAt || null,
        projectType: data.projectType || 'unknown',
      });
    } catch {}
  }
  return results.sort((a, b) => {
    if (!a.inspectedAt || !b.inspectedAt) return 0;
    return new Date(b.inspectedAt) - new Date(a.inspectedAt);
  });
}

function hasInspection(repoPath) {
  const data = loadInspection(repoPath);
  return data !== null;
}

module.exports = {
  saveInspection,
  loadInspection,
  deleteInspection,
  listInspections,
  hasInspection,
};
