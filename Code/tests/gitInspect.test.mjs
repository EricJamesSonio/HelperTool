import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkTmp, rmRf } from './helpers.mjs';

const require = createRequire(import.meta.url);
const inspect = require('../ipc/gitInspect_ipc.js');

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
      GIT_MERGE_AUTOEDIT: 'no',
    }),
  });
}

function write(dir, name, content) {
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function newRepo(branch) {
  const dir = mkTmp();
  made.push(dir);
  run(dir, 'init');
  run(dir, 'symbolic-ref', 'HEAD', 'refs/heads/' + branch);
  return dir;
}

function commit(dir, message) {
  run(dir, 'add', '-A');
  run(dir, 'commit', '-m', message);
  return run(dir, 'rev-parse', 'HEAD').trim();
}

function history() {
  const dir = newRepo('main');
  write(dir, 'a.txt', 'one\n');
  write(dir, 'b.txt', 'b\n');
  const c1 = commit(dir, 'first');
  write(dir, 'a.txt', 'two\n');
  fs.rmSync(path.join(dir, 'b.txt'));
  write(dir, 'c.txt', 'c\n');
  const c2 = commit(dir, 'second');
  write(dir, 'd.bin', Buffer.from([0, 1, 2, 3, 0, 4]));
  const c3 = commit(dir, 'third');
  return { dir, c1, c2, c3 };
}

describe('gitInspect - parsers', () => {
  it('reads name-status entries', () => {
    assert.deepEqual(inspect.parseNameStatus('M\0a.txt\0A\0b.txt\0D\0c.txt\0'), [
      { file: 'a.txt', status: 'M' },
      { file: 'b.txt', status: 'A' },
      { file: 'c.txt', status: 'D' },
    ]);
  });

  it('reads numstat entries including binary files', () => {
    assert.deepEqual(inspect.parseNumstat('1\t2\ta.txt\0-\t-\tbin.png\0'), [
      { file: 'a.txt', additions: 1, deletions: 2, binary: false },
      { file: 'bin.png', additions: 0, deletions: 0, binary: true },
    ]);
  });
});

describe('gitInspect - branches', { skip: !gitOk }, () => {
  it('reports the current branch and lists local branches', async () => {
    const dir = newRepo('main');
    write(dir, 'a.txt', 'a\n');
    commit(dir, 'init');
    run(dir, 'checkout', '-b', 'feature');

    const r = await inspect.listBranches(dir);
    assert.equal(r.current, 'feature');
    assert.equal(r.detached, false);
    assert.deepEqual(r.local, ['feature', 'main']);
    assert.deepEqual(r.remote, []);
  });

  it('flags a detached HEAD', async () => {
    const dir = newRepo('main');
    write(dir, 'a.txt', 'a\n');
    commit(dir, 'init');
    run(dir, 'checkout', '--detach');

    const r = await inspect.listBranches(dir);
    assert.equal(r.detached, true);
    assert.equal(r.current, '');
  });

  it('includes the unborn branch of an empty repository', async () => {
    const dir = newRepo('main');
    const r = await inspect.listBranches(dir);
    assert.equal(r.current, 'main');
    assert.deepEqual(r.local, ['main']);
  });
});

describe('gitInspect - commits', { skip: !gitOk }, () => {
  it('lists commits newest first and pages them', async () => {
    const h = history();
    const all = await inspect.listCommits(h.dir, 'main', 1, 10);
    assert.deepEqual(all.commits.map((c) => c.message), ['third', 'second', 'first']);
    assert.equal(all.commits[0].hash, h.c3);
    assert.equal(all.commits[0].shortHash.length, 7);
    assert.equal(all.commits[2].parents.length, 0);
    assert.equal(all.total, 3);

    const first = await inspect.listCommits(h.dir, 'main', 1, 2);
    assert.deepEqual(first.commits.map((c) => c.message), ['third', 'second']);
    assert.equal(first.totalPages, 2);

    const second = await inspect.listCommits(h.dir, 'main', 2, 2);
    assert.deepEqual(second.commits.map((c) => c.message), ['first']);
  });

  it('returns an empty list for a branch without commits', async () => {
    const dir = newRepo('main');
    const r = await inspect.listCommits(dir, 'main', 1, 10);
    assert.deepEqual(r.commits, []);
    assert.equal(r.total, 0);
    assert.equal(r.empty, true);
  });

  it('rejects unsafe branch names', async () => {
    const h = history();
    await assert.rejects(inspect.listCommits(h.dir, '--output=x', 1, 10));
    await assert.rejects(inspect.listCommits(h.dir, 'a..b', 1, 10));
    await assert.rejects(inspect.listCommits(h.dir, 42, 1, 10));
  });

  it('marks merge commits', async () => {
    const dir = newRepo('main');
    write(dir, 'a.txt', 'a\n');
    commit(dir, 'init');
    run(dir, 'checkout', '-b', 'feat');
    write(dir, 'f.txt', 'f\n');
    commit(dir, 'feat work');
    run(dir, 'checkout', 'main');
    write(dir, 'm.txt', 'm\n');
    commit(dir, 'main work');
    run(dir, 'merge', '--no-ff', 'feat', '-m', 'merge feat');
    const mergeHash = run(dir, 'rev-parse', 'HEAD').trim();

    const list = await inspect.listCommits(dir, 'main', 1, 10);
    assert.equal(list.commits[0].isMerge, true);

    const files = await inspect.listFiles(dir, mergeHash);
    assert.equal(files.isMerge, true);
    assert.deepEqual(files.files.map((f) => f.file), ['f.txt']);
  });
});

describe('gitInspect - files and content', { skip: !gitOk }, () => {
  it('lists the files a commit changed with their statuses', async () => {
    const h = history();

    const second = await inspect.listFiles(h.dir, h.c2.slice(0, 10));
    assert.equal(second.hash, h.c2);
    assert.equal(second.parent, h.c1);
    const byFile = Object.fromEntries(second.files.map((f) => [f.file, f]));
    assert.equal(byFile['a.txt'].status, 'M');
    assert.equal(byFile['a.txt'].additions, 1);
    assert.equal(byFile['a.txt'].deletions, 1);
    assert.equal(byFile['b.txt'].status, 'D');
    assert.equal(byFile['b.txt'].deletions, 1);
    assert.equal(byFile['c.txt'].status, 'A');
    assert.equal(byFile['c.txt'].additions, 1);

    const first = await inspect.listFiles(h.dir, h.c1);
    assert.equal(first.parent, null);
    assert.deepEqual(first.files.map((f) => [f.file, f.status]), [
      ['a.txt', 'A'],
      ['b.txt', 'A'],
    ]);

    const third = await inspect.listFiles(h.dir, h.c3);
    assert.equal(third.files[0].file, 'd.bin');
    assert.equal(third.files[0].binary, true);
  });

  it('reads a file as it was at a commit', async () => {
    const h = history();
    assert.equal((await inspect.readFileAt(h.dir, h.c2, 'a.txt')).content, 'two\n');
    assert.equal((await inspect.readFileAt(h.dir, h.c1, 'a.txt')).content, 'one\n');
    assert.equal((await inspect.readFileAt(h.dir, h.c1, 'b.txt')).content, 'b\n');
  });

  it('reports files that do not exist at a commit and binary files', async () => {
    const h = history();
    await assert.rejects(inspect.readFileAt(h.dir, h.c2, 'b.txt'), (e) => e.missing === true);
    const bin = await inspect.readFileAt(h.dir, h.c3, 'd.bin');
    assert.equal(bin.binary, true);
  });

  it('rejects unsafe paths and commit ids', async () => {
    const h = history();
    await assert.rejects(inspect.readFileAt(h.dir, h.c2, '../x'));
    await assert.rejects(inspect.readFileAt(h.dir, h.c2, '/etc/passwd'));
    await assert.rejects(inspect.readFileAt(h.dir, 'nothex!', 'a.txt'));
    await assert.rejects(inspect.listFiles(h.dir, '--all'));
  });

  it('returns the diff of one file against the first parent', async () => {
    const h = history();
    const changed = await inspect.readDiff(h.dir, h.c2, 'a.txt');
    assert.match(changed.diff, /-one/);
    assert.match(changed.diff, /\+two/);

    const root = await inspect.readDiff(h.dir, h.c1, 'a.txt');
    assert.match(root.diff, /\+one/);
  });
});