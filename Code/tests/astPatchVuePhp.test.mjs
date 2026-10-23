import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const astPatch = require('../utils/astPatch/index.js');
const grammarLoader = require('../utils/astPatch/grammarLoader.js');
import { mkTmp, rmRf, read } from './helpers.mjs';

const VUE_SFC = `<template>
  <div class="wrap">
    <ResortCard v-for="r in resorts" :key="r.id" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ResortCard from '@/components/resort/ResortCard.vue'

const resorts = ref([])

function calculateTotal(items) {
  return items.reduce((a, b) => a + b.price, 0)
}
</script>

<style scoped>
.wrap { padding: 20px; }
</style>
`;

const PHP_CLASS = `<?php

namespace App\\Http\\Controllers;

use App\\Models\\Resort;
use Illuminate\\Http\\Request;

class ResortController extends Controller
{
    public function index(): string
    {
        return 'index';
    }

    public function calculateTotal(array $items): float
    {
        return array_sum(array_column($items, 'price'));
    }

    public function oldMethod(): string
    {
        return 'remove me';
    }
}
`;

describe('N: Vue SFC surgical targeting', () => {
  before(async () => { await grammarLoader.ensureInit(); });

  it('N1: Replace a function inside <script> keeps the whole SFC intact', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'ResortCard.vue');
      fs.writeFileSync(file, VUE_SFC, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'calculateTotal',
        'function calculateTotal(items) {\n  return items.reduce((a, b) => a + b.price * 1.1, 0)\n}');
      assert.equal(r.ok, true);
      const out = read(file);
      assert.ok(out.includes('a + b.price * 1.1'), 'replacement applied');
      // the file must NOT have lost the closing tags
      assert.ok(out.includes('</script>'), 'script end tag kept');
      assert.ok(out.includes('<style scoped>'), 'style block kept');
      assert.ok(out.includes('</style>'), 'style end tag kept');
      assert.ok(out.includes('<template>'), 'template kept');
      assert.ok(!out.includes('return items.reduce((a, b) => a + b.price, 0)'), 'old body replaced');
    } finally { rmRf(tmp); }
  });

  it('N2: Replace a const inside <script> keeps the whole SFC intact', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'ResortCard.vue');
      fs.writeFileSync(file, VUE_SFC, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'resorts', 'const resorts = ref([])\nconst extra = 1');
      assert.equal(r.ok, true);
      const out = read(file);
      assert.ok(out.includes('const extra = 1'));
      assert.ok(out.includes('</script>'), 'script end tag kept');
      assert.ok(out.includes('</style>'), 'style end tag kept');
    } finally { rmRf(tmp); }
  });

  it('N3: Remove a function inside <script> keeps the whole SFC intact', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'ResortCard.vue');
      fs.writeFileSync(file, VUE_SFC, 'utf-8');
      const r = await astPatch.applyRemove(file, 'calculateTotal');
      assert.equal(r.ok, true);
      const out = read(file);
      assert.ok(!out.includes('calculateTotal'));
      assert.ok(out.includes('</script>'), 'script end tag kept');
      assert.ok(out.includes('</style>'), 'style end tag kept');
    } finally { rmRf(tmp); }
  });

  it('N4: Add after imports inserts INSIDE the <script> block', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'ResortCard.vue');
      fs.writeFileSync(file, VUE_SFC, 'utf-8');
      const r = await astPatch.applyAddAfter(file, 'imports', "import { computed } from 'vue'");
      assert.equal(r.ok, true);
      const out = read(file);
      assert.ok(out.startsWith('<template>'), 'the SFC must still start with <template>');
      const scriptStart = out.indexOf('<script setup>');
      const scriptEnd = out.indexOf('</script>');
      const inserted = out.indexOf("import { computed }");
      assert.ok(inserted > scriptStart && inserted < scriptEnd, 'import inserted inside <script>');
    } finally { rmRf(tmp); }
  });

  it('N5: a CSS rule inside <style> is targetable', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'ResortCard.vue');
      fs.writeFileSync(file, VUE_SFC, 'utf-8');
      const r = await astPatch.applyUpdate(file, '.wrap', '.wrap { padding: 40px; }');
      assert.equal(r.ok, true, 'reason: ' + r.reason);
      const out = read(file);
      assert.ok(out.includes('padding: 40px'));
      assert.ok(out.includes('</style>'), 'style end tag kept');
    } finally { rmRf(tmp); }
  });

  it('N6: an element by css class inside <template> is targetable', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'ResortCard.vue');
      fs.writeFileSync(file, VUE_SFC, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'wrap', '<div class="wrap other">');
      assert.equal(r.ok, true, 'reason: ' + r.reason);
      const out = read(file);
      assert.ok(out.includes('<div class="wrap other">'));
    } finally { rmRf(tmp); }
  });
});

