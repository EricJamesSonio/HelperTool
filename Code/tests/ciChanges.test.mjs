import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkTmp, rmRf } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { getChanges, parseStatus, parseNameStatus } = require('../services/ci/ciChanges.js');

const gitOk = spawnSync('git', ['--version']).status === 0;
const made = [];

after(() => {
  for (const dir of made) rmRf(dir);
});

function run(dir, ...args) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'tester',
      GIT_AUTHOR_EMAIL: 'tester@example.com',
      GIT_COMMITTER_NAME: 'tester',
      GIT_COMMITTER_EMAIL: 'tester@example.com',
    }),
  });
}

function write(dir, name, text) {
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

function newRepo(branch) {
  const dir = mkTmp();
  made.push(dir);
  run(dir, 'init');
  run(dir, 'symbolic-ref', 'HEAD', 'refs/heads/' + branch);
  return dir;
}

function byFile(changes) {
  return Object.fromEntries(changes.files.map((f) => [f.file, f]));
}

describe('ciChanges - parsers', () => {
  it('reads porcelain status entries, renames and conflicts', () => {
    const text = '?? new.txt\0 M a.txt\0R  b.txt\0old.txt\0UU c.txt\0A  d.txt\0';
    assert.deepEqual(parseStatus(text), [
      { file: 'new.txt', status: '?' },
      { file: 'a.txt', status: 'M' },
      { file: 'b.txt', status: 'R' },
      { file: 'c.txt', status: 'U' },
      { file: 'd.txt', status: 'A' },
    ]);
  });

  it('reads name-status entries', () => {
    assert.deepEqual(parseNameStatus('M\0a.txt\0A\0b.txt\0D\0c.txt\0'), [
      { file: 'a.txt', status: 'M' },
      { file: 'b.txt', status: 'A' },
      { file: 'c.txt', status: 'D' },
    ]);
  });
});

describe('ciChanges - getChanges', { skip: !gitOk }, () => {
  it('separates committed and working tree changes against a base', async () => {
    const dir = newRepo('main');
    write(dir, 'a.txt', 'a\n');
    write(dir, 'b.txt', 'b\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '-m', 'init');
    run(dir, 'checkout', '-b', 'feature');
    write(dir, 'a.txt', 'a2\n');
    write(dir, 'c.txt', 'c\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '-m', 'work');
    write(dir, 'b.txt', 'b2\n');
    write(dir, 'd.txt', 'd\n');

    const changes = await getChanges({ repoPath: dir, base: 'main' });
    const files = byFile(changes);

    assert.equal(changes.branch, 'feature');
    assert.equal(changes.base.ref, 'main');
    assert.equal(changes.committed, 2);
    assert.equal(changes.working, 2);
    assert.equal(changes.total, 4);
    assert.equal(files['a.txt'].status, 'M');
    assert.deepEqual(files['a.txt'].sources, ['committed']);
    assert.equal(files['c.txt'].status, 'A');
    assert.deepEqual(files['c.txt'].sources, ['committed']);
    assert.equal(files['b.txt'].status, 'M');
    assert.deepEqual(files['b.txt'].sources, ['working']);
    assert.equal(files['d.txt'].status, '?');
    assert.deepEqual(files['d.txt'].sources, ['working']);
  });

  it('finds main on its own and reports no committed changes on the base branch', async () => {
    const dir = newRepo('main');
    write(dir, 'a.txt', 'a\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '-m', 'init');
    write(dir, 'a.txt', 'a2\n');

    const changes = await getChanges({ repoPath: dir });
    assert.equal(changes.base.ref, 'main');
    assert.equal(changes.committed, 0);
    assert.equal(changes.working, 1);
    assert.equal(changes.files[0].file, 'a.txt');
  });

  it('shows only working tree changes when no base branch exists', async () => {
    const dir = newRepo('dev');
    write(dir, 'x.txt', 'x\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '-m', 'init');
    write(dir, 'x.txt', 'x2\n');

    const changes = await getChanges({ repoPath: dir });
    assert.equal(changes.base, null);
    assert.match(changes.note, /No base branch/);
    assert.equal(changes.total, 1);
    assert.equal(changes.files[0].status, 'M');
  });

  it('handles a repository without commits', async () => {
    const dir = newRepo('main');
    write(dir, 'f.txt', 'f\n');

    const changes = await getChanges({ repoPath: dir });
    assert.equal(changes.head, null);
    assert.equal(changes.base, null);
    assert.equal(changes.files[0].file, 'f.txt');
    assert.equal(changes.files[0].status, '?');
  });

  it('rejects bad input', async () => {
    const dir = newRepo('main');
    write(dir, 'a.txt', 'a\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '-m', 'init');

    await assert.rejects(getChanges({ repoPath: dir, base: '--output=x' }), (e) => e.status === 400);
    await assert.rejects(getChanges({ repoPath: dir, base: 'a..b' }), (e) => e.status === 400);
    await assert.rejects(getChanges({ repoPath: dir, base: 'nope' }), (e) => e.status === 400);
    await assert.rejects(getChanges({ repoPath: dir, base: 42 }), (e) => e.status === 400);

    const plain = mkTmp();
    made.push(plain);
    await assert.rejects(getChanges({ repoPath: plain }), (e) => e.status === 400);
  });
});