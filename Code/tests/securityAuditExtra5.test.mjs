import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTests } = require('../services/security/auditExtra5.js');

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

function netCtx(url, headers, status = 200) {
  return {
    profile: { frontend: { framework: 'unknown' }, backend: { framework: 'unknown' } },
    say: () => {},
    net: {
      base: new URL(url),
      root: { status, headers: new Headers(headers), body: '', setCookies: [] },
    },
  };
}

function staticCtx(files, options = {}) {
  const deps = options.deps || [];
  return {
    ctx: true,
    files: options.paths ? options.paths.map((rel) => ({ rel })) : [],
    deps: { names: new Set(deps), byRoot: [{ root: '.', rel: '', file: 'package.json', deps: new Set(deps) }] },
    corpus: Object.entries(files).map(([rel, text]) => ({ rel, lines: text.split(/\r?\n/), isTest: false })),
  };
}

describe('dyn-isolation-headers', () => {
  it('flags all three missing headers', async () => {
    const out = await byId('dyn-isolation-headers').run(netCtx('http://localhost:3000', {}));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings.length, 3);
  });

  it('passes when all are present', async () => {
    const headers = {
      'permissions-policy': 'camera=()',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
    };
    const out = await byId('dyn-isolation-headers').run(netCtx('http://localhost:3000', headers));
    assert.equal(out.status, 'pass');
  });
});

