'use strict';

const fs = require('fs');
const path = require('path');
const stackDetector = require('./detect/stackDetector');
const dbDetector = require('./detect/dbDetector');
const authDetector = require('./detect/authDetector');
const envReader = require('./detect/envReader');
const surfaceDiscovery = require('./detect/surfaceDiscovery');

function confidenceFor(value, strongSignal) {
  if (!value || value === 'unknown' || value === 'none-found') return 0.2;
  return strongSignal ? 0.9 : 0.6;
}

function projectRoots(repoPath) {
  const roots = [repoPath];
  let entries = [];
  try {
    entries = fs.readdirSync(repoPath, { withFileTypes: true });
  } catch (e) {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const dir = path.join(repoPath, entry.name);
    if (fs.existsSync(path.join(dir, 'package.json')) || fs.existsSync(path.join(dir, 'composer.json'))) {
      roots.push(dir);
    }
  }
  return roots;
}

function folderOf(repoPath, dir) {
  return path.relative(repoPath, dir).split(path.sep).join('/');
}

function withFolder(folder, list) {
  return folder ? list.map((item) => folder + '/' + item) : list;
}

function unique(list) {
  return Array.from(new Set(list));
}

function detectStack(repoPath) {
  const parts = projectRoots(repoPath).map((root) => ({
    root,
    folder: folderOf(repoPath, root),
    stack: stackDetector.detect(root),
    db: dbDetector.detect(root),
    auth: authDetector.detect(root),
    env: envReader.readEnv(root),
  }));

  const first = parts[0];
  const frontendPart = parts.find((p) => p.stack.frontend.framework !== 'unknown') || first;
  const backendPart = parts.find((p) => p.stack.backend.framework !== 'unknown') || first;
  const dbPart = parts.find((p) => p.db.dialect !== 'unknown') || first;
  const authPart = parts.find((p) => p.auth.mechanism !== 'none-found') || first;
  const managerPart = parts.find((p) => p.stack.packageManager) || first;

  const surfaceParts = unique([frontendPart, backendPart]);
  const endpoints = [];
  let openapi = false;
  for (const part of surfaceParts) {
    const found = surfaceDiscovery.discover(part.root, part.stack.frontend.framework);
    for (const endpoint of found.endpoints) {
      endpoints.push(Object.assign({}, endpoint, { file: withFolder(part.folder, [endpoint.file])[0] }));
    }
    if (found.openapi) openapi = true;
  }

  const keysPresent = unique([].concat(...parts.map((p) => p.env.keysPresent)));
  const publicPrefixKeys = unique([].concat(...parts.map((p) => p.env.publicPrefixKeys)));

  return {
    frontend: frontendPart.stack.frontend,
    backend: backendPart.stack.backend,
    database: {
      dialect: dbPart.db.dialect,
      layer: dbPart.db.layer,
      files: withFolder(dbPart.folder, dbPart.db.files),
    },
    auth: { mechanism: authPart.auth.mechanism, library: authPart.auth.library, hashing: authPart.auth.hashing },
    env: { keysPresent, publicPrefixKeys },
    surface: { endpoints, openapi },
    packageManager: managerPart.stack.packageManager,
    projectFolders: parts.map((p) => p.folder || '.'),
    confidence: {
      frontend: confidenceFor(frontendPart.stack.frontend.framework, frontendPart.stack.frontend.framework !== 'unknown'),
      database: confidenceFor(dbPart.db.dialect, dbPart.db.layer !== 'unknown'),
      auth: confidenceFor(authPart.auth.mechanism, !!authPart.auth.library),
    },
    detectedAt: Date.now(),
  };
}

module.exports = { detectStack, projectRoots };