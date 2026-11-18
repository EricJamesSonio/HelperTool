import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scorePath, nearWord } = require('../utils/fuzzyMatch.js');

test('scorePath ranks exact name above prefix, word start and inner matches', () => {
  const names = [
    'utils/search.js',
    'utils/searchManager.js',
    'utils/fileSearch.js',
    'utils/research.js',
  ];
  const scores = names.map((n) => scorePath(n, ['search']).score);
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i - 1] > scores[i], names[i - 1] + ' should outrank ' + names[i]);
  }
});

test('scorePath finds swapped and missing letters', () => {
  const cases = [
    ['src/controller.js', 'cotnroller'],
    ['src/controller.js', 'contrller'],
    ['src/controller.js', 'controoller'],
  ];
  for (const [rel, token] of cases) {
    const r = scorePath(rel, [token]);
    assert.ok(r, token + ' should match ' + rel);
    assert.equal(r.approx, true);
  }
});

test('scorePath scores an exact name above a typo', () => {
  const exact = scorePath('a/controller.js', ['controller']);
  const typo = scorePath('a/controller.js', ['cotnroller']);
  assert.ok(exact.score > typo.score);
  assert.equal(exact.approx, false);
});

test('scorePath marks the matched letters of an abbreviation', () => {
  const r = scorePath('src/searchManager.js', ['srchmgr']);
  assert.ok(r);
  assert.equal(r.approx, true);
  assert.ok(r.marks.length > 0);
  assert.equal(r.marks[0][0], 0);
});

test('scorePath requires every token and rejects unrelated names', () => {
  assert.equal(scorePath('src/controller.js', ['zzzz']), null);
  assert.equal(scorePath('src/controller.js', ['controller', 'zzzz']), null);
  assert.equal(scorePath('src/controller.js', []), null);
});

test('nearWord matches a typo inside a camelCase identifier', () => {
  const hit = nearWord('chekout', 'handleCheckout');
  assert.ok(hit);
  assert.equal(hit.kind, 'near');
  assert.equal(hit.off, 6);
  assert.equal(hit.len, 8);
});

test('nearWord rejects unrelated words', () => {
  assert.equal(nearWord('zzzzzz', 'handleCheckout'), null);
});