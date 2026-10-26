import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadParsers } from './helpers.mjs';

let parseContentBlocks, hasExplicitBlocks;
before(async () => {
  const p = await loadParsers();
  parseContentBlocks = p.parseContentBlocks;
  hasExplicitBlocks = p.hasExplicitBlocks;
});

describe('L: Explicit block format (<<<START / <<<END)', () => {
  it('L1: PHP file is taken verbatim', () => {
    const raw = `server/app/Http/Controllers/ResortController.php
<<<START
<?php

namespace App\\Http\\Controllers;

use App\\Models\\Resort;
use Illuminate\\Http\\Request;

class ResortController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return Resort::query()->paginate();
    }
}
<<<END`;
    assert.equal(hasExplicitBlocks(raw), true);
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'server/app/Http/Controllers/ResortController.php');
    assert.equal(e[0].mode, 'full');
    assert.ok(e[0].content.startsWith('<?php'));
    assert.ok(e[0].content.includes('class ResortController extends Controller'));
    assert.ok(e[0].content.includes('return Resort::query()->paginate();'));
    assert.ok(e[0].content.endsWith('}'));
    assert.ok(!e[0].content.includes('<<<START'));
    assert.ok(!e[0].content.includes('<<<END'));
  });

  it('L2: Vue SFC is taken verbatim', () => {
    const raw = `client/src/components/resort/ResortCard.vue
<<<START
<template>
  <div class="card">
    <h2>{{ resort.name }}</h2>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePublicResort } from '@/composables/useQuery/usePublicResort'

const props = defineProps({ resort: Object })
</script>

<style scoped>
.card { padding: 16px; }
</style>
<<<END`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'client/src/components/resort/ResortCard.vue');
    assert.ok(e[0].content.includes('<template>'));
    assert.ok(e[0].content.includes('</template>'));
    assert.ok(e[0].content.includes('<script setup>'));
    assert.ok(e[0].content.includes('</script>'));
    assert.ok(e[0].content.includes('<style scoped>'));
    assert.ok(e[0].content.includes('</style>'));
  });

  it('L3: nested markdown fence survives inside a block', () => {
    const raw = `docs/README.md
<<<START
# Title

\`\`\`js
const a = 1;
\`\`\`

tail
<<<END`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.ok(e[0].content.includes('```js'));
    assert.ok(e[0].content.includes('const a = 1;'));
    assert.ok(e[0].content.includes('tail'));
  });

  it('L4: surgical verb on the path line is honoured', () => {
    const raw = `server/app/Utils/Haversine.php (Replace: distance)
<<<START
public static function distance($a, $b)
{
    return 1.0;
}
<<<END`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].mode, 'update');
    assert.equal(e[0].target, 'distance');
    assert.ok(e[0].content.includes('public static function distance'));
  });

  it('L5: missing END marker is reported as a warning', () => {
    const raw = `a/b.php
<<<START
<?php
class B {}`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'a/b.php');
    assert.ok(e[0].warning && /END marker/i.test(e[0].warning));
  });

  it('L6: explicit and legacy blocks can be mixed in one paste', () => {
    const raw = `legacy/old.ts
\`\`\`ts
export const old = 1;
\`\`\`

modern/new.php
<<<START
<?php
class New {}
<<<END`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 2);
    assert.equal(e[0].relPath, 'legacy/old.ts');
    assert.equal(e[0].content, 'export const old = 1;');
    assert.equal(e[1].relPath, 'modern/new.php');
    assert.equal(e[1].content, '<?php\nclass New {}');
  });

  it('L7: marker aliases are accepted', () => {
    for (const [start, end] of [
      ['<<<START', '<<<END'],
      ['[[START]]', '[[END]]'],
      ['===START===', '===END==='],
    ]) {
      const raw = `app/x.ts\n${start}\nconst a = 1;\n${end}`;
      const e = parseContentBlocks(raw);
      assert.equal(e.length, 1, `alias ${start} should parse`);
      assert.equal(e[0].relPath, 'app/x.ts');
      assert.equal(e[0].content, 'const a = 1;');
    }
  });

  it('L7b: prose-like aliases only work next to a primary marker', () => {
    // "--- START ---" and "<!-- START -->" can legitimately appear in prose,
    // so on their own they must not switch the parser into explicit mode.
    const raw = `app/x.ts\n--- START ---\nconst a = 1;\n--- END ---`;
    assert.equal(hasExplicitBlocks(raw), false);
    // ...but they work as delimiters once a primary marker is present
    const raw2 = `app/x.ts\n<<<START\nconst a = 1;\n--- END ---`;
    const e = parseContentBlocks(raw2);
    assert.equal(e.length, 1);
    assert.equal(e[0].content, 'const a = 1;');
  });

  it('L8: a paste without markers is NOT treated as explicit', () => {
    const raw = `app/x.ts\n\`\`\`ts\nconst a = 1;\n\`\`\``;
    assert.equal(hasExplicitBlocks(raw), false);
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].content, 'const a = 1;');
  });

  it('L9: a marker inside a fenced legacy block does not switch modes', () => {
    const raw = `app/x.ts
\`\`\`ts
// <<<START is not a marker here
const a = 1;
\`\`\``;
    assert.equal(hasExplicitBlocks(raw), false);
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'app/x.ts');
  });

  it('L10: two blocks for the same path — last one wins', () => {
    const raw = `a/b.ts
<<<START
first
<<<END
a/b.ts
<<<START
second
<<<END`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].content, 'second');
  });

  it('L11: (Partial) is dropped in explicit mode too', () => {
    const raw = `a/b.ts (Partial)
<<<START
should be ignored
<<<END`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 0);
  });
});

