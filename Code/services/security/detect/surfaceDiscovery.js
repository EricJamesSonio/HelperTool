'use strict';

const fs = require('fs');
const path = require('path');

function walk(dir, depthLeft, out) {
  if (depthLeft < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, depthLeft - 1, out);
    } else if (/\.(js|ts|jsx|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

function discover(repoPath, frontendFramework) {
  const endpoints = [];
  const candidates = [
    path.join(repoPath, 'app', 'api'),
    path.join(repoPath, 'pages', 'api'),
    path.join(repoPath, 'src', 'app', 'api'),
    path.join(repoPath, 'src', 'pages', 'api'),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const files = [];
    walk(dir, 6, files);
    for (const file of files) {
      endpoints.push({ method: 'UNKNOWN', file: path.relative(repoPath, file).split(path.sep).join('/') });
    }
  }
  return {
    endpoints,
    openapi: fs.existsSync(path.join(repoPath, 'openapi.json')) || fs.existsSync(path.join(repoPath, 'swagger.json')),
  };
}

module.exports = { discover };