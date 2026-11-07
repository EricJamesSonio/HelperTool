import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { matches, isValid, evaluatePathFilter } = require('../services/ci/ciPathMatch.js');
const { selectJobs, jobScope, normalizeDir, scopeFiles } = require('../services/ci/ciSmart.js');
const { parseWorkflowText } = require('../services/ci/ciWorkflows.js');

const JOBS = [
  'jobs:',
  '  web:',
  '    runs-on: ubuntu-latest',
  '    defaults:',
  '      run:',
  '        working-directory: web',
  '    steps:',
  '      - run: npm test',
  '  api:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: npm test',
  '        working-directory: api',
  '  lint:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: npm run lint',
  '  e2e:',
  '    needs: [web, api]',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: npm run e2e',
  '        working-directory: e2e',
].join('\n');

const PR_IGNORE_MD = ['on:', '  pull_request:', '    paths-ignore:', "      - '**.md'"].join('\n');

function workflow(on, file) {
  return parseWorkflowText(file || 'ci.yml', 'name: CI\n' + on + '\n' + JOBS + '\n');
}

describe('ciPathMatch - glob rules', () => {
  it('keeps * inside one folder', () => {
    assert.equal(matches('*.js', 'a.js'), true);
    assert.equal(matches('*.js', 'src/a.js'), false);
  });

  it('lets ** cross folders and match zero folders', () => {
    assert.equal(matches('**/*.js', 'a.js'), true);
    assert.equal(matches('**/*.js', 'src/a.js'), true);
    assert.equal(matches('**/*.js', 'src/x/a.js'), true);
    assert.equal(matches('docs/**', 'docs/a.md'), true);
    assert.equal(matches('docs/**', 'docs/x/y.md'), true);
    assert.equal(matches('docs/**', 'other/docs/a.md'), false);
    assert.equal(matches('src/**/*.ts', 'src/a.ts'), true);
    assert.equal(matches('src/**/*.ts', 'src/x/y/a.ts'), true);
    assert.equal(matches('src/**/*.ts', 'lib/a.ts'), false);
    assert.equal(matches('**.md', 'README.md'), true);
    assert.equal(matches('**.md', 'docs/a.md'), true);
  });

  it('applies ? and + to the preceding character', () => {
    assert.equal(matches('ab?.txt', 'a.txt'), true);
    assert.equal(matches('ab?.txt', 'ab.txt'), true);
    assert.equal(matches('ab?.txt', 'abb.txt'), false);
    assert.equal(matches('a+.txt', 'a.txt'), true);
    assert.equal(matches('a+.txt', 'aaa.txt'), true);
    assert.equal(matches('a+.txt', '.txt'), false);
  });

  it('supports character classes, escapes and literal dots', () => {
    assert.equal(matches('v[0-9].txt', 'v1.txt'), true);
    assert.equal(matches('v[0-9].txt', 'va.txt'), false);
    assert.equal(matches('a\\*.txt', 'a*.txt'), true);
    assert.equal(matches('a\\*.txt', 'ab.txt'), false);
    assert.equal(matches('a.js', 'abjs'), false);
  });

  it('rejects patterns that are invalid or too complex', () => {
    assert.equal(isValid('src/**'), true);
    assert.equal(isValid('**/'.repeat(9) + 'x'), false);
    assert.equal(isValid('v[z-a].txt'), false);
    assert.equal(isValid(''), false);
  });
});

describe('ciPathMatch - path filters', () => {
  it('uses the last matching pattern for paths', () => {
    const filter = { paths: ['src/**', '!src/gen/**'] };
    assert.equal(evaluatePathFilter(['src/gen/a.js'], filter).outcome, 'ignored');
    assert.deepEqual(evaluatePathFilter(['src/gen/a.js', 'src/b.js'], filter).matched, ['src/b.js']);

    const again = { paths: ['src/**', '!src/gen/**', 'src/gen/keep.js'] };
    assert.deepEqual(evaluatePathFilter(['src/gen/keep.js', 'src/gen/other.js', 'src/main.js'], again).matched, [
      'src/gen/keep.js',
      'src/main.js',
    ]);
  });

  it('skips the workflow only when every file is ignored', () => {
    const filter = { pathsIgnore: ['docs/**', '**.md'] };
    assert.equal(evaluatePathFilter(['docs/a.md', 'README.md'], filter).outcome, 'ignored');
    const result = evaluatePathFilter(['docs/a.md', 'src/a.js'], filter);
    assert.equal(result.outcome, 'matched');
    assert.deepEqual(result.matched, ['src/a.js']);
  });

  it('treats unevaluable filters conservatively', () => {
    assert.equal(evaluatePathFilter(['a.js'], {}).outcome, 'unfiltered');
    assert.equal(evaluatePathFilter(['a.js'], undefined).outcome, 'unfiltered');

    const both = evaluatePathFilter(['a.js'], { paths: ['a/**'], pathsIgnore: ['b/**'] });
    assert.equal(both.outcome, 'unknown');
    assert.match(both.warning, /paths-ignore/);

    assert.equal(evaluatePathFilter(['a.js'], { pathsIgnore: ['!docs/**'] }).outcome, 'unknown');
    assert.equal(evaluatePathFilter(['a.js'], { paths: ['v[z-a]'] }).outcome, 'unknown');
  });
});

