import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTests } = require('../services/security/auditExtra.js');

const helpers = {
  finding: (d) => Object.assign({ severity: 'medium', confidence: 'confirmed' }, d),
  outcome: (findings) => {
    if (!findings.length) return { status: 'pass', findings: [] };
    const allReview = findings.every((f) => f.confidence === 'review');
    return { status: allReview ? 'review' : 'fail', findings };
  },
  skip: (reason) => ({ status: 'skip', reason, findings: [] }),
  na: (reason) => ({ status: 'na', reason, findings: [] }),
  headerFix: (profile, name) => 'Set ' + name + '.',
  hasAny: (set, list) => list.some((n) => set.has(n)),
};

const tests = createTests(helpers);

function byId(id) {
  const found = tests.find((t) => t.id === id);
  assert.ok(found, 'missing test ' + id);
  return found;
}

function ctxOf(files, deps = []) {
  return {
    profile: { frontend: { framework: 'unknown' }, backend: { framework: 'unknown' } },
    deps: { names: new Set(deps) },
    say: () => {},
    corpus: Object.entries(files).map(([rel, text]) => ({
      rel,
      lines: text.split(/\r?\n/),
      isTest: false,
    })),
  };
}

function netCtx(headers, body, handler) {
  return {
    profile: { frontend: { framework: 'unknown' }, backend: { framework: 'unknown' } },
    say: () => {},
    net: {
      base: new URL('http://localhost:3000'),
      root: { status: 200, headers: new Headers(headers), body, setCookies: [] },
      client: {
        request: handler || (async () => ({ status: 404, headers: new Headers(), body: '' })),
      },
    },
  };
}

describe('jwt-hardening', () => {
  it('is not applicable without a JWT library', async () => {
    const out = await byId('jwt-hardening').run(ctxOf({ 'a.js': 'jwt.verify(t, s);' }));
    assert.equal(out.status, 'na');
  });

  it('flags the none algorithm as high', async () => {
    const source = "const p = jwt.verify(token, secret, { algorithms: ['none'] });";
    const out = await byId('jwt-hardening').run(ctxOf({ 'auth.ts': source }, ['jsonwebtoken']));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings.length, 1);
    assert.equal(out.findings[0].severity, 'high');
  });

  it('marks verify without pinned algorithms for review', async () => {
    const out = await byId('jwt-hardening').run(ctxOf({ 'auth.ts': 'const p = jwt.verify(token, secret);' }, ['jsonwebtoken']));
    assert.equal(out.status, 'review');
    assert.equal(out.findings[0].confidence, 'review');
  });

  it('passes verify with pinned algorithms', async () => {
    const source = "const p = jwt.verify(token, secret, { algorithms: ['HS256'] });";
    const out = await byId('jwt-hardening').run(ctxOf({ 'auth.ts': source }, ['jsonwebtoken']));
    assert.equal(out.status, 'pass');
  });

  it('flags ignoreExpiration', async () => {
    const source = "jwt.verify(t, s, { algorithms: ['HS256'], ignoreExpiration: true });";
    const out = await byId('jwt-hardening').run(ctxOf({ 'auth.ts': source }, ['jsonwebtoken']));
    assert.equal(out.findings.length, 1);
    assert.match(out.findings[0].title, /expiry/);
  });

  it('flags a literal secret', async () => {
    const source = "const t = jwt.sign({ id: 1 }, 'supersecret', { algorithm: 'HS256' });";
    const out = await byId('jwt-hardening').run(ctxOf({ 'auth.ts': source }, ['jsonwebtoken']));
    assert.equal(out.status, 'fail');
    assert.match(out.findings[0].title, /secret/);
  });
});

describe('tls-verify', () => {
  it('flags rejectUnauthorized false', async () => {
    const out = await byId('tls-verify').run(ctxOf({ 'net.js': 'const a = new https.Agent({ rejectUnauthorized: false });' }));
    assert.equal(out.status, 'fail');
  });

  it('flags the environment override', async () => {
    const out = await byId('tls-verify').run(ctxOf({ 'net.js': "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';" }));
    assert.equal(out.status, 'fail');
  });

  it('passes clean code', async () => {
    const out = await byId('tls-verify').run(ctxOf({ 'net.js': 'const a = new https.Agent({ keepAlive: true });' }));
    assert.equal(out.status, 'pass');
  });
});

describe('weak-random', () => {
  it('flags Math.random used for a token', async () => {
    const out = await byId('weak-random').run(ctxOf({ 'a.js': 'const resetToken = Math.random().toString(36);' }));
    assert.equal(out.status, 'fail');
  });

  it('ignores unrelated Math.random', async () => {
    const out = await byId('weak-random').run(ctxOf({ 'a.js': 'const jitter = Math.random() * 100;' }));
    assert.equal(out.status, 'pass');
  });
});

