import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTests } = require('../services/security/auditExtra2.js');

const helpers = {
  finding: (d) => Object.assign({ severity: 'medium', confidence: 'confirmed' }, d),
  outcome: (findings) => {
    if (!findings.length) return { status: 'pass', findings: [] };
    const allReview = findings.every((f) => f.confidence === 'review');
    return { status: allReview ? 'review' : 'fail', findings };
  },
};

const tests = createTests(helpers);

function byId(id) {
  const found = tests.find((t) => t.id === id);
  assert.ok(found, 'missing test ' + id);
  return found;
}

function ctxOf(files, publicKeys = []) {
  return {
    profile: { env: { publicPrefixKeys: publicKeys } },
    corpus: Object.entries(files).map(([rel, text]) => ({
      rel,
      lines: text.split(/\r?\n/),
      isTest: false,
    })),
  };
}

describe('client-env-secrets', () => {
  it('flags a secret-looking public variable used in code as high', async () => {
    const out = await byId('client-env-secrets').run(ctxOf({ 'lib/api.ts': 'const k = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;' }));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings[0].severity, 'high');
  });

  it('ignores public-by-design names', async () => {
    const source = ['const a = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;', 'const b = import.meta.env.VITE_API_URL;'].join('\n');
    const out = await byId('client-env-secrets').run(ctxOf({ 'lib/a.ts': source }));
    assert.equal(out.status, 'pass');
  });

  it('marks a token-like name for review', async () => {
    const out = await byId('client-env-secrets').run(ctxOf({ 'a.ts': 'const t = import.meta.env.VITE_MAPBOX_TOKEN;' }));
    assert.equal(out.status, 'review');
  });

  it('flags a sensitive name found only in the env profile', async () => {
    const out = await byId('client-env-secrets').run(ctxOf({ 'a.ts': 'const x = 1;' }, ['NEXT_PUBLIC_DATABASE_URL']));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings.length, 1);
  });

  it('reports a key once even when referenced twice', async () => {
    const source = ['const a = process.env.VITE_JWT_SECRET;', 'const b = process.env.VITE_JWT_SECRET;'].join('\n');
    const out = await byId('client-env-secrets').run(ctxOf({ 'a.ts': source }, ['VITE_JWT_SECRET']));
    assert.equal(out.findings.length, 1);
  });
});

describe('mass-assignment', () => {
  it('flags prisma data from the request body as confirmed', async () => {
    const source = 'await prisma.user.update({ where: { id }, data: req.body });';
    const out = await byId('mass-assignment').run(ctxOf({ 'users.ts': source }));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings[0].confidence, 'confirmed');
  });

  it('marks Object.assign with the body for review', async () => {
    const out = await byId('mass-assignment').run(ctxOf({ 'a.ts': 'Object.assign(entity, req.body);' }));
    assert.equal(out.status, 'review');
  });

  it('flags new Model(req.body)', async () => {
    const out = await byId('mass-assignment').run(ctxOf({ 'a.js': 'const u = new User(req.body);' }));
    assert.equal(out.findings.length, 1);
  });

  it('flags Model.update with the body', async () => {
    const out = await byId('mass-assignment').run(ctxOf({ 'a.js': 'await User.update(req.body, { where: { id } });' }));
    assert.equal(out.findings.length, 1);
  });

  it('flags Laravel create from $request->all()', async () => {
    const out = await byId('mass-assignment').run(ctxOf({ 'UserController.php': '$user = User::create($request->all());' }));
    assert.equal(out.findings.length, 1);
  });

  it('passes a whitelisted write', async () => {
    const source = 'await prisma.user.update({ where: { id }, data: { name: req.body.name } });';
    const out = await byId('mass-assignment').run(ctxOf({ 'users.ts': source }));
    assert.equal(out.status, 'pass');
  });
});

describe('ssrf', () => {
  it('flags fetch with request input as high', async () => {
    const out = await byId('ssrf').run(ctxOf({ 'proxy.js': 'const r = await fetch(req.query.url);' }));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings[0].severity, 'high');
  });

  it('flags axios with a template using the body', async () => {
    const out = await byId('ssrf').run(ctxOf({ 'proxy.js': 'const r = await axios.get(`${req.body.target}/data`);' }));
    assert.equal(out.status, 'fail');
  });

  it('suppresses the finding when an allowlist is nearby', async () => {
    const source = ['if (!allowedHosts.includes(new URL(req.query.url).host)) return;', 'const r = await fetch(req.query.url);'].join('\n');
    const out = await byId('ssrf').run(ctxOf({ 'proxy.js': source }));
    assert.equal(out.status, 'pass');
  });

  it('ignores a constant address', async () => {
    const out = await byId('ssrf').run(ctxOf({ 'a.js': "const r = await fetch('https://api.example.com/x');" }));
    assert.equal(out.status, 'pass');
  });
});

describe('debug-mode', () => {
  it('flags APP_DEBUG true in a config file', async () => {
    const out = await byId('debug-mode').run(ctxOf({ 'docker-compose.yml': '      APP_DEBUG: true' }));
    assert.equal(out.status, 'review');
  });

  it('flags Django DEBUG True', async () => {
    const out = await byId('debug-mode').run(ctxOf({ 'config/settings.py': 'DEBUG = True' }));
    assert.equal(out.findings.length, 1);
  });

  it('skips files with development-style names', async () => {
    const out = await byId('debug-mode').run(ctxOf({ 'docker-compose.dev.yml': '      APP_DEBUG: true' }));
    assert.equal(out.status, 'pass');
  });

  it('flags NODE_ENV forced to development', async () => {
    const out = await byId('debug-mode').run(ctxOf({ 'server.js': "process.env.NODE_ENV = 'development';" }));
    assert.equal(out.findings.length, 1);
  });

  it('does not flag a comparison', async () => {
    const out = await byId('debug-mode').run(ctxOf({ 'server.js': "if (process.env.NODE_ENV === 'development') {" }));
    assert.equal(out.status, 'pass');
  });
});