describe('dyn-trace', () => {
  const servers = [];

  function start(handler) {
    return new Promise((resolve) => {
      const server = http.createServer(handler);
      servers.push(server);
      server.listen(0, '127.0.0.1', () => resolve(server));
    });
  }

  after(() => {
    for (const server of servers) {
      server.close();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    }
  });

  it('flags a server that echoes the probe header', async () => {
    const server = await start((req, res) => {
      if (req.method === 'TRACE') {
        res.writeHead(200, { 'content-type': 'message/http' });
        res.end('TRACE / HTTP/1.1\r\nx-trace-probe: ' + req.headers['x-trace-probe']);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const out = await byId('dyn-trace').run(netCtx('http://127.0.0.1:' + server.address().port, {}));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings[0].severity, 'low');
  });

  it('passes a server that refuses TRACE', async () => {
    const server = await start((req, res) => {
      res.writeHead(405);
      res.end('no');
    });
    const out = await byId('dyn-trace').run(netCtx('http://127.0.0.1:' + server.address().port, {}));
    assert.equal(out.status, 'pass');
  });

  it('skips when the request cannot be sent', async () => {
    const out = await byId('dyn-trace').run(netCtx('http://127.0.0.1:1', {}));
    assert.equal(out.status, 'skip');
  });
});

describe('dyn-https', () => {
  it('is not applicable for a local http target', async () => {
    const out = await byId('dyn-https').run(netCtx('http://localhost:3000', {}));
    assert.equal(out.status, 'na');
  });

  it('marks a remote http target without a redirect for review', async () => {
    const out = await byId('dyn-https').run(netCtx('http://app.example.com', {}, 200));
    assert.equal(out.status, 'review');
    assert.equal(out.findings[0].severity, 'medium');
  });

  it('passes a remote http target that redirects to https', async () => {
    const out = await byId('dyn-https').run(netCtx('http://app.example.com', { location: 'https://app.example.com/' }, 301));
    assert.equal(out.status, 'pass');
  });

  it('flags a short HSTS max-age on https', async () => {
    const out = await byId('dyn-https').run(netCtx('https://app.example.com', { 'strict-transport-security': 'max-age=300' }));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings[0].severity, 'low');
  });

  it('passes a long HSTS max-age on https', async () => {
    const out = await byId('dyn-https').run(netCtx('https://app.example.com', { 'strict-transport-security': 'max-age=31536000; includeSubDomains' }));
    assert.equal(out.status, 'pass');
  });

  it('leaves a missing HSTS header to the headers check', async () => {
    const out = await byId('dyn-https').run(netCtx('https://app.example.com', {}));
    assert.equal(out.status, 'na');
  });
});

describe('graphql-hardening', () => {
  const server = ['@apollo/server'];

  it('is not applicable without a GraphQL server', async () => {
    const out = await byId('graphql-hardening').run(staticCtx({ 'a.ts': 'x' }, { deps: ['graphql'] }));
    assert.equal(out.status, 'na');
  });

  it('marks enabled introspection for review', async () => {
    const source = 'const s = new ApolloServer({ typeDefs, resolvers, introspection: true });';
    const out = await byId('graphql-hardening').run(staticCtx({ 'server.ts': source }, { deps: server.concat(['graphql-depth-limit']) }));
    assert.equal(out.status, 'review');
    assert.equal(out.findings[0].severity, 'medium');
  });

  it('suppresses introspection that is gated by NODE_ENV', async () => {
    const source = "const s = new ApolloServer({ introspection: process.env.NODE_ENV !== 'production' });";
    const out = await byId('graphql-hardening').run(staticCtx({ 'server.ts': source }, { deps: server.concat(['graphql-depth-limit']) }));
    assert.equal(out.status, 'pass');
  });

  it('suppresses a literal true that sits inside an environment check', async () => {
    const source = ["if (process.env.NODE_ENV === 'development') {", '  options.introspection = true;', '  options.playground = true;', '}'].join('\n');
    const out = await byId('graphql-hardening').run(staticCtx({ 'server.ts': source }, { deps: server.concat(['graphql-depth-limit']) }));
    assert.equal(out.status, 'pass');
  });

  it('flags a missing depth or complexity limiter as low review', async () => {
    const out = await byId('graphql-hardening').run(staticCtx({ 'server.ts': 'const s = new ApolloServer({ typeDefs });' }, { deps: server }));
    assert.equal(out.status, 'review');
    assert.equal(out.findings[0].severity, 'low');
  });

  it('accepts a limiter dependency', async () => {
    const out = await byId('graphql-hardening').run(staticCtx({ 'server.ts': 'const s = new ApolloServer({ typeDefs });' }, { deps: server.concat(['graphql-depth-limit']) }));
    assert.equal(out.status, 'pass');
  });

  it('accepts a limiter found in code', async () => {
    const source = 'const s = new ApolloServer({ typeDefs, validationRules: [depthLimit(7)] });';
    const out = await byId('graphql-hardening').run(staticCtx({ 'server.ts': source }, { deps: server }));
    assert.equal(out.status, 'pass');
  });
});

describe('automation-hygiene', () => {
  it('is not applicable without a .github folder', async () => {
    const out = await byId('automation-hygiene').run(staticCtx({}, { paths: ['package.json'] }));
    assert.equal(out.status, 'na');
  });

  it('flags missing update automation and missing scanning', async () => {
    const out = await byId('automation-hygiene').run(
      staticCtx({ '.github/workflows/ci.yml': 'name: ci' }, { paths: ['.github/workflows/ci.yml'] })
    );
    assert.equal(out.status, 'review');
    assert.equal(out.findings.length, 2);
  });

  it('passes with Dependabot and CodeQL', async () => {
    const out = await byId('automation-hygiene').run(
      staticCtx(
        { '.github/workflows/codeql.yml': '      - uses: github/codeql-action/init@v3' },
        { paths: ['.github/dependabot.yml', '.github/workflows/codeql.yml'] }
      )
    );
    assert.equal(out.status, 'pass');
  });

  it('accepts Renovate and Semgrep', async () => {
    const out = await byId('automation-hygiene').run(
      staticCtx(
        { '.github/workflows/scan.yml': '      - run: semgrep ci' },
        { paths: ['renovate.json', '.github/workflows/scan.yml'] }
      )
    );
    assert.equal(out.status, 'pass');
  });
});