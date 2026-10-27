import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MARKERS,
  detectReply,
  parseReply,
  cleanPath,
  extractBlockContainer,
  extractFinalStatus,
  isSensitivePath,
  stripSensitiveTreeLines,
  buildFixReply,
} from '../renderer/researcher/assist/protocol.js';
import { resolveRequests } from '../renderer/researcher/assist/pathResolver.js';
import { createOrchestrator } from '../renderer/researcher/assist/orchestratorCore.js';

// ---------------------------------------------------------------------------
// markers
// ---------------------------------------------------------------------------

test('detectReply: marker with decoration on the first line', () => {
  for (const first of ['*send-file-contents*', '**send-file-contents**', '`send-file-contents`', '*send-file-contents*:']) {
    const d = detectReply(first + '\nrenderer/a.js');
    assert.equal(d.marker, MARKERS.SEND_FILE_CONTENTS, first);
    assert.equal(d.offFirstLine, false);
  }
});

test('detectReply: marker quoted mid-message is ignored', () => {
  const text = 'Sure.\nLet me explain.\nI will think about it.\nWhen done I use *output-results* here.\n*send-file-contents*';
  assert.equal(detectReply(text), null);
});

test('detectReply: marker on the second line is accepted with a flag', () => {
  const d = detectReply('Okay, I need more context.\n*provide-codebase*');
  assert.equal(d.marker, MARKERS.PROVIDE_CODEBASE);
  assert.equal(d.offFirstLine, true);
});

test('detectReply: blocks without a marker are treated as output-results', () => {
  const d = detectReply('a/b.js\n<<<START\nx\n<<<END\n');
  assert.equal(d.marker, MARKERS.OUTPUT_RESULTS);
  assert.equal(d.implied, true);
});

test('detectReply: plain prose and empty text give null', () => {
  assert.equal(detectReply('Hello there, how are you?'), null);
  assert.equal(detectReply('   \n  '), null);
});

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------

test('cleanPath: decorations, notes, brackets and backslashes', () => {
  assert.equal(cleanPath('- `renderer/researcher/index.js`'), 'renderer/researcher/index.js');
  assert.equal(cleanPath('2. ipc/researcher_ipc.js - the main handler'), 'ipc/researcher_ipc.js');
  assert.equal(cleanPath('app/api/admin/orders/[row]/route.ts'), 'app/api/admin/orders/[row]/route.ts');
  assert.equal(cleanPath('Code\\renderer\\state.js'), 'Code/renderer/state.js');
  assert.equal(cleanPath('./package.json,'), 'package.json');
  assert.equal(cleanPath('_app.tsx'), '_app.tsx');
  assert.equal(cleanPath('Thanks.'), null);
  assert.equal(cleanPath('Here are the files I need:'), null);
  assert.equal(cleanPath('```'), null);
  assert.equal(cleanPath('https://example.com/a.js'), null);
});

test('parseReply: send-file-contents with a messy list', () => {
  const reply = [
    '*send-file-contents*',
    '',
    '- `renderer/researcher/index.js`',
    '2. ipc/researcher_ipc.js - the main handler',
    '```',
    'app/api/admin/orders/[row]/route.ts',
    'Thanks.',
    'renderer/researcher/index.js',
    'Code\\renderer\\state.js',
    '```',
  ].join('\n');
  const p = parseReply(reply);
  assert.deepEqual(p.paths, [
    'renderer/researcher/index.js',
    'ipc/researcher_ipc.js',
    'app/api/admin/orders/[row]/route.ts',
    'Code/renderer/state.js',
  ]);
});

// ---------------------------------------------------------------------------
// code blocks
// ---------------------------------------------------------------------------

const OUTPUT_REPLY = [
  '*output-results*',
  '',
  'Updated the card and fixed margins.',
  '',
  '```text',
  'client/src/Card.vue',
  '<<<START',
  '<template>',
  '  <div>hi</div>',
  '</template>',
  '<<<END',
  '',
  'utils/calc.js (Replace: total)',
  '<<<START',
  'const doc = `',
  '```js',
  'nested fence',
  '```',
  '`;',
  'function total() { return 1; }',
  '<<<END',
  '```',
  '',
  'Run the migration first.',
  '*human-review-needed*',
  'php artisan migrate',
].join('\n');