describe('ciSmart - job scope', () => {
  it('normalizes working directories', () => {
    assert.equal(normalizeDir('./web/'), 'web');
    assert.equal(normalizeDir('.'), '.');
    assert.equal(normalizeDir('a\\b'), 'a/b');
    assert.equal(normalizeDir('../x'), null);
    assert.equal(normalizeDir('/abs'), null);
    assert.equal(normalizeDir('${{ env.DIR }}'), null);
  });

  it('classifies jobs as directory or root scoped', () => {
    const wf = workflow(PR_IGNORE_MD);
    const byId = Object.fromEntries(wf.jobs.map((job) => [job.id, job]));
    assert.deepEqual(jobScope(byId.web), { kind: 'directory', directories: ['web'], why: '' });
    assert.equal(jobScope(byId.api).kind, 'directory');
    assert.equal(jobScope(byId.lint).kind, 'root');
  });

  it('treats an unresolvable working directory as root scoped', () => {
    const text = [
      'on: push',
      'jobs:',
      '  x:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm test',
      '        working-directory: "${{ env.DIR }}"',
    ].join('\n');
    const wf = parseWorkflowText('x.yml', text);
    assert.equal(jobScope(wf.jobs[0]).kind, 'root');
  });

  it('limits files to the repository folder inside a larger Git repo', () => {
    const top = path.resolve('/repo');
    const files = ['sub/a.js', 'other/b.js'];
    assert.deepEqual(scopeFiles(files, top, path.join(top, 'sub')), ['a.js']);
    assert.deepEqual(scopeFiles(files, top, top), files);
  });
});

describe('ciSmart - selectJobs', () => {
  it('selects directory jobs from changed files and root jobs always', () => {
    const result = selectJobs({ workflow: workflow(PR_IGNORE_MD), files: ['web/src/app.js'] });
    assert.deepEqual(result.selectedJobIds, ['web', 'lint']);
    assert.deepEqual(result.dependencyJobIds, []);
    const web = result.jobs.find((job) => job.id === 'web');
    assert.match(web.reason, /web/);
    assert.equal(result.jobs.find((job) => job.id === 'api').selected, false);
    assert.equal(result.jobs.find((job) => job.id === 'e2e').selected, false);
  });

  it('adds jobs needed by a selected job as dependencies', () => {
    const result = selectJobs({ workflow: workflow(PR_IGNORE_MD), files: ['e2e/run.js'] });
    assert.deepEqual(result.selectedJobIds, ['lint', 'e2e']);
    assert.deepEqual(result.dependencyJobIds, ['web', 'api']);
    const web = result.jobs.find((job) => job.id === 'web');
    assert.equal(web.selected, false);
    assert.equal(web.dependency, true);
    assert.match(web.reason, /needs it/);
  });

  it('selects nothing when path filters exclude every change', () => {
    const result = selectJobs({ workflow: workflow(PR_IGNORE_MD), files: ['README.md'] });
    assert.equal(result.triggered, false);
    assert.deepEqual(result.selectedJobIds, []);
    assert.match(result.summary, /would not run/);
  });

  it('warns about shared files that only root jobs cover', () => {
    const result = selectJobs({ workflow: workflow(PR_IGNORE_MD), files: ['package.json'] });
    assert.deepEqual(result.selectedJobIds, ['lint']);
    assert.equal(result.sharedCount, 1);
    assert.ok(result.warnings.some((w) => /outside every job directory/.test(w)));
  });

  it('selects every job when the workflow file changed', () => {
    const result = selectJobs({ workflow: workflow(PR_IGNORE_MD), files: ['.github/workflows/ci.yml'] });
    assert.equal(result.mode, 'workflow-changed');
    assert.deepEqual(result.selectedJobIds, ['web', 'api', 'lint', 'e2e']);
  });

  it('selects every job when the change list is truncated', () => {
    const result = selectJobs({ workflow: workflow(PR_IGNORE_MD), files: ['web/a.js'], truncated: true });
    assert.equal(result.mode, 'truncated');
    assert.deepEqual(result.selectedJobIds, ['web', 'api', 'lint', 'e2e']);
    assert.ok(result.warnings.length >= 1);
  });

  it('selects nothing when there are no changed files', () => {
    const result = selectJobs({ workflow: workflow(PR_IGNORE_MD), files: [] });
    assert.deepEqual(result.selectedJobIds, []);
    assert.equal(result.triggered, false);
    assert.match(result.summary, /no changed files/i);
  });

  it('works on an unfiltered push workflow', () => {
    const result = selectJobs({ workflow: workflow('on: push'), files: ['web/a.js'] });
    assert.equal(result.mode, 'unfiltered');
    assert.deepEqual(result.selectedJobIds, ['web', 'lint']);
  });

  it('only counts files that pass the paths filter', () => {
    const on = ['on:', '  pull_request:', '    paths:', "      - 'web/**'"].join('\n');
    const blocked = selectJobs({ workflow: workflow(on), files: ['api/x.js'] });
    assert.equal(blocked.triggered, false);

    const result = selectJobs({ workflow: workflow(on), files: ['web/x.js', 'api/y.js'] });
    assert.equal(result.triggered, true);
    assert.deepEqual(result.selectedJobIds, ['web', 'lint']);
  });

  it('triggers when any push or pull_request filter passes', () => {
    const on = [
      'on:',
      '  push:',
      '    paths:',
      "      - 'docs/**'",
      '  pull_request:',
      '    paths:',
      "      - 'web/**'",
    ].join('\n');
    const result = selectJobs({ workflow: workflow(on), files: ['web/a.js'] });
    assert.equal(result.triggered, true);
    assert.deepEqual(result.selectedJobIds, ['web', 'lint']);
  });

  it('does not filter workflows without push or pull_request triggers', () => {
    const on = ['on:', '  schedule:', '    - cron: "0 0 * * *"'].join('\n');
    const result = selectJobs({ workflow: workflow(on), files: ['README.md'] });
    assert.equal(result.mode, 'unfiltered');
    assert.match(result.note, /do not apply/);
    assert.deepEqual(result.selectedJobIds, ['lint']);
  });
});