import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkTmp, rmRf } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { createRunner } = require('../services/consoleRunner.js');

const cwdRoot = mkTmp();
after(() => rmRf(cwdRoot));

const NODE = process.execPath;

function setup() {
  const events = [];
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  const runner = createRunner((repoPath, event, data) => {
    events.push({ event, data });
    if (event === 'finished') finish(data);
  });
  const lines = () => events.filter((e) => e.event === 'log').flatMap((e) => e.data);
  return { runner, events, done, lines };
}

function nodeStep(id, script, extra) {
  return Object.assign(
    { id, title: id, command: 'node ' + id, argv: [NODE, '-e', script], cwd: cwdRoot, env: {}, interactive: false },
    extra || {}
  );
}

function jobSpec(steps, extra) {
  return Object.assign({ title: 'test job', kind: 'action', steps }, extra || {});
}

async function waitFor(check, ms) {
  const end = Date.now() + (ms || 8000);
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for the condition');
}

describe('consoleRunner - basic execution', () => {
  it('runs a step and reports success', async () => {
    const t = setup();
    t.runner.startJob('repo-ok', jobSpec([nodeStep('a', "console.log('hello')")]));
    const job = await t.done;
    assert.equal(job.status, 'done');
    assert.equal(job.exitCode, 0);
    assert.equal(job.steps[0].status, 'done');
    assert.equal(job.steps[0].reason, 'exit');
    assert.ok(t.lines().some((l) => l.k === 'out' && l.t === 'hello'));
  });

  it('reports a non-zero exit as failed', async () => {
    const t = setup();
    t.runner.startJob('repo-fail', jobSpec([nodeStep('a', 'process.exit(3)')]));
    const job = await t.done;
    assert.equal(job.status, 'failed');
    assert.equal(job.exitCode, 3);
    assert.equal(job.steps[0].status, 'failed');
  });

  it('keeps stdout and stderr apart', async () => {
    const t = setup();
    t.runner.startJob('repo-streams', jobSpec([nodeStep('a', "console.log('to-out'); console.error('to-err')")]));
    await t.done;
    assert.ok(t.lines().some((l) => l.k === 'out' && l.t === 'to-out'));
    assert.ok(t.lines().some((l) => l.k === 'err' && l.t === 'to-err'));
  });

  it('runs a plain command string through the shell', async () => {
    const t = setup();
    const step = { id: 'sh', title: 'sh', command: 'node -e "console.log(42)"', cwd: cwdRoot, env: {}, interactive: false };
    t.runner.startJob('repo-shell', jobSpec([step]));
    const job = await t.done;
    assert.equal(job.status, 'done');
    assert.ok(t.lines().some((l) => l.t === '42'));
  });

  it('refuses a second job while one is running', async () => {
    const t = setup();
    t.runner.startJob('repo-dup', jobSpec([nodeStep('a', "console.log('ready'); setInterval(() => {}, 1000)")]));
    await waitFor(() => t.lines().some((l) => l.t === 'ready'));
    assert.throws(() => t.runner.startJob('repo-dup', jobSpec([nodeStep('b', 'process.exit(0)')])), (err) => err.status === 409);
    assert.equal(t.runner.stopJob('repo-dup'), true);
    await t.done;
  });
});

describe('consoleRunner - step sequencing', () => {
  it('keeps running later steps after a failure by default', async () => {
    const t = setup();
    t.runner.startJob('repo-default', jobSpec([nodeStep('a', 'process.exit(1)'), nodeStep('b', "console.log('b')")]));
    const job = await t.done;
    assert.equal(job.status, 'failed');
    assert.equal(job.steps[0].status, 'failed');
    assert.equal(job.steps[1].status, 'done');
  });

  it('skips the rest after a failure when stopOnFail is set', async () => {
    const t = setup();
    t.runner.startJob(
      'repo-halt',
      jobSpec([nodeStep('a', 'process.exit(1)', { stopOnFail: true }), nodeStep('b', "console.log('b')")])
    );
    const job = await t.done;
    assert.equal(job.status, 'failed');
    assert.equal(job.steps[1].status, 'skipped');
    assert.equal(job.steps[1].reason, 'earlier-failure');
  });

  it('blocks a step whose dependency failed and still runs unrelated steps', async () => {
    const t = setup();
    t.runner.startJob(
      'repo-blocked',
      jobSpec([
        nodeStep('a', 'process.exit(1)'),
        nodeStep('b', "console.log('b')", { dependsOn: ['a'] }),
        nodeStep('c', "console.log('c')"),
      ])
    );
    const job = await t.done;
    assert.equal(job.status, 'failed');
    assert.deepEqual(
      job.steps.map((s) => s.status),
      ['failed', 'blocked', 'done']
    );
    assert.equal(job.steps[1].reason, 'dependency');
  });

  it('runs a step whose dependency passed', async () => {
    const t = setup();
    t.runner.startJob(
      'repo-deps-ok',
      jobSpec([nodeStep('a', "console.log('a')"), nodeStep('b', "console.log('b')", { dependsOn: ['a'] })])
    );
    const job = await t.done;
    assert.equal(job.status, 'done');
    assert.deepEqual(
      job.steps.map((s) => s.status),
      ['done', 'done']
    );
  });
});