describe('O: PHP surgical targeting', () => {
  before(async () => { await grammarLoader.ensureInit(); });

  it('O1: Replace a method keeps the namespace and the imports', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'ResortController.php');
      fs.writeFileSync(file, PHP_CLASS, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'calculateTotal',
        'public function calculateTotal(array $items): float\n    {\n        return array_sum(array_column($items, \'price\')) * 1.1;\n    }');
      assert.equal(r.ok, true, 'reason: ' + r.reason);
      const out = read(file);
      assert.ok(out.includes('* 1.1'));
      assert.ok(out.startsWith('<?php'), 'php tag kept');
      assert.ok(out.includes('namespace App\\Http\\Controllers;'), 'namespace kept');
      assert.ok(out.includes('use App\\Models\\Resort;'), 'imports kept');
      assert.ok(out.includes('public function index()'), 'other methods kept');
    } finally { rmRf(tmp); }
  });

  it('O2: a pasted method keeps the shape of the original (no double indent)', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'ResortController.php');
      fs.writeFileSync(file, PHP_CLASS, 'utf-8');
      // pasted exactly as it appears in the file (first line at column 0)
      const pasted = 'public function calculateTotal(array $items): float\n    {\n        return 42;\n    }';
      const r = await astPatch.applyUpdate(file, 'calculateTotal', pasted);
      assert.equal(r.ok, true);
      const out = read(file);
      assert.ok(
        out.includes('    public function calculateTotal(array $items): float\n    {\n        return 42;\n    }'),
        'indentation should match the original, got:\n' + out,
      );
    } finally { rmRf(tmp); }
  });

  it('O3: Add after imports inserts after the last use statement (never before the namespace)', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'ResortController.php');
      fs.writeFileSync(file, PHP_CLASS, 'utf-8');
      const r = await astPatch.applyAddAfter(file, 'imports', 'use Illuminate\\Support\\Facades\\DB;');
      assert.equal(r.ok, true, 'reason: ' + r.reason);
      const out = read(file);
      const ns = out.indexOf('namespace');
      const useModels = out.indexOf('use App\\Models\\Resort;');
      const useDb = out.indexOf('use Illuminate\\Support\\Facades\\DB;');
      const classStart = out.indexOf('class ResortController');
      assert.ok(ns < useModels, 'namespace first');
      assert.ok(useModels < useDb, 'new import after the existing imports');
      assert.ok(useDb < classStart, 'new import before the class');
    } finally { rmRf(tmp); }
  });

  it('O4: Remove a method leaves the rest of the class intact', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'ResortController.php');
      fs.writeFileSync(file, PHP_CLASS, 'utf-8');
      const r = await astPatch.applyRemove(file, 'oldMethod');
      assert.equal(r.ok, true, 'reason: ' + r.reason);
      const out = read(file);
      assert.ok(!out.includes('oldMethod'));
      assert.ok(!out.includes('remove me'));
      assert.ok(out.includes('calculateTotal'), 'other methods kept');
      assert.ok(out.includes('namespace App\\Http\\Controllers;'), 'namespace kept');
    } finally { rmRf(tmp); }
  });

  it('O5: a class constant is targetable', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'Klass.php');
      fs.writeFileSync(file, `<?php\n\nclass Klass\n{\n    const MAX = 10;\n\n    public function go(): int\n    {\n        return self::MAX;\n    }\n}\n`, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'MAX', 'const MAX = 20;');
      assert.equal(r.ok, true, 'reason: ' + r.reason);
      assert.ok(read(file).includes('const MAX = 20;'));
    } finally { rmRf(tmp); }
  });
});
