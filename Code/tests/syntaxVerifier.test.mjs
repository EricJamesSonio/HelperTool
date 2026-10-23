import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { verifySyntax } = require('../utils/syntaxVerifier.js');

// verifySyntax(text, ext) -> null when clean, { ok:false, error, line, column } otherwise
async function expectFlagged(text, ext, msgMatch) {
  const result = await verifySyntax(text, ext);
  assert.ok(result, `expected "${ext}" input to be flagged, but it passed`);
  assert.equal(result.ok, false);
  if (msgMatch) assert.match(result.error, msgMatch);
  return result;
}

async function expectClean(text, ext) {
  const result = await verifySyntax(text, ext);
  assert.equal(result, null, `expected "${ext}" input to pass, got: ${result && result.error}`);
}

describe('syntaxVerifier — tree-sitter backed checks', () => {
  it('ts: missing closing brace is flagged', async () => {
    await expectFlagged(
      `export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
`,
      'ts',
      /brace|missing/i,
    );
  });

  it('ts: valid file produces no false positive', async () => {
    await expectClean(
      `import { taxRate } from './config';

export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * (1 + taxRate), 0);
}
`,
      'ts',
    );
  });

  it('ts: malformed export list is flagged', async () => {
    await expectFlagged(
      `export { calculateTotal, , formatCurrency };
`,
      'ts',
      /error|unexpected/i,
    );
  });

  it('tsx: unterminated function body is flagged', async () => {
    await expectFlagged(
      `export default function A() { return <div className="x">hi</div>; `,
      'tsx',
    );
  });

  it('tsx: valid JSX produces no false positive', async () => {
    await expectClean(
      `export default function A() { return <div className="x">hi</div>; }`,
      'tsx',
    );
  });

  it('css: missing closing brace is flagged', async () => {
    await expectFlagged(
      `.form {
  max-width: 480px;
`,
      'css',
      /brace|missing/i,
    );
  });

  it('css: valid file produces no false positive', async () => {
    await expectClean(
      `.form {
  max-width: 560px;
  margin: 0 auto;
}
`,
      'css',
    );
  });

  it('py: unmatched parenthesis is flagged', async () => {
    await expectFlagged(
      `def calculate_total(items:
    return sum(item.price for item in items)
`,
      'py',
    );
  });

  it('py: valid file produces no false positive', async () => {
    await expectClean(
      `def calculate_total(items):
    return sum(item.price for item in items)
`,
      'py',
    );
  });

  it('html: unclosed tag is flagged', async () => {
    await expectFlagged(
      `<div class="panel">
  <span>total</span>
`,
      'html',
      /tag|unclosed/i,
    );
  });

  it('json: trailing comma is flagged', async () => {
    await expectFlagged(
      `{
  "name": "helper-tool",
}`,
      'json',
      /invalid json/i,
    );
  });

  it('json: valid file produces no false positive', async () => {
    await expectClean(
      `{
  "name": "helper-tool",
  "version": "1.0.2"
}
`,
      'json',
    );
  });

  it('go: unmatched brace falls back to the bracket check', async () => {
    await expectFlagged(
      `func CalculateTotal(items []Item) float64 {
    total := 0.0
    for _, item := range items {
        total += item.Price
    }
    return total
`,
      'go',
    );
  });
});

describe('syntaxVerifier — PHP specific rules', () => {
  it('php: missing opening tag is flagged', async () => {
    await expectFlagged(
      `class Resort extends Model
{
}
`,
      'php',
      /<\?php/,
    );
  });

  it('php: namespace must be the first statement', async () => {
    await expectFlagged(
      `<?php
use App\\Models\\Resort;

namespace App\\Http;
`,
      'php',
      /namespace/,
    );
  });

  it('php: namespace first is accepted', async () => {
    await expectClean(
      `<?php

namespace App\\Http;

use App\\Models\\Resort;

class ResortController extends Controller
{
}
`,
      'php',
    );
  });

  it('php: no namespace at all is accepted', async () => {
    await expectClean(
      `<?php

use App\\Models\\Resort;

class Resort
{
}
`,
      'php',
    );
  });

  it('php: missing brace is flagged', async () => {
    const r = await expectFlagged(
      `<?php
class Resort extends Model
{
    public function index(): string
    {
        return 'x';
`,
      'php',
    );
    assert.ok(/error|brace|missing|unexpected/i.test(r.error));
  });
});

describe('syntaxVerifier — Vue specific rules', () => {
  it('vue: valid SFC produces no false positive', async () => {
    await expectClean(
      `<template>
  <div class="wrap">
    <ResortCard v-for="r in resorts" :key="r.id" />
  </div>
</template>

<script setup>
import { ref } from 'vue'

const resorts = ref([])
</script>
`,
      'vue',
    );
  });

  it('vue: syntax error inside <script> is flagged', async () => {
    await expectFlagged(
      `<template>
  <div class="wrap">x</div>
</template>

<script setup>
const resorts = ;
</script>
`,
      'vue',
      /<script>/,
    );
  });

  it('vue: unclosed template tag is flagged', async () => {
    await expectFlagged(
      `<template>
  <div class="panel">
    <span>{{ total }}</span>
</template>
`,
      'vue',
      /tag|unclosed/i,
    );
  });
});
