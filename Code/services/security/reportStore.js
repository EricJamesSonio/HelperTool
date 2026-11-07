'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_NAME = 'security-reports.json';
const MAX_HISTORY = 20;

let storeDir = null;

function init(dir) {
  storeDir = dir;
}

function filePath() {
  if (!storeDir) throw new Error('The security report storage location is unavailable.');
  return path.join(storeDir, FILE_NAME);
}

function readAll() {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeAll(data) {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(data), 'utf8');
    fs.renameSync(temp, file);
  } finally {
    try {
      fs.unlinkSync(temp);
    } catch (e) {
      /* temp file already moved */
    }
  }
}

function save(repoPath, report) {
  const store = readAll();
  const entry = store[repoPath] || { last: null, history: [] };
  entry.last = report;
  entry.history.unshift({
    id: report.id,
    startedAt: report.startedAt,
    score: report.score.overall,
    grade: report.score.grade,
    critical: report.totals.bySeverity.critical || 0,
    high: report.totals.bySeverity.high || 0,
  });
  entry.history = entry.history.slice(0, MAX_HISTORY);
  store[repoPath] = entry;
  writeAll(store);
}

function getLast(repoPath) {
  const entry = readAll()[repoPath];
  return entry && entry.last ? entry.last : null;
}

function getHistory(repoPath) {
  const entry = readAll()[repoPath];
  return entry && Array.isArray(entry.history) ? entry.history : [];
}

module.exports = { init, save, getLast, getHistory };