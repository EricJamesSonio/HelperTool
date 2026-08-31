# Track B — FileSeeder Pipeline (wt/verifier-b)

**Worktree:** `../HelperTool-wt-b` branch `wt/verifier-b`
**Allowlist:** `Code/utils/fileSeeder.js`, `Code/utils/astPatch/grammarLoader.js` ONLY. Do not touch `syntaxVerifier.js` fallback internals or UI.

## Goal

Deduplicate preview logic, unify thresholds, make truncation string-aware, keep `#tests 118 → 118`.

## Background

* `fileSeeder.js:18` `isTruncatedContent` counts `{}()[]` via regex ignoring strings → false positive on `const s="{}"`.
* `fileSeeder.js:203` full-mode guard `trim.length>=10` vs `syntaxVerifier <10` vs `isTruncated <20` — split thresholds (10-19 gap silent).
* `fileSeeder.js:249` second-pass grouped `verifySyntax(right)` temp replay (`gs-verify-*`) duplicates `getPatchedPreview` (`gs-dry-*`) logic (`fileSeeder.js:372`) with divergent grouping (`details idx` vs `allEntries.filter(r===resolved)`).
* `getPatchedPreview` filter `e.resolved||e.relPath===resolved` misses anchored `src/components/Foo.tsx` vs literal.
* Truncation not re-checked on patched `right`.

## Tasks

1. **Unify thresholds:** define `const MIN_VERIFY_LEN = 20` at top of `fileSeeder.js` and use in `isTruncatedContent` guard and `previewContent` full guard (`content.trim().length >= MIN_VERIFY_LEN`). In `syntaxVerifier.js` do NOT edit — leave TODO: `// TODO(wt-a): align <10 to 20`.
2. **Extract helper:** `async function computePatchedRight(basePath, resolved, entriesForFile, left)` that does temp-file replay (`applyAddAfter/Before/Remove/Update` sequential, `fs.readFileSync`) — shared by both `previewContent` second-pass and `getPatchedPreview`. Remove duplication.
3. **Fix grouping:** in both callers, resolve entries via `entries.map(e=>({ ...e, resolved: e.resolved || resolveRelPath(basePath,e.relPath,cache).resolved }))` or reuse `details` mapping correctly — ensure `a.ts` dedup order (`parser I1` bug) preserved but index mapping not off-by-one. Use `Map<resolved, idxs>` from `details` directly.
4. **String-aware truncation:** replace `isTruncatedContent` regex counts with state-machine that skips inside `'`, `"`, `` ` ``, `//`, `/* */` (reuse `syntaxVerifier.fallbackCheck` state or extract `countBracesAware`). Keep `ends with ,:([{:=>` check.
5. **Patched truncation:** after `verifySyntax(right)`, also run `isTruncatedContent(right)` on patched `right` and append to `warning` (so surgical that introduces dangling `=>` is flagged).
6. **Grammar loader:** add `html:'html'` already done (keep), ensure `locateFile` uses `path.join(__dirname,...)` with `process.resourcesPath` fallback for asar (add `try { require('electron').app.getAppPath() } catch`).

## Acceptance

* `npm --prefix Code test` 118/118 (B3 short 6-char `x*5+'{'` still `null`, `B4` tails `, : =>` still `ends with`, `M1/M2/M3` syntax still).
* No change to `syntaxVerifier.js` fallback logic; no UI edits.
* `getPatchedPreview` still returns `{left,right,syntaxError?}`.

## Do NOT

* Touch `fallbackCheck`/`htmlTagCheck` internals — Track A owns.
* Touch `ui.js`/`diffViewer.js`/CSS — Track C owns.
* Change `warning` string format (keep `; ` join).
