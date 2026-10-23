import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let normalizeTarget, findTargetNode, collectFilesUnder, resolveTargets, selectPathsForMode, isFileNode;

before(async () => {
  const { loadSelectResolve } = await import('./helpers.mjs');
  const m = await loadSelectResolve();
  normalizeTarget = m.normalizeTarget;
  findTargetNode = m.findTargetNode;
  collectFilesUnder = m.collectFilesUnder;
  resolveTargets = m.resolveTargets;
  selectPathsForMode = m.selectPathsForMode;
  isFileNode = m.isFileNode;
});

const ROOT = 'C:/proj';

// Tree shaped like a Laravel + Vue repo, already flattened as the tree view does.
const flat = [
  { name: 'server', path: `${ROOT}/server`, displayPath: 'server', type: 'folder' },
  { name: 'app', path: `${ROOT}/server/app`, displayPath: 'server/app', type: 'folder' },
  { name: 'Resort.php', path: `${ROOT}/server/app/Models/Resort.php`, displayPath: 'server/app/Models/Resort.php', type: 'file' },
  { name: 'Models', path: `${ROOT}/server/app/Models`, displayPath: 'server/app/Models', type: 'folder' },
  { name: 'routes', path: `${ROOT}/server/routes`, displayPath: 'server/routes', type: 'folder' },
  { name: 'api.php', path: `${ROOT}/server/routes/api.php`, displayPath: 'server/routes/api.php', type: 'file' },
  { name: 'web.php', path: `${ROOT}/server/routes/web.php`, displayPath: 'server/routes/web.php', type: 'file' },
  { name: 'client', path: `${ROOT}/client`, displayPath: 'client', type: 'folder' },
  { name: 'src', path: `${ROOT}/client/src`, displayPath: 'client/src', type: 'folder' },
  { name: 'main.js', path: `${ROOT}/client/src/main.js`, displayPath: 'client/src/main.js', type: 'file' },
  { name: 'App.vue', path: `${ROOT}/client/src/App.vue`, displayPath: 'client/src/App.vue', type: 'file' },
];

describe('selectShortcuts — normalizeTarget', () => {
  it('trims and strips quotes', () => {
    assert.equal(normalizeTarget('  "backend"  '), 'backend');
    assert.equal(normalizeTarget("'client/src'"), 'client/src');
  });

  it('normalizes slashes and leading ./ or /', () => {
    assert.equal(normalizeTarget('client\\src'), 'client/src');
    assert.equal(normalizeTarget('./client/src'), 'client/src');
    assert.equal(normalizeTarget('/client/src/'), 'client/src');
  });

  it('keeps empty input empty', () => {
    assert.equal(normalizeTarget(''), '');
    assert.equal(normalizeTarget('   '), '');
    assert.equal(normalizeTarget(null), '');
  });
});

describe('selectShortcuts — isFileNode', () => {
  it('uses the type flag when present', () => {
    assert.equal(isFileNode({ type: 'file' }), true);
    assert.equal(isFileNode({ type: 'folder', children: [] }), false);
  });

  it('falls back to children presence', () => {
    assert.equal(isFileNode({ name: 'a', children: [] }), true);
    assert.equal(isFileNode({ name: 'a', children: [{ name: 'b' }] }), false);
    assert.equal(isFileNode(null), false);
  });
});

describe('selectShortcuts — findTargetNode', () => {
  it('matches an exact repo-relative folder path', () => {
    assert.equal(findTargetNode('server/routes', flat).path, `${ROOT}/server/routes`);
  });

  it('matches a root folder by relative path', () => {
    assert.equal(findTargetNode('client', flat).path, `${ROOT}/client`);
  });

  it('matches a path suffix', () => {
    assert.equal(findTargetNode('src', flat).path, `${ROOT}/client/src`);
    assert.equal(findTargetNode('routes', flat).path, `${ROOT}/server/routes`);
  });

  it('matches a bare file name, including suffix match', () => {
    assert.equal(findTargetNode('api.php', flat).path, `${ROOT}/server/routes/api.php`);
    assert.equal(findTargetNode('server/routes/web.php', flat).path, `${ROOT}/server/routes/web.php`);
  });

  it('prefers the exact path over a suffix match', () => {
    const tree = [
      { name: 'a', path: 'A/a', displayPath: 'a', type: 'folder' },
      { name: 'src', path: 'A/x/src', displayPath: 'x/src', type: 'folder' },
      { name: 'src', path: 'A/a/src', displayPath: 'a/src', type: 'folder' },
    ];
    assert.equal(findTargetNode('a/src', tree).path, 'A/a/src');
  });

  it('is case insensitive', () => {
    assert.equal(findTargetNode('SERVER/Routes', flat).path, `${ROOT}/server/routes`);
  });

  it('returns null for unknown targets', () => {
    assert.equal(findTargetNode('nope', flat), null);
    assert.equal(findTargetNode('', flat), null);
    assert.equal(findTargetNode('src', []), null);
  });
});

