# Performance Refactoring — Safety Rules & Guardrails

This document defines **how** we refactor for performance: the discipline, the measurement
methodology, the rollback protocol, and the code-level constraints that prevent regressions.
Based on deep analysis of the codebase at `Code/`, especially the interdependencies between
`database/`, `ipc/`, `indexer/`, `indexer-service/`, `renderer/`, and `preload.js`.

---

## 1. The Golden Rule

> **One semantic change per commit. Never refactor and fix a bug in the same change.**

Every commit must be independently verifiable. If a commit changes behavior, it must be
provably better by measurement. If it only restructures code, it must produce identical output.

---

## 2. Pre-Flight Checklist (Before Touching Any Module)

Before editing a module, complete these steps:

### 2.1 Map All Consumers

```bash
# Find every file that imports the module
rg "require\\(['\"]\\.\\./relative/path/to/module['\"]\\)" --type js
rg "require\\(['\"]MODULE_NAME['\"]\\)" --type js

# For IPC handlers: find every ipcRenderer.invoke('handler-name') in renderer/
rg "ipcRenderer\\.invoke\\(['\"]handler-name['\"]" --type js
```

### 2.2 Document the Contract

For the module being changed, document:
- **Inputs:** What params does it accept? What format?
- **Outputs:** What does it return? What shape?
- **Side effects:** Does it write to disk? Send IPC? Modify global state? Start a timer?
- **Error states:** What happens on failure? Throws? Returns null? Logs?

### 2.3 Instrument the "Before" State

```js
// BEFORE making changes, add logging at caller and callee:
const start = performance.now();
const result = await targetModule.someFunction(args);
console.log('[perf-baseline] someFunction:', JSON.stringify({
  args: sanitize(args),
  resultShape: typeof result,
  resultKeys: result ? Object.keys(result) : [],
  duration: (performance.now() - start).toFixed(2) + 'ms',
}));
```

### 2.4 Write the Rollback Command First

```bash
# Before making changes, record the current commit
CURRENT=$(git rev-parse HEAD)
echo "Rollback: git checkout $CURRENT"
```

---

## 3. Instrumentation-First Methodology

### Step 1: Add Observability (BEFORE optimization)

```js
// Wrap the target function
const original = targetModule.hotFunction;
targetModule.hotFunction = async function(...args) {
  const start = performance.now();
  const result = await original.apply(this, args);
  const duration = performance.now() - start;
  if (duration > 50) { // log slow calls
    console.warn('[perf] hotFunction slow:', duration.toFixed(2) + 'ms');
  }
  return result;
};
```

### Step 2: Apply the Optimization

### Step 3: Verify (AFTER)

- Run the same scenario
- Compare before/after metrics
- If any metric regresses → rollback
- Remove instrumentation only after verification

---

## 4. Parallel-Implementation Pattern (High-Risk Changes)

For changes where correctness is non-trivial (query optimizations, cache eviction):

```
Old path (unchanged)  ──►  Comparator  ──►  Log discrepancies
New path (optimized)  ──►              ──►  Use new if zero diffs
```

### Example: Query optimization

```js
const oldResults = await oldQuery(params);
const newResults = await newQuery(params);
const oldSet = new Set(oldResults.map(r => JSON.stringify(r)));
const newSet = new Set(newResults.map(r => JSON.stringify(r)));
const missing = oldResults.filter(r => !newSet.has(JSON.stringify(r)));
const extra = newResults.filter(r => !oldSet.has(JSON.stringify(r)));
if (missing.length || extra.length) {
  console.error('[perf-parallel] MISMATCH:', { missing: missing.length, extra: extra.length });
  // Still use old results — new query is wrong
  return oldResults;
}
return newResults; // New query matches — safe to use
```

**Remove the parallel comparison** only after running in production for N hours with zero mismatches.

---

## 5. Rollback Protocol

### When to Rollback

- Any existing functionality breaks
- A performance metric regresses beyond noise (±5%)
- A new error appears in console that wasn't there before
- DB corruption or data loss

### How to Rollback

```bash
# Each phase corresponds to a git tag
git checkout perf/phase-0-before   # go back to before Phase 0
# or revert specific commits
git revert HEAD                    # revert the last commit
```

### Hard Rule

> If a change causes a regression, **revert immediately**. Do not attempt a fix-forward
> in the same session. Rollback first, analyze, then re-attempt.

---

## 6. Code-Level Constraints

### 6.1 No Silent Behavior Changes

If a function changes its return type, shape, or error behavior, ALL callers MUST be updated
in the same commit. Never leave the app running with mismatched contracts.

**Allowed:** Adding new fields to a returned object (callers ignore unknown fields).
**Forbidden:** Removing a field, changing a field type, or changing null/undefined semantics.

### 6.2 Old Path Stays Until New Path Is Proven

When replacing an implementation:
1. Add the new code alongside the old
2. Route traffic through old by default
3. Add a feature flag (`USE_NEW_IMPLEMENTATION`)
4. Test with flag on in development
5. Flip flag on in production
6. Remove old code only after the flag has been on for N days

