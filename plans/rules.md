# Global Seeder Verifier — Parallel Worktree Rules

**Use worktrees, not branches.** 3 worktrees from `v18` already created:

```
../HelperTool-wt-a  → wt/verifier-a
../HelperTool-wt-b  → wt/verifier-b
../HelperTool-wt-c  → wt/verifier-c
```

## How to run

```powershell
# in each worktree
cd "C:\Users\Windows 10\Desktop\Personal\Tools\HelperTool-wt-a"
npm --prefix Code test
# or
node --test Code/tests/*.test.mjs
```

## Collision avoidance — STRICT

Each track may **only** edit its allowlisted files. No overlap. If you need a shared constant, add it in your track and leave a TODO comment for merge — do not touch another track's files.

| Track | Worktree | Allowlist (only these) |
|-------|----------|------------------------|
| **A — Fallback Lexer** | `wt-a` | `Code/utils/syntaxVerifier.js` (fallbackCheck + htmlTagCheck only), `Code/tests/parser.test.mjs` fixture additions (if needed) |
| **B — FileSeeder Pipeline** | `wt-b` | `Code/utils/fileSeeder.js`, `Code/utils/astPatch/grammarLoader.js` |
| **C — UI / Diff** | `wt-c` | `Code/renderer/globalSeeder/ui.js`, `Code/renderer/diffViewer.js`, `Code/renderer/styles/global-seeder.css`, `Code/renderer/styles/diff-viewer.css` |

**Forbidden for all:** editing `Code/tests/helpers.mjs`, `Code/package.json`, or another track's files. If you must change a shared threshold, leave a `// TODO(wt-b): unify MIN_VERIFY_LEN` comment instead.

## Commit + merge

* One commit per worktree: `git commit -m "wt-a: harden fallback lexer"`.
* Merge order: A → B → C into `v18` via `git merge wt/verifier-a --no-ff` etc. Worktrees are isolated, so no rebase needed.
* Verification: `npm --prefix Code test` must be 118/118 before and after each merge.

## Acceptance

* No `warning.includes('syntax error')` break — keep string `; ` join.
* `npm --prefix Code test` 118/118.
* No writes outside `helpers.mkTmp()` tmp dirs in tests.
