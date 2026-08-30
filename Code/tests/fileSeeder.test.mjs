import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fileSeeder = require('../utils/fileSeeder.js');
const astPatch = require('../utils/astPatch/index.js');
const grammarLoader = require('../utils/astPatch/grammarLoader.js');
import { mkTmp, rmRf, read } from './helpers.mjs';

before(async () => { await grammarLoader.ensureInit(); });

// A Structure
describe('A: Structure mode', () => {
  it('A1: preview on fresh tree all toCreate', () => {
    const tmp = mkTmp();
    try {
      const r = fileSeeder.preview(tmp, ['a.ts','b.ts','c/d.ts']);
      assert.deepEqual(r.toCreate.sort(), ['a.ts','b.ts','c/d.ts'].sort());
      assert.equal(r.toSkip.length, 0);
    } finally { rmRf(tmp); }
  });
  it('A2: preview where some exist', () => {
    const tmp = mkTmp();
    try {
      fs.writeFileSync(path.join(tmp,'a.ts'),'','utf-8');
      const r = fileSeeder.preview(tmp, ['a.ts','b.ts']);
      assert.ok(r.toSkip.includes('a.ts'));
      assert.ok(r.toCreate.includes('b.ts'));
    } finally { rmRf(tmp); }
  });
  it('A3: seed creates empty files', () => {
    const tmp = mkTmp();
    try {
      const r = fileSeeder.seed(tmp, ['x.ts','y/z.ts']);
      assert.equal(r.errors.length, 0);
      assert.ok(fs.existsSync(path.join(tmp,'x.ts')));
      assert.ok(fs.existsSync(path.join(tmp,'y/z.ts')));
      assert.equal(read(path.join(tmp,'x.ts')),'');
    } finally { rmRf(tmp); }
  });
});

// B Full content
describe('B: Full content mode', () => {
  it('B1: seedContent full new file created', async () => {
    const tmp = mkTmp();
    try {
      const r = await fileSeeder.seedContent(tmp, [{relPath:'new/file.ts', content:'hello', mode:'full'}]);
      assert.ok(r.created.includes('new/file.ts'));
      assert.equal(read(path.join(tmp,'new/file.ts')),'hello');
    } finally { rmRf(tmp); }
  });
  it('B2: seedContent full overwrite', async () => {
    const tmp = mkTmp();
    try {
      fs.mkdirSync(path.join(tmp,'a'),{recursive:true});
      fs.writeFileSync(path.join(tmp,'a/file.ts'),'old','utf-8');
      const r = await fileSeeder.seedContent(tmp, [{relPath:'a/file.ts', content:'new', mode:'full'}]);
      assert.ok(r.overwritten.includes('a/file.ts'));
      assert.equal(read(path.join(tmp,'a/file.ts')),'new');
    } finally { rmRf(tmp); }
  });
  it('B3: previewContent unbalanced braces warning', async () => {
    const tmp = mkTmp();
    try {
      const bad = 'function foo(){ return {'; // unbalanced {
      const p = await fileSeeder.previewContent(tmp, [{relPath:'a.ts', content:bad, mode:'full'}]);
      assert.ok(p.details[0].warning && p.details[0].warning.includes('unbalanced'));
      // short <10 not flagged (verifier guard) — isTruncated guard is <20
      const short = 'x'.repeat(5)+'{';
      const p2 = await fileSeeder.previewContent(tmp, [{relPath:'b.ts', content:short, mode:'full'}]);
      assert.equal(p2.details[0].warning, null);
      const balanced = 'function foo(){ return 1; }';
      const p3 = await fileSeeder.previewContent(tmp, [{relPath:'c.ts', content:balanced, mode:'full'}]);
      assert.equal(p3.details[0].warning, null);
      // close>open now flagged by syntaxVerifier (unexpected closing brace) — assert that behavior
      const extraClose = 'const x={a:1}};';
      const p4 = await fileSeeder.previewContent(tmp, [{relPath:'d.ts', content:extraClose, mode:'full'}]);
      assert.ok(p4.details[0].warning && p4.details[0].warning.includes('syntax error'));
    } finally { rmRf(tmp); }
  });
  it('B4: previewContent dangling ending warning', async () => {
    const tmp = mkTmp();
    try {
      for (const tail of [',',':','=','=>']) {
        const c = 'const x='.repeat(5) + 'a'.repeat(20) + tail;
        const d = (await fileSeeder.previewContent(tmp, [{relPath:'x.ts', content:c, mode:'full'}])).details[0];
        assert.ok(d.warning && d.warning.includes('ends with'), `tail ${tail} should warn`);
      }
      for (const tail of ['(','[','{']) {
        const c = 'const x='.repeat(5) + 'a'.repeat(20) + tail;
        const d = (await fileSeeder.previewContent(tmp, [{relPath:'x.ts', content:c, mode:'full'}])).details[0];
        assert.ok(d.warning && (d.warning.includes('ends with') || d.warning.includes('unbalanced') || d.warning.includes('syntax error')), `tail ${tail} should warn`);
      }
      const ok = (await fileSeeder.previewContent(tmp, [{relPath:'y.ts', content:'function foo(){return 1}', mode:'full'}])).details[0];
      assert.equal(ok.warning, null);
    } finally { rmRf(tmp); }
  });
  it('B5: full-mode syntax error flagged', async () => {
    const tmp = mkTmp();
    try {
      const bad = 'function foo(){ return {';
      const p = await fileSeeder.previewContent(tmp, [{relPath:'a.ts', content:bad, mode:'full'}]);
      assert.ok(p.details[0].warning && p.details[0].warning.includes('syntax error'));
    } finally { rmRf(tmp); }
  });
  it('B6: full-mode go/rb/java no grammar writes fine', async () => {
    const tmp = mkTmp();
    try {
      for (const ext of ['go','rb','java']) {
        const rel = `file.${ext}`;
        const p = await fileSeeder.previewContent(tmp, [{relPath:rel, content:'valid content, no check', mode:'full'}]);
        assert.equal(p.details[0].warning, null);
        const r = await fileSeeder.seedContent(tmp, [{relPath:rel, content:'hello', mode:'full'}]);
        assert.ok(r.created.includes(rel) || r.overwritten.includes(rel));
      }
    } finally { rmRf(tmp); }
  });
});

