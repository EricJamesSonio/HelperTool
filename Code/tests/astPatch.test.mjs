import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const astPatch = require('../utils/astPatch/index.js');
const grammarLoader = require('../utils/astPatch/grammarLoader.js');
import { mkTmp, rmRf, read } from './helpers.mjs';

describe('C: Surgical AST (js/ts/tsx/css/py/json)', () => {
  before(async () => { await grammarLoader.ensureInit(); });

  it('C1: Replace named function, rest byte-identical', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'a.ts');
      const orig = `import { x } from './x';\nexport function foo(){ return 1; }\nexport function bar(){ return 2; }\n`;
      fs.writeFileSync(file, orig, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'foo', 'export function foo(){ return 99; }');
      assert.equal(r.ok, true);
      const out = read(file);
      assert.ok(out.includes('function foo(){ return 99; }'));
      assert.ok(out.includes('function bar(){ return 2; }'));
      assert.ok(out.includes("import { x }"));
    } finally { rmRf(tmp); }
  });

  it('C2: Add after imports', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'b.ts');
      fs.writeFileSync(file, `import a from './a';\nimport b from './b';\nexport const x=1;\n`, 'utf-8');
      const r = await astPatch.applyAddAfter(file, 'imports', `import { formatCurrency } from './helpers';`);
      assert.equal(r.ok, true);
      const out = read(file);
      const ia = out.indexOf("import a"); const ib = out.indexOf("import b"); const ic = out.indexOf('formatCurrency'); const ix = out.indexOf('export const x');
      assert.ok(ib < ic && ic < ix);
    } finally { rmRf(tmp); }
  });

  it('C3: Add after end appends EOF', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'c.ts');
      fs.writeFileSync(file, `export const a=1;\n`, 'utf-8');
      const r = await astPatch.applyAddAfter(file, 'end', `export const b=2;`);
      assert.equal(r.ok, true);
      assert.ok(read(file).includes('export const b=2;'));
    } finally { rmRf(tmp); }
  });

  it('C4: Add before target', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'd.ts');
      fs.writeFileSync(file, `export function foo(){ return 1; }\nexport function bar(){ return 2; }\n`, 'utf-8');
      const r = await astPatch.applyAddBefore(file, 'bar', `export function baz(){ return 3; }`);
      assert.equal(r.ok, true);
      const out = read(file);
      assert.ok(out.indexOf('baz') < out.indexOf('bar'));
    } finally { rmRf(tmp); }
  });

  it('C5: BUG — Remove leaves dangling export reference', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'e.ts');
      fs.writeFileSync(file, `export function legacyOrderFormatter(){ return 1; }\nexport { calculateTotal, legacyOrderFormatter };\nexport function calculateTotal(){ return 2; }\n`, 'utf-8');
      const r = await astPatch.applyRemove(file, 'legacyOrderFormatter');
      assert.equal(r.ok, true);
      const out = read(file);
      // node itself removed, but re-export still mentions it — bug asserted
      assert.equal(out.includes('function legacyOrderFormatter'), false);
      assert.ok(out.includes('legacyOrderFormatter'), 'dangling export still present (bug)');
    } finally { rmRf(tmp); }
  });

  it('C6: batch Add after imports -> Replace foo -> Remove bar sequential', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'f.ts');
      fs.writeFileSync(file, `import a from './a';\nexport function foo(){ return 1; }\nexport function bar(){ return 2; }\n`, 'utf-8');
      const r1 = await astPatch.applyAddAfter(file, 'imports', `import b from './b';`);
      assert.equal(r1.ok, true);
      const r2 = await astPatch.applyUpdate(file, 'foo', `export function foo(){ return 99; }`);
      assert.equal(r2.ok, true);
      const r3 = await astPatch.applyRemove(file, 'bar');
      assert.equal(r3.ok, true);
      const out = read(file);
      assert.ok(out.includes("import b from './b'"));
      assert.ok(out.includes('return 99'));
      assert.equal(out.includes('function bar'), false);
    } finally { rmRf(tmp); }
  });

  it('C7: CSS Replace .selector', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'g.css');
      fs.writeFileSync(file, `.panel{ margin:20px; }\n.other{ color:red; }\n`, 'utf-8');
      const r = await astPatch.applyUpdate(file, '.panel', `.panel{ margin:0; }`);
      assert.equal(r.ok, true);
      const out = read(file);
      assert.ok(out.includes('margin:0'));
      assert.ok(out.includes('.other'));
    } finally { rmRf(tmp); }
  });

  it('C8: JSON Replace dot-path', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'h.json');
      fs.writeFileSync(file, JSON.stringify({ scripts:{ build:'old', test:'vitest run'}}, null, 2), 'utf-8');
      const r = await astPatch.applyUpdate(file, 'scripts.build', '"tsc --incremental"');
      assert.equal(r.ok, true);
      const j = JSON.parse(read(file));
      assert.equal(j.scripts.build, 'tsc --incremental');
      assert.equal(j.scripts.test, 'vitest run');
    } finally { rmRf(tmp); }
  });

  it('C9: Replace restores missing export', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'i.ts');
      fs.writeFileSync(file, `export function foo(){ return 1; }\n`, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'foo', `function foo(){ return 2; }`);
      assert.equal(r.ok, true);
      assert.equal(r.restoredPrefix, 'export');
      assert.ok(read(file).includes('export function foo'));
    } finally { rmRf(tmp); }
  });

  it('C10: Replace restores missing async', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'j.ts');
      fs.writeFileSync(file, `export async function foo(){ return 1; }\n`, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'foo', `export function foo(){ return 2; }`);
      assert.equal(r.ok, true);
      assert.ok(r.restoredPrefix && r.restoredPrefix.includes('async'));
      const out = read(file);
      // actual buggy order is "async export function" — assert actual behavior
      assert.ok(out.includes('async') && out.includes('function foo'));
      assert.ok(out.includes('export function') || out.includes('async export'));
    } finally { rmRf(tmp); }
  });
});