### 6.3 IPC Contract Freeze

IPC handler names, response shapes, and event payloads are **contract**. Changing them
requires a coordinated migration:
1. Add the new handler with a new name (e.g., `handlerName_v2`)
2. Update the renderer to call the new handler
3. Keep the old handler for backward compatibility
4. Remove the old handler after confirming all renderer instances are updated

### 6.4 Sync → Async Migration Rules

When changing a synchronous function to async:
1. Check all callers — do they `await` the result? (If not, they'll get a Promise object, not the value)
2. If any caller is in a synchronous context (e.g., `Array.map()`, `if()` condition), it must be refactored first
3. Never use `process.binding('spawn_sync')` as a workaround — use proper async

---

## 7. Anti-Patterns Specific to This Codebase

### ❌ Refactoring db.js without checking all consumers

`database/db.js` is imported by 15+ modules. Changing its export shape, initialization sequence,
or timing breaks everything downstream.
- **Check:** `rg "require\\(['\"]\\.\\./database/db['\"]" --type js`
- **Safe pattern:** Add new exports alongside old ones; deprecate old ones with console.warn

### ❌ Changing IPC response shapes without updating preload.js

The `preload.js` file defines the bridge contract. If an IPC handler changes its return value,
the corresponding bridge function must be updated.
- **Check:** Match `ipcMain.handle('name', ...)` with `ipcRenderer.invoke('name', ...)` in preload.js
- **Safe pattern:** Never remove fields from responses — only add optional ones

### ❌ Making sync→async changes without checking all callers

- `rg "require\\(['\"]\\.\\./config/config['\"]"` — config.readConfig() is called from renderer bridges
- Some callers may not `await` the result if you change it to async
- **Safe pattern:** Keep a sync wrapper for legacy callers, add async version for new code

### ❌ Optimizing cache without verifying the working set

SymbolCache._store (unbounded Map) is assumed to be complete by code that calls `cache.get()`.
Adding LRU eviction must account for:
- The search path iterates the entire `_store` — eviction reduces coverage
- The `getFileDeps` path iterates `_store` to find reverse dependencies — eviction loses edges
- **Safe pattern:** Evict only files not touched in N minutes; keep metadata (file paths) even after evicting symbol data

### ❌ Changing rendering without understanding the event model

`utils/treeView.js` modifies `selectedItems` array in-place (mutates the caller's array).
The DOM event delegation at line 30-67 depends on `container._treeClickHandler` being attached
to the container, and `container._lastClickPath` / `container._lastClickTime` for double-click detection.
Virtual scrolling must preserve ALL of these.

---

## 8. Perf Measurement Harness

### Before/After Measurement Template

```js
async function measure(label, fn, iterations = 1000) {
  // Warmup
  for (let i = 0; i < 100; i++) await fn();
  // Measure
  const start = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  const total = performance.now() - start;
  const avg = total / iterations;
  console.log(`[perf] ${label}: avg=${avg.toFixed(3)}ms total=${total.toFixed(0)}ms n=${iterations}`);
  return avg;
}
```

### DB Query Measurement

```sql
-- Before optimization:
EXPLAIN QUERY PLAN SELECT ... ;
-- After optimization:
EXPLAIN QUERY PLAN SELECT ... ;
-- Verify: the plan shows index usage (SEARCH) not full table scans (SCAN)
```

### IPC Round-Trip Measurement

```js
// In preload.js:
const originalInvoke = ipcRenderer.invoke;
ipcRenderer.invoke = async function(channel, ...args) {
  const start = performance.now();
  const result = await originalInvoke.call(this, channel, ...args);
  const duration = performance.now() - start;
  if (duration > 10) { // log slow IPC (>10ms)
    console.warn(`[perf-ipc] ${channel}: ${duration.toFixed(2)}ms`);
  }
  return result;
};
```

### UI Frame Measurement

```js
let frameCount = 0, lastFrameTime = performance.now();
function onFrame() {
  frameCount++;
  const now = performance.now();
  if (now - lastFrameTime > 1000) {
    console.log(`[perf-ui] ${frameCount} fps`);
    frameCount = 0;
    lastFrameTime = now;
  }
  requestAnimationFrame(onFrame);
}
requestAnimationFrame(onFrame);
```

---

## 9. Phase Completion Sign-Off Checklist

Before marking any phase complete:

- [ ] Pre-flight checklist completed for every modified module
- [ ] Before/after metrics logged and show improvement or no regression
- [ ] All existing IPC handlers respond with identical shapes (or new handlers are additive only)
- [ ] Renderer bridge (`preload.js`) matches all IPC handler changes
- [ ] No silent catch{} swallows added — every error path logs or handles
- [ ] Rollback commit is identified and tagged
- [ ] Old code path still present (not deleted) unless proven safe for >24h
- [ ] `console.log` instrumentation from measurement is removed (not left in production path)
- [ ] No new npm dependencies added without written justification
