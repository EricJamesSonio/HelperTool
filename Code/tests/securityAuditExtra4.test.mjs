import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTests, _internals } = require('../services/security/auditExtra4.js');
const { parseAuditOutput, pickManager, createHistoryParser } = _internals;

const FAKE_AWS = 'AKIA' + 'IOSFODNN7EXAMPLE';

const helpers = {
  finding: (d) => Object.assign({ severity: 'medium', confidence: 'confirmed' }, d),
  outcome: (findings) => {
    if (!findings.length) return { status: 'pass', findings: [] };
    const allReview = findings.every((f) => f.confidence === 'review');
    return { status: allReview ? 'review' : 'fail', findings };
  },
  skip: (reason) => ({ status: 'skip', reason, findings: [] }),
  na: (reason) => ({ status: 'na', reason, findings: [] }),
  git: (repoPath, args) => {
    const r = spawnSync('git', args, { cwd: repoPath, encoding: 'utf8' });
    return r.status === 0 ? r.stdout : null;
  },
  trackedFiles: (repoPath) => {
    const r = spawnSync('git', ['ls-files', '-z'], { cwd: repoPath, encoding: 'utf8' });
    return r.status === 0 ? new Set(r.stdout.split('\0').filter(Boolean)) : null;
  },
  killTree: (child) => child.kill(),
  npmEnv: () => Object.assign({}, process.env),
  classifyNpmFailure: (raw) => ({ code: 'tooling', message: String(raw || '') }),
  sensitiveRe: /(?:^|\/)(?:\.env(?:\.(?!example$)[^/]+)?|credentials\.json|[^/]+\.pem)$/i,
  testPathRe: /(?:^|\/)(?:tests?|__tests__|fixtures|spec|e2e|mocks?)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i,
  skipFileRe: /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|bundle|\.min\.|\.map$/i,
};

const tests = createTests(helpers);

