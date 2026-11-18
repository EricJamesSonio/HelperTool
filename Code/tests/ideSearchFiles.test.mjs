import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extOf,
  countExts,
  decodeTextBuffer,
  isProbablyTextBuffer,
} = require('../utils/ideSearchFiles.js');

test('IDE search discovers image, archive, extensionless, and hidden files', () => {
  const files = [
    '/repo/logo.png',
    '/repo/archive.tar.gz',
    '/repo/LICENSE',
    '/repo/.env',
  ];
  assert.deepEqual(countExts(files), [
    ['', 2],
    ['gz', 1],
    ['png', 1],
  ]);
  assert.equal(extOf('/repo/archive.tar.gz'), 'gz');
  assert.equal(extOf('/repo/LICENSE'), '');
});

test('IDE search identifies binary image and executable buffers', () => {
  assert.equal(isProbablyTextBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])), false);
  assert.equal(isProbablyTextBuffer(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x04])), false);
});

test('IDE search accepts normal text and UTF-16 text', () => {
  assert.equal(isProbablyTextBuffer(Buffer.from('const answer = 42;\n', 'utf8')), true);
  assert.equal(isProbablyTextBuffer(Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00])), true);
  assert.equal(decodeTextBuffer(Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00])), 'AB');
});
