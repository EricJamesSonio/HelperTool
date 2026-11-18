import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../renderer/defaultPreferences.js', import.meta.url), 'utf8');
const preferences = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('fresh-install keyboard shortcuts are unique', () => {
  const bindings = Object.values(preferences.DEFAULT_PREFERENCES.shortcuts).filter(Boolean);
  assert.equal(new Set(bindings).size, bindings.length);
});

test('fresh-install defaults contain no machine-specific paths or credentials', () => {
  const serialized = JSON.stringify(preferences.DEFAULT_PREFERENCES);
  assert.doesNotMatch(serialized, /[A-Za-z]:\\\\|\\\\Users\\\\|api[-_]?key\s*[:=]|(?:access|refresh)[-_]?token\s*[:=]|password\s*[:=]/i);
});
