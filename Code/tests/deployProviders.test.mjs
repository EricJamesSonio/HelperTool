import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PROVIDERS, getProvider, searchProviders, normalizeUrl, toNavigableUrl } = require('../utils/deployProviders.js');

test('provider ids are unique and every link is https', () => {
  const ids = new Set(PROVIDERS.map((p) => p.id));
  assert.equal(ids.size, PROVIDERS.length);
  for (const p of PROVIDERS) assert.ok(p.url.startsWith('https://'), p.id);
});

test('search ranks by name, id and keyword', () => {
  assert.equal(searchProviders('vercel')[0].id, 'vercel');
  assert.equal(searchProviders('mongo')[0].id, 'mongodb-atlas');
  assert.ok(searchProviders('postgres').some((p) => p.id === 'neon'));
  assert.equal(searchProviders('zzzzzz').length, 0);
});

test('search puts providers for the chosen role first', () => {
  assert.ok(searchProviders('', 'images')[0].roles.includes('images'));
  assert.ok(searchProviders('', 'database')[0].roles.includes('database'));
});

test('getProvider finds a provider or returns null', () => {
  assert.equal(getProvider('render').name, 'Render');
  assert.equal(getProvider('nope'), null);
});

test('normalizeUrl accepts only web addresses', () => {
  const cases = [
    ['example.com', 'https://example.com/'],
    ['https://vercel.com/me/app', 'https://vercel.com/me/app'],
    ['ftp://example.com', ''],
    ['javascript:alert(1)', ''],
    ['', ''],
  ];
  for (const [input, expected] of cases) assert.equal(normalizeUrl(input), expected, input);
});

test('toNavigableUrl handles hosts, local addresses and search text', () => {
  assert.equal(toNavigableUrl('vercel.com/dash'), 'https://vercel.com/dash');
  assert.equal(toNavigableUrl('localhost:3000'), 'http://localhost:3000/');
  assert.ok(toNavigableUrl('hello world').startsWith('https://www.google.com/search?q='));
  assert.ok(toNavigableUrl('javascript:alert(1)').startsWith('https://www.google.com/search?q='));
});