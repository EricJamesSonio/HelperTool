import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mkTmp, rmRf } from './helpers.mjs';

const require = createRequire(import.meta.url);
const ci = require('../services/ci/ciWorkflows.js');
const { buildPlan } = require('../services/ci/ciPlan.js');
const { preflight } = require('../services/ci/ciPreflight.js');

const made = [];

after(() => {
  for (const dir of made) rmRf(dir);
});

function tmp() {
  const dir = mkTmp();
  made.push(dir);
  return dir;
}

const CI_TEXT = [
  'name: CI',
  'on:',
  '  push:',
  '    branches: [main, development]',
  '  pull_request:',
  '    branches: [main, development]',
  'jobs:',
  '  changes:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - uses: dorny/paths-filter@v3',
  '        with:',
  '          filters: |',
  '            backend: backend/**',
  '  backend:',
  '    needs: changes',
  "    if: needs.changes.outputs.backend == 'true'",
  '    runs-on: ubuntu-latest',
  '    services:',
  '      postgres:',
  '        image: postgres:16',
  '    defaults:',
  '      run:',
  '        working-directory: backend',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - uses: actions/setup-node@v4',
  '        with:',
  '          node-version: 20',
  '      - run: npm ci',
  '      - run: npm test -- --ci',
].join('\n') + '\n';

describe('local-only CI - support labels', () => {
  const workflow = ci.parseWorkflowText('ci.yml', CI_TEXT);

  it('treats GitHub-only actions, services and job conditions as notes', () => {
    assert.equal(workflow.support, 'full');
    assert.equal(workflow.jobs[0].steps[1].support, 'skipped');
    assert.equal(workflow.jobs[0].steps[1].remoteOnly, true);
    assert.equal(workflow.jobs[0].commandCount, 0);
    assert.equal(workflow.jobs[1].support, 'full');
    assert.equal(workflow.jobs[1].commandCount, 2);
    assert.equal(workflow.jobs[1].review, true);
  });
});

describe('local-only CI - plan', () => {
  it('runs only the commands and skips the GitHub-only action', () => {
    const dir = tmp();
    const workflow = ci.parseWorkflowText('ci.yml', CI_TEXT);
    const { plan } = buildPlan({ repoPath: dir, workflow, trusted: true });
    assert.deepEqual(plan.blockers, []);
    assert.ok(plan.jobs.every((job) => job.state === 'ready'));
    assert.equal(plan.summary.runSteps, 2);
    assert.equal(plan.summary.skippedSteps, 1);
  });

  it('skips steps with GitHub conditions, failure hooks and unresolved expressions', () => {
    const dir = tmp();
    const text = [
      'on: push',
      'jobs:',
      '  a:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo a',
      '      - run: echo b',
      "        if: github.ref == 'refs/heads/main'",
      '      - run: echo c',
      '        if: failure()',
      '      - run: echo ${{ needs.x.outputs.y }}',
    ].join('\n') + '\n';
    const workflow = ci.parseWorkflowText('a.yml', text);
    const { plan } = buildPlan({ repoPath: dir, workflow, trusted: true });
    assert.deepEqual(
      plan.jobs[0].steps.map((step) => step.kind),
      ['run', 'skipped', 'skipped', 'skipped']
    );
    assert.equal(plan.jobs[0].state, 'ready');
    assert.equal(plan.summary.runSteps, 1);
  });

  it('still blocks matrix jobs', () => {
    const dir = tmp();
    const text = [
      'on: push',
      'jobs:',
      '  t:',
      '    runs-on: ubuntu-latest',
      '    strategy:',
      '      matrix:',
      '        node: [18, 20]',
      '    steps:',
      '      - run: echo hi',
    ].join('\n') + '\n';
    const workflow = ci.parseWorkflowText('m.yml', text);
    const { plan } = buildPlan({ repoPath: dir, workflow, trusted: true });
    assert.equal(plan.jobs[0].state, 'unsupported');
  });
});

describe('local-only CI - preflight', () => {
  it('only warns when a service container is not running', async () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'backend'));
    const workflow = ci.parseWorkflowText('ci.yml', CI_TEXT);
    const { plan } = buildPlan({ repoPath: dir, workflow, trusted: true });
    const result = await preflight({
      repoPath: dir,
      workflow,
      plan,
      runtimeProbe: async () => ({ available: true, version: 'v20' }),
      portProbe: async () => false,
    });
    assert.deepEqual(result.blockers, []);
    assert.ok(result.warnings.some((warning) => /postgres/.test(warning)));
  });
});