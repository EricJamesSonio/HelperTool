import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  prepareContent,
  fixSmartQuotes,
  isCollapsed,
  rewrapJsStatements,
  rewrapVue,
  isJsFamily,
} = require('../utils/contentRepair.js');
const { verifySyntax } = require('../utils/syntaxVerifier.js');

// What an LLM returns when it collapses a whole SFC onto one line.
const ONE_LINE_SFC = `<template><div class="confirm"><button @click="emit('confirm')">{{ label }}</button></div></template><script setup>import { computed } from 'vue' import BaseButton from './BaseButton.vue' const props = defineProps({ label: { type: String, default: 'OK' } }) const emit = defineEmits(['confirm']) const text = computed(() => props.label.trim()) function onClick() { if (!text.value) return; emit('confirm') } </script><style scoped>.confirm { display: flex; }</style>`;

const MULTILINE_SFC = `<template>
  <div class="confirm">
    <button @click="emit('confirm')">{{ label }}</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import BaseButton from './BaseButton.vue'

const props = defineProps({ label: { type: String, default: 'OK' } })
const emit = defineEmits(['confirm'])
const text = computed(() => props.label.trim())

function onClick() {
  if (!text.value) return
  emit('confirm')
}
</script>

<style scoped>
.confirm { display: flex; }
</style>`;

describe('CR: content repair', () => {
  it('CR1: isCollapsed detects one-line blocks only', () => {
    assert.equal(isCollapsed(ONE_LINE_SFC), true);
    assert.equal(isCollapsed(MULTILINE_SFC), false);
    assert.equal(isCollapsed('   \n\n  '), false);
  });

  it('CR2: JS family covers js/ts/vue but not css/php', () => {
    for (const ext of ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', '.VUE']) {
      assert.equal(isJsFamily(ext), true, ext);
    }
    for (const ext of ['css', 'php', 'html', 'md']) {
      assert.equal(isJsFamily(ext), false, ext);
    }
  });

  it('CR3: fixSmartQuotes converts paired quotes only', () => {
    const src = `<button @click="emit(\u2018confirm\u2019)" title=\u201Cok\u201D>don\u2019t</button>`;
    const out = fixSmartQuotes(src);
    assert.equal(out.changed, true);
    assert.match(out.text, /emit\('confirm'\)/);
    assert.match(out.text, /title="ok"/);
    // Word-internal apostrophes have no opening pair and stay untouched.
    assert.match(out.text, /don\u2019t/);
    assert.equal(fixSmartQuotes('plain').changed, false);
    // A pair nested in an already-ASCII-quoted string is not rewritten.
    assert.equal(fixSmartQuotes('title="\u201Cok\u201D"').changed, false);
  });

  it('CR4: rewrapJsStatements breaks adjacent imports and statements', () => {
    const out = rewrapJsStatements("import a from 'x' import b from 'y' const c = 1; const d = 2;");
    const lines = out.split('\n');
    assert.equal(lines.length, 4);
    assert.match(lines[0], /^import a from 'x'$/);
    assert.match(lines[1], /^import b from 'y'$/);
    assert.match(lines[2], /^const c = 1;$/);
    assert.match(lines[3], /^const d = 2;$/);
  });

  it('CR5: rewrapJsStatements keeps strings, objects and blocks intact', () => {
    const out = rewrapJsStatements("const a = { b: 'c; d', e: `f } g` } const d = 1");
    const lines = out.split('\n');
    assert.equal(lines.length, 2);
    assert.equal(lines[0], "const a = { b: 'c; d', e: `f } g` }");
    assert.equal(lines[1], 'const d = 1');
  });

  it('CR6: rewrapVue only rewraps script bodies', () => {
    const out = rewrapVue(ONE_LINE_SFC);
    assert.ok(out.includes('\n<script setup>'));
    assert.ok(out.includes('\n</script>'));
    // template stays on a single line: no statement splitting inside markup
    assert.match(out, /<template><div class="confirm">/);
    assert.match(out, /const props = defineProps/);
    assert.ok(out.split('\n').length > 8);
  });

  it('CR7: a collapsed Vue SFC is repaired and verifies clean', async () => {
    const before = await verifySyntax(ONE_LINE_SFC, 'vue');
    assert.ok(before && !before.ok, 'sample must be broken to be a real regression');

    const res = await prepareContent(ONE_LINE_SFC, 'vue');
    assert.deepEqual(res.repairs, ['single-line']);
    assert.equal(res.error, null);
    assert.equal(await verifySyntax(res.text, 'vue'), null);
    assert.match(res.text, /^<template>/);
    assert.match(res.text, /\n<script setup>\nimport \{ computed \} from 'vue'\n/);
  });

  it('CR8: repair is idempotent and leaves multi-line files alone', async () => {
    const first = await prepareContent(ONE_LINE_SFC, 'vue');
    const second = await prepareContent(first.text, 'vue');
    assert.deepEqual(second.repairs, []);
    assert.equal(second.text, first.text);

    const clean = await prepareContent(MULTILINE_SFC, 'vue');
    assert.deepEqual(clean.repairs, []);
    assert.equal(clean.text, MULTILINE_SFC);
    assert.equal(clean.error, null);
  });

  it('CR9: smart quotes are fixed and reported', async () => {
    const src = `<template><button @click="emit(\u2018confirm\u2019)">x</button></template>`;
    const res = await prepareContent(src, 'vue');
    assert.deepEqual(res.repairs, ['smart quotes']);
    assert.equal(res.text, `<template><button @click="emit('confirm')">x</button></template>`);
    assert.equal(res.error, null);
  });

  it('CR10: genuinely broken code stays invalid (no fake repair)', async () => {
    const res = await prepareContent('function foo( {', 'js');
    assert.equal(res.repairs.length, 0);
    assert.ok(res.error && !res.error.ok);
  });

  it('CR11: valid one-liners are not reformatted', async () => {
    const src = 'const a = 1; const b = 2;';
    const res = await prepareContent(src, 'js');
    assert.deepEqual(res.repairs, []);
    assert.equal(res.text, src);
    assert.equal(res.error, null);
  });

  it('CR12: non-JS extensions are never rewrapped', async () => {
    const src = '<style>.a{color:red}</style>';
    const res = await prepareContent(src, 'css');
    assert.deepEqual(res.repairs, []);
    assert.equal(res.text, src);
  });

  it('CR13: PHP with smart quotes is fixed', async () => {
    const src = "<?php\nclass X { public function y() { return \u2018a\u2019; } }";
    const res = await prepareContent(src, 'php');
    assert.deepEqual(res.repairs, ['smart quotes']);
    assert.match(res.text, /return 'a';/);
  });
});
