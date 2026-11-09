import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { diagnose } = require('../services/ideDiagnostics.js');

async function syntaxDiags(file, text) {
  const diags = await diagnose({ file, text, exts: ['js'] });
  return diags.filter((d) => /^Syntax error|^Missing/.test(d.msg));
}

test('export type star re-exports are accepted', async () => {
  const text = [
    'export type { A } from "./a"',
    'export type * from "./b"',
    'export type * as ns from "./c"',
    '',
  ].join('\n');
  assert.deepEqual(await syntaxDiags('src/index.ts', text), []);
});

test('generic call with an import type and empty arguments is accepted', async () => {
  const text = [
    'vi.mock("@/api/auth", async (orig) => {',
    '  const actual = await orig<typeof import("@/api/auth")>()',
    '  return { ...actual, me: (...a: unknown[]) => meMock(...a) }',
    '})',
    '',
  ].join('\n');
  assert.deepEqual(await syntaxDiags('src/a.test.tsx', text), []);
});

test('bare ampersand in JSX text is accepted', async () => {
  const text = [
    'export default function P() {',
    '  return (',
    '    <div>',
    '      <button onClick={go}>Review & Save</button>',
    '      <p>',
    '        Terms &',
    '        Conditions',
    '      </p>',
    '    </div>',
    '  )',
    '}',
    '',
  ].join('\n');
  assert.deepEqual(await syntaxDiags('src/P.tsx', text), []);
});

test('real syntax errors are still reported', async () => {
  const unclosed = await syntaxDiags('src/b.tsx', 'const a = (\n');
  assert.ok(unclosed.length > 0);
  const badJsx = await syntaxDiags('src/c.tsx', 'const f = () => {\n  return <div>a & b</div\n}\n');
  assert.ok(badJsx.length > 0);
  const badExport = await syntaxDiags('src/d.ts', 'export type * from "./a"\nconst x = (\n');
  assert.ok(badExport.length > 0);
});
test('bare ampersand after a JSX expression is accepted', async () => {
  const text = [
    'export default function Q() {',
    '  return (',
    '    <p>',
    '      <span>{count} patients & {name}</span>',
    '    </p>',
    '  )',
    '}',
    '',
  ].join('\n');
  assert.deepEqual(await syntaxDiags('src/Q.tsx', text), []);
});
