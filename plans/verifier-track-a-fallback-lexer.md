# Track A — Fallback Lexer + HTML Tags (wt/verifier-a)

**Worktree:** `../HelperTool-wt-a` branch `wt/verifier-a`
**Allowlist:** `Code/utils/syntaxVerifier.js` ONLY (fallbackCheck + htmlTagCheck). Do not touch `fileSeeder.js` or UI.

## Goal

Make the fallback (unsupported langs + permissive php/vue) reliable without touching tree-sitter path.

## Background

`Code/utils/syntaxVerifier.js:10` `fallbackCheck` is a char loop counting `{}()[]`, tracking `inSingle/inDouble/inTick/inLineComment/inBlockComment/esc`, then duplicate-import check. Weaknesses: `col` off-by-1, regex `/ab/` mis-classified as `//`, `` `${}` `` depth ignored, `//` inside `http://` false, `py #` not handled, `html <!-- -->` not skipped, duplicate-import exact-trim false negative, missing braces reports bottom line not true line.

`htmlTagCheck` (`syntaxVerifier.js:65`) regex `/<\/?([a-zA-Z].../` misses comments, `full.endsWith('/>')` fails for `<img >`, extra `</span>` ignored, line always bottom.

## Tasks

1. Fix `col` counting: move `col++` after `\n` handling, set `col=1` on new line.
2. Regex literal: before treating `//` as comment, check previous non-space char in `= ( , : [ ! & | ? { } ; return` → treat `/…/` as regex, skip to next unescaped `/`.
3. Template `${}`: when `inTick`, track `inExprDepth` — on `${` increment, on `}` when depth>0 decrement (brace counting inside `${}` behaves like normal code, not tick string).
4. Ext-aware comments: if `ext==='py'` handle `#` line comment and `'''`/`"""` block strings; if `ext==='html'||'vue'` handle `<!-- -->` skip.
5. `htmlTagCheck`:
   - Skip `<!--.*?-->` and `<!DOCTYPE.*?>` before tag regex.
   - `isSelfClose = /\/\s*>$/.test(full) || voidTags.has(tag)` to handle `<img >`.
   - Skip `<script>`/`<style>` interior (consume until `</tag>`).
   - On close mismatch, report `unclosed tag <div> (expected </div> before </span>)`.
   - Line via `text.slice(0,m.index).split('\n').length`.

## Acceptance

* `node --test tests/parser.test.mjs tests/astPatch.test.mjs tests/fileSeeder.test.mjs` — `B3/B4` short `<10` vs `<20` still as before (do not change thresholds here — that is Track B).
* Direct: `verifySyntax('const s="http://a"; // hi','js')` → no false bracket, `verifySyntax('`a ${b}`','js')` handles nesting, `verifySyntax('<div><span>hi','html')` line ===1 and error `unclosed tag <div>`.

## Test to add/update

Add in `Code/tests/fileSeeder.test.mjs` or `astPatch.test.mjs` (but prefer not to touch those — leave test additions for Track B; just ensure existing `B6` `go` fallback not broken).

## Do NOT

* Change `MIN_VERIFY_LEN` thresholds (`<10` guard) — Track B owns thresholds.
* Touch `treeSitterCheck` or `verifySyntax` orchestration (line 143).
* Edit fileSeeder or UI.