// G target-not-found + E2 via fileSeeder
describe('G/E: Target-not-found', () => {
  it('G1: surgical target not found on existing file skips not overwrite', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp,'a.ts');
      fs.writeFileSync(file,'export function foo(){ return 1; }\n','utf-8');
      const before = read(file);
      const r = await fileSeeder.seedContent(tmp, [{relPath:'a.ts', content:'function foo(){return 99}', mode:'update', target:'nonExistentXYZ', resolved:'a.ts'}]);
      assert.equal(r.patched.length, 0);
      assert.ok(r.errors.some(e=>e.warning && e.warning.includes('patch skipped')));
      assert.equal(read(file), before);
    } finally { rmRf(tmp); }
  });
  it('G2: Add after on non-existent file creates verbatim', async () => {
    const tmp = mkTmp();
    try {
      const r = await fileSeeder.seedContent(tmp, [{relPath:'new.ts', content:'import x from "./x";', mode:'addAfter', target:'imports', resolved:'new.ts'}]);
      assert.ok(r.patched.includes('new.ts') || r.created.includes('new.ts'));
      assert.equal(read(path.join(tmp,'new.ts')),'import x from "./x";');
    } finally { rmRf(tmp); }
  });
  it('G3: BUG — Replace on non-existent creates broken file (only node)', async () => {
    const tmp = mkTmp();
    try {
      const r = await fileSeeder.seedContent(tmp, [{relPath:'missing.ts', content:'function foo(){return 1}', mode:'update', target:'foo', resolved:'missing.ts'}]);
      assert.ok(r.errors.some(e=>e.warning && e.warning.includes('patch fallback')));
      assert.ok(r.created.includes('missing.ts'));
      const out = read(path.join(tmp,'missing.ts'));
      assert.equal(out, 'function foo(){return 1}');
      assert.ok(!out.includes('import') && out.length < 50);
    } finally { rmRf(tmp); }
  });
  it('G4: BUG — Remove on non-existent creates blank file', async () => {
    const tmp = mkTmp();
    try {
      const r = await fileSeeder.seedContent(tmp, [{relPath:'gone.ts', content:'', mode:'remove', target:'bar', resolved:'gone.ts'}]);
      assert.ok(r.errors.some(e=>e.warning && e.warning.includes('patch fallback')));
      assert.ok(r.created.includes('gone.ts'));
      assert.equal(read(path.join(tmp,'gone.ts')),'');
    } finally { rmRf(tmp); }
  });
  it('E2: surgical Replace on existing go skips not overwrite', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp,'a.go');
      fs.writeFileSync(file,'package main\nfunc foo(){}\n','utf-8');
      const before = read(file);
      const r = await fileSeeder.seedContent(tmp, [{relPath:'a.go', content:'func foo(){return}', mode:'update', target:'foo', resolved:'a.go'}]);
      assert.ok(r.errors.some(e=>e.warning && (e.warning.includes('no grammar') || e.warning.includes('not found'))));
      assert.equal(read(file), before);
      const c = await astPatch.canPatch(file,'foo','update');
      assert.match(c.reason, /no grammar/);
      const p = await fileSeeder.previewContent(tmp, [{relPath:'a.go', content:'x', mode:'update', target:'foo'}]);
      assert.ok(p.details[0].warning && p.details[0].warning.includes('no grammar'));
    } finally { rmRf(tmp); }
  });
});

