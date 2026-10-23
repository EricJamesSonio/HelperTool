import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadParsers, mkTmp, rmRf, read } from './helpers.mjs';

const require = createRequire(import.meta.url);
const fileSeeder = require('../utils/fileSeeder.js');

let parseContentBlocks;
before(async () => {
  const p = await loadParsers();
  parseContentBlocks = p.parseContentBlocks;
});

// A realistic Laravel + Vue paste in the explicit block format
const LARAVEL_VUE_PASTE = '```text\n' +
'Here are the files you asked for.\n' +
'\n' +
'server/app/Http/Controllers/ResortController.php\n' +
'<<<START\n' +
'<?php\n' +
'\n' +
'namespace App\\Http\\Controllers;\n' +
'\n' +
'use App\\Models\\Resort;\n' +
'use Illuminate\\Http\\Request;\n' +
'\n' +
'class ResortController extends Controller\n' +
'{\n' +
'    public function index(Request $request): JsonResponse\n' +
'    {\n' +
'        return Resort::query()->paginate();\n' +
'    }\n' +
'\n' +
'    public function calculateTotal(array $items): float\n' +
'    {\n' +
"        return array_sum(array_column($items, 'price'));\n" +
'    }\n' +
'}\n' +
'<<<END\n' +
'\n' +
'client/src/components/resort/ResortCard.vue\n' +
'<<<START\n' +
'<template>\n' +
'  <div class="resort-card">\n' +
'    <h2>{{ resort.name }}</h2>\n' +
'  </div>\n' +
'</template>\n' +
'\n' +
'<script setup>\n' +
"import { computed } from 'vue'\n" +
"import { usePublicResort } from '@/composables/useQuery/usePublicResort'\n" +
'\n' +
'const props = defineProps({ resort: { type: Object, required: true } })\n' +
'const name = computed(() => props.resort.name)\n' +
'</script>\n' +
'\n' +
'<style scoped>\n' +
'.resort-card {\n' +
'  padding: 16px;\n' +
'}\n' +
'</style>\n' +
'<<<END\n' +
'\n' +
'client/src/composables/useQuery/usePublicResort.js\n' +
'<<<START\n' +
"import { ref } from 'vue'\n" +
"import axios from '@/api/axios'\n" +
'\n' +
'export function usePublicResort(id) {\n' +
'  const resort = ref(null)\n' +
'  return { resort }\n' +
'}\n' +
'<<<END\n' +
'```\n';

