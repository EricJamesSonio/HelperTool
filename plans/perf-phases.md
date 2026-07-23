# Performance Refactoring — Phased Implementation Plan

**Goal:** Apply the 15 performance findings from the analysis incrementally, in order of
safety (low risk first), without breaking existing functionality.

**Context:** `Code/` is an Electron app with main process (`main.js`), renderer (`renderer/`),
child processes (`worker-service/`, `indexer-service/`), IPC bridge (`preload.js`),
SQLite via sql.js (`database/`), and tree-sitter parsing (`indexer/parser.js`).

---

## Phase Dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
                                                                  │
                                                    (only if Phase 4 stable)
```

Each phase requires the prior phase to be stable and signed off.

---

## Phase 0: Instrumentation & Baseline

**Risk:** None — no behavior changes, no contract changes.
**Duration:** ~1 session
**Issues:** None (additive only)

### Goal

Add measurement infrastructure that lets us detect regressions instantly.

### Deliverables

1. **IPC timing wrapper** in `main.js` — wrap all `ipcMain.handle()` registrations with a
   timing decorator that logs any handler taking >10ms.

2. **Query plan logging** — add temporary `EXPLAIN QUERY PLAN` logging for the 5 most
   frequent queries (configurable via `process.env.DEBUG_QUERY`).

3. **Startup metrics** — log DB size, symbol count, file count, and init duration to console
   at startup (already partially done in `main.js:117-121`, extend with full metrics).

4. **Performance harness script** — `scripts/measure-perf.js` that:
   - Launches the app
   - Indexes a small test repo (the repo itself, ~50 files)
   - Renders the tree view
   - Measures: IPC round-trips, tree render time, DB query time, memory usage
   - Outputs: a JSON report to `perf-baseline.json`

### Files Modified

- `Code/main.js` — add IPC timing wrapper
- `Code/database/db.js` — add query logging (debug flag only)

### Files Created

- `Code/scripts/measure-perf.js` — performance harness

### Sign-Off

- [ ] Performance harness runs and produces `perf-baseline.json`
- [ ] IPC timing wrapper logs without breaking any handler
- [ ] No behavior changes — only additive instrumentation

---

## Phase 1: Low-Risk Local Optimizations

**Risk:** Low — each change is self-contained, no API/contract changes, easily revertible.
**Duration:** ~2-3 sessions
**Issues:** #4, #7, #10, #13, #12

### 1A — Cheap mtime+size pre-filter before read+hash (Issue #4)

**File:** `Code/indexer/indexer.js:80-93`

**Current behavior:** Reads entire file content + computes MD5 hash before checking
if the file has changed.

**Change:** Check `stat.mtime` + `stat.size` against stored values first. Only read+hash
if those differ.

**Safety:** The stored `file_hash` is the source of truth. The mtime/size check is
an optimization that avoids read+hash when the file is clearly unchanged. If the
optimization incorrectly skips a changed file (false negative), the index will be
stale — but subsequent indexing passes will catch it. This is the same tradeoff
`make` and all build tools use.

**Checklist:**
- [ ] Verify: unchanged files are still skipped (hash comparison still runs)
- [ ] Verify: changed files with same mtime but different content are still re-indexed
      (the hash check is the authoritative check, mtime is just a pre-filter)

### 1B — Consolidate 5 profile requests into 1 (Issue #7)

**File:** `Code/ipc/prefetchService.js:121-148`
**Worker:** `Code/worker-service/worker.js`

**Current behavior:** `_prefetchProfile` sends 5 separate `_fetchFromWorker` calls.

**Change:** Add a new handler `profileData:getAll` in the worker that returns all
profile data in one response. The prefetch service calls this single handler. Keep
the old individual handlers for backward compatibility (unused, but harmless).

**Safety:** Additive only — new handler + new call path. Old handlers are not removed.
The `Promise.all` of 5 calls is replaced with a single call returning the same shape.

**Checklist:**
- [ ] New `getAll` handler returns the same data shape as the old 5 combined
- [ ] Old individual handlers remain untouched
- [ ] Profile page in renderer shows identical data

### 1C — Remove duplicate ALTER TABLE (Issue #10)

**File:** `Code/database/db.js:80-81` and `Code/database/db.js:249-250`

**Current behavior:** `ALTER TABLE profile ADD COLUMN bio` runs twice (lines 80-81 and 249-250).
Both are wrapped in try/catch so they silently fail on second run.

**Change:** Remove the second ALTER TABLE (lines 249-250). Keep the first one.

**Safety:** Pure deletion of dead code. The try/catch ensures the first one only
applies if the column doesn't exist. The second one always fails (since the first
already added it or it already existed).

**Checklist:**
- [ ] Profile table still has `bio` and `website` columns after startup
- [ ] No console error from the removed ALTER TABLE

### 1D — Remove pretty-print from config JSON (Issue #13)

**File:** `Code/config/config.js:42`

**Current behavior:** `JSON.stringify(_cache, null, 2)` produces ~30% larger output.

**Change:** Replace with `JSON.stringify(_cache)` (no pretty-print). This affects
the on-disk config file only — the in-memory cache is unchanged.

**Safety:** The config file is JSON. Whether it's pretty-printed or minified doesn't
affect `JSON.parse()` behavior. Readers of the file (humans) lose formatting, but
this is a tool config file, not a user-facing document.

**Checklist:**
- [ ] Config still reads correctly after write
- [ ] `flushConfig()` still works

### 1E — Optimize DOM class manipulation in tree view (Issue #12)

**File:** `Code/renderer/utils/treeView.js:84-100`

**Current behavior:** `_updateHighlightsForPaths` iterates ALL `.tree-node` elements
via `querySelectorAll` and toggles classes on each click — O(n) per click.

**Change:** Store the last-highlighted node path. On click, remove class from old
path's element and add to new path's element — O(1) per click.

**Safety:** The selection logic is unchanged. Only the DOM update mechanism changes.
Both the old and new paths produce the same visible result. Test by clicking
various items and verifying the correct highlight appears.

**Checklist:**
- [ ] Single-click selects correctly
- [ ] Double-click opens file correctly
- [ ] Folder select with actionType='code' works
- [ ] Multi-select behavior unchanged
- [ ] After filter/refresh, highlights are correct

---

## Phase 2: Measured Medium-Risk Changes

**Risk:** Medium — internal API changes, no external contract changes.
**Duration:** ~2-3 sessions
**Issues:** #9, #11, #15, #14

### 2A — Config writes to async (Issue #9)

**File:** `Code/config/config.js`

**Current behavior:** `fs.writeFileSync` in `_doWrite()`. Called from debounced timer.

**Change:** Replace `fs.writeFileSync` with `await fs.promises.writeFile` in the
debounced path. Keep `flushConfig()` as sync (crash-safe path) — it will still
use `writeFileSync`.

**Safety:** `_doWrite()` is called from a `setTimeout` callback, not from any
synchronous context. Making it async doesn't affect any caller because the timer
is fire-and-forget. `flushConfig()` remains synchronous for when the app exits.

**Checklist:**
- [ ] Config still persists correctly
- [ ] `flushConfig()` (called on app exit) still writes synchronously
- [ ] No unhandled promise rejections from the async path

### 2B — Reduce chokidar watcher depth (Issue #11)

**File:** `Code/ipc/profile.js:62-82`

**Current behavior:** Chokidar watches with `depth: 10`, no file extension filter,
wide ignore list.

**Change:** Reduce `depth: 10` to `depth: 5`. Add `ignored` rule for binary file
extensions (`.png`, `.jpg`, `.ico`, `.exe`, `.wasm`, etc.). Keep the existing
node_modules/.git/dist ignores.

**Safety:** Profile tracking counts file saves and changes. Reducing depth only
affects files deeper than 5 directories — which are typically generated assets,
not source code. File extension filtering excludes binary files that don't
generate meaningful profile data.

**Checklist:**
- [ ] Source file changes (depth <= 5) are still captured
- [ ] Profile graph still shows accurate data
- [ ] Watcher ready event fires faster

### 2C — Optimize reverse dependency SQL query (Issue #15)

**File:** `Code/indexer-service/indexer.js:629-649`

**Current behavior:** Full table scan of `file_imports` for the entire repo, then
filter in JS with string matching.

**Change:** Replace with indexed lookup:

```sql
SELECT fi.path as source_path, fi2.import_path, fi2.import_type, fi2.imported_symbols
FROM file_imports fi2
JOIN indexed_files fi ON fi.id = fi2.file_id
WHERE fi2.resolved_file_id = ? AND fi2.repo_id = ?
```

This uses the existing `idx_imports_resolved` index.

**Safety:** Use the parallel-implementation pattern — run both queries, compare
results, log mismatches, use new query only if results match.

**Checklist:**
- [ ] Old and new queries return identical results for 10 test files
- [ ] `EXPLAIN QUERY PLAN` shows index scan (SEARCH) not table scan (SCAN)
- [ ] Response time measured before/after

### 2D — Graceful shutdown with async flush (Issue #14)

**File:** `Code/database/db.js:372-380`

**Current behavior:** `close()` calls `_flushSync()` —> `_db.export()` + `Buffer.from()`
+ `fs.writeFileSync()` — blocking the main process on app exit.

**Change:** Send a final async flush to the write worker; wait up to 2s for
completion; fall back to sync flush if worker doesn't respond in time.

**Safety:** The sync flush remains as the fallback. The async path is the
preferred path. If the worker is busy/dead, the sync path ensures data is
still written.

**Checklist:**
- [ ] App closes cleanly (no hanging)
- [ ] DB file is valid after close (can be reopened)
- [ ] 2s timeout fires correctly if worker is unresponsive

---

## Phase 3: High-Impact Architectural Changes (Part 1)

**Risk:** Medium-High — changes to core infrastructure.
**Duration:** ~2-3 sessions
**Issues:** #6, #8, #3

### 3A — Bound the in-memory symbol cache (Issue #6)

**File:** `Code/indexer-service/cache.js`

**Current behavior:** `_store` Map grows unboundedly — every file parsed stays
in memory forever.

**Change:** Add LRU eviction with configurable max (default: 10000 entries).
Track access time per entry. Evict oldest-accessed entries when limit is hit.

**Safety:** Start with a high limit (10000) that covers the working set.
Log eviction events. Monitor for cache misses (entries that were evicted but
later needed) — these indicate the limit is too low. Only reduce limit after
observing no cache misses.

**Checklist:**
- [ ] Cache eviction logged for monitoring
- [ ] Search still returns all results (it queries both cache + DB now)
- [ ] getFileDeps still works (it relies on _store iteration — must query DB as fallback)
- [ ] Memory usage measured before/after

### 3B — Optimize DB flush debounce (Issue #8)

**File:** `Code/database/db.js:363-370`

**Current behavior:** 2s debounce on `save()`, writes entire DB on every flush.

**Change:** Increase debounce to 5s for non-critical paths. Add a separate
immediate flush for critical paths (indexing complete, app close).

**Safety:** Data durability is not compromised — the in-memory sql.js database
is always consistent. The flush is just persistence to disk. Longer debounce
means more data batched per write, reducing total writes.

**Checklist:**
- [ ] `save()` called during indexing still persists before app exit
- [ ] No observable data loss after crash recovery (sql.js WAL mode handles this)

### 3C — Fully async directory walk (Issue #3)

**Files:** `Code/indexer/indexer.js:195-216`, `Code/ipc/symbolIndex_ipc.js:86-100`

**Current behavior:** `walkDir` uses `fs.readdirSync` recursively. The
`symbolIndex_ipc.js` has a `workerProxy.send('walkDir', ...)` path but falls
back to sync walk if worker is not ready.

**Change:** Ensure the worker is always ready before indexing starts (move the
`workerProxy.start()` earlier and `await` its readiness). If worker walk still
fails, use `fs.promises.readdir` with `await Promise.all()` for concurrent
directory traversal.

**Safety:** The sync walk remains as the last-resort fallback. The primary path
becomes async. The change to async is transparent to callers because they're
already in async context.

**Checklist:**
- [ ] Worker walk returns identical file lists to sync walk (compare on a test repo)
- [ ] Fallback to async fs walk (not sync) when worker is down
- [ ] Indexing still completes successfully with all three paths

---

## Phase 4: High-Impact Architectural Changes (Part 2)

**Risk:** High — changes API contracts between processes.
**Duration:** ~3-4 sessions
**Issues:** #5, #2

### 4A — Paginate codebase map IPC (Issue #2)

**Files:** `Code/indexer-service/indexer.js:724-760`, `Code/ipc/graphify_ipc.js`
(and anything calling `db:getCodebaseMapData`)

**Current behavior:** Single IPC message sends ALL files, ALL symbols, ALL imports.

**Change:** Add optional `limit` and `offset` parameters. Default to fetching
metadata only (counts, aggregates). The full data is fetched lazily when needed.

**Safety:** Old behavior preserved when params are absent (no breaking change).
The new behavior is opt-in via params. After confirming all consumers use the
paginated API, deprecate the full-fetch path.

**Checklist:**
- [ ] Codebase map still renders with full data (old path)
- [ ] Paginated path returns correct subsets
- [ ] No consumer broken by the change (old path unchanged)

### 4B — Virtual scrolling in tree view (Issue #5)

**File:** `Code/renderer/utils/treeView.js`

**Current behavior:** Entire tree rendered as DOM nodes — 10k+ nodes for large repos.

**Change:** Add a `'virtual'` view mode that only renders visible nodes (determined
by scroll position). Keep `'list'` and `'tree'` modes as-is. The virtual mode is
opt-in via a config flag initially.

**Safety:** This is the most complex change because it interacts with:
- Click delegation (need to translate screen coordinates to data indices)
- Double-click detection (based on `_lastClickPath` / `_lastClickTime`)
- Move-request buttons (need to reposition overlay)
- Selection highlighting (need to maintain highlight state for non-visible nodes)
- `selectedItems` array mutation (shared with other modes)

**Approach:** Build `_renderVirtualMode()` alongside `_renderListMode()` and
`_renderTreeMode()`. The virtual mode uses a scrollable container + absolute
positioned rows. Only ~50 DOM nodes exist regardless of data size. Click events
use a data-index attribute for lookup, not event delegation path.

**Checklist:**
- [ ] List mode unchanged (existing behavior preserved)
- [ ] Tree mode unchanged (existing behavior preserved)
- [ ] Virtual mode renders correct subset at any scroll position
- [ ] Selection works identically across all three modes
- [ ] Double-click still opens files
- [ ] Move buttons reposition correctly
- [ ] Filter + search + virtual mode all work together
- [ ] Memory measured: 10k nodes -> 50 DOM nodes in virtual mode

---

## Phase 5: Highest-Risk Architectural Change

**Risk:** Very High — architectural, many dependencies.
**Duration:** 3-5 sessions
**Issue:** #1 (Dual database)

### 5A — Dual-Write Mode

Make the indexer-service DB the "primary" and the main-process DB read-only.
Both DBs receive writes, but reads come from the primary. Log all discrepancies.

### 5B — Read-Migration

Switch all reads from the main-process DB to the indexer-service DB.
Verify all queries return identical results (parallel implementation pattern).

### 5C — Remove Secondary

After N days of zero discrepancies, remove the main-process DB entirely.
Remove `database/db.js::initDatabase`, `getDb`, `save`, `close` (or reduce to
thin wrappers).

**Safety for each step:**
- Dual-write mode: fully reversible (no data loss if we stop writing to secondary)
- Read-migration: parallel comparison catches any mismatches before switching
- Removal: only done after proving the primary handles all workloads

---

## Rollback Strategy

| Phase | Rollback Action |
|-------|-----------------|
| 0 (Instrumentation) | `git revert` — no behavior change, safe to keep or remove |
| 1 (Local optimizations) | Revert individual commits — each is self-contained |
| 2 (Medium-risk) | Revert individual commits — but verify no downstream depends on new behavior |
| 3 (Architectural P1) | Revert phase commit — cache limit change may require cache clear; walk change is transparent |
| 4 (Architectural P2) | Revert phase commit — old view modes are preserved, just flip config flag |
| 5 (DB dedup) | **Full rollback** — turn dual-write off, restore secondary DB from backup |

For Phases 0-4: rollback is `git revert` of the commits in that phase.
For Phase 5: rollback requires restoring the main-process DB and re-enabling writes to it.

---

## Quick Reference: Issue to File Mapping

| Issue | Primary File(s) | Phase |
|-------|-----------------|-------|
| #1 Dual database | `database/db.js`, `indexer-service/indexer.js`, `database/sharedSqlJs.js` | 5 |
| #2 Massive IPC | `indexer-service/indexer.js:724-760` | 4 |
| #3 Sync walk | `indexer/indexer.js:195-216`, `ipc/symbolIndex_ipc.js:86-100` | 3 |
| #4 Hash after read | `indexer/indexer.js:80-93` | 1 |
| #5 No virtualization | `renderer/utils/treeView.js` | 4 |
| #6 Unbounded cache | `indexer-service/cache.js` | 3 |
| #7 5 profile calls | `ipc/prefetchService.js:121-148` | 1 |
| #8 Full DB export | `database/db.js:335-370` | 3 |
| #9 Sync config | `config/config.js:42` | 2 |
| #10 Duplicate ALTER | `database/db.js:80-81, 249-250` | 1 |
| #11 Chokidar depth | `ipc/profile.js:62-82` | 2 |
| #12 DOM class ops | `renderer/utils/treeView.js:84-100` | 1 |
| #13 Pretty JSON | `config/config.js:42` | 1 |
| #14 Sync close | `database/db.js:372-380` | 2 |
| #15 Full scan query | `indexer-service/indexer.js:629-649` | 2 |
