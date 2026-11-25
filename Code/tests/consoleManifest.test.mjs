import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mkTmp, rmRf } from './helpers.mjs';

const require = createRequire(import.meta.url);
const manifest = require('../services/consoleManifest.js');

const made = [];

after(() => {
  for (const dir of made) rmRf(dir);
});

function repo(files) {
  const dir = mkTmp();
  made.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

describe('consoleManifest - detected npm scripts', () => {
  const dir = repo({
    'package.json': {
      scripts: {
        build: 'tsc',
        start: 'node .',
        dev: 'vite',
        test: 'jest',
        lint: 'eslint .',
        prebuild: 'echo before',
        'seed:dev': 'node seed.js',
        'db:reset': 'node reset.js',
        migrate: 'prisma migrate dev',
        'migrate:production': 'APP_ENV=production prisma migrate deploy',
      },
      devDependencies: { jest: '^29.0.0' },
    },
  });
  const view = manifest.describe(dir);
  const byTitle = Object.fromEntries(view.items.map((i) => [i.title, i]));

  it('reports the detected source and trusts it', () => {
    assert.equal(view.source, 'detected');
    assert.equal(view.trusted, true);
  });

  it('skips the test script and hook scripts', () => {
    for (const name of ['test', 'prebuild']) {
      assert.equal(byTitle[name], undefined, name + ' should not be listed');
    }
  });

  it('lists long-running scripts under Dev servers', () => {
    assert.equal(byTitle.start.section, 'Dev servers');
    assert.equal(byTitle.dev.section, 'Dev servers');
  });

  it('classifies scripts by name', () => {
    assert.equal(byTitle.build.id, 'pkg:.:build');
    assert.equal(byTitle.build.page, 'scripts');
    assert.equal(byTitle.build.risk, 'readonly');
    assert.equal(byTitle.lint.risk, 'readonly');
    assert.equal(byTitle['seed:dev'].page, 'seeds');
    assert.equal(byTitle['db:reset'].page, 'database');
    assert.equal(byTitle['db:reset'].risk, 'destructive');
  });

  it('groups local and production variants into one action', () => {
    const item = byTitle.migrate;
    assert.equal(item.page, 'database');
    assert.equal(item.needsDb, true);
    assert.ok(item.targets.local);
    assert.ok(item.targets.production);
    assert.equal(item.targets.local.appEnv, 'development');
    assert.equal(item.targets.production.appEnv, 'production');
    assert.equal(item.targets.local.missing, false);
  });
});

describe('consoleManifest - local and prod suffix pairing', () => {
  const dir = repo({
    'package.json': {
      scripts: {
        'db:deploy:local': 'node scripts/db.js local deploy',
        'db:deploy:prod': 'node scripts/db.js prod deploy',
        'db:reset:full': 'node reset-full.js',
        'db:reset:full:prod': 'node reset-full.js --prod',
        'db:status': 'node status.js',
        'db:status:local': 'node status-local.js',
      },
    },
  });
  const view = manifest.describe(dir);
  const byTitle = Object.fromEntries(view.items.map((i) => [i.title, i]));

  it('pairs a :local script with its :prod script', () => {
    const item = byTitle['db:deploy'];
    assert.ok(item);
    assert.equal(item.targets.local.display, 'npm run db:deploy:local');
    assert.equal(item.targets.production.display, 'npm run db:deploy:prod');
    assert.equal(item.targets.production.appEnv, 'production');
  });

  it('pairs a plain script with its :prod script', () => {
    const item = byTitle['db:reset:full'];
    assert.ok(item);
    assert.equal(item.risk, 'destructive');
    assert.equal(item.targets.local.display, 'npm run db:reset:full');
    assert.equal(item.targets.production.display, 'npm run db:reset:full:prod');
  });

  it('keeps a plain script and a :local script apart when both exist', () => {
    assert.ok(byTitle['db:status']);
    assert.ok(byTitle['db:status:local']);
    assert.equal(byTitle['db:status'].targets.local.display, 'npm run db:status');
    assert.equal(byTitle['db:status:local'].targets.local.display, 'npm run db:status:local');
  });
});

describe('consoleManifest - empty and test suites', () => {
  it('returns nothing for an empty folder', () => {
    const dir = repo({ 'readme.txt': 'hello' });
    const view = manifest.describe(dir);
    assert.deepEqual(view.items, []);
    assert.deepEqual(view.suites, []);
  });

  it('detects a jest suite and counts its test files', () => {
    const dir = repo({
      'package.json': { scripts: { test: 'jest' }, devDependencies: { jest: '^29.0.0' } },
      'src/a.test.js': 'test("a", () => {});',
    });
    const view = manifest.describe(dir);
    assert.equal(view.suites.length, 1);
    assert.equal(view.suites[0].runner, 'jest');
    assert.equal(view.suites[0].files, 1);
  });
});

describe('consoleManifest - repository manifest trust', () => {
  it('blocks the actions of a manifest that was not trusted', () => {
    const dir = repo({
      'package.json': { scripts: { build: 'tsc' } },
      '.helper/console.json': {
        actions: [{ id: 'x', title: 'X', page: 'scripts', targets: { local: { script: 'build' } } }],
      },
    });
    const view = manifest.describe(dir);
    assert.equal(view.source, 'manifest');
    assert.equal(view.trusted, false);
    assert.ok(view.hash);
    assert.equal(view.items[0].targets.local.blocked, true);
  });

  it('falls back to detected scripts when the manifest is not valid JSON', () => {
    const dir = repo({
      'package.json': { scripts: { build: 'tsc' } },
      '.helper/console.json': '{ not json',
    });
    const view = manifest.describe(dir);
    assert.equal(view.source, 'detected');
    assert.ok(view.notice.length > 0);
    assert.ok(view.items.some((i) => i.title === 'build'));
  });
});