// I Full+surgical reordering bug
describe('I: Full+surgical reordering bug', () => {
  it('I1: BUG — Full(v1) -> Surgical -> Full(v2) parser order merges v2 at v1 position', async () => {
    const { loadParsers } = await import('./helpers.mjs');
    const { parseContentBlocks } = await loadParsers();
    const raw = `a.ts\n\`\`\`ts\nfirst\n\`\`\`\na.ts (Add after: imports)\n\`\`\`ts\nimport b from './b';\n\`\`\`\na.ts\n\`\`\`ts\nsecond\n\`\`\``;
    const e = parseContentBlocks(raw);
    assert.equal(e.length, 2);
    assert.equal(e[0].relPath,'a.ts');
    assert.equal(e[0].mode,'full');
    assert.equal(e[0].content.trim(),'second');
    assert.equal(e[1].mode,'addAfter');
    assert.ok(e[1].content.includes('import b'));
  });
  it('I2: BUG — seedContent applies patch on top of v2', async () => {
    const tmp = mkTmp();
    try {
      const { loadParsers } = await import('./helpers.mjs');
      const { parseContentBlocks } = await loadParsers();
      const raw = `a.ts\n\`\`\`ts\nfirst\n\`\`\`\na.ts (Add after: imports)\n\`\`\`ts\nimport b from './b';\n\`\`\`\na.ts\n\`\`\`ts\nsecond\n\`\`\``;
      const entries = parseContentBlocks(raw).map(en=>({...en, resolved:en.relPath}));
      const r = await fileSeeder.seedContent(tmp, entries);
      // buggy order: second overwrites first, then addAfter adds import b on top of second
      const out = read(path.join(tmp,'a.ts'));
      assert.ok(out.includes('second'));
      assert.ok(out.includes("import b from './b'"));
    } finally { rmRf(tmp); }
  });
});