describe('cookie-flags-code', () => {
  it('marks a bare cookie call for review', async () => {
    const out = await byId('cookie-flags-code').run(ctxOf({ 'a.js': "res.cookie('session', id);" }));
    assert.equal(out.status, 'review');
  });

  it('passes a cookie with every flag', async () => {
    const source = 'res.cookie("session", id, { httpOnly: true, secure: true, sameSite: "lax" });';
    const out = await byId('cookie-flags-code').run(ctxOf({ 'a.js': source }));
    assert.equal(out.status, 'pass');
  });

  it('flags SameSite none without secure', async () => {
    const source = "res.cookie('a', 1, { httpOnly: true, sameSite: 'none' });";
    const out = await byId('cookie-flags-code').run(ctxOf({ 'a.js': source }));
    assert.ok(out.findings.some((f) => /SameSite=None/.test(f.title)));
  });

  it('flags express-session without a store for review', async () => {
    const source = ["const session = require('express-session');", "app.use(session({ secret: 'x' }));"].join('\n');
    const out = await byId('cookie-flags-code').run(ctxOf({ 'app.js': source }));
    assert.ok(out.findings.some((f) => /MemoryStore/.test(f.title)));
  });
});

describe('command-injection', () => {
  it('flags exec with a template literal', async () => {
    const source = ["const { exec } = require('child_process');", 'exec(`git log ${branch}`);'].join('\n');
    const out = await byId('command-injection').run(ctxOf({ 'run.js': source }));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings[0].severity, 'high');
  });

  it('flags cp.exec with concatenation', async () => {
    const source = ["const cp = require('child_process');", "cp.exec('ls ' + dir);"].join('\n');
    const out = await byId('command-injection').run(ctxOf({ 'run.js': source }));
    assert.equal(out.status, 'fail');
  });

  it('keeps execFile with an argument array safe', async () => {
    const source = ["const { execFile } = require('child_process');", "execFile('git', ['log', branch]);"].join('\n');
    const out = await byId('command-injection').run(ctxOf({ 'run.js': source }));
    assert.equal(out.status, 'pass');
  });

  it('ignores regex exec in a file without child_process', async () => {
    const out = await byId('command-injection').run(ctxOf({ 'a.js': "const m = re.exec('a' + b);" }));
    assert.equal(out.status, 'pass');
  });

  it('flags spawn with shell true and interpolation', async () => {
    const source = ["const { spawn } = require('child_process');", 'spawn(`git ${args}`, [], { shell: true });'].join('\n');
    const out = await byId('command-injection').run(ctxOf({ 'run.js': source }));
    assert.ok(out.findings.some((f) => /shell: true/.test(f.title)));
  });
});

describe('path-traversal', () => {
  it('flags fs access built from request input', async () => {
    const source = "app.get('/f/:n', (req, res) => fs.readFile(path.join(base, req.params.n), cb));";
    const out = await byId('path-traversal').run(ctxOf({ 'a.js': source }));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings.length, 1);
  });

  it('accepts a guarded path', async () => {
    const source = 'fs.readFile(path.join(base, path.basename(req.params.n)), cb);';
    const out = await byId('path-traversal').run(ctxOf({ 'a.js': source }));
    assert.equal(out.status, 'pass');
  });

  it('marks path.join with request input for review', async () => {
    const out = await byId('path-traversal').run(ctxOf({ 'a.js': 'const p = path.join(root, req.query.dir);' }));
    assert.equal(out.status, 'review');
  });
});

describe('dyn-csp-quality', () => {
  it('is not applicable without a CSP', async () => {
    const out = await byId('dyn-csp-quality').run(netCtx({}, ''));
    assert.equal(out.status, 'na');
  });

  it('flags unsafe-inline and unsafe-eval', async () => {
    const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    const out = await byId('dyn-csp-quality').run(netCtx({ 'content-security-policy': csp }, ''));
    assert.equal(out.status, 'fail');
    assert.ok(out.findings.some((f) => /unsafe-inline/.test(f.title)));
    assert.ok(out.findings.some((f) => /unsafe-eval/.test(f.title)));
  });

  it('passes a strict policy', async () => {
    const csp = "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'";
    const out = await byId('dyn-csp-quality').run(netCtx({ 'content-security-policy': csp }, ''));
    assert.equal(out.status, 'pass');
  });
});

describe('dyn-source-maps', () => {
  const body = '<script src="/assets/app.js"></script>';

  it('flags a public source map', async () => {
    const handler = async (p) => ({
      status: p === '/assets/app.js.map' ? 200 : 404,
      headers: new Headers(),
      body: '{"version":3,"sources":["a.js"]}',
    });
    const out = await byId('dyn-source-maps').run(netCtx({}, body, handler));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings[0].severity, 'low');
  });

  it('passes when the map is not served', async () => {
    const out = await byId('dyn-source-maps').run(netCtx({}, body));
    assert.equal(out.status, 'pass');
  });

  it('is not applicable without scripts', async () => {
    const out = await byId('dyn-source-maps').run(netCtx({}, '<html></html>'));
    assert.equal(out.status, 'na');
  });
});

describe('dyn-open-redirect', () => {
  it('flags a redirect to an outside host', async () => {
    const handler = async (p) => {
      if (p.startsWith('/login')) {
        return { status: 302, headers: new Headers({ location: 'https://evil.example/x' }), body: '' };
      }
      return { status: 200, headers: new Headers(), body: '' };
    };
    const out = await byId('dyn-open-redirect').run(netCtx({}, '', handler));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings.length, 1);
  });

  it('passes when nothing redirects outside', async () => {
    const handler = async () => ({ status: 200, headers: new Headers(), body: '' });
    const out = await byId('dyn-open-redirect').run(netCtx({}, '', handler));
    assert.equal(out.status, 'pass');
  });
});