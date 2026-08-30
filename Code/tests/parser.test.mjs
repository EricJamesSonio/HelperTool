import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixDir = path.join(__dirname, 'fixtures');

let parseInput, parseContentBlocks;
before(async () => {
  const { loadParsers } = await import('./helpers.mjs');
  const p = await loadParsers();
  parseInput = p.parseInput;
  parseContentBlocks = p.parseContentBlocks;
});

function fix(name) { return fs.readFileSync(path.join(fixDir, name), 'utf-8'); }

describe('K: Parser — AI_RULE.md format compliance', () => {
  it('K1: golden-path full block', () => {
    const e = parseContentBlocks(fix('parser-K1-full.txt'));
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'components/sheet-builder/SharePanel.tsx');
    assert.equal(e[0].mode, 'full');
    assert.ok(e[0].content.includes('SharePanel'));
  });

  it('K2: glued language token csscss', () => {
    const e = parseContentBlocks(fix('parser-K2-glued.txt'));
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'components/a/B.module.css');
    assert.ok(e[0].content.includes('.panel'));
  });

  it('K3: em-dash suffix stripped', () => {
    const e = parseContentBlocks(fix('parser-K3-emdash.txt'));
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'hooks/useFormConfig.ts');
    assert.ok(e[0].content.includes('Foo'));
  });

  it('K4: missing opening fence recovered (closing-only)', () => {
    const e = parseContentBlocks(fix('parser-K4-closing-only.txt'));
    assert.equal(e.length, 1);
    assert.equal(e[0].mode, 'update');
    assert.equal(e[0].target, 'calculateTotal');
    assert.ok(e[0].content.includes('calculateTotal'));
    assert.ok(!e[0].content.includes('php') || e[0].content.trim().startsWith('public'));
  });

  it('K4b: missing closing fence handled', () => {
    const e = parseContentBlocks(fix('parser-K4b-unclosed.txt'));
    assert.equal(e.length, 1);
    assert.ok(e[0].content.includes('export const x'));
  });

  it('K5: trailing prose dropped, code kept', () => {
    const e = parseContentBlocks(fix('parser-K5-prose.txt'));
    assert.equal(e.length, 1);
    assert.ok(e[0].content.includes('getUser'));
    assert.ok(!e[0].content.includes("That's the shape"));
  });

  it('K6: Next.js bracket paths', () => {
    const e = parseContentBlocks(fix('parser-K6-brackets.txt'));
    const paths = e.map(x=>x.relPath);
    assert.ok(paths.includes('app/api/admin/orders/[row]/route.ts'));
    assert.ok(paths.includes('app/[[...slug]]/page.tsx'));
    assert.ok(paths.includes('app/(admin)/layout.tsx'));
    for (const en of e) assert.ok(en.content.length>0);
  });

  it('K7: surgical aliases map correctly', () => {
    const e = parseContentBlocks(fix('parser-K7-aliases.txt'));
    // a Replace, b Update, c Add after, d Add (alias), e Add before, f Remove
    const byPath = Object.fromEntries(e.map(x=>[x.relPath, x]));
    assert.equal(byPath['a.ts'].mode, 'update');
    assert.equal(byPath['a.ts'].target, 'foo');
    assert.equal(byPath['b.ts'].mode, 'update');
    assert.equal(byPath['c.ts'].mode, 'addAfter');
    assert.equal(byPath['d.ts'].mode, 'addAfter'); // Add alias
    assert.equal(byPath['e.ts'].mode, 'addBefore');
    assert.equal(byPath['f.ts'].mode, 'remove');
    // case-insensitive UPDATE
    const up = parseContentBlocks('a.ts (UPDATE: foo)\n```ts\nx\n```');
    assert.equal(up[0].mode, 'update');
  });

  it('K8: (Partial) dropped entirely', () => {
    const e = parseContentBlocks(fix('parser-K8-partial.txt'));
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'a.ts');
    assert.ok(e[0].content.includes('keep'));
    assert.ok(!e.some(x=>x.content.includes('partial')));
  });

  it('K9: two full same path dedup last-wins', () => {
    const e = parseContentBlocks(fix('parser-K9-dedup.txt'));
    assert.equal(e.length, 1);
    assert.equal(e[0].relPath, 'a.ts');
    assert.equal(e[0].content.trim(), 'second');
  });

  it('K10: two surgical same path kept in order', () => {
    const e = parseContentBlocks(fix('parser-K10-surgical-order.txt'));
    assert.equal(e.length, 2);
    assert.equal(e[0].mode, 'addAfter');
    assert.ok(e[0].content.includes("import a"));
    assert.equal(e[1].mode, 'addAfter');
    assert.ok(e[1].content.includes("import b"));
  });

  it('K: combined batch literal smoke', () => {
    const e = parseContentBlocks(fix('combined-batch.txt'));
    // should have at least: sheet-builder full, calc replace, calc addafter, theme css, app.json json, [id] route, legacy remove, dup remove, userService full (partial skipped)
    const rels = e.map(x=>x.relPath);
    assert.ok(rels.includes('components/sheet-builder/SharePanel.tsx'));
    assert.ok(rels.includes('utils/calc.ts'));
    assert.ok(rels.includes('styles/theme.css'));
    assert.ok(rels.includes('config/app.json'));
    assert.ok(rels.includes('app/api/[id]/route.ts'));
    // Partial skipped
    assert.ok(!e.some(x=>x.content.includes('partialUser')));
  });
});
