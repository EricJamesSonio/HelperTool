import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
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

function view(id, startedAt, kind, stepStatus) {
  return {
    id,
    repoPath: '/r',
    actionId: 'ci:ci.yml',
    title: 'CI run',
    kind,
    startedAt,
    endedAt: null,
    status: 'running',
    exitCode: null,
    error: null,
    steps: [
      { idx: 0, id: 's0', title: 'Install', command: 'npm ci', status: 'done', exitCode: 0, startedAt: 1, endedAt: 2 },
      { idx: 1, id: 's1', title: 'Test', command: 'npm test', status: stepStatus, exitCode: stepStatus === 'done' ? 0 : 1, startedAt: 2, endedAt: 3 },
    ],
  };
}

function finish(id, startedAt, kind, stepStatus) {
  db.finishRun(Object.assign(view(id, startedAt, kind, stepStatus), { status: stepStatus === 'done' ? 'done' : 'failed', endedAt: startedAt + 100, exitCode: stepStatus === 'done' ? 0 : 1 }));
}

function err(fingerprint, title) {
  return { stepIdx: 1, fingerprint, level: 'error', title, message: 'message ' + title, file: 'src/a.ts', line: 1, col: 1, count: 1 };
}

describe('consoleDb - comparing CI runs', { skip: !sqliteOk }, () => {
  it('prepares the database', () => {
    assert.equal(db.init(fakeApp(root)), true);
  });

  it('reports no previous run for the first CI run', () => {
    db.startRun(view('a', 1000, 'ci', 'failed'), { actionId: 'ci:ci.yml', env: 'local' });
    db.insertErrors('a', [err('fa', 'TS1'), err('fb', 'TS2')]);
    finish('a', 1000, 'ci', 'failed');
    const detail = db.getRun('a');
    assert.deepEqual(detail.compare, { previous: null });
  });

  it('separates new, fixed and persisting errors and step changes', () => {
    db.startRun(view('b', 2000, 'ci', 'done'), { actionId: 'ci:ci.yml', env: 'local' });
    db.insertErrors('b', [err('fb', 'TS2'), err('fc', 'TS3')]);
    finish('b', 2000, 'ci', 'done');

    const compare = db.getRun('b').compare;
    assert.equal(compare.previous.id, 'a');
    assert.deepEqual(compare.newErrors.map((e) => e.title), ['TS3']);
    assert.deepEqual(compare.fixedErrors.map((e) => e.title), ['TS1']);
    assert.equal(compare.persisting, 1);
    assert.equal(compare.stepChanges.length, 1);
    assert.equal(compare.stepChanges[0].id, 's1');
    assert.equal(compare.stepChanges[0].from, 'failed');
    assert.equal(compare.stepChanges[0].to, 'done');
  });

  it('does not compare runs that are not CI runs', () => {
    db.startRun(view('c', 3000, 'action', 'done'), { actionId: 'ci:ci.yml', env: 'local' });
    finish('c', 3000, 'action', 'done');
    assert.equal(db.getRun('c').compare, null);
  });
});