import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTests } = require('../services/security/auditExtra3.js');

const helpers = {
  finding: (d) => Object.assign({ severity: 'medium', confidence: 'confirmed' }, d),
  outcome: (findings) => {
    if (!findings.length) return { status: 'pass', findings: [] };
    const allReview = findings.every((f) => f.confidence === 'review');
    return { status: allReview ? 'review' : 'fail', findings };
  },
  na: (reason) => ({ status: 'na', reason, findings: [] }),
  hasAny: (set, list) => list.some((n) => set.has(n)),
};

const tests = createTests(helpers);

function byId(id) {
  const found = tests.find((t) => t.id === id);
  assert.ok(found, 'missing test ' + id);
  return found;
}

function ctxOf(files, options = {}) {
  return {
    profile: {
      auth: { mechanism: options.mechanism || 'jwt', library: options.library || null },
      backend: { framework: options.backend || 'express' },
    },
    deps: { names: new Set(options.deps || []) },
    files: options.diskFiles || [],
    corpus: Object.entries(files).map(([rel, text]) => ({
      rel,
      lines: text.split(/\r?\n/),
      isTest: false,
    })),
  };
}

function dockerCtx(rel, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hsx-docker-'));
  const abs = path.join(dir, 'Dockerfile');
  fs.writeFileSync(abs, text);
  return ctxOf({}, { diskFiles: [{ abs, rel, size: text.length }] });
}

describe('docker-hardening', () => {
  it('is not applicable without a Dockerfile', async () => {
    const out = await byId('docker-hardening').run(ctxOf({}));
    assert.equal(out.status, 'na');
  });

  it('flags latest, remote ADD, secret ENV and root', async () => {
    const text = [
      'FROM node:latest',
      'ADD https://example.com/x.tgz /tmp/',
      'ENV API_TOKEN=abc123def',
      'RUN npm ci',
      'CMD ["node", "index.js"]',
    ].join('\n');
    const out = await byId('docker-hardening').run(dockerCtx('Dockerfile', text));
    assert.equal(out.status, 'fail');
    assert.ok(out.findings.some((f) => /not pinned/.test(f.title)));
    assert.ok(out.findings.some((f) => /ADD downloads/.test(f.title)));
    assert.ok(out.findings.some((f) => /ENV API_TOKEN/.test(f.title)));
    assert.ok(out.findings.some((f) => /runs as root/.test(f.title)));
  });

  it('never puts the secret value in the evidence', async () => {
    const out = await byId('docker-hardening').run(dockerCtx('Dockerfile', 'FROM node:20\nENV DB_PASSWORD=hunter2hunter2\nUSER node'));
    const item = out.findings.find((f) => /DB_PASSWORD/.test(f.title));
    assert.ok(item);
    assert.ok(!item.evidence.includes('hunter2'));
  });

  it('passes a pinned multi-stage image that ends as a normal user', async () => {
    const text = [
      'FROM node:20-alpine AS build',
      'RUN npm ci',
      'FROM node:20-alpine',
      'COPY --from=build /app /app',
      'USER node',
      'CMD ["node", "index.js"]',
    ].join('\n');
    const out = await byId('docker-hardening').run(dockerCtx('Dockerfile', text));
    assert.equal(out.status, 'pass');
  });

  it('does not treat a stage alias as an unpinned image', async () => {
    const text = ['FROM node:20-alpine AS base', 'USER node', 'FROM base', 'CMD ["node"]'].join('\n');
    const out = await byId('docker-hardening').run(dockerCtx('Dockerfile', text));
    assert.equal(out.status, 'pass');
  });

  it('skips the root check for development Dockerfiles', async () => {
    const out = await byId('docker-hardening').run(dockerCtx('Dockerfile.dev', 'FROM node:20-alpine\nCMD ["npm", "run", "dev"]'));
    assert.equal(out.status, 'pass');
  });
});

describe('github-actions', () => {
  const wf = '.github/workflows/ci.yml';

  it('is not applicable without workflows', async () => {
    const out = await byId('github-actions').run(ctxOf({ 'a.js': 'x' }));
    assert.equal(out.status, 'na');
  });

  it('flags a third-party action that is not pinned', async () => {
    const source = ['jobs:', '  build:', '    steps:', '      - uses: actions/checkout@v4', '      - uses: someone/deploy@v1'].join('\n');
    const out = await byId('github-actions').run(ctxOf({ [wf]: source }));
    assert.equal(out.findings.length, 1);
    assert.match(out.findings[0].title, /not pinned/);
  });

  it('accepts a SHA-pinned action', async () => {
    const source = '      - uses: someone/deploy@0123456789abcdef0123456789abcdef01234567';
    const out = await byId('github-actions').run(ctxOf({ [wf]: source }));
    assert.equal(out.status, 'pass');
  });

  it('flags write-all permissions', async () => {
    const out = await byId('github-actions').run(ctxOf({ [wf]: 'permissions: write-all' }));
    assert.equal(out.findings.length, 1);
  });

  it('flags pull_request_target with a PR head checkout', async () => {
    const source = [
      'on:',
      '  pull_request_target:',
      'jobs:',
      '  t:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '        with:',
      '          ref: ${{ github.event.pull_request.head.sha }}',
    ].join('\n');
    const out = await byId('github-actions').run(ctxOf({ [wf]: source }));
    assert.equal(out.status, 'fail');
    assert.equal(out.findings[0].severity, 'high');
  });

  it('flags untrusted text inside a run block', async () => {
    const source = ['    steps:', '      - run: |', '          echo "${{ github.event.pull_request.title }}"'].join('\n');
    const out = await byId('github-actions').run(ctxOf({ [wf]: source }));
    assert.equal(out.findings.length, 1);
    assert.equal(out.findings[0].severity, 'high');
  });

  it('flags a secret interpolated into run but not one in env', async () => {
    const source = [
      '    steps:',
      '      - run: ./deploy.sh ${{ secrets.TOKEN }}',
      '      - name: safe',
      '        env:',
      '          TOKEN: ${{ secrets.TOKEN }}',
      '        run: ./deploy.sh',
    ].join('\n');
    const out = await byId('github-actions').run(ctxOf({ [wf]: source }));
    assert.equal(out.findings.length, 1);
    assert.match(out.findings[0].title, /secret is interpolated/);
  });

  it('marks npm install for review and allows npm ci', async () => {
    const out = await byId('github-actions').run(ctxOf({ [wf]: ['      - run: npm install', '      - run: npm ci'].join('\n') }));
    assert.equal(out.status, 'review');
    assert.equal(out.findings.length, 1);
  });
});