function byId(id) {
  const found = tests.find((t) => t.id === id);
  assert.ok(found, 'missing test ' + id);
  return found;
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('parseAuditOutput', () => {
  it('reads a pnpm or npm style summary', () => {
    const text = JSON.stringify({
      advisories: { 1: { module_name: 'lodash', severity: 'high' } },
      metadata: { vulnerabilities: { info: 0, low: 1, moderate: 2, high: 3, critical: 4 } },
    });
    const out = parseAuditOutput(text);
    assert.equal(out.counts.critical, 4);
    assert.equal(out.counts.moderate, 2);
    assert.deepEqual(out.names.high, ['lodash']);
  });

  it('reads yarn classic line-by-line output', () => {
    const lines = [
      JSON.stringify({ type: 'auditAdvisory', data: { advisory: { module_name: 'minimist', severity: 'critical' } } }),
      JSON.stringify({ type: 'auditSummary', data: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 1 } } }),
    ].join('\n');
    const out = parseAuditOutput(lines);
    assert.equal(out.counts.critical, 1);
    assert.deepEqual(out.names.critical, ['minimist']);
  });

  it('reads yarn berry advisory lines', () => {
    const lines = [
      JSON.stringify({ value: 'semver', children: { ID: 1, Severity: 'high' } }),
      JSON.stringify({ value: 'ws', children: { ID: 2, Severity: 'moderate' } }),
    ].join('\n');
    const out = parseAuditOutput(lines);
    assert.equal(out.counts.high, 1);
    assert.equal(out.counts.moderate, 1);
    assert.deepEqual(out.names.moderate, ['ws']);
  });

  it('returns an error for an error report', () => {
    const out = parseAuditOutput(JSON.stringify({ error: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE', message: 'The audit endpoint failed' } }));
    assert.match(out.error, /audit endpoint/);
  });

  it('returns null for unreadable text', () => {
    assert.equal(parseAuditOutput('not json at all'), null);
    assert.equal(parseAuditOutput(''), null);
  });
});

describe('pickManager', () => {
  it('detects pnpm, yarn classic and yarn berry', () => {
    const pnpmDir = tmpDir('hsx-pnpm-');
    fs.writeFileSync(path.join(pnpmDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9');
    assert.equal(pickManager(pnpmDir), 'pnpm');

    const classicDir = tmpDir('hsx-yarn1-');
    fs.writeFileSync(path.join(classicDir, 'yarn.lock'), '# yarn lockfile v1');
    fs.writeFileSync(path.join(classicDir, 'package.json'), '{}');
    assert.equal(pickManager(classicDir), 'yarn');

    const berryDir = tmpDir('hsx-yarn4-');
    fs.writeFileSync(path.join(berryDir, 'yarn.lock'), '__metadata:');
    fs.writeFileSync(path.join(berryDir, 'package.json'), JSON.stringify({ packageManager: 'yarn@4.1.0' }));
    assert.equal(pickManager(berryDir), 'yarn-berry');

    assert.equal(pickManager(tmpDir('hsx-none-')), null);
  });
});

describe('pkg-audit', () => {
  it('is not applicable without pnpm or yarn lockfiles', async () => {
    const out = await byId('pkg-audit').run({ deps: { byRoot: [] }, say: () => {} });
    assert.equal(out.status, 'na');
  });

  it('reports Bun-only projects as not applicable', async () => {
    const dir = tmpDir('hsx-bun-');
    fs.writeFileSync(path.join(dir, 'bun.lock'), '');
    const out = await byId('pkg-audit').run({ deps: { byRoot: [{ root: dir, rel: '', file: 'package.json', deps: new Set() }] }, say: () => {} });
    assert.equal(out.status, 'na');
    assert.match(out.reason, /Bun/);
  });
});

describe('history parser', () => {
  const diff = [
    '@@C abc1234',
    '',
    'diff --git a/src/a.js b/src/a.js',
    '--- /dev/null',
    '+++ b/src/a.js',
    '@@ -0,0 +1,2 @@',
    "+const k = '" + FAKE_AWS + "';",
    "-const old = '" + FAKE_AWS + "';",
    '@@C def5678',
    '',
    'diff --git a/tests/b.js b/tests/b.js',
    '--- /dev/null',
    '+++ b/tests/b.js',
    '@@ -0,0 +1 @@',
    "+const k = '" + FAKE_AWS + "';",
    '@@C 0a1b2c3',
    '',
    'diff --git a/.env b/.env',
    '--- /dev/null',
    '+++ b/.env',
    '@@ -0,0 +1 @@',
    '+AWS=' + FAKE_AWS,
  ].join('\n');

  it('keeps only added lines in normal source files', () => {
    const hits = [];
    const parser = createHistoryParser(helpers, (hit) => hits.push(hit));
    parser.push(diff);
    parser.end();
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, 'src/a.js');
    assert.equal(hits[0].commit, 'abc1234');
  });

  it('handles lines split across chunks', () => {
    const hits = [];
    const parser = createHistoryParser(helpers, (hit) => hits.push(hit));
    for (let i = 0; i < diff.length; i += 7) parser.push(diff.slice(i, i + 7));
    parser.end();
    assert.equal(hits.length, 1);
  });
});

const gitOk = spawnSync('git', ['--version']).status === 0;

describe('git-history-secrets', { skip: !gitOk }, () => {
  const dirs = [];

  function run(dir, args) {
    const r = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false'].concat(args), {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  }

  function commit(dir, message) {
    run(dir, ['add', '-A']);
    run(dir, ['commit', '-q', '-m', message]);
  }

  function makeRepo() {
    const dir = tmpDir('hsx-hist-');
    dirs.push(dir);
    run(dir, ['init', '-q']);
    fs.mkdirSync(path.join(dir, 'src'));
    return dir;
  }

  after(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips a folder that is not a git repository', async () => {
    const dir = tmpDir('hsx-nogit-');
    dirs.push(dir);
    const out = await byId('git-history-secrets').run({ repoPath: dir, corpus: [], say: () => {} });
    assert.equal(out.status, 'skip');
  });

  it('finds a removed key and a removed .env without printing the key', async () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'src', 'config.js'), "const key = '" + FAKE_AWS + "';\n");
    fs.writeFileSync(path.join(dir, '.env'), 'X=1\n');
    commit(dir, 'add secrets');
    fs.writeFileSync(path.join(dir, 'src', 'config.js'), 'const key = process.env.AWS_KEY;\n');
    run(dir, ['rm', '-q', '.env']);
    commit(dir, 'remove secrets');

    const ctx = {
      repoPath: dir,
      corpus: [{ rel: 'src/config.js', lines: ['const key = process.env.AWS_KEY;'], isTest: false }],
      say: () => {},
    };
    const out = await byId('git-history-secrets').run(ctx);
    assert.equal(out.status, 'fail');

    const aws = out.findings.find((f) => /AWS access key found in git history/.test(f.title));
    assert.ok(aws);
    assert.equal(aws.file, 'src/config.js');
    assert.ok(!aws.evidence.includes(FAKE_AWS));

    const env = out.findings.find((f) => /\.env was committed/.test(f.title));
    assert.ok(env);
    assert.equal(env.confidence, 'review');
  });

  it('leaves out a key that is still in the current source', async () => {
    const dir = makeRepo();
    const line = "const key = '" + FAKE_AWS + "';";
    fs.writeFileSync(path.join(dir, 'src', 'config.js'), line + '\n');
    commit(dir, 'add key');

    const ctx = {
      repoPath: dir,
      corpus: [{ rel: 'src/config.js', lines: [line], isTest: false }],
      say: () => {},
    };
    const out = await byId('git-history-secrets').run(ctx);
    assert.equal(out.status, 'pass');
  });
});