import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _internals } = require('../services/security/audit.js');
const { scanPrismaRawCalls, scanCors, classifyNpmFailure } = _internals;

function ctxOf(files, mechanism = 'jwt') {
  return {
    profile: { auth: { mechanism } },
    corpus: Object.entries(files).map(([rel, text]) => ({
      rel,
      lines: text.split(/\r?\n/),
      isTest: false,
    })),
  };
}

describe('Prisma raw-query analysis', () => {
  it('ignores a constant DROP statement', () => {
    const out = scanPrismaRawCalls(ctxOf({ 'seeds/drop.ts': "await db.$executeRawUnsafe('DROP SCHEMA public CASCADE');" }));
    assert.equal(out.length, 0);
  });

  it('ignores a parameterized statement across lines', () => {
    const source = [
      'await tx.$executeRawUnsafe(',
      "  'UPDATE \"GradeTemplate\" SET \"name\" = $1 WHERE id = $2',",
      '  name,',
      '  id,',
      ');',
    ].join('\n');
    const out = scanPrismaRawCalls(ctxOf({ 'grade-template.service.ts': source }));
    assert.equal(out.length, 0);
  });

  it('flags a template literal that interpolates a value', () => {
    const out = scanPrismaRawCalls(ctxOf({ 'unsafe.ts': 'await tx.$executeRawUnsafe(`DELETE FROM ${table}`);' }));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'high');
    assert.equal(out[0].confidence, 'confirmed');
  });

  it('resolves a constant variable', () => {
    const source = ["const sql = 'DROP SCHEMA public CASCADE';", 'await db.$executeRawUnsafe(sql);'].join('\n');
    const out = scanPrismaRawCalls(ctxOf({ 'drop.ts': source }));
    assert.equal(out.length, 0);
  });

  it('flags an interpolated variable', () => {
    const source = ['const sql = `SELECT * FROM ${table}`;', 'await db.$queryRawUnsafe(sql);'].join('\n');
    const out = scanPrismaRawCalls(ctxOf({ 'unsafe.ts': source }));
    assert.equal(out.length, 1);
    assert.equal(out[0].confidence, 'confirmed');
  });

  it('marks an unresolved variable for review', () => {
    const out = scanPrismaRawCalls(ctxOf({ 'unsafe.ts': 'await db.$queryRawUnsafe(sql, id);' }));
    assert.equal(out.length, 1);
    assert.equal(out[0].confidence, 'review');
  });
});

describe('npm audit failures', () => {
  it('labels an allow-scripts config rejection as a tooling issue', () => {
    const failure = classifyNpmFailure('--allow-scripts is not allowed in project-scoped installs.');
    assert.equal(failure.code, 'config');
    assert.match(failure.message, /tooling issue/);
    assert.match(failure.message, /allowScripts/);
  });

  it('labels registry connectivity problems as offline', () => {
    const failure = classifyNpmFailure('request to https://registry.npmjs.org failed, reason: ENOTFOUND');
    assert.equal(failure.code, 'offline');
  });
});

describe('CORS analysis', () => {
  it('treats a JWT-authenticated gateway wildcard as low-risk hardening', () => {
    const source = "@WebSocketGateway({ cors: { origin: '*', credentials: true } })";
    const out = scanCors(ctxOf({ 'meeting.gateway.ts': source }, 'jwt'));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'low');
    assert.equal(out[0].confidence, 'review');
  });

  it('escalates a cookie-authenticated gateway wildcard with credentials', () => {
    const source = [
      "@WebSocketGateway({ cors: { origin: '*', credentials: true } })",
      'handleConnection(client) {',
      '  const session = client.handshake.headers.cookie;',
      '}',
    ].join('\n');
    const out = scanCors(ctxOf({ 'meeting.gateway.ts': source }, 'session-cookie'));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'medium');
    assert.equal(out[0].confidence, 'confirmed');
  });

  it('flags an HTTP wildcard with credentials as high', () => {
    const source = "app.enableCors({ origin: '*', credentials: true });";
    const out = scanCors(ctxOf({ 'main.ts': source }));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'high');
  });

  it('keeps an HTTP wildcard without credentials at medium', () => {
    const source = "app.enableCors({ origin: '*' });";
    const out = scanCors(ctxOf({ 'main.ts': source }));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'medium');
  });
});