test('extractBlockContainer: rebuilds a clean batch and keeps nested fences', () => {
  const p = parseReply(OUTPUT_REPLY);
  const c = p.container;
  assert.equal(c.blocks, 2);
  assert.equal(c.missingEnd, false);
  assert.ok(c.text.startsWith('client/src/Card.vue\n<<<START\n<template>'));
  assert.ok(c.text.includes('utils/calc.js (Replace: total)\n<<<START'));
  assert.ok(c.text.includes('```js\nnested fence\n```'));
  assert.ok(!c.text.includes('Run the migration'));
});

test('extractFinalStatus: status marker after the last block, with its note', () => {
  const p = parseReply(OUTPUT_REPLY);
  assert.equal(p.finalStatus.marker, MARKERS.HUMAN_REVIEW);
  assert.equal(p.finalStatus.note, 'php artisan migrate');
  assert.equal(extractFinalStatus('a\n<<<START\nx\n<<<END\n*done-ready-review*').marker, MARKERS.DONE);
});

test('extractBlockContainer: multiple containers, inline path, missing END', () => {
  const text = [
    '```text', 'a/one.js', '<<<START', '1', '<<<END', '```',
    'Some prose in between.',
    '```text', 'b/two.js <<<START', '2', '<<<END', '```',
    'c/three.js', '<<<START', '3',
  ].join('\n');
  const c = extractBlockContainer(text);
  assert.equal(c.blocks, 3);
  assert.equal(c.missingEnd, true);
  assert.ok(c.text.includes('a/one.js\n<<<START\n1\n<<<END'));
  assert.ok(c.text.includes('b/two.js\n<<<START\n2\n<<<END'));
  assert.ok(c.text.includes('c/three.js\n<<<START\n3'));
  assert.ok(!c.text.includes('prose'));
});

test('extractBlockContainer: no blocks gives null', () => {
  assert.equal(extractBlockContainer('just text\n```js\nx\n```'), null);
});

// ---------------------------------------------------------------------------
// sensitive files
// ---------------------------------------------------------------------------

test('isSensitivePath and tree filtering', () => {
  for (const p of ['credentials.json', 'Code/gmail-store.json', '.env', 'app/.env.local', 'keys/server.pem']) {
    assert.equal(isSensitivePath(p), true, p);
  }
  for (const p of ['.env.example', 'src/envelope.js', 'credentials/readme.md', 'main.js']) {
    assert.equal(isSensitivePath(p), false, p);
  }
  const tree = ['Code/', '\u251c\u2500 .docignore', '\u251c\u2500 credentials.json', '\u2502   \u2514\u2500 .env.local', '\u2514\u2500 main.js'].join('\n');
  const out = stripSensitiveTreeLines(tree);
  assert.equal(out.removed, 2);
  assert.ok(!out.text.includes('credentials'));
  assert.ok(out.text.includes('main.js'));
});

// ---------------------------------------------------------------------------
// resolver
// ---------------------------------------------------------------------------