describe('selectShortcuts — collectFilesUnder', () => {
  it('collects every file below a folder', () => {
    const files = collectFilesUnder(findTargetNode('server/routes', flat), flat);
    assert.deepEqual(files, [`${ROOT}/server/routes/api.php`, `${ROOT}/server/routes/web.php`]);
  });

  it('collects nested files recursively', () => {
    const files = collectFilesUnder(findTargetNode('server', flat), flat);
    assert.ok(files.includes(`${ROOT}/server/app/Models/Resort.php`));
    assert.equal(files.length, 3);
  });

  it('returns the file itself for a file node', () => {
    assert.deepEqual(
      collectFilesUnder(findTargetNode('api.php', flat), flat),
      [`${ROOT}/server/routes/api.php`],
    );
  });

  it('is not fooled by sibling folders sharing a prefix', () => {
    const tree = [
      { name: 'src', path: 'R/src', displayPath: 'src', type: 'folder' },
      { name: 'src2', path: 'R/src2', displayPath: 'src2', type: 'folder' },
      { name: 'a.js', path: 'R/src2/a.js', displayPath: 'src2/a.js', type: 'file' },
      { name: 'b.js', path: 'R/src/b.js', displayPath: 'src/b.js', type: 'file' },
    ];
    assert.deepEqual(collectFilesUnder(tree[0], tree), ['R/src/b.js']);
  });
});

describe('selectShortcuts — resolveTargets (code mode)', () => {
  it('expands folders to their files', () => {
    const r = resolveTargets(['backend', 'server/routes'], flat, 'code');
    // "backend" does not exist in this tree, "server/routes" does
    assert.deepEqual(r.missing, ['backend']);
    assert.deepEqual(r.files, [`${ROOT}/server/routes/api.php`, `${ROOT}/server/routes/web.php`]);
    assert.deepEqual(r.folders, []);
  });

  it('mixes files and folders without duplicates', () => {
    const r = resolveTargets(['client/src', 'client/src/main.js'], flat, 'code');
    assert.deepEqual(r.files, [
      `${ROOT}/client/src/main.js`,
      `${ROOT}/client/src/App.vue`,
    ]);
  });

  it('keeps the user typed name in resolved entries', () => {
    const r = resolveTargets(['src'], flat, 'code');
    assert.equal(r.resolved[0].target, 'src');
    assert.equal(r.resolved[0].path, `${ROOT}/client/src`);
    assert.equal(r.resolved[0].count, 2);
  });

  it('ignores blank targets', () => {
    const r = resolveTargets(['', '   ', 'server/routes'], flat, 'code');
    assert.deepEqual(r.missing, []);
    assert.equal(r.files.length, 2);
  });
});

describe('selectShortcuts — resolveTargets (structure mode)', () => {
  it('returns the folder itself, not its files', () => {
    const r = resolveTargets(['server/routes'], flat, 'structure');
    assert.deepEqual(r.folders, [`${ROOT}/server/routes`]);
    assert.deepEqual(r.files, []);
  });

  it('still returns files that were targeted directly', () => {
    const r = resolveTargets(['server/routes/api.php'], flat, 'structure');
    assert.deepEqual(r.files, [`${ROOT}/server/routes/api.php`]);
    assert.deepEqual(r.folders, []);
  });

  it('supports a multi-root preset', () => {
    const r = resolveTargets(['server', 'client'], flat, 'structure');
    assert.deepEqual(r.folders, [`${ROOT}/server`, `${ROOT}/client`]);
  });

  it('selectPathsForMode picks the right bucket', () => {
    const r = resolveTargets(['server/routes'], flat, 'structure');
    assert.deepEqual(selectPathsForMode(r, 'structure'), [`${ROOT}/server/routes`]);
    assert.deepEqual(selectPathsForMode(resolveTargets(['server/routes'], flat, 'code'), 'code'), [
      `${ROOT}/server/routes/api.php`,
      `${ROOT}/server/routes/web.php`,
    ]);
  });
});
