import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mkTmp, rmRf } from './helpers.mjs';

const require = createRequire(import.meta.url);

let sqliteOk = true;
try {
  require('node:sqlite');
} catch (err) {
  sqliteOk = false;
}

const db = require('../database/consoleDb.js');
const root = mkTmp();

after(() => {
  db.close();
  rmRf(root);
});

function fakeApp(dir) {
  return { getPath: () => dir };
}

function makeView(id, extra) {
  return Object.assign(
    {
      id,
      repoPath: '/repo',
      actionId: 'ci:test',
      title: 'CI run',
      kind: 'ci',
      startedAt: Date.now(),
      endedAt: null,
      status: 'running',
      exitCode: null,
      error: null,
      steps: [
        {
          idx: 0,
          id: 's0',
          title: 'Install',
          command: 'npm ci',
          status: 'done',
          exitCode: 0,
          startedAt: 1,
          endedAt: 2,
          progress: null,
          result: null,
          jobId: 'backend',
          jobTitle: 'Backend',
          reason: 'exit',
        },
        {
          idx: 1,
          id: 's1',
          title: 'Test',
          command: 'npm test',
          status: 'failed',
          exitCode: 1,
          startedAt: 2,
          endedAt: 3,
          progress: null,
          result: null,
          jobId: 'backend',
          jobTitle: 'Backend',
          reason: 'exit',
        },
      ],
    },
    extra || {}
  );
}

const V1_SCHEMA = `
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  action_id TEXT,
  title TEXT NOT NULL,
  kind TEXT,
  env TEXT,
  app_env TEXT,
  host TEXT,
  db_name TEXT,
  command TEXT,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_ms INTEGER,
  exit_code INTEGER,
  error TEXT,
  meta_json TEXT
);
CREATE TABLE run_steps (
  run_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  step_id TEXT,
  title TEXT,
  command TEXT,
  status TEXT,
  exit_code INTEGER,
  started_at INTEGER,
  ended_at INTEGER,
  progress_json TEXT,
  result_json TEXT,
  PRIMARY KEY (run_id, idx)
);
CREATE TABLE run_logs (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  step_index INTEGER,
  kind TEXT,
  text TEXT,
  PRIMARY KEY (run_id, seq)
);
`;

describe('consoleDb', { skip: !sqliteOk }, () => {
  it('creates a fresh database', () => {
    assert.equal(db.init(fakeApp(path.join(root, 'fresh'))), true);
    assert.equal(db.available(), true);
  });

  it('stores job fields, the snapshot and the steps of a run', () => {
    db.startRun(makeView('run1'), { actionId: 'ci:test', env: 'local', snapshot: { workflow: 'ci.yml', jobs: ['backend'] } });
    db.finishRun(makeView('run1', { status: 'failed', endedAt: Date.now(), exitCode: 1 }));
    const detail = db.getRun('run1');
    assert.equal(detail.run.status, 'failed');
    assert.equal(detail.run.meta.workflow, 'ci.yml');
    assert.equal(detail.steps.length, 2);
    assert.equal(detail.steps[0].jobId, 'backend');
    assert.equal(detail.steps[0].jobTitle, 'Backend');
    assert.equal(detail.steps[1].reason, 'exit');
  });

  it('stores and lists structured errors without leaking secrets', () => {
    db.insertErrors('run1', [
      {
        stepIdx: 1,
        fingerprint: 'f1',
        level: 'error',
        title: 'TS2322',
        message: 'Type error near password=hunter2',
        file: 'src/a.ts',
        line: 10,
        col: 5,
        count: 2,
        logSeq: 7,
      },
    ]);
    const errors = db.listErrors('run1');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].file, 'src/a.ts');
    assert.equal(errors[0].line, 10);
    assert.equal(errors[0].col, 5);
    assert.equal(errors[0].count, 2);
    assert.equal(errors[0].message.includes('hunter2'), false);
    assert.equal(db.getRun('run1').errors.length, 1);
  });

  it('caps the stored output of a single run', () => {
    db._setLogCap(5);
    try {
      db.startRun(makeView('run2'), { actionId: 'ci:test', env: 'local' });
      const entries = [];
      for (let i = 0; i < 8; i += 1) entries.push({ s: 0, k: 'out', t: 'line ' + i });
      db.appendLogs('run2', entries);
      db.finishRun(makeView('run2', { status: 'done', endedAt: Date.now(), exitCode: 0 }));
      const detail = db.getRun('run2');
      assert.equal(detail.logs.length, 6);
      assert.ok(detail.logs[5].t.includes('truncated'));
    } finally {
      db._setLogCap(200000);
    }
  });

  it('prunes the oldest runs of a repository', () => {
    for (const [id, startedAt] of [['p1', 1000], ['p2', 2000], ['p3', 3000]]) {
      const view = makeView(id, { repoPath: '/prune', startedAt });
      db.startRun(view, { actionId: 'ci:test', env: 'local' });
      db.finishRun(makeView(id, { repoPath: '/prune', startedAt, status: 'done', endedAt: startedAt + 10, exitCode: 0 }));
    }
    assert.equal(db.pruneRuns('/prune', 1), 2);
    const left = db.listRuns('/prune', {});
    assert.equal(left.total, 1);
    assert.equal(left.items[0].id, 'p3');
  });

  it('clears runs together with their errors', () => {
    assert.ok(db.countRuns('/repo') >= 2);
    db.clearRuns('/repo');
    assert.equal(db.getRun('run1'), null);
    assert.deepEqual(db.listErrors('run1'), []);
  });

  it('upgrades a version 1 database without losing runs', () => {
    db.close();
    const { DatabaseSync } = require('node:sqlite');
    const userData = path.join(root, 'old');
    const dir = path.join(userData, 'repo-console');
    require('node:fs').mkdirSync(dir, { recursive: true });
    const old = new DatabaseSync(path.join(dir, 'console.db'));
    old.exec(V1_SCHEMA);
    old
      .prepare('INSERT INTO runs (id, repo_path, title, status, started_at) VALUES (?, ?, ?, ?, ?)')
      .run('old1', '/old', 'Old run', 'done', 1000);
    old
      .prepare('INSERT INTO run_steps (run_id, idx, step_id, title, command, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run('old1', 0, 's0', 'Old step', 'npm run seed', 'done');
    old.exec('PRAGMA user_version = 1');
    old.close();

    assert.equal(db.init(fakeApp(userData)), true);
    const before = db.getRun('old1');
    assert.equal(before.run.title, 'Old run');
    assert.equal(before.steps[0].jobId, null);

    db.startRun(makeView('new1', { repoPath: '/old' }), { actionId: 'ci:test', env: 'local' });
    db.finishRun(makeView('new1', { repoPath: '/old', status: 'done', endedAt: Date.now(), exitCode: 0 }));
    assert.equal(db.getRun('new1').steps[0].jobId, 'backend');
  });
});