const REPO = 'C:\\proj\\Code';
const abs = (rel) => REPO + '\\' + rel.replace(/\//g, '\\');
const FILES = [
  'renderer/researcher/index.js',
  'renderer/researcher/state.js',
  'renderer/codeswampUI/index.js',
  'ipc/researcher_ipc.js',
  'credentials.json',
  'app/api/orders/[row]/route.ts',
];
const FOLDERS = ['renderer', 'renderer/researcher', 'ipc'];
const FLAT = [
  ...FILES.map((rel) => ({ name: rel.split('/').pop(), displayPath: rel, path: abs(rel), type: 'file' })),
  ...FOLDERS.map((rel) => ({ name: rel.split('/').pop(), displayPath: rel, path: abs(rel), type: 'folder', children: [{}] })),
];

test('resolveRequests: exact, root-name prefix, dynamic segments, dedupe', () => {
  const r = resolveRequests(
    ['renderer/researcher/state.js', 'Code/ipc/researcher_ipc.js', 'app/api/orders/[row]/route.ts', 'renderer/researcher/state.js'],
    FLAT,
    { repoName: 'Code' }
  );
  assert.deepEqual(r.resolved.map((x) => x.display), [
    'renderer/researcher/state.js',
    'ipc/researcher_ipc.js',
    'app/api/orders/[row]/route.ts',
  ]);
  assert.equal(r.missing.length, 0);
});

test('resolveRequests: ambiguous bare name, folder, missing with suggestion, blocked', () => {
  const r = resolveRequests(
    ['index.js', 'renderer/researcher', 'renderer/researcher/stat.js', 'ipc/nothing/zzz.js', 'credentials.json'],
    FLAT,
    { repoName: 'Code' }
  );
  assert.equal(r.ambiguous.length, 1);
  assert.equal(r.ambiguous[0].candidates.length, 2);
  assert.equal(r.folders.length, 1);
  assert.deepEqual(r.folders[0].files, ['renderer/researcher/index.js', 'renderer/researcher/state.js']);
  assert.equal(r.missing.length, 2);
  assert.deepEqual(r.missing[0].suggestions, ['renderer/researcher/state.js']);
  assert.deepEqual(r.missing[1].suggestions, []);
  assert.equal(r.blocked.length, 1);
  assert.equal(r.resolved.length, 0);
});

test('resolveRequests: a wrong folder never auto-picks a same-named file elsewhere', () => {
  const r = resolveRequests(['renderer/nope/index.js'], FLAT, { repoName: 'Code' });
  assert.equal(r.resolved.length, 0);
  assert.equal(r.missing.length, 1);
  assert.ok(r.missing[0].suggestions.length > 0);
});

// ---------------------------------------------------------------------------
// orchestrator flows (mocked deps)
// ---------------------------------------------------------------------------

function makeDeps(overrides = {}) {
  const calls = [];
  const deps = {
    calls,
    getRepoPath: () => REPO,
    getFlatList: () => FLAT,
    tempFile: async (name) => '/tmp/' + name,
    generate: async (type, repo, items) => {
      calls.push({ type, items });
      if (type === 'structure') {
        return { success: true, content: 'Code/\n\u251c\u2500 main.js\n\u251c\u2500 credentials.json\n\u2514\u2500 renderer/\n' };
      }
      const content = items
        .filter((p) => !/ignored/.test(p))
        .map((p) => '\n// ===== File: ' + p.slice(REPO.length + 1) + ' =====\nconsole.log(1)\n')
        .join('');
      return { success: true, content };
    },
    parseContentBlocks: (raw) => {
      const lines = raw.split('\n');
      const entries = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] !== '<<<START') continue;
        const header = lines[i - 1];
        const m = header.match(/^(\S+)(?: \((\w+): (.+)\))?$/);
        const body = [];
        let j = i + 1;
        while (j < lines.length && lines[j] !== '<<<END') body.push(lines[j++]);
        entries.push({ relPath: m[1], mode: m[2] ? 'update' : 'full', target: m[3] || null, content: body.join('\n') });
      }
      return entries;
    },
    previewContent: async (repo, entries) => ({
      details: entries.map((e) => ({
        original: e.relPath,
        resolved: e.relPath,
        exists: true,
        mode: e.mode,
        target: e.target,
        warning: null,
        invalid: false,
        repairs: [],
        candidates: [''],
        ambiguous: false,
      })),
    }),
    ...overrides,
  };
  return deps;
}

test('flow provide-codebase: tree reply without sensitive files', async () => {
  const o = createOrchestrator(makeDeps());
  const steps = [];
  const r = await o.handleReply('*provide-codebase*', { onStep: (s) => steps.push(s) });
  assert.equal(r.status, 'ready');
  assert.ok(r.replyText.includes('main.js'));
  assert.ok(!r.replyText.includes('credentials.json'));
  assert.ok(steps.length >= 4);
  assert.ok(r.steps.every((s) => s.state === 'done'));
  assert.equal(r.round, 1);
});

test('flow send-file-contents: found, missing, blocked, docignored, repeats', async () => {
  const deps = makeDeps();
  const o = createOrchestrator(deps);
  const reply = '*send-file-contents*\nrenderer/researcher/index.js\nipc/researcher_ipc.js\ncredentials.json\nrenderer/researcher/stat.js\n';
  const r = await o.handleReply(reply);
  assert.equal(r.status, 'warning');
  assert.ok(r.replyText.includes('// ===== File: renderer\\researcher\\index.js ====='));
  assert.ok(r.replyText.includes('Not available: credentials.json (sensitive file)'));
  assert.ok(r.replyText.includes('Not found: renderer/researcher/stat.js (did you mean renderer/researcher/state.js?)'));
  assert.ok(!r.replyText.includes('gmail'));
  assert.equal(deps.calls.filter((c) => c.type === 'code')[0].items.length, 2);
  assert.equal(o.getSession().sentCount, 2);

  const again = await o.handleReply('*send-file-contents*\nrenderer/researcher/index.js');
  assert.ok(again.replyText.includes('Sent before, fresh copy attached: renderer/researcher/index.js (round 1)'));
  assert.equal(o.getSession().round, 2);
});