// J Anchoring
describe('J: Folder anchoring', () => {
  it('J1: BUG — ambiguous true even for single candidate', async () => {
    const tmp = mkTmp();
    try {
      const uniq = 'uniqCompX'+Date.now();
      fs.mkdirSync(path.join(tmp, uniq),{recursive:true});
      const cache=new Map();
      const res=fileSeeder.resolveRelPath(tmp, `${uniq}/file.ts`, cache);
      assert.ok(res.candidates.length>=2);
      assert.equal(res.ambiguous, true);
      assert.ok(res.resolved.includes(uniq));
    } finally { rmRf(tmp); }
  });
  it('J2: two components shallowest wins', async () => {
    const tmp = mkTmp();
    try {
      fs.mkdirSync(path.join(tmp,'src/components'),{recursive:true});
      fs.mkdirSync(path.join(tmp,'a/b/components'),{recursive:true});
      const cache=new Map();
      const res=fileSeeder.resolveRelPath(tmp,'components/Foo.tsx',cache);
      assert.ok(res.candidates.length>=3);
      assert.ok(res.resolved.startsWith('src/components'));
      assert.equal(res.ambiguous, true);
    } finally { rmRf(tmp); }
  });
  it('J3: no folder literal fallback', () => {
    const tmp = mkTmp();
    try {
      const cache=new Map();
      const res=fileSeeder.resolveRelPath(tmp,'nope/Foo.tsx',cache);
      assert.equal(res.resolved,'nope/Foo.tsx');
      assert.deepEqual(res.candidates,[]);
      assert.equal(res.ambiguous,false);
    } finally { rmRf(tmp); }
  });
  it('J4: .github not anchored literal', async () => {
    const tmp = mkTmp();
    try {
      fs.mkdirSync(path.join(tmp,'.github/workflows'),{recursive:true});
      assert.equal(fileSeeder.findCandidates(tmp,'.github').length,0);
      const p=await fileSeeder.previewContent(tmp,[{relPath:'.github/workflows/ci.yml', content:'yaml', mode:'full'}]);
      const d=p.details[0];
      assert.equal(d.resolved,'.github/workflows/ci.yml');
      assert.equal(d.ambiguous,false);
    } finally { rmRf(tmp); }
  });
  it('J5: BUG — 12-cap unsorted early return', () => {
    const tmp = mkTmp();
    try {
      // create 13 distinct parents each with a "components" subfolder
      for(let i=0;i<13;i++){
        const name=`p${String(i).padStart(2,'0')}`;
        fs.mkdirSync(path.join(tmp,name,'components'),{recursive:true});
      }
      const cands=fileSeeder.findCandidates(tmp,'components');
      assert.equal(cands.length, 12);
      // unsorted bug: early return bypasses shallowest-first sort — discovery order may not be sorted
      // we assert the bug: length capped, and note that sort was skipped
      // With our dirs all depth 2, alphabetical would be p00/components first; discovery is BFS queue order which for same depth is alphabetical anyway due to readdir order, so we just assert cap
      // This locks the cap behavior; sort bug is documented
    } finally { rmRf(tmp); }
  });
  it('J6: deeper than depth 6 not found', () => {
    const tmp = mkTmp();
    try {
      fs.mkdirSync(path.join(tmp,'a/b/c/d/e/f/g/h'),{recursive:true});
      assert.equal(fileSeeder.findCandidates(tmp,'h').length,0);
      fs.mkdirSync(path.join(tmp,'a2/b2/c2/d2/e2/lim'),{recursive:true});
      assert.equal(fileSeeder.findCandidates(tmp,'lim').length,1);
    } finally { rmRf(tmp); }
  });
});

// M preview integration
describe('M: previewContent/getPatchedPreview integration', () => {
  it('M1: surgical batch broken syntax flagged in previewContent', async () => {
    const tmp = mkTmp();
    try {
      const file=path.join(tmp,'s.ts');
      fs.writeFileSync(file,'export const x=1','utf-8');
      const p=await fileSeeder.previewContent(tmp,[{relPath:'s.ts', content:'export const x={', mode:'update', target:'x'}]);
      assert.ok(p.details[0].warning && p.details[0].warning.includes('syntax error'));
    } finally { rmRf(tmp); }
  });
  it('M2: getPatchedPreview returns syntaxError', async () => {
    const tmp = mkTmp();
    try {
      const file=path.join(tmp,'s2.ts');
      fs.writeFileSync(file,'export const x=1','utf-8');
      const entries=[{relPath:'s2.ts', resolved:'s2.ts', content:'export const x={', mode:'update', target:'x'}];
      const gp=await fileSeeder.getPatchedPreview(tmp,'s2.ts',entries);
      assert.ok(gp.syntaxError && !gp.syntaxError.ok);
      assert.ok(gp.syntaxError.error);
    } finally { rmRf(tmp); }
  });
  it('M3: getPatchedPreview clean full no syntaxError', async () => {
    const tmp = mkTmp();
    try {
      const entries=[{relPath:'ok.ts', resolved:'ok.ts', content:'export const y=1', mode:'full'}];
      const gp=await fileSeeder.getPatchedPreview(tmp,'ok.ts',entries);
      assert.equal(gp.syntaxError, undefined);
      assert.equal(gp.right,'export const y=1');
    } finally { rmRf(tmp); }
  });
});
