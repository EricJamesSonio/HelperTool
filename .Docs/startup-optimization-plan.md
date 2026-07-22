# First-Load Performance Optimization Plan

> Tracking document for the Helper Tool startup slowness fix.
> Each step should be checked off as implemented and verified.

---

## Phase 1 — Quick Wins (High Impact, Low Risk)

### 1.1 — Lazy-load worker task modules

**Files:** `Code/worker-service/worker.js`

**Problem:** All 18 task modules are `require()`d eagerly at the top of `worker.js`, including heavy dependencies (`pg`, `mysql2`, `mongodb`, `simple-git`, `sharp`, `ffprobe`, `ffmpeg`). This delays the worker's `ready` signal by hundreds of ms.

**Solution:** Replace top-level requires with lazy `require()` calls inside each `case` branch.

**Verification:** Worker sends `ready` signal measurably faster. Use `console.time` around the old vs new worker bootstrap.

```
[x] Implemented
[ ] Verified
```

---

### 1.2 — Skip schema creation when tables already exist

**Files:** `Code/database/db.js`, `Code/database/chatDb.js`, `Code/database/errorCopDb.js`

**Problem:** Every startup runs 35+ `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` SQL statements, even though the tables already exist on subsequent launches.

**Solution:** At the start of each `createSchema()`, run a single `SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN (...)` to check if all expected tables exist. If yes, skip all schema DDL.

**Verification:** Check that schema creation is skipped on warm starts (DB file already exists). Check that fresh starts (no DB file) still create the full schema.

```
[x] Implemented
[ ] Verified
```

---

### 1.3 — Early WASM load start

**Files:** `Code/database/sharedSqlJs.js`

**Problem:** sql.js WASM loading (`sql-wasm.js` 45KB + `sql-wasm.wasm` 644KB + compilation) doesn't start until `app.whenReady()` fires, which is already late in the startup sequence.

**Solution:** Start loading the WASM at module-evaluation time (top-level) instead of inside `getSqlJs()`. The `getSqlJs()` function just awaits the already-started promise.

**Verification:** Measure time from process start to `_promise` resolution vs old approach. Confirm all three DB inits still work.

```
[x] Implemented
[ ] Verified
```

---

### 1.4 — Defer indexer process start further

**Files:** `Code/main.js`, `Code/ipc/repo_ipc.js`

**Problem:** The indexer service is spawned 2 seconds after startup, but the user hasn't selected a repository yet. This spawns a full Node.js child process unnecessarily early.

**Solution:** Move indexer start to trigger on first repo selection via `onRepoSelected` callback. Falls back to 15s timeout if no repo selected.

**Verification:** Confirm indexer is spawned only when/after a repo is selected. Confirm indexing still works.

```
[x] Implemented
[ ] Verified
```

---

### 1.5 — Remove duplicate getSqlJs implementations

**Files:** `Code/worker-service/workerSqlJs.js` (new), `Code/worker-service/tasks/dbInspector.js`, `Code/worker-service/tasks/profileData.js`

**Problem:** Both files have copy-pasted `_loadSqlJs()` functions. Extract shared util.

**Solution:** Created `workerSqlJs.js` in worker-service and updated both task files to use it.

**Verification:** Both tasks still load sql.js successfully when invoked.

```
[x] Implemented
[ ] Verified
```

---

## Phase 2 — Renderer Startup Optimization (Medium Effort)

### 2.1 — Convert static imports in toolsManager.js to dynamic imports

**Status:** NOT STARTED — complex refactor of 1137-line file. Recommend doing after esbuild bundling (3.1) which makes this automatic.

```
[ ] Implemented
[ ] Verified
```

---

### 2.2 — Defer settingsManager.js import

**Files:** `Code/renderer/app.js`

**Problem:** `settingsManager.js` (which loads ~20 themes at ~50KB) was `await`ed in the critical startup path, blocking first paint.

**Solution:** Moved the `import('./settingsManager.js')` to a `requestAnimationFrame` callback after first paint. Fallback theme is applied immediately.

**Verification:** Confirm theme is still applied (brief flash of fallback theme before full theme loads). Measure time-to-first-paint improvement.

```
[x] Implemented
[ ] Verified
```

---

### 2.3 — Consolidate CSS files

**Files:** `Code/renderer/index.html`

**Status:** NOT STARTED — lower priority. The media="print" trick already makes most CSS non-blocking. The 4 blocking CSS files (~86KB) could be merged.

```
[ ] Implemented
[ ] Verified
```

---

## Phase 3 — Architectural (Higher Effort, Larger Payoff)

### 3.1 — Bundle renderer with esbuild

**Status:** NOT STARTED — would automate 2.1 and 2.3. Recommended next major step.

```
[ ] Implemented
[ ] Verified
```

---

### 3.2 — V8 code caching for renderer scripts

**Status:** SKIPPED — `app.scriptCodeCache()` API was removed in Electron 39. No equivalent available.

```
[ ] Cancelled — API unavailable
```

---

### 3.3 — Pre-warm WASM at install/build time

**Status:** NOT STARTED — Partially addressed by 1.3 (earlier WASM load). Full pre-compilation requires experimental V8 flags not suitable for production.

```
[ ] Implemented
[ ] Verified
```

---

## Implementation Order (Actual)

```
Phase 1 (all) → 2.2 → (remaining postponed)
```

---

## Measurement / Profiling

Before starting, capture baseline timings:

| Metric | Before (ms) | After (ms) |
|--------|-------------|------------|
| `app.whenReady()` → DB init complete | | |
| Worker fork → ready signal | | |
| Renderer `DOMContentLoaded` → `init:done` | | |
| Process start → first paint | | |
| sql.js WASM load + compile | | |
| Schema creation | | |
| Total startup time (perceived) | | |
