import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { extractErrors, failureError } = require('../services/ci/ciErrors.js');

function lines(...texts) {
  return texts.map((t) => ({ s: 0, k: 'err', t }));
}

describe('ciErrors - extractErrors', () => {
  it('reads TypeScript errors in both formats', () => {
    const found = extractErrors(
      lines(
        "src/a.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
        "src/b.ts:3:7 - error TS2304: Cannot find name 'x'."
      ),
      { stepIdx: 2 }
    );
    assert.equal(found.length, 2);
    assert.equal(found[0].title, 'TS2322');
    assert.equal(found[0].file, 'src/a.ts');
    assert.equal(found[0].line, 10);
    assert.equal(found[0].col, 5);
    assert.equal(found[0].stepIdx, 2);
    assert.equal(found[1].file, 'src/b.ts');
    assert.equal(found[1].line, 3);
  });

  it('reads ESLint stylish output under its file header', () => {
    const found = extractErrors(
      lines('src/c.js', "  4:9  error  'x' is not defined  no-undef", '  8:1  warning  Unexpected console  no-console', '')
    );
    assert.equal(found.length, 2);
    assert.equal(found[0].file, 'src/c.js');
    assert.equal(found[0].title, 'no-undef');
    assert.equal(found[0].level, 'error');
    assert.equal(found[0].line, 4);
    assert.equal(found[1].level, 'warning');
    assert.equal(found[1].col, 1);
  });

  it('reads a Node error with the first project frame', () => {
    const found = extractErrors(
      lines('TypeError: x is not a function', '    at run (/repo/src/d.js:12:3)', '    at node:internal/main:1:1'),
      { root: '/repo' }
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].title, 'TypeError');
    assert.equal(found[0].file, 'src/d.js');
    assert.equal(found[0].line, 12);
    assert.equal(found[0].col, 3);
    assert.ok(found[0].stack.includes('at run'));
  });

  it('reads a Python traceback', () => {
    const found = extractErrors(
      lines('Traceback (most recent call last):', '  File "app.py", line 7, in <module>', '    run()', 'ValueError: bad value')
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].title, 'ValueError');
    assert.equal(found[0].message, 'bad value');
    assert.equal(found[0].file, 'app.py');
    assert.equal(found[0].line, 7);
  });

  it('reads GitHub annotations', () => {
    const found = extractErrors(lines('::error file=src/e.ts,line=5,col=2::Boom'));
    assert.equal(found.length, 1);
    assert.equal(found[0].file, 'src/e.ts');
    assert.equal(found[0].line, 5);
    assert.equal(found[0].col, 2);
    assert.equal(found[0].message, 'Boom');
  });

  it('merges repeated errors into one entry with a count', () => {
    const line = "src/a.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    const found = extractErrors(lines(line, line));
    assert.equal(found.length, 1);
    assert.equal(found[0].count, 2);
  });

  it('ignores system and input lines', () => {
    const found = extractErrors([{ s: 0, k: 'sys', t: 'src/a.ts(1,1): error TS1000: nope' }]);
    assert.equal(found.length, 0);
  });
});

describe('ciErrors - failureError', () => {
  it('describes a timeout', () => {
    const e = failureError({ idx: 3, reason: 'timeout', exitCode: -1 });
    assert.equal(e.title, 'Step failed');
    assert.equal(e.stepIdx, 3);
    assert.match(e.message, /timed out/);
  });

  it('describes a plain exit code', () => {
    const e = failureError({ idx: 0, reason: 'exit', exitCode: 2 });
    assert.match(e.message, /code 2/);
  });
});