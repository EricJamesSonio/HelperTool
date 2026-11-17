import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { suggestFrom } = require('../services/deploySuggest.js');

const forRole = (list, role) => list.filter((s) => s.role === role);

test('a Next.js and Postgres repo gets Vercel and a Postgres host', () => {
  const list = suggestFrom({ stackIds: ['nextjs', 'nestjs'], frameworks: [], dialect: 'postgres', envKeys: [], markers: [] });
  assert.equal(forRole(list, 'frontend')[0].providerId, 'vercel');
  assert.equal(forRole(list, 'backend')[0].providerId, 'render');
  assert.ok(forRole(list, 'database').some((s) => s.providerId === 'neon'));
});

test('config files are the strongest signal', () => {
  const list = suggestFrom({ stackIds: ['react'], frameworks: [], dialect: '', envKeys: [], markers: ['netlify.toml', 'fly.toml'] });
  assert.equal(forRole(list, 'frontend')[0].providerId, 'netlify');
  assert.equal(forRole(list, 'backend')[0].providerId, 'fly');
});

test('environment variable names suggest image and database hosts', () => {
  const list = suggestFrom({ stackIds: [], frameworks: [], dialect: '', envKeys: ['CLOUDINARY_URL', 'MONGO_URI'], markers: [] });
  assert.equal(forRole(list, 'images')[0].providerId, 'cloudinary');
  assert.equal(forRole(list, 'database')[0].providerId, 'mongodb-atlas');
});

test('images always get a default suggestion and each role is capped', () => {
  const list = suggestFrom({});
  assert.ok(forRole(list, 'images').length >= 1);
  for (const role of ['frontend', 'backend', 'database', 'images']) assert.ok(forRole(list, role).length <= 4);
});