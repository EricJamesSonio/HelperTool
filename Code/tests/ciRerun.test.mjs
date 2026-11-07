import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkTmp, rmRf } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { selectRerun, workflowFileOf, incompleteJobIds } = require('../services/ci/ciRerun.js');
const { parseWorkflowText } = require('../services/ci/ciWorkflows.js');
const { buildPlan } = require('../services/ci/ciPlan.js');

const made = [];

after(() => {
  for (const dir of made) rmRf(dir);
});

const TEXT = [
  'name: CI',
  'on: push',
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: echo build',
  '  test:',
  '    needs: build',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: echo test',
  '  lint:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: echo lint',
].join('\n');

function workflow() {
  return parseWorkflowText('ci.yml', TEXT + '\n');
}

function detail(steps, metaOverride, runOverride) {
  const wf = workflow();
  const meta =
    metaOverride === undefined
      ? { mode: 'full', selectedJobs: ['build', 'test', 'lint'], workflow: { file: 'ci.yml', hash: wf.hash } }
      : metaOverride;
  return {
    run: Object.assign({ id: 'r1', kind: 'ci', actionId: 'ci:ci.yml', status: 'failed', meta }, runOverride || {}),
    steps,
  };
}

function step(jobId, status) {
  return { jobId, status };
}

describe('ciRerun - helpers', () => {
  it('reads the workflow file from a CI run only', () => {
    assert.equal(workflowFileOf(detail([])), 'ci.yml');
    assert.equal(workflowFileOf(detail([], undefined, { kind: 'tests', actionId: 'tests:all' })), null);
    assert.equal(workflowFileOf(detail([], undefined, { actionId: 'seed:x' })), null);
    assert.equal(workflowFileOf(null), null);
  });

  it('lists jobs with any unfinished step', () => {
    const steps = [step('a', 'done'), step('a', 'failed'), step('b', 'done'), step('c', 'pending'), { status: 'failed' }];
    assert.deepEqual(incompleteJobIds(steps), ['a', 'c']);
  });
});

describe('ciRerun - failed jobs', () => {
  it('selects failed and blocked jobs in workflow order', () => {
    const d = detail([step('build', 'done'), step('test', 'failed'), step('lint', 'blocked')]);
    const result = selectRerun({ detail: d, workflow: workflow(), which: 'failed' });
    assert.equal(result.mode, 'selected');
    assert.deepEqual(result.jobIds, ['test', 'lint']);
    assert.deepEqual(result.failedJobIds, ['test', 'lint']);
    assert.equal(result.workflowChanged, false);
    assert.deepEqual(result.source, { id: 'r1', status: 'failed' });
  });

  it('includes jobs that were stopped, interrupted or never started', () => {
    const d = detail([step('build', 'stopped'), step('test', 'pending'), step('lint', 'interrupted')]);
    const result = selectRerun({ detail: d, workflow: workflow(), which: 'failed' });
    assert.deepEqual(result.jobIds, ['build', 'test', 'lint']);
  });

  it('refuses when every job finished', () => {
    const d = detail([step('build', 'done'), step('test', 'done'), step('lint', 'done')], undefined, { status: 'done' });
    assert.throws(() => selectRerun({ detail: d, workflow: workflow(), which: 'failed' }), (e) => e.status === 400);
  });

  it('refuses a job that no longer exists in the workflow', () => {
    const d = detail([step('gone', 'failed')]);
    assert.throws(
      () => selectRerun({ detail: d, workflow: workflow(), which: 'failed' }),
      (e) => e.status === 409 && /gone/.test(e.message)
    );
  });

  it('still works with a truncated stored plan but flags the workflow as changed', () => {
    const d = detail([step('test', 'failed')], { truncated: true });
    const result = selectRerun({ detail: d, workflow: workflow(), which: 'failed' });
    assert.deepEqual(result.jobIds, ['test']);
    assert.equal(result.workflowChanged, true);
  });

  it('flags a workflow that changed since the run', () => {
    const d = detail([step('test', 'failed')], { mode: 'full', selectedJobs: [], workflow: { file: 'ci.yml', hash: 'old' } });
    assert.equal(selectRerun({ detail: d, workflow: workflow(), which: 'failed' }).workflowChanged, true);
  });
});

describe('ciRerun - same jobs', () => {
  it('reruns a full plan as full', () => {
    const d = detail([step('test', 'failed')]);
    const result = selectRerun({ detail: d, workflow: workflow(), which: 'same' });
    assert.equal(result.mode, 'full');
    assert.deepEqual(result.jobIds, []);
  });

  it('reruns a selected plan with the stored jobs in workflow order', () => {
    const meta = { mode: 'selected', selectedJobs: ['test', 'build'], workflow: { file: 'ci.yml', hash: workflow().hash } };
    const result = selectRerun({ detail: detail([step('test', 'done')], meta), workflow: workflow(), which: 'same' });
    assert.equal(result.mode, 'selected');
    assert.deepEqual(result.jobIds, ['build', 'test']);
  });

  it('refuses when the stored plan is incomplete', () => {
    const truncated = detail([step('test', 'failed')], { truncated: true });
    assert.throws(() => selectRerun({ detail: truncated, workflow: workflow(), which: 'same' }), (e) => e.status === 409);

    const missing = detail([step('test', 'failed')], null);
    assert.throws(() => selectRerun({ detail: missing, workflow: workflow(), which: 'same' }), (e) => e.status === 409);

    const empty = detail([], { mode: 'selected', selectedJobs: [], workflow: { hash: 'x' } });
    assert.throws(() => selectRerun({ detail: empty, workflow: workflow(), which: 'same' }), (e) => e.status === 409);
  });
});

describe('ciRerun - bad input', () => {
  it('rejects an unknown rerun choice, a non CI run and a different workflow', () => {
    const d = detail([step('test', 'failed')]);
    assert.throws(() => selectRerun({ detail: d, workflow: workflow(), which: 'all' }), (e) => e.status === 400);

    const notCi = detail([], undefined, { kind: 'tests', actionId: 'tests:all' });
    assert.throws(() => selectRerun({ detail: notCi, workflow: workflow(), which: 'failed' }), (e) => e.status === 400);

    const other = parseWorkflowText('other.yml', TEXT + '\n');
    assert.throws(() => selectRerun({ detail: d, workflow: other, which: 'failed' }), (e) => e.status === 409);
  });

  it('rejects a workflow with a parse error', () => {
    const broken = parseWorkflowText('ci.yml', 'jobs: [unclosed\n');
    assert.ok(broken.parseError);
    assert.throws(() => selectRerun({ detail: detail([step('test', 'failed')]), workflow: broken, which: 'failed' }), (e) => e.status === 400);
  });
});

describe('ciRerun - plan integration', () => {
  it('builds a plan for the selection and pulls in dependencies', () => {
    const d = detail([step('build', 'done'), step('test', 'failed')]);
    const wf = workflow();
    const picked = selectRerun({ detail: d, workflow: wf, which: 'failed' });
    const dir = mkTmp();
    made.push(dir);
    const built = buildPlan({ repoPath: dir, workflow: wf, mode: picked.mode, jobIds: picked.jobIds, approvedSkips: [], trusted: true });
    assert.deepEqual(built.plan.selectedJobs, ['build', 'test']);
    assert.equal(typeof built.planHash, 'string');
  });
});