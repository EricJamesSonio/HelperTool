import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { makeDeployStore, normalizeAccount, normalizeTarget } = require('../utils/deployStore.js');

function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-store-'));
  return makeDeployStore({ app: { getPath: () => dir } });
}

test('normalizeAccount needs a known provider and a label', () => {
  assert.equal(normalizeAccount({ providerId: 'nope', label: 'me' }), null);
  assert.equal(normalizeAccount({ providerId: 'vercel', label: '  ' }), null);
  assert.equal(normalizeAccount({ providerId: 'vercel', label: 'me@example.com' }).providerId, 'vercel');
});

test('normalizeTarget fills defaults and falls back to a custom role', () => {
  const t = normalizeTarget({ providerId: 'render', role: 'emails', roleLabel: 'Emails', url: 'not a url' });
  assert.equal(t.role, 'custom');
  assert.equal(t.roleLabel, 'Emails');
  assert.equal(t.name, 'Render');
  assert.equal(t.url, 'https://dashboard.render.com');
  assert.equal(normalizeTarget({ providerId: 'nope' }), null);
});

test('targets are saved per repo and found with any path spelling', () => {
  const store = freshStore();
  const { account } = store.saveAccount({ providerId: 'vercel', label: 'me@example.com' });
  store.saveTarget('C:\\Code\\App', { role: 'frontend', providerId: 'vercel', accountId: account.id, url: 'vercel.com/me/app' });
  const view = store.view('c:/code/app/');
  assert.equal(view.targets.length, 1);
  assert.equal(view.targets[0].url, 'https://vercel.com/me/app');
  assert.equal(store.view('c:/code/other').targets.length, 0);
});

test('accounts are shared and removing one clears it from targets', () => {
  const store = freshStore();
  const { account } = store.saveAccount({ providerId: 'render', label: 'work' });
  const again = store.saveAccount({ providerId: 'render', label: 'WORK' });
  assert.equal(again.account.id, account.id);
  store.saveTarget('/repo/a', { role: 'backend', providerId: 'render', accountId: account.id });
  store.saveTarget('/repo/b', { role: 'backend', providerId: 'render', accountId: account.id });
  store.deleteAccount(account.id);
  assert.equal(store.view('/repo/a').targets[0].accountId, '');
  assert.equal(store.view('/repo/b').targets[0].accountId, '');
  assert.equal(store.view('/repo/a').accounts.length, 0);
});

test('deleting a target removes only that target', () => {
  const store = freshStore();
  const a = store.saveTarget('/repo', { role: 'frontend', providerId: 'vercel' }).target;
  store.saveTarget('/repo', { role: 'database', providerId: 'neon' });
  store.deleteTarget('/repo', a.id);
  const view = store.view('/repo');
  assert.equal(view.targets.length, 1);
  assert.equal(view.targets[0].providerId, 'neon');
});