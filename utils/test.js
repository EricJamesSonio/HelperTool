// syntaxVerifier.test.mjs
// Drop next to your existing globalSeeder.test.mjs. Uses node:test + assert (no extra deps).
// Adjust the import path below to wherever verifySyntax actually lives.

import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySyntax } from '../Code/utils/syntaxVerifier.js';

// Helper: expect a syntax error to be flagged, optionally check message/line
function expectFlagged(text, ext, msgMatch, lineExpected) {
  const result = verifySyntax(text, ext);
  assert.equal(result.ok, false, `expected "${ext}" input to be flagged, but it passed`);
  if (msgMatch) assert.match(result.message, msgMatch);
  if (lineExpected !== undefined) assert.equal(result.line, lineExpected);
}

// Helper: expect clean input to pass with no false positive
function expectClean(text, ext) {
  const result = verifySyntax(text, ext);
  assert.equal(result.ok, true, `expected "${ext}" input to pass, got: ${result.message}`);
}

// ---------------------------------------------------------------------------
// JS / TS — tree-sitter path
// ---------------------------------------------------------------------------

test('js: missing closing brace is flagged', () => {
  expectFlagged(
    `function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
`,
    'js',
    /brace|unexpected end|error/i
  );
});

test('js: duplicate import of same module is flagged', () => {
  expectFlagged(
    `import { formatCurrency } from './helpers';
import { formatCurrency } from './helpers';
export { formatCurrency };
`,
    'js',
    /duplicate import/i
  );
});

test('ts: unclosed string literal is flagged', () => {
  expectFlagged(
    `function greet(name: string) {
  return "hello, ${'${name}'};
}
`,
    'ts',
    /string|error/i
  );
});

test('js: valid file produces no false positive', () => {
  expectClean(
    `import { taxRate } from './config';

function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * (1 + taxRate), 0);
}

export { calculateTotal };
`,
    'js'
  );
});

// --- Regression cases from the Remove-verb bugs -----------------------------

test('REGRESSION (known gap): export referencing a removed identifier is NOT flagged (semantic, not syntax)', () => {
  // This mirrors Test 6's output: formatDate was removed but still exported.
  // Documenting current behavior intentionally — this is syntactically valid JS,
  // tree-sitter has no symbol table, so verifySyntax correctly reports ok:true here.
  // If/when a reference-integrity pass is added, flip this assertion.
  expectClean(
    `import { taxRate } from './config';

function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * (1 + taxRate), 0);
}

export { calculateTotal, formatDate, formatCurrency };
`,
    'js'
  );
});

test('REGRESSION: malformed export list from batch Remove (double comma) IS flagged', () => {
  // Mirrors Test 8's actual output.
  expectFlagged(
    `import { taxRate } from './config';

function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

export { calculateTotal, , formatCurrency };
`,
    'js',
    /error/i
  );
});

test('js: duplicate top-level const in same scope — check current behavior', () => {
  // tree-sitter's JS grammar is CFG-based, not scope-aware, so this is likely
  // NOT flagged by hasError()/isMissing() even though it's a real runtime SyntaxError
  // ("Identifier has already been declared"). This test documents whatever the
  // current behavior is — update the assertion once you decide if this needs
  // to be caught, e.g. via the fallback duplicate-import-style check extended
  // to top-level const/let/function names.
  const result = verifySyntax(
    `const CURRENCY_SYMBOL = "$";
const CURRENCY_SYMBOL = "USD";
`,
    'js'
  );
  console.log('duplicate-const result (informational, not asserted):', result);
});

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

test('css: missing closing brace is flagged', () => {
  expectFlagged(
    `.form {
  max-width: 480px;
  margin: 0 auto;
`,
    'css'
  );
});

test('css: missing colon in declaration is flagged', () => {
  expectFlagged(
    `.form {
  max-width 480px;
}
`,
    'css'
  );
});

test('css: valid file produces no false positive', () => {
  expectClean(
    `.form {
  max-width: 560px;
  margin: 0 auto;
  padding: 24px;
}
`,
    'css'
  );
});

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

test('py: unmatched parenthesis is flagged', () => {
  expectFlagged(
    `def calculate_total(items:
    return sum(item.price for item in items)
`,
    'py'
  );
});

test('py: valid file produces no false positive', () => {
  expectClean(
    `def calculate_total(items):
    return sum(item.price for item in items)
`,
    'py'
  );
});

// ---------------------------------------------------------------------------
// HTML — via grammarLoader html/htm mapping
// ---------------------------------------------------------------------------

test('html: unclosed tag is flagged', () => {
  expectFlagged(
    `<div class="panel">
  <span>total</span>
`,
    'html',
    /tag|unclosed/i
  );
});

test('html: mismatched closing tag is flagged', () => {
  expectFlagged(
    `<div class="panel">
  <span>total</div>
</span>`,
    'html',
    /tag|mismatch/i
  );
});

test('html: valid file produces no false positive', () => {
  expectClean(
    `<div class="panel">
  <span>total</span>
</div>
`,
    'html'
  );
});

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

test('json: trailing comma is flagged', () => {
  expectFlagged(
    `{
  "name": "helper-tool",
  "version": "1.0.2",
}
`,
    'json'
  );
});

test('json: missing colon is flagged', () => {
  expectFlagged(
    `{
  "name" "helper-tool"
}
`,
    'json'
  );
});

test('json: valid file produces no false positive', () => {
  expectClean(
    `{
  "name": "helper-tool",
  "version": "1.0.2"
}
`,
    'json'
  );
});

// ---------------------------------------------------------------------------
// PHP / Vue — string-fallback AST per your notes
// ---------------------------------------------------------------------------

test('php: missing semicolon is flagged', () => {
  expectFlagged(
    `<?php
function formatCurrency($amount) {
    return "$" . number_format($amount, 2)
}
`,
    'php'
  );
});

test('vue: unclosed template tag is flagged', () => {
  expectFlagged(
    `<template>
  <div class="panel">
    <span>{{ total }}</span>
</template>
`,
    'vue'
  );
});

// ---------------------------------------------------------------------------
// Unsupported language — fallbackCheck (bracket/string/etc, not tree-sitter)
// ---------------------------------------------------------------------------

test('go: unmatched brace triggers fallback bracket check', () => {
  expectFlagged(
    `func CalculateTotal(items []Item) float64 {
    total := 0.0
    for _, item := range items {
        total += item.Price
    }
    return total
`,
    'go'
  );
});

test('go: valid file passes fallback check', () => {
  expectClean(
    `func CalculateTotal(items []Item) float64 {
    total := 0.0
    for _, item := range items {
        total += item.Price
    }
    return total
}
`,
    'go'
  );
});

// ---------------------------------------------------------------------------
// previewContent / getPatchedPreview integration (surgical replay path)
// ---------------------------------------------------------------------------
// These assume fileSeeder.js exports the functions referenced in your notes.
// Skip/adjust if the export names differ.

test.skip('getPatchedPreview surfaces syntaxError for a broken surgical batch (integration — wire up fixture)', () => {
  // 1. Seed a temp file with the "current" calc.js content.
  // 2. Run the Test 8 batch (Add after: imports -> Replace: calculateTotal -> Remove: formatDate)
  //    through the real patch pipeline, not a hand-built string.
  // 3. Assert getPatchedPreview(...).syntaxError.message matches /error/i
  //    and .line points at the malformed export line.
  // This is the actual regression test for the bug — the unit tests above
  // only prove verifySyntax works on a string; this proves the pipeline
  // actually calls it on the *patched* result for batches, not just full overwrites.
});