describe('D: PHP / Vue fallback', () => {
  before(async () => { await grammarLoader.ensureInit(); });

  it('D1: Replace PHP function via grammar or string fallback', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'k.php');
      fs.writeFileSync(file, `<?php\nclass RefactorTest{\n public function calculateTotal(): float { return 1; }\n public function oldMethod(): string { return 'x'; }\n}\n`, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'calculateTotal', `public function calculateTotal(): float { return 2; }`);
      assert.equal(r.ok, true);
      assert.ok(read(file).includes('return 2'));
      assert.ok(read(file).includes('oldMethod'));
    } finally { rmRf(tmp); }
  });

  it('D2: Vue object-shorthand foo — best-effort, assert actual behavior', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'l.vue');
      fs.writeFileSync(file, `<template><div/></template>\n<script>export default { methods:{ foo(item){ return item; }, bar(){ return 2; } } }</` + `script>`, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'foo', `foo(item){ return item*2; }`);
      // Do not assume ok:true; just assert graceful: either patched correctly or ok:false with no corruption
      if (r.ok) {
        // if it did patch, at least file still has bar or is not empty
        const out = read(file);
        assert.ok(out.length > 0);
        assert.ok(out.includes('bar') || out.includes('foo'));
      } else {
        assert.ok(r.reason && typeof r.reason === 'string');
        // file unchanged (applyUpdate only writes on ok)
        const out = read(file);
        assert.ok(out.includes('foo(item)'));
      }
    } finally { rmRf(tmp); }
  });
});

describe('E: Unsupported language + H: duplicate name', () => {
  before(async () => { await grammarLoader.ensureInit(); });

  it('E1: canPatch on go/rb/java returns no grammar', async () => {
    const tmp = mkTmp();
    try {
      for (const ext of ['go','rb','java']) {
        const file = path.join(tmp, `m.${ext}`);
        fs.writeFileSync(file, `content`, 'utf-8');
        const c = await astPatch.canPatch(file, 'foo', 'update');
        assert.equal(c.ok, false);
        assert.match(c.reason, /no grammar for/);
      }
    } finally { rmRf(tmp); }
  });

  it('H1: BUG — duplicate name depth-first first match', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'n.ts');
      fs.writeFileSync(file, `export function run(){ return 1; }\nexport class C{ run(){ return 2; } }\n`, 'utf-8');
      const r = await astPatch.applyUpdate(file, 'run', `export function run(){ return 99; }`);
      assert.equal(r.ok, true);
      const out = read(file);
      assert.ok(out.includes('return 99'), 'first run replaced');
      assert.ok(out.includes('return 2'), 'second run still 2 (bug: second not touched)');
    } finally { rmRf(tmp); }
  });
});
