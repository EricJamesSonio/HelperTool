# Track C — UI / Diff Live Verifier (wt/verifier-c)

**Worktree:** `../HelperTool-wt-c` branch `wt/verifier-c`
**Allowlist:** `Code/renderer/globalSeeder/ui.js`, `Code/renderer/diffViewer.js`, `Code/renderer/styles/global-seeder.css`, `Code/renderer/styles/diff-viewer.css` ONLY. Do not touch `fileSeeder.js` or `syntaxVerifier.js`.

## Goal

Make the "warning only" signal accurate before click and after edit, without stringly breakage.

## Background

* `ui.js:74` summary `syntaxCount = details.filter(d=>d.warning?.includes('syntax error')).length`, `fallbackCount = warnCount - syntaxCount`, row `isSyntax = warning.includes('syntax error')` (`ui.js:120`), label `split(';').find(includes)`. `details[]` drives `gs-badge-verify` + `gs-preview-row--verify-warn` + selector `<select>` that mutates `d.resolved`/`state.contentEntries[idx].resolved` without re-running `previewContent` (stale `exists`/`warning`).
* `diffViewer.js:95` `_renderPreviewDiff` banner `dv-verify-banner` above `leftBody` via `insertBefore`, always `dv-verify-banner--high`, single error only, `Go to line` queries `[data-line]` but `_renderDiff` sets `data-block`, falls back to `scrollTop=(line-5)*18`, snippet 60, risk always `High`.
* No live re-verify on `Edit` or ambiguous select; `close()` hides banner but `autoSaveAndClose` may save silently.

## Tasks

1. **Keep string contract but add helper:** add `function isSyntaxWarning(w){ return w && w.includes('syntax error'); }` and `function syntaxLabel(w){ return w.split(';').find(s=>s.includes('syntax error'))?.trim()||w; }` at top of `ui.js` — single place, not 3 duplicates.
2. **Live re-verify on selector change:** `ui.js:164` select `change` handler after mutating `d.resolved` — debounce 150ms then call `window.electronAPI.fileSeeder.previewContent(basePath, state.contentEntries)` to refresh `exists`/`warning` for that single file, update row class `verify-warn`/`patch-warn` and badge count without full re-render. If too heavy, just mark row `gs-preview-row--stale` and tooltip `re-run Preview to verify new path`.
3. **Live re-verify on edit:** `ui.js:239` `onSave(newRightText)` currently sets `last.content=newRightText` + `mode='full'` — after save, call `verifySyntax` via `getPatchedPreview` for that file and update `d.warning` + banner via `diffViewer.updateSyntaxError(newV)` (expose new function) without closing diff. Debounce 300ms on `input` in `diffViewer._toggleEditMode`.
4. **Diff fidelity:** in `diffViewer.js:158` banner, use `severity` from `syntaxError.severity` (`medium`→`dv-verify-banner--medium` yellow) else high red; show `line:col` + `snippet` (`<code>`). In `doRender`, after `_renderDiff`, ensure each line has `data-line` attr (add in `_renderDiff` where `line` spans created) so `Go to line` finds `[data-line="X"]`. Change magic `*18` to `getComputedStyle(line).lineHeight`.
5. **Multiple diagnostics:** if `syntaxError` becomes array later, render list; for quick win, if single, also append to analysis panel as second `dv-finding` with `dv-finding-medium` for `severity:medium` (duplicate import) else `high`.
6. **CSS:** `global-seeder.css` already has `gs-badge-verify` red — add `gs-badge-verify--stale` yellow for pending re-verify; `diff-viewer.css` already has `dv-verify-banner` — add `dv-verify-banner--medium` (yellow dim) and `dv-verify-banner--stale`.

## Acceptance

* Preview row still `!` red for syntax, `!` orange for fallback — no break of `warning.includes` contract (helper centralizes).
* After ambiguous select change, row updates without full page reload; no `fs` outside tmp (previewContent still via main).
* After `Edit` save, banner updates; `Go to line` scrolls to actual line.
* `npm --prefix Code test` still 118/118 (UI not under node:test, but no regression).
* Only UI/CSS files touched.

## Do NOT

* Touch `syntaxVerifier.js` logic or thresholds — Tracks A/B own.
* Touch `fileSeeder.js` grouping — Track B owns.
* Change `warning` string format.