test('flow send-file-contents: no paths and tree not loaded', async () => {
  const o = createOrchestrator(makeDeps());
  const none = await o.handleReply('*send-file-contents*\nPlease give me everything.');
  assert.equal(none.status, 'error');
  assert.ok(none.replyText.includes('could not read any file paths'));

  const o2 = createOrchestrator(makeDeps({ getFlatList: () => [] }));
  const empty = await o2.handleReply('*send-file-contents*\nipc/a.js');
  assert.equal(empty.status, 'error');
  assert.ok(empty.lines[0].text.includes('No files loaded'));
});

test('flow output-results: clean dry run keeps the batch for the seeder and reports final status', async () => {
  const o = createOrchestrator(makeDeps());
  const r = await o.handleReply(OUTPUT_REPLY);
  assert.equal(r.status, 'ready');
  assert.equal(r.replyText, '');
  assert.ok(r.seederText.includes('client/src/Card.vue\n<<<START'));
  assert.equal(r.finalStatus.marker, MARKERS.HUMAN_REVIEW);
  assert.ok(r.lines.some((l) => l.text.includes('human review needed')));
});

test('flow output-results: invalid and patch failures build a fix reply with current file attached', async () => {
  const deps = makeDeps({
    previewContent: async (repo, entries) => ({
      details: entries.map((e, i) => ({
        original: e.relPath,
        resolved: e.relPath,
        exists: true,
        mode: e.mode,
        target: e.target,
        warning: i === 0 ? 'syntax error - unexpected `}` at line 3' : i === 1 ? 'patch target "total" not found' : null,
        invalid: i === 0,
        repairs: [],
        candidates: [''],
        ambiguous: false,
      })),
    }),
  });
  const o = createOrchestrator(deps);
  const reply = [
    '*output-results*', 'a/one.js', '<<<START', 'x', '<<<END',
    'ipc/researcher_ipc.js (Replace: total)', '<<<START', 'y', '<<<END',
    'b/ok.js', '<<<START', 'z', '<<<END',
  ].join('\n');
  const r = await o.handleReply(reply);
  assert.equal(r.status, 'warning');
  assert.equal(r.issues.length, 2);
  assert.ok(r.replyText.includes('do NOT resend them: b/ok.js'));
  assert.ok(r.replyText.startsWith('The dry run of your last reply found problems:'));
  assert.ok(r.replyText.includes('1. a/one.js - syntax error'));
  assert.ok(r.replyText.includes('2. ipc/researcher_ipc.js - patch target "total" not found'));
  assert.ok(r.replyText.includes('Current content of the files whose patches failed:'));
  assert.ok(r.replyText.includes('// ===== File: ipc/researcher_ipc.js ====='));
});

test('flow output-results: no blocks asks Claude to resend in format', async () => {
  const o = createOrchestrator(makeDeps());
  const r = await o.handleReply('*output-results*\nHere is the change:\n```js\nconst a = 1;\n```');
  assert.equal(r.status, 'error');
  assert.equal(r.legacy, true);
  assert.ok(r.replyText.includes('found no <<<START / <<<END blocks'));
});

test('flow human-review / done: status only, no reply', async () => {
  const o = createOrchestrator(makeDeps());
  const review = await o.handleReply('*human-review-needed*\nRun php artisan migrate.');
  assert.equal(review.status, 'review');
  assert.equal(review.replyText, '');
  assert.equal(review.lines[0].text, 'Run php artisan migrate.');
  const done = await o.handleReply('*done-ready-review*');
  assert.equal(done.status, 'done');
});

test('flow: cancel stops before results and does not burn a round', async () => {
  const o = createOrchestrator(makeDeps());
  let cancelled = false;
  const r = await o.handleReply('*provide-codebase*', {
    onStep: () => {
      cancelled = true;
    },
    isCancelled: () => cancelled,
  });
  assert.equal(r.status, 'cancelled');
  assert.equal(o.getSession().round, 0);
});

test('flow: unknown text and helper errors', async () => {
  const o = createOrchestrator(makeDeps());
  assert.equal((await o.handleReply('just some text')).status, 'unknown');
  const bad = createOrchestrator(makeDeps({ getRepoPath: () => null }));
  const r = await bad.handleReply('*provide-codebase*');
  assert.equal(r.status, 'error');
  assert.ok(r.lines[0].text.includes('No repo selected'));
});

test('buildFixReply: lists issues, ok files and never starts with a marker', () => {
  const t = buildFixReply({ issues: [{ path: 'a.js', reason: 'bad' }], okPaths: ['b.js'] });
  assert.equal(detectReply(t), null);
  assert.ok(t.includes('do NOT resend them: b.js'));
});