describe('P: End-to-end — Laravel + Vue paste through the real seeder', () => {
  it('P1: parses into the right files', () => {
    const entries = parseContentBlocks(LARAVEL_VUE_PASTE);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].relPath, 'server/app/Http/Controllers/ResortController.php');
    assert.equal(entries[1].relPath, 'client/src/components/resort/ResortCard.vue');
    assert.equal(entries[2].relPath, 'client/src/composables/useQuery/usePublicResort.js');
    // the prose before the first block is not part of any file
    assert.ok(!entries.some(e => e.content.includes('Here are the files')));
  });

  it('P2: the seeded files are byte-exact on disk', async () => {
    const tmp = mkTmp();
    try {
      const entries = parseContentBlocks(LARAVEL_VUE_PASTE);
      const preview = await fileSeeder.previewContent(tmp, entries);
      assert.equal(preview.details.length, 3);
      for (const d of preview.details) {
        assert.equal(d.warning, null, `unexpected warning for ${d.resolved}: ${d.warning}`);
        assert.equal(d.parseWarning, null, `unexpected parse warning for ${d.resolved}: ${d.parseWarning}`);
      }
      const result = await fileSeeder.seedContent(tmp, entries);
      assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
      assert.equal(result.created.length, 3);

      const php = read(path.join(tmp, 'server/app/Http/Controllers/ResortController.php'));
      assert.ok(php.startsWith('<?php\n'), 'php tag first');
      assert.ok(php.includes('namespace App\\Http\\Controllers;'));
      assert.ok(php.includes('use App\\Models\\Resort;'));
      assert.ok(php.includes('class ResortController extends Controller'));
      assert.ok(php.includes('return array_sum(array_column($items, \'price\'));'));
      assert.ok(php.trimEnd().endsWith('}'));

      const vue = read(path.join(tmp, 'client/src/components/resort/ResortCard.vue'));
      assert.ok(vue.startsWith('<template>'));
      assert.ok(vue.includes('</template>'));
      assert.ok(vue.includes('<script setup>'));
      assert.ok(vue.includes('</script>'));
      assert.ok(vue.includes('<style scoped>'));
      assert.ok(vue.includes('</style>'));
      assert.ok(vue.includes("import { usePublicResort } from '@/composables/useQuery/usePublicResort'"));
    } finally { rmRf(tmp); }
  });

  it('P3: the seeded PHP and Vue files pass the syntax verifier', async () => {
    const tmp = mkTmp();
    try {
      const entries = parseContentBlocks(LARAVEL_VUE_PASTE);
      await fileSeeder.seedContent(tmp, entries);
      const { verifySyntax } = require('../utils/syntaxVerifier.js');
      const php = read(path.join(tmp, 'server/app/Http/Controllers/ResortController.php'));
      const vue = read(path.join(tmp, 'client/src/components/resort/ResortCard.vue'));
      assert.equal(await verifySyntax(php, 'php'), null, 'PHP should be valid');
      assert.equal(await verifySyntax(vue, 'vue'), null, 'Vue should be valid');
    } finally { rmRf(tmp); }
  });

  it('P4: a surgical batch against the seeded PHP file', async () => {
    const tmp = mkTmp();
    try {
      const entries = parseContentBlocks(LARAVEL_VUE_PASTE);
      await fileSeeder.seedContent(tmp, entries);

      const patch = parseContentBlocks(`server/app/Http/Controllers/ResortController.php (Replace: calculateTotal)
<<<START
public function calculateTotal(array $items): float
{
    return array_sum(array_column($items, 'price')) * 1.1;
}
<<<END`);
      assert.equal(patch.length, 1);
      assert.equal(patch[0].mode, 'update');
      assert.equal(patch[0].target, 'calculateTotal');

      const preview = await fileSeeder.previewContent(tmp, patch);
      assert.equal(preview.details[0].warning, null, 'preview warning: ' + preview.details[0].warning);

      const result = await fileSeeder.seedContent(tmp, patch);
      assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
      assert.equal(result.patched.length, 1);

      const php = read(path.join(tmp, 'server/app/Http/Controllers/ResortController.php'));
      assert.ok(php.includes("* 1.1"), 'patch applied');
      assert.ok(php.includes('namespace App\\Http\\Controllers;'), 'namespace kept');
      assert.ok(php.includes('use App\\Models\\Resort;'), 'imports kept');
      assert.ok(php.includes('public function index('), 'other methods kept');
      assert.ok(php.trimEnd().endsWith('}'), 'file still closed');

      const { verifySyntax } = require('../utils/syntaxVerifier.js');
      assert.equal(await verifySyntax(php, 'php'), null, 'patched PHP should still be valid');
    } finally { rmRf(tmp); }
  });

  it('P5: a surgical batch against the seeded Vue file', async () => {
    const tmp = mkTmp();
    try {
      const entries = parseContentBlocks(LARAVEL_VUE_PASTE);
      await fileSeeder.seedContent(tmp, entries);

      const patch = parseContentBlocks(`client/src/components/resort/ResortCard.vue (Replace: usePublicResort)
<<<START
import { usePublicResort } from '@/composables/useQuery/usePublicResortV2'
<<<END`);
      const result = await fileSeeder.seedContent(tmp, patch);
      assert.equal(result.errors.length, 0, JSON.stringify(result.errors));

      const vue = read(path.join(tmp, 'client/src/components/resort/ResortCard.vue'));
      assert.ok(vue.includes('usePublicResortV2'), 'patch applied');
      assert.ok(vue.includes('</script>'), 'script end tag kept');
      assert.ok(vue.includes('</style>'), 'style block kept');
      assert.ok(vue.includes('</template>'), 'template end tag kept');
    } finally { rmRf(tmp); }
  });

  it('P6: an unfenced legacy paste of the same PHP file is not truncated', async () => {
    const tmp = mkTmp();
    try {
      const raw = `server/app/Http/Controllers/ResortController.php
<?php

namespace App\\Http\\Controllers;

use App\\Models\\Resort;

class ResortController extends Controller
{
    public function index(): JsonResponse
    {
        return Resort::query()->paginate();
    }
}`;
      const entries = parseContentBlocks(raw);
      assert.equal(entries.length, 1);
      await fileSeeder.seedContent(tmp, entries);
      const php = read(path.join(tmp, 'server/app/Http/Controllers/ResortController.php'));
      assert.ok(php.includes('return Resort::query()->paginate();'), 'the class body survived');
    } finally { rmRf(tmp); }
  });
});