describe('L2: One code container for the whole batch', () => {
  it('L2-1: the whole batch inside a single fenced container', () => {
    const raw = '```text\n' +
      'client/src/composables/useQuery/bookingMutations.js\n' +
      '<<<START\n' +
      "import { useMutation, useQueryClient } from '@tanstack/vue-query'\n" +
      "import { createOptimisticCallbacks } from './optimistic'\n" +
      '<<<END\n' +
      '\n' +
      'client/src/views/owner/BookingDetail.vue\n' +
      '<<<START\n' +
      '<template>\n  <div class="wrap" />\n</template>\n' +
      '<<<END\n' +
      '```';
    assert.equal(hasExplicitBlocks(raw), true);
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 2);
    assert.equal(e[0].relPath, 'client/src/composables/useQuery/bookingMutations.js');
    assert.equal(e[0].content,
      "import { useMutation, useQueryClient } from '@tanstack/vue-query'\nimport { createOptimisticCallbacks } from './optimistic'");
    assert.equal(e[1].relPath, 'client/src/views/owner/BookingDetail.vue');
    assert.equal(e[1].content, '<template>\n  <div class="wrap" />\n</template>');
  });

  it('L2-2: a container without a language tag works too', () => {
    const raw = '```\n' +
      'server/app/Models/Resort.php\n' +
      '<<<START\n' +
      '<?php\n' +
      'class Resort {}\n' +
      '<<<END\n' +
      '```';
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'server/app/Models/Resort.php');
    assert.equal(e[0].content, '<?php\nclass Resort {}');
  });

  it('L2-3: prose around the container is not part of any file', () => {
    const raw = 'Here are the files:\n\n' +
      '```text\n' +
      'app/a.ts\n' +
      '<<<START\n' +
      'const a = 1;\n' +
      '<<<END\n' +
      '```\n\nThat is all.';
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'app/a.ts');
    assert.equal(e[0].content, 'const a = 1;');
    assert.ok(!e[0].content.includes('Here are the files'));
  });

  it('L2-4: a container with a surgical block inside', () => {
    const raw = '```text\n' +
      'server/app/Utils/Haversine.php (Replace: distance)\n' +
      '<<<START\n' +
      'public static function distance($a, $b)\n' +
      '{\n    return 1.0;\n' +
      '}\n' +
      '<<<END\n' +
      '```';
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].mode, 'update');
    assert.equal(e[0].target, 'distance');
    assert.ok(e[0].content.includes('public static function distance'));
  });

  it('L2-5: a legacy paste is NOT treated as a container', () => {
    const raw = 'app/a.ts\n```ts\nconst a = 1;\n```';
    assert.equal(hasExplicitBlocks(raw), false);
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].content, 'const a = 1;');
  });

  it('L2-6: prose that mentions the markers does not switch modes', () => {
    const raw = 'docs/readme.md\n```md\nUse <<<START and <<<END markers\n```';
    assert.equal(hasExplicitBlocks(raw), false);
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'docs/readme.md');
    assert.ok(e[0].content.includes('<<<START'));
  });

  it('L2-7: a README documenting the format falls back to the legacy parser', () => {
    const raw = 'docs/readme.md\n```md\n<<<START\nsome example\n<<<END\n```';
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'docs/readme.md');
    assert.ok(e[0].content.includes('some example'));
  });
});