describe('webhook-signature', () => {
  it('marks an unverified handler for review', async () => {
    const source = "app.post('/webhooks/stripe', (req, res) => { handle(req.body); res.sendStatus(200); });";
    const out = await byId('webhook-signature').run(ctxOf({ 'routes/stripe.js': source }));
    assert.equal(out.status, 'review');
  });

  it('passes a handler that verifies the signature', async () => {
    const source = [
      "app.post('/webhooks/stripe', (req, res) => {",
      "  const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);",
      '});',
    ].join('\n');
    const out = await byId('webhook-signature').run(ctxOf({ 'routes/stripe.js': source }));
    assert.equal(out.status, 'pass');
  });

  it('passes a handler that checks an HMAC', async () => {
    const source = [
      "router.post('/github/webhook', (req, res) => {",
      "  const sig = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');",
      '});',
    ].join('\n');
    const out = await byId('webhook-signature').run(ctxOf({ 'routes/gh.js': source }));
    assert.equal(out.status, 'pass');
  });

  it('ignores files with no webhook', async () => {
    const out = await byId('webhook-signature').run(ctxOf({ 'a.js': "app.post('/login', login);" }));
    assert.equal(out.status, 'pass');
  });
});

describe('upload-hardening', () => {
  it('flags multer without limits', async () => {
    const out = await byId('upload-hardening').run(ctxOf({ 'up.js': "const upload = multer({ dest: 'uploads/' });" }));
    assert.equal(out.status, 'fail');
    assert.ok(out.findings.some((f) => /size limit/.test(f.title)));
  });

  it('passes multer with limits and fileFilter', async () => {
    const source = ['const upload = multer({', '  storage,', '  limits: { fileSize: 1000 },', '  fileFilter,', '});'].join('\n');
    const out = await byId('upload-hardening').run(ctxOf({ 'up.js': source }));
    assert.equal(out.status, 'pass');
  });

  it('skips multer with a variable it cannot analyze', async () => {
    const out = await byId('upload-hardening').run(ctxOf({ 'up.js': 'const upload = multer(options);' }));
    assert.equal(out.status, 'pass');
  });

  it('marks a bare Nest FileInterceptor for review', async () => {
    const out = await byId('upload-hardening').run(ctxOf({ 'a.controller.ts': "@UseInterceptors(FileInterceptor('file'))" }));
    assert.equal(out.status, 'review');
  });

  it('marks originalname in a path for review', async () => {
    const out = await byId('upload-hardening').run(ctxOf({ 'up.js': 'const target = path.join(dir, file.originalname);' }));
    assert.equal(out.status, 'review');
  });

  it('accepts originalname passed through basename', async () => {
    const out = await byId('upload-hardening').run(ctxOf({ 'up.js': 'const target = path.join(dir, path.basename(file.originalname));' }));
    assert.equal(out.status, 'pass');
  });
});

describe('csrf-protection', () => {
  it('is not applicable for token-header auth', async () => {
    const out = await byId('csrf-protection').run(ctxOf({ 'a.js': 'x' }, { mechanism: 'jwt' }));
    assert.equal(out.status, 'na');
  });

  it('is not applicable for Laravel', async () => {
    const out = await byId('csrf-protection').run(ctxOf({ 'a.js': 'x' }, { mechanism: 'session-cookie', backend: 'laravel' }));
    assert.equal(out.status, 'na');
  });

  it('passes with a CSRF library', async () => {
    const out = await byId('csrf-protection').run(ctxOf({ 'a.js': 'x' }, { mechanism: 'session-cookie', deps: ['csrf-csrf'] }));
    assert.equal(out.status, 'pass');
  });

  it('passes with a built-in auth library', async () => {
    const out = await byId('csrf-protection').run(ctxOf({ 'a.js': 'x' }, { mechanism: 'session-cookie', library: 'next-auth' }));
    assert.equal(out.status, 'pass');
  });

  it('reports low review with SameSite only', async () => {
    const out = await byId('csrf-protection').run(ctxOf({ 'a.js': "res.cookie('s', id, { sameSite: 'lax' });" }, { mechanism: 'session-cookie' }));
    assert.equal(out.status, 'review');
    assert.equal(out.findings[0].severity, 'low');
  });

  it('reports medium review with nothing in place', async () => {
    const out = await byId('csrf-protection').run(ctxOf({ 'a.js': "res.cookie('s', id);" }, { mechanism: 'session-cookie' }));
    assert.equal(out.status, 'review');
    assert.equal(out.findings[0].severity, 'medium');
  });
});