import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mkTmp, rmRf } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { preflight } = require('../services/ci/ciPreflight.js');

const made = [];

after(() => {
  for (const dir of made) rmRf(dir);
});

function repoWithNative() {
  const dir = mkTmp();
  made.push(dir);
  const pkg = path.join(dir, 'node_modules', 'native-pkg');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'engine.node'), 'x');
  return dir;
}

function planFor(dir, command) {
  return {
    jobs: [
      {
        id: 'a',
        steps: [{ kind: 'run', cwd: dir, command, secretNames: [], referencedEnvNames: [] }],
      },
    ],
  };
}

const locked = (file) => file.endsWith('engine.node');

describe('ciPreflight - locked node_modules', () => {
  it('blocks an install step when a native file is in use on windows', async () => {
    const dir = repoWithNative();
    const result = await preflight({ repoPath: dir, workflow: { jobs: [] }, plan: planFor(dir, 'npm ci'), lockProbe: locked, platform: 'win32' });
    assert.equal(result.blockers.length, 1);
    assert.match(result.blockers[0], /in use by another program/);
    assert.match(result.blockers[0], /engine\.node/);
  });

  it('does not block on other platforms', async () => {
    const dir = repoWithNative();
    const result = await preflight({ repoPath: dir, workflow: { jobs: [] }, plan: planFor(dir, 'npm ci'), lockProbe: locked, platform: 'linux' });
    assert.deepEqual(result.blockers, []);
  });

  it('does not block steps that are not installs', async () => {
    const dir = repoWithNative();
    const result = await preflight({ repoPath: dir, workflow: { jobs: [] }, plan: planFor(dir, 'npm test'), lockProbe: locked, platform: 'win32' });
    assert.deepEqual(result.blockers, []);
  });
});