describe('M: Parser fixes for PHP / Vue / extensions', () => {  it('M1: unfenced PHP is not truncated at the class declaration', () => {
    const raw = `server/app/Http/Controllers/ResortController.php
<?php

namespace App\\Http\\Controllers;

use App\\Models\\Resort;
use Illuminate\\Http\\Request;

class ResortController extends Controller
{
    public function index(Request $request)
    {
        return Resort::paginate();
    }
}`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.ok(e[0].content.includes('class ResortController extends Controller'));
    assert.ok(e[0].content.includes('return Resort::paginate();'));
    assert.ok(e[0].content.trim().endsWith('}'));
  });

  it('M2: unfenced PHP with a long interface declaration is not truncated', () => {
    const raw = `server/app/Contracts/ImageStorageInterface.php
<?php

namespace App\\Contracts;

interface ImageStorageInterface
{
    public function store(string $path): string;
}`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.ok(e[0].content.includes('interface ImageStorageInterface'));
    assert.ok(e[0].content.includes('public function store'));
  });

  it('M3: PHP use statements are never mistaken for a path', () => {
    const raw = `app/A.php
<?php
use App\\Models\\Resort;
use Illuminate\\Support\\Facades\\DB;

class A {}
`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'app/A.php');
    assert.ok(e[0].content.includes('use App\\Models\\Resort;'));
  });

  it('M4: real extensions are not mangled by the glued-lang fallback', () => {
    const raw = `app/F.cjs
\`\`\`js
const a = 1;
\`\`\`
app/F.jsonc
\`\`\`jsonc
{ "a": 1 }
\`\`\`
app/F.mts
\`\`\`ts
const b: number = 2;
\`\`\``;
    const e = parseContentBlocks(raw);
    const paths = e.map(x => x.relPath);
    assert.ok(paths.includes('app/F.cjs'), 'got: ' + JSON.stringify(paths));
    assert.ok(paths.includes('app/F.jsonc'), 'got: ' + JSON.stringify(paths));
    assert.ok(paths.includes('app/F.mts'), 'got: ' + JSON.stringify(paths));
  });

  it('M5: the glued csscss form still resolves to .css', () => {
    const raw = 'components/a/B.module.csscss\n```css\n.panel { color: red; }\n```';
    const e = parseContentBlocks(raw);
    assert.equal(e[0].relPath, 'components/a/B.module.css');
  });

  it('M6: blade templates are recognised', () => {
    const raw = `resources/views/resorts/index.blade.php
<<<START
@extends('layouts.app')

@section('content')
    <h1>Resorts</h1>
@endsection
<<<END`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'resources/views/resorts/index.blade.php');
    assert.ok(e[0].content.includes("@section('content')"));
  });

  it('M7: a nested fence with a longer outer fence keeps the inner block', () => {
    const raw = [
      'docs/guide.md',
      '````md',
      '# Title',
      '```js',
      'const a = 1;',
      '```',
      'tail',
      '````',
    ].join('\n');
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.ok(e[0].content.includes('```js'));
    assert.ok(e[0].content.includes('const a = 1;'));
    assert.ok(e[0].content.includes('tail'));
  });

  it('M8: a path-looking line inside an explicit block is not a new file', () => {
    const raw = `app/x.php
<<<START
<?php
\$path = 'storage/app/public/resorts';
include 'helpers/Foo.php';
<<<END`;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'app/x.php');
    assert.ok(e[0].content.includes("include 'helpers/Foo.php';"));
  });
});
describe('N: Config files and dot-folders', () => {
  it('N1: toml, ini, mako, dotfiles and dot-folders are accepted', () => {
    const paths = [
      '.gitignore',
      '.github/workflows/ci.yml',
      'backend/pyproject.toml',
      'backend/alembic.ini',
      'backend/.env.example',
      'backend/migrations/script.py.mako',
      'backend/Dockerfile',
      'frontend/tsconfig.node.json',
    ];
    const raw = paths.map(p => `${p}\n<<<START\nkey = 1\n<<<END`).join('\n\n');
    const e = parseContentBlocks(raw);
    assert.deepEqual(e.map(x => x.relPath), paths);
  });

  it('N2: path traversal is still rejected', () => {
    const raw = '../evil.toml\n<<<START\na = 1\n<<<END';
    assert.equal(parseContentBlocks(raw).length, 0);
  });

  it('N3: a CSS selector line is not mistaken for a dotfile', () => {
    const raw = 'app/a.css\n```css\n.panel {\n  color: red;\n}\n```';
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'app/a.css');
  });
});
