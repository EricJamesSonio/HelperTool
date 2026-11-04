import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mkTmp, rmRf } from './helpers.mjs';

const require = createRequire(import.meta.url);
const ci = require('../services/ci/ciWorkflows.js');
const ciEnv = require('../services/ci/ciEnv.js');
const { buildPlan } = require('../services/ci/ciPlan.js');
const { startCiRun } = require('../services/ci/ciExecutor.js');
const { resolveShell } = require('../services/ci/ciShell.js');

const made = [];

after(() => {
  for (const dir of made) rmRf(dir);
});

function tmp() {
  const dir = mkTmp();
  made.push(dir);
  return dir;
}

function repoWith(name, lines) {
  const dir = tmp();
  const full = path.join(dir, '.github', 'workflows', name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, lines.join('\n') + '\n');
  return dir;
}

function fakeRunner() {
  const specs = [];
  return {
    specs,
    startJob(repoPath, spec) {
      specs.push(spec);
      return { id: 'job-1', status: 'running' };
    },
    isRunning: () => false,
    getJob: () => null,
  };
}

function options(dir, file, extra) {
  const workflow = ci.getWorkflow(dir, file);
  const { planHash } = buildPlan({ repoPath: dir, workflow, trusted: true });
  return Object.assign(
    {
      repoPath: dir,
      file,
      mode: 'full',
      jobIds: [],
      approvedSkips: [],
      planHash,
      ack: true,
      runner: fakeRunner(),
      dataDir: tmp(),
      isTrusted: () => true,
      deps: {
        preflight: async () => ({ blockers: [] }),
        gitSha: () => 'abc123',
        shell: { platform: 'linux', find: () => '/usr/bin/bash', exists: () => true },
      },
    },
    extra || {}
  );
}

const GOOD = [
  'name: CI',
  'on: push',
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - run: echo one',
  '      - run: echo two ${{ secrets.TOKEN_X }}',
  '  test:',
  '    needs: build',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: echo three',
];

describe('ciShell - resolveShell', () => {
  it('uses bash by default on linux', () => {
    const found = resolveShell({ platform: 'linux', find: (n) => (n === 'bash' ? '/bin/bash' : null), exists: () => false });
    assert.equal(found.ok, true);
    assert.equal(found.name, 'bash');
    assert.equal(found.bin, '/bin/bash');
  });

  it('rejects custom shell templates', () => {
    const found = resolveShell({ shell: 'foo {0}', platform: 'linux', find: () => '/bin/foo', exists: () => false });
    assert.equal(found.ok, false);
  });

  it('skips the WSL bash stub on windows and falls back', () => {
    const find = (n) => (n === 'bash' ? 'C:\\Windows\\System32\\bash.exe' : n === 'pwsh' ? 'C:\\pwsh\\pwsh.exe' : null);
    const found = resolveShell({ platform: 'win32', find, exists: () => false });
    assert.equal(found.ok, true);
    assert.equal(found.name, 'pwsh');
  });

  it('reports a requested shell that is missing', () => {
    const found = resolveShell({ shell: 'pwsh', platform: 'linux', find: () => null, exists: () => false });
    assert.equal(found.ok, false);
    assert.match(found.reason, /not found/);
  });
});

describe('ciExecutor - guards', () => {
  it('refuses to run without confirmation', async () => {
    const dir = repoWith('ci.yml', GOOD);
    await assert.rejects(startCiRun(options(dir, 'ci.yml', { ack: false })), (e) => e.status === 400);
  });

  it('refuses an untrusted workflow', async () => {
    const dir = repoWith('ci.yml', GOOD);
    await assert.rejects(startCiRun(options(dir, 'ci.yml', { isTrusted: () => false })), (e) => e.status === 403);
  });

  it('refuses a stale plan hash', async () => {
    const dir = repoWith('ci.yml', GOOD);
    await assert.rejects(startCiRun(options(dir, 'ci.yml', { planHash: 'stale' })), (e) => e.status === 409);
  });

  it('refuses deployment workflows', async () => {
    const dir = repoWith('deploy.yml', ['name: Deploy', 'on: push', 'jobs:', '  d:', '    runs-on: ubuntu-latest', '    steps:', '      - run: npm publish']);
    await assert.rejects(startCiRun(options(dir, 'deploy.yml')), (e) => e.status === 400);
  });

  it('refuses jobs with unsupported actions', async () => {
    const dir = repoWith('ci.yml', ['name: X', 'on: push', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: some-org/some-action@v1']);
    await assert.rejects(startCiRun(options(dir, 'ci.yml')), (e) => e.status === 400);
  });

  it('refuses when preflight finds blockers', async () => {
    const dir = repoWith('ci.yml', GOOD);
    const extra = { deps: { preflight: async () => ({ blockers: ['Runtime missing'] }), gitSha: () => '', shell: { platform: 'linux', find: () => '/usr/bin/bash', exists: () => true } } };
    await assert.rejects(startCiRun(options(dir, 'ci.yml', extra)), (e) => e.status === 400);
  });

  it('refuses commands too long to review in full', async () => {
    const dir = repoWith('ci.yml', ['name: X', 'on: push', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo ' + 'x'.repeat(4100)]);
    await assert.rejects(startCiRun(options(dir, 'ci.yml')), (e) => e.status === 400);
  });
});

describe('ciExecutor - starting a run', () => {
  it('builds ordered steps with dependencies, scripts and masking', async () => {
    const dir = repoWith('ci.yml', GOOD);
    const opts = options(dir, 'ci.yml');
    ciEnv.setValues(opts.dataDir, dir, { TOKEN_X: 'sekret-value' });

    const result = await startCiRun(opts);
    assert.equal(result.job.id, 'job-1');

    const spec = opts.runner.specs[0];
    assert.equal(spec.kind, 'ci');
    assert.equal(spec.actionId, 'ci:ci.yml');
    assert.ok(spec.redactValues.includes('sekret-value'));
    assert.deepEqual(spec.steps.map((s) => s.id), ['build:1', 'build:2', 'test:0']);
    assert.deepEqual(spec.steps[0].dependsOn, []);
    assert.deepEqual(spec.steps[1].dependsOn, ['build:1']);
    assert.deepEqual(spec.steps[2].dependsOn, ['build:2']);

    const second = spec.steps[1];
    assert.equal(second.command.includes('sekret-value'), false);
    const script = fs.readFileSync(second.argv[second.argv.length - 1], 'utf8');
    assert.ok(script.includes('echo two sekret-value'));
    assert.equal(second.env.CI, 'true');
    assert.equal(second.env.GITHUB_SHA, 'abc123');
  });
});