describe('consoleRunner - timeout, stop and input', () => {
  it('ends a step that exceeds its timeout', { timeout: 20000 }, async () => {
    const t = setup();
    t.runner.startJob('repo-timeout', jobSpec([nodeStep('a', 'setInterval(() => {}, 1000)', { timeoutMs: 500 })]));
    const job = await t.done;
    assert.equal(job.status, 'failed');
    assert.equal(job.steps[0].status, 'failed');
    assert.equal(job.steps[0].reason, 'timeout');
  });

  it('stops a running job', { timeout: 20000 }, async () => {
    const t = setup();
    t.runner.startJob('repo-stop', jobSpec([nodeStep('a', "console.log('ready'); setInterval(() => {}, 1000)"), nodeStep('b', "console.log('never')")]));
    await waitFor(() => t.lines().some((l) => l.t === 'ready'));
    assert.equal(t.runner.stopJob('repo-stop'), true);
    const job = await t.done;
    assert.equal(job.status, 'stopped');
    assert.equal(job.steps[0].status, 'stopped');
    assert.equal(job.steps[1].status, 'skipped');
    assert.equal(t.lines().some((l) => l.t === 'never'), false);
  });

  it('passes typed answers to an interactive step', { timeout: 20000 }, async () => {
    const t = setup();
    const script = "process.stdout.write('Name: '); process.stdin.once('data', (d) => { console.log('got ' + d.toString().trim()); process.exit(0); })";
    t.runner.startJob('repo-input', jobSpec([nodeStep('a', script, { interactive: true })]));
    await waitFor(() => {
      const job = t.runner.getJob('repo-input', false);
      return !!(job && job.awaiting);
    });
    assert.equal(t.runner.sendInput('repo-input', 'bob'), true);
    const job = await t.done;
    assert.equal(job.status, 'done');
    assert.ok(t.lines().some((l) => l.t === 'got bob'));
    assert.ok(t.lines().some((l) => l.k === 'in' && l.t === 'bob'));
  });
});

describe('consoleRunner - hooks and masking', () => {
  it('masks values listed in redactValues', async () => {
    const t = setup();
    t.runner.startJob(
      'repo-mask',
      jobSpec([nodeStep('a', "console.log('the value is super-secret-value')")], { redactValues: ['super-secret-value'] })
    );
    await t.done;
    const all = t.lines();
    assert.ok(all.length > 0);
    assert.equal(all.some((l) => l.t.includes('super-secret-value')), false);
    assert.ok(all.some((l) => l.t.includes('the value is ***')));
  });

  it('calls onEnd with the step view and its output lines', async () => {
    const t = setup();
    const seen = [];
    const step = nodeStep('a', "console.log('hook-line')", {
      jobId: 'backend',
      jobTitle: 'Backend',
      onEnd: (view, lines) => seen.push({ view, lines }),
    });
    t.runner.startJob('repo-hook', jobSpec([step]));
    const job = await t.done;
    assert.equal(seen.length, 1);
    assert.equal(seen[0].view.jobId, 'backend');
    assert.equal(seen[0].view.status, 'done');
    assert.ok(seen[0].lines.some((l) => l.t === 'hook-line'));
    assert.equal(job.steps[0].jobTitle, 'Backend');
  });

  it('reports whether anything is running', { timeout: 20000 }, async () => {
    const t = setup();
    assert.equal(t.runner.anyRunning(), false);
    t.runner.startJob('repo-any', jobSpec([nodeStep('a', "console.log('ready'); setInterval(() => {}, 1000)")]));
    await waitFor(() => t.lines().some((l) => l.t === 'ready'));
    assert.equal(t.runner.anyRunning(), true);
    t.runner.stopAll();
    await t.done;
    assert.equal(t.runner.anyRunning(), false);
  });
});