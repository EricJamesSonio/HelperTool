'use strict';

const stackDetector = require('./detect/stackDetector');
const dbDetector = require('./detect/dbDetector');
const authDetector = require('./detect/authDetector');
const envReader = require('./detect/envReader');
const surfaceDiscovery = require('./detect/surfaceDiscovery');

function confidenceFor(value, strongSignal) {
  if (!value || value === 'unknown' || value === 'none-found') return 0.2;
  return strongSignal ? 0.9 : 0.6;
}

function detectStack(repoPath) {
  const stack = stackDetector.detect(repoPath);
  const db = dbDetector.detect(repoPath);
  const auth = authDetector.detect(repoPath);
  const env = envReader.readEnv(repoPath);
  const surface = surfaceDiscovery.discover(repoPath, stack.frontend.framework);

  return {
    frontend: stack.frontend,
    backend: stack.backend,
    database: { dialect: db.dialect, layer: db.layer, files: db.files },
    auth: { mechanism: auth.mechanism, library: auth.library, hashing: auth.hashing },
    env: { keysPresent: env.keysPresent, publicPrefixKeys: env.publicPrefixKeys },
    surface,
    packageManager: stack.packageManager,
    confidence: {
      frontend: confidenceFor(stack.frontend.framework, stack.frontend.framework !== 'unknown'),
      database: confidenceFor(db.dialect, db.layer !== 'unknown'),
      auth: confidenceFor(auth.mechanism, !!auth.library),
    },
    detectedAt: Date.now(),
  };
}

module.exports = { detectStack };