describe('P: bad LLM output is repaired or blocked', () => {
  const ONE_LINE_SFC = `<template><div class="confirm"><button @click="emit('confirm')">{{ label }}</button></div></template><script setup>import { computed } from 'vue' import BaseButton from './BaseButton.vue' const props = defineProps({ label: { type: String, default: 'OK' } }) const emit = defineEmits(['confirm']) const text = computed(() => props.label.trim()) function onClick() { if (!text.value) return; emit('confirm') } </script><style scoped>.confirm { display: flex; }</style>`;

  it('P7: preview repairs a one-line Vue SFC and seeds valid code', async () => {
    const tmp = mkTmp();
    try {
      const entries = [{ relPath: 'resources/js/Confirm.vue', content: ONE_LINE_SFC }];
      const preview = await fileSeeder.previewContent(tmp, entries);
      const d = preview.details[0];
      assert.equal(d.invalid, false);
      assert.deepEqual(d.repairs, ['single-line']);
      assert.equal(d.warning, null);

      const res = await fileSeeder.seedContent(tmp, [{
        relPath: entries[0].relPath,
        content: d.content,
        resolved: d.resolved,
      }]);
      assert.equal(res.errors.length, 0);
      const written = read(path.join(tmp, 'resources/js/Confirm.vue'));
      assert.ok(written.includes('\n<script setup>\n'), 'script tag on its own line');
      assert.ok(written.includes("import { computed } from 'vue'\n"), 'imports split');
    } finally { rmRf(tmp); }
  });

  it('P8: preview flags genuinely invalid content', async () => {
    const tmp = mkTmp();
    try {
      const entries = [{ relPath: 'src/broken.ts', content: 'export function broken( {\n  return 1;\n}' }];
      const preview = await fileSeeder.previewContent(tmp, entries);
      const d = preview.details[0];
      assert.equal(d.invalid, true);
      assert.match(d.warning, /syntax error/);
      assert.deepEqual(d.repairs, []);
    } finally { rmRf(tmp); }
  });

  it('P9: seedContent refuses invalid entries unless allowInvalid is set', async () => {
    const tmp = mkTmp();
    try {
      const bad = { relPath: 'src/broken.ts', content: 'export function broken( {\n  return 1;\n}' };
      const res = await fileSeeder.seedContent(tmp, [bad]);
      assert.equal(res.created.length, 0);
      assert.equal(res.errors.length, 1);
      assert.match(res.errors[0].warning, /skipped — invalid syntax/);
      assert.equal(fs.existsSync(path.join(tmp, 'src/broken.ts')), false);

      const forced = await fileSeeder.seedContent(tmp, [{ ...bad, allowInvalid: true }]);
      assert.equal(forced.errors.length, 0);
      assert.ok(fs.existsSync(path.join(tmp, 'src/broken.ts')));
    } finally { rmRf(tmp); }
  });

  it('P10: smart quotes are repaired before seeding', async () => {
    const tmp = mkTmp();
    try {
      const src = `<template><button @click="emit(\u2018confirm\u2019)">x</button></template>`;
      const entries = [{ relPath: 'src/Q.vue', content: src }];
      const preview = await fileSeeder.previewContent(tmp, entries);
      assert.deepEqual(preview.details[0].repairs, ['smart quotes']);
      await fileSeeder.seedContent(tmp, [{ relPath: 'src/Q.vue', content: preview.details[0].content }]);
      const written = read(path.join(tmp, 'src/Q.vue'));
      assert.match(written, /emit\('confirm'\)/);
      assert.ok(!/[\u2018\u2019\u201C\u201D]/.test(written));
    } finally { rmRf(tmp); }
  });
});
