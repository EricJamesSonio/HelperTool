import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mkTmp, rmRf } from './helpers.mjs';

const require = createRequire(import.meta.url);
const ci = require('../services/ci/ciWorkflows.js');

const made = [];

after(() => {
  for (const dir of made) rmRf(dir);
});

function repoWith(files) {
  const dir = mkTmp();
  made.push(dir);
  for (const [name, text] of Object.entries(files)) {
    const full = path.join(dir, '.github', 'workflows', name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return dir;
}

function yml(lines) {
  return lines.join('\n') + '\n';
}

function parse(lines) {
  return ci.parseWorkflowText('test.yml', yml(lines));
}

const CI_YML = [
  'name: CI',
  'on:',
  '  push:',
  '    branches: [main]',
  '  pull_request:',
  'jobs:',
  '  backend:',
  '    runs-on: ubuntu-latest',
  '    defaults:',
  '      run:',
  '        working-directory: backend',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - uses: actions/setup-node@v4',
  '        with:',
  '          node-version: 20',
  '      - run: npm ci',
  '      - name: Test',
  '        run: npm test',
  '  frontend:',
  '    needs: backend',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: npm run build',
];

describe('ciWorkflows - discovery', () => {
  it('reports a missing workflows folder', () => {
    const dir = mkTmp();
    made.push(dir);
    const found = ci.discover(dir);
    assert.equal(found.dirExists, false);
    assert.deepEqual(found.workflows, []);
  });

  it('reports an empty workflows folder', () => {
    const dir = mkTmp();
    made.push(dir);
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    const found = ci.discover(dir);
    assert.equal(found.dirExists, true);
    assert.deepEqual(found.workflows, []);
  });

  it('finds .yml and .yaml files and ignores everything else', () => {
    const body = yml(['name: X', 'on: push', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo hi']);
    const dir = repoWith({ 'b.yml': body, 'a.yaml': body, 'notes.txt': 'x', 'c.yml.bak': body, 'README.md': '# x' });
    const found = ci.discover(dir);
    assert.deepEqual(
      found.workflows.map((w) => w.file),
      ['a.yaml', 'b.yml']
    );
  });

  it('reads one workflow by name and refuses bad names', () => {
    const dir = repoWith({ 'ci.yml': yml(CI_YML) });
    assert.equal(ci.getWorkflow(dir, 'ci.yml').name, 'CI');
    assert.equal(ci.getWorkflow(dir, 'missing.yml'), null);
    assert.equal(ci.getWorkflow(dir, '../ci.yml'), null);
    assert.equal(ci.isWorkflowFile('ci.yml'), true);
    assert.equal(ci.isWorkflowFile('sub/ci.yml'), false);
    assert.equal(ci.isWorkflowFile('..\\ci.yml'), false);
    assert.equal(ci.isWorkflowFile('ci.txt'), false);
    assert.equal(ci.isWorkflowFile(42), false);
  });
});

describe('ciWorkflows - parsing', () => {
  const w = parse(CI_YML);

  it('keeps the on key as a trigger list', () => {
    assert.equal(w.parseError, null);
    assert.deepEqual(w.triggers, ['push', 'pull_request']);
    assert.deepEqual(w.triggerFilters.push.branches, ['main']);
  });

  it('reads jobs, dependencies and working directories', () => {
    assert.deepEqual(
      w.jobs.map((j) => j.id),
      ['backend', 'frontend']
    );
    assert.equal(w.jobs[0].workingDirectory, 'backend');
    assert.deepEqual(w.jobs[1].needs, ['backend']);
    assert.equal(w.jobs[0].runsOn, 'ubuntu-latest');
  });

  it('tells commands from actions and records step lines', () => {
    const steps = w.jobs[0].steps;
    assert.deepEqual(
      steps.map((s) => s.kind),
      ['uses', 'uses', 'run', 'run']
    );
    assert.equal(steps[2].run, 'npm ci');
    assert.equal(steps[3].name, 'Test');
    assert.equal(steps[0].line, 13);
  });

  it('applies the policy for common actions', () => {
    const steps = w.jobs[0].steps;
    assert.equal(steps[0].support, 'satisfied');
    assert.equal(steps[1].support, 'validate');
    assert.deepEqual(steps[1].with, ['node-version']);
    assert.equal(steps[2].support, 'supported');
  });

  it('marks a simple workflow as fully supported and classifies it', () => {
    assert.equal(w.support, 'full');
    assert.equal(w.category, 'ci');
    assert.equal(w.deployBlocked, false);
    assert.equal(w.hash.length, 64);
  });

  it('reports invalid YAML with a position', () => {
    const bad = parse(['name: Broken', 'jobs:', '  a: [unclosed']);
    assert.ok(bad.parseError);
    assert.equal(typeof bad.parseError.message, 'string');
    assert.equal(bad.support, 'unsupported');
    assert.equal(bad.jobs.length, 0);
  });

  it('reports a workflow with no jobs', () => {
    const empty = parse(['name: Empty', 'on: push']);
    assert.equal(empty.support, 'unsupported');
    assert.ok(empty.problems.some((p) => /no jobs/i.test(p)));
  });

  it('reports missing needs and dependency cycles', () => {
    const missing = parse(['on: push', 'jobs:', '  a:', '    needs: ghost', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo a']);
    assert.ok(missing.problems.some((p) => /does not exist/.test(p)));
    const cycle = parse([
      'on: push',
      'jobs:',
      '  a:',
      '    needs: b',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo a',
      '  b:',
      '    needs: a',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo b',
    ]);
    assert.ok(cycle.problems.some((p) => /cycle/i.test(p)));
    assert.equal(cycle.support, 'partial');
  });
});

describe('ciWorkflows - unsupported features', () => {
  it('marks matrix jobs as unsupported and flags the expression', () => {
    const w = parse([
      'on: push',
      'jobs:',
      '  t:',
      '    runs-on: ubuntu-latest',
      '    strategy:',
      '      matrix:',
      '        node: [18, 20]',
      '    steps:',
      '      - run: echo ${{ matrix.node }}',
    ]);
    assert.equal(w.jobs[0].matrix, true);
    assert.equal(w.jobs[0].support, 'unsupported');
    assert.ok(w.features.includes('matrix'));
    assert.equal(w.jobs[0].steps[0].support, 'partial');
    assert.equal(w.support, 'unsupported');
  });

  it('resolves env and secrets expressions without complaint', () => {
    const w = parse(['on: push', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo ${{ secrets.TOKEN }} ${{ env.MODE }}']);
    assert.equal(w.jobs[0].steps[0].support, 'supported');
  });

  it('flags services, reusable workflows and third-party actions', () => {
    const w = parse([
      'on: push',
      'jobs:',
      '  db:',
      '    runs-on: ubuntu-latest',
      '    services:',
      '      postgres:',
      '        image: postgres:16',
      '    steps:',
      '      - uses: some-org/some-action@v1',
      '  call:',
      '    uses: ./.github/workflows/other.yml',
    ]);
    assert.equal(w.jobs[0].support, 'partial');
    assert.deepEqual(w.jobs[0].services, ['postgres']);
    assert.equal(w.jobs[0].steps[0].support, 'unsupported');
    assert.equal(w.jobs[1].support, 'unsupported');
    assert.ok(w.features.includes('services'));
    assert.ok(w.features.includes('reusable-workflow'));
    assert.ok(w.features.includes('third-party-action'));
  });

  it('keeps simple conditions and flags complex ones for review', () => {
    const w = parse([
      'on: push',
      'jobs:',
      '  a:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo one',
      '        if: always()',
      '      - run: echo two',
      "        if: github.ref == 'refs/heads/main'",
    ]);
    assert.equal(w.jobs[0].steps[0].review, false);
    assert.equal(w.jobs[0].steps[1].review, true);
    assert.equal(w.jobs[0].support, 'partial');
    assert.ok(w.features.includes('conditions'));
  });

  it('flags checkout of another repository', () => {
    const w = parse([
      'on: push',
      'jobs:',
      '  a:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '        with:',
      '          repository: other/repo',
    ]);
    assert.equal(w.jobs[0].steps[0].support, 'unsupported');
  });
});

describe('ciWorkflows - classification', () => {
  it('blocks release workflows triggered by tags that publish', () => {
    const w = parse([
      'name: Deploy',
      'on:',
      '  push:',
      "    tags: ['v*']",
      'jobs:',
      '  deploy:',
      '    runs-on: ubuntu-latest',
      '    environment: production',
      '    steps:',
      '      - run: npm publish',
    ]);
    assert.equal(w.category, 'release');
    assert.equal(w.deployBlocked, true);
    assert.ok(w.deployReasons.length >= 2);
  });

  it('blocks deployments detected from commands and actions', () => {
    const byCommand = parse(['on: push', 'jobs:', '  d:', '    runs-on: ubuntu-latest', '    steps:', '      - run: kubectl apply -f k8s/']);
    assert.equal(byCommand.category, 'deploy');
    assert.equal(byCommand.deployBlocked, true);
    const byAction = parse(['on: push', 'jobs:', '  d:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: aws-actions/configure-aws-credentials@v4']);
    assert.equal(byAction.deployBlocked, true);
  });

  it('classifies test-only, build-only and scheduled workflows', () => {
    const tests = parse(['on: push', 'jobs:', '  t:', '    runs-on: ubuntu-latest', '    steps:', '      - run: pytest']);
    assert.equal(tests.category, 'test');
    const build = parse(['on: push', 'jobs:', '  b:', '    runs-on: ubuntu-latest', '    steps:', '      - run: npm run build']);
    assert.equal(build.category, 'build');
    const cron = parse(['on:', '  schedule:', "    - cron: '0 3 * * 1'", 'jobs:', '  m:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo hello']);
    assert.equal(cron.category, 'maintenance');
    assert.equal(cron.deployBlocked, false);
  });

  it('summaries leave out the job details', () => {
    const summary = ci.summarize(parse(CI_YML));
    assert.equal(summary.jobCount, 2);
    assert.equal(summary.jobs, undefined);
    assert.equal(summary.file, 'test.yml');
  });
});