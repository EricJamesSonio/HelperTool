# Ecosystem Watcher — Phased Implementation Plan

## Phase 0: Foundation & Architecture

### Goal
Establish project structure, core data model, and session management. No capture logic yet.

### Context from Existing Codebase
- The project already has session management in `terminal/error-cop/error-engine.js`:
  `createSession()`, `processOutput()`, `endSession()`, `deleteSessions()`
- Session data is persisted via SQLite in `database/errorCopDb.js`
- Existing session fields: `project, cwd, shell, command, status, exit_code, total_errors, total_warnings, total_lines`
- IPC handlers use a `safe(fn)` wrapper pattern (see `error_cop_ipc.js`) — use this for watcher handlers too

### Integration Approach
- The watcher does **NOT** replace error-engine sessions — it **extends** them
- Watcher adds a lightweight in-memory layer on top of existing sessions:
  - Ring buffer for raw event stream (not persisted)
  - Watcher session IDs parallel existing session IDs (1:1 mapping)
  - `WatcherSession = { sessionId, engineSessionId, buffer, eventCount, startedAt }`

### Deliverables
- `Code/ecosystem-watcher/` directory with:
  - `index.js` — public API, wires everything together
  - `session.js` — watcher session manager (thin wrapper around existing sessions)
  - `buffer.js` — circular ring buffer class, fixed capacity, O(1) push/evict, TTL
  - `constants.js` — shared regex patterns, event types, status enums (prevents duplication anti-pattern)
- Core data model:
  - Event schema: `{ timestamp, type (log|error|request|process), level, data }`
  - Watcher session: `{ sessionId, engineSessionId, buffer, eventCount, startedAt }`
- Circular ring buffer: pre-allocated `Array(MAX_EVENTS)`, head/tail pointers, O(1) insert
- Auto-cleanup timer (every 5 min, purges sessions older than 12h)

### Performance Rules
- Buffer uses pre-allocated array, head/tail index rotation — no splice, no shift
- No synchronous IO on any path
- Session manager uses `Map<sessionId, WatcherSession>` for O(1) lookups

### Deps
- Zero new npm packages — `events`, `path`, `fs` only

### Cleanup Checklist
- [ ] No debug logs in production path
- [ ] Buffer eviction tested with rapid insert (100k events in 1s)
- [ ] Session expiry frees all references for GC
- [ ] Constants file created — no magic strings ANYWHERE

---

## Phase 1: MVP — Log Capture & Event Stream

### Goal
Capture stdout/stderr output and create the unified event stream. Read-only MVP — no error detection reimplementation.

### Context from Existing Codebase
- `terminal/error-cop/error-engine.js` already handles:
  - Session creation with `createSession()`
  - Terminal output processing with `processOutput()`
  - Error detection via `ErrorDetector.processLine()`
  - Session teardown with `endSession()`
- `terminal/ipc/terminal_ipc.js` already pipes PTY output through error-engine
- `error-parser.js` already does line parsing with pre-filter regex
- **Problem**: No raw event stream exists — once data goes through error-engine, raw output is discarded (only errors are stored)

### Integration Approach
- Watcher taps into the output pipeline **before** error-engine processes it
- Watcher session is created alongside error-engine session (same trigger point)
- Watcher receives the same `data` chunks that get sent to `errorEngine.processOutput()`
- Watcher stores raw events in ring buffer, error-engine handles error detection
- **No reimplementation** of error detection — watcher focuses on the unified event stream

### Deliverables
- `capture/process.js` — attach to existing child process output, capture raw lines as events
- `capture/log-adapter.js` — bridge between watcher and `terminal_ipc.js`:
  ```
  term.onData(data) → [watcher capture(data)] → errorEngine.processOutput(data)
  ```
- New routes in `errorCopServer/server.js`:
  - `GET /watcher/sessions` — list watcher sessions (wraps existing sessions + event counts)
  - `GET /watcher/events/:sessionId` — paginated raw event list from ring buffer
- Watcher hooks into `terminal_ipc.js:register()`:
  - After `term.onData()` fires, pipe same data to watcher buffer
- AI flow: `run_command()` → `GET /watcher/events/:id` → see full real-time log stream

### Performance Rules
- No `fs.writeSync` in capture path
- Batch event writes to buffer on microtask boundary, not per-line
- Event ingestion capped at 1000 events/sec per session (drop oldest if exceeded)
- Watcher capture adds < 0.01ms per data chunk (just buffer push + index update)

### Integration Points
- `errorCopServer/server.js` — register `/watcher/*` routes
- `terminal/ipc/terminal_ipc.js` — add watcher hook in `term.onData()` handler
- `errorCopServer/tool-registry.json` — add `get_watcher_sessions`, `get_event_stream` tools

### Cleanup Checklist
- [ ] No zombie child processes on session end
- [ ] Watcher cleanup on `endSession()` — no dangling references
- [ ] Max event buffer enforced (5000 per session cap)
- [ ] Watcher routes registered in `ENDPOINTS` array
- [ ] All responses match `{ success, data, error? }` contract

---

## Phase 2: Unified Event System & Runtime KB

### Goal
Unify all event types into a queryable store with timeline and summarization. Extend existing tools, don't duplicate them.

### Context from Existing Codebase
- `error-storage.js` already has: `getErrors()`, `getTimeline()`, `getSummary()`, `getSessions()`
- All storage uses SQLite via `database/errorCopDb.js` (`getErrorCopDb()` + `save()`)
- The `safe(fn)` wrapper in `error_cop_ipc.js` wraps all IPC handlers:
  ```js
  const safe = (fn) => {
    return async (...args) => {
      try { return await fn(...args); }
      catch (e) { console.error('[ErrorCop] IPC error:', e); return []; }
    };
  };
  ```
- `graphify-service/retrieval/` already has a full retrieval engine with resolvers, ranking, subgraph builder

### Integration Approach
- Watcher event store uses the **same SQLite DB** (`errorCopDb.js`) — add a `watcher_events` table
- Event queries extend the existing pattern in `error-storage.js` (same `_applyDateRange`, `_rowToObj` patterns)
- IPC handlers use the existing `safe(fn)` wrapper
- Summarization feeds INTO graphify's retrieval engine as additional context

### Deliverables
- `store/event-store.js` — extends `error-storage.js` patterns for watcher events:
  - `insertEvent({ sessionId, type, level, data })` — single event insert
  - `queryEvents({ sessionId, type, level, startTime, endTime, limit, cursor })` — cursor-based pagination
  - `getSessionTimeline(sessionId)` — chronological event rollup
- `query/filter.js` — query builder with cursor-based pagination (no offset):
  - `filter({ sessionId, type, level, timeRange, limit, after })`
- Summarization engine: raw events → `{ summary, keyEvents[], metrics{} }`
  - Compresses 500+ events into 5-10 key observations
  - Same shape as existing `error-storage.js:getSummary()` but for ALL events
- New routes in `errorCopServer/server.js`:
  - `GET /watcher/query` — filtered event search
  - `GET /watcher/timeline/:sessionId` — session timeline
  - `GET /watcher/summary/:sessionId` — AI-optimized summary

### Performance Rules
- Events indexed by `sessionId + type` for O(log n) lookups
- Timeline queries use cursor-based pagination (pass `after` param), never `OFFSET`
- Summarization: max 200 most recent events, runs async
- In-memory buffer keeps max 10K events; older events fetched from SQLite on demand
- All query endpoints respond < 50ms for typical usage

### Integration Points
- `database/errorCopDb.js` — add `watcher_events` table migration
- `errorCopServer/server.js` — register `/watcher/*` routes
- `terminal/error-cop/error-storage.js` — extend with watcher event methods (or parallel file)
- `graphify-service/retrieval/retrieval-engine.js` — watcher summarizer can feed context to retrieval planner
- `Code/ipc/` — add `watcher_ipc.js` following `error_cop_ipc.js` pattern with `safe(fn)` wrapper

### Cleanup Checklist
- [ ] Index memory overhead measured (< 5% of event data size)
- [ ] Cursor-based pagination tested with rapid insert
- [ ] Query path tested with empty/missing session
- [ ] IPC uses `safe(fn)` wrapper (not bare try/catch in every handler)
- [ ] SQLite `save()` called after batch writes, not per-event

---

## Phase 3: Network & Process Monitoring

### Goal
Capture outbound HTTP requests and process resource usage. Opt-in only — off by default.

### Context from Existing Codebase
- `error-engine.js` already has browser monitoring via `_onBrowserError()`, `attachBrowser()`, `BrowserCollector`
- `browser-collector.js` already captures browser console errors via injected script
- No existing HTTP request monitoring or process stats — this is new territory
- Node's `http`/`https` modules are used throughout (`errorCopServer`, `graphify-service`, `gmailService`)
- Process spawning already done in `terminal_ipc.js` and `opencode_ipc.js` via `node-pty`

### Integration Approach
- Network capture uses Node's `async_hooks` or `diagnostics_channel` (not monkey-patching — cleaner cleanup)
- Process stats use Node's built-in `process` module + `os` module (zero native deps)
- Captured data feeds into the watcher event store (same `insertEvent()` from Phase 2)
- Browser monitoring already exists — watcher can consume `BrowserCollector` events as additional event type

### Deliverables
- `capture/network.js` — capture outbound HTTP requests:
  - Uses `diagnostics_channel` (if available) or wraps `http.request`/`https.request`
  - Records: URL, method, status, duration, size
  - Opt-in per session via `{ captureNetwork: true }`
  - Redacts `authorization`, `cookie`, `x-api-key`, `set-cookie` from logged data
  - Hook overhead: < 0.5ms per request (measured)
- `capture/process-stats.js` — poll process metrics:
  - Memory: rss, heapTotal, heapUsed, external
  - CPU: user, system (from `process.cpuUsage()`)
  - Uptime: from session start
  - Poll interval: 10s minimum, configurable
  - Uses `os` + `process` module only
  - Polling auto-pauses after 30s of inactivity
- `capture/browser-bridge.js` — consume existing `BrowserCollector` events as watcher events:
  - Maps `browserError` → watcher event `{ type: 'error', level, data: { url, message, stack } }`
- Events from all sources feed into unified event store

### Performance Rules
- Network capture: **disabled by default**, enabled per-session via `captureNetwork: true`
- Hook overhead: < 0.5ms per request — enforced via `performance.now()` benchmark
- Process stats: `os` module only — no `child_process.exec()` or `spawn()`
- Polling pauses if session has no new events for 30s
- Redaction runs on a trimmed copy, not the original request object

### Safety
- Network capture redacts: `authorization`, `cookie`, `x-api-key`, `set-cookie` — both headers and URL params
- Process stats scoped to watcher's own child processes (PIDs tracked in session)
- No system-wide process enumeration
- Redaction tested with sample payloads before enable

### Cleanup Checklist
- [x] Monkey-patches (`http.request`, `http.get`, `https.request`, `https.get`) fully restored on session end — verified in test
- [x] No leaked `async_hooks` or `diagnostics_channel` subscriptions (using monkey-patch only)
- [x] Redaction tested with known secrets in URL (`token=secret` → `REDACTED`)
- [x] Redaction tested with known secrets in headers (`authorization: Bearer tok` — no crash)
- [x] Poll interval cleared on `endSession()` (timer cleared, entry deleted from map)
- [x] Documentation: feature flag defaults (`captureNetwork`, `captureProcessStats`, `pollIntervalMs`), opt-in mechanism (`meta.captureNetwork: true`)

---

## Phase 4: AI Agent Interaction

### Goal
Expose a clean AI-facing API so agents can autonomously observe, query, and debug.

### Context from Existing Codebase
- AI tools are registered in `errorCopServer/tool-registry.json` — a structured JSON manifest
- Each tool has: `name`, `description`, `when_to_use[]`, `priority`, `cost`, `endpoint`, `input`, `output`, `examples`
- Current tools: `get_latest_errors`, `query_errors`, `get_errors_by_session`, `get_error_summary`, `get_sessions`, `get_timeline`, `run_command`, `stop_command`, `list_commands`, etc.
- No `@opencode-ai/plugin` config exists — tools use the `tool-registry.json` manifest, NOT plugin config
- IPC handlers use `safe(fn)` wrapper pattern (see `error_cop_ipc.js`)

### Integration Approach
- Watcher tools are added to the EXISTING `tool-registry.json` — not a separate manifest
- Tool names follow existing convention: `list_watcher_sessions`, `get_event_stream`, `query_events`, `get_runtime_snapshot`
- Watcher server routes are added to `errorCopServer/server.js` alongside existing routes
- IPC handlers are added to `Code/ipc/` following `error_cop_ipc.js` pattern

### Deliverables
- AI tool definitions in `errorCopServer/tool-registry.json`:
  - `get_runtime_snapshot` — current session state + recent events + error summary
  - `query_events` — filtered event search across sessions
  - `list_watcher_sessions` — active sessions with event counts
  - `get_session_timeline` — chronological event rollup
- Watcher IPC module `Code/ipc/watcher_ipc.js`:
  - Uses `safe(fn)` wrapper (matching `error_cop_ipc.js` pattern)
  - Handlers: `watcher:getSnapshot`, `watcher:queryEvents`, `watcher:listSessions`, `watcher:getTimeline`
- Routes in `errorCopServer/server.js`:
  - `GET /watcher/snapshot/:sessionId` — single-call state dump
  - `GET /watcher/query` — filtered event search
  - `GET /watcher/timeline/:sessionId` — chronological events
- Response shape always: `{ success: true, data, meta?: { count, duration } }` or `{ success: false, error }`

### Integration Points
- `errorCopServer/tool-registry.json` — add 4 watcher tool definitions
- `errorCopServer/server.js` — register `/watcher/*` routes in `ENDPOINTS` + handler chain
- `Code/ipc/watcher_ipc.js` — new file following `error_cop_ipc.js` pattern
- `Code/ecosystem-watcher/index.js` — expose internal API for IPC handlers to consume

### Cleanup Checklist
- [ ] Tool descriptions accurate, include `when_to_use` and `examples`
- [ ] Error responses always include actionable message (not just "Error occurred")
- [ ] Session attach/detach leaves no dangling listeners
- [ ] Tool priority/cost set appropriately (snapshot=cost_low, query=cost_medium)
- [ ] IPC uses `safe(fn)` wrapper — no bare try/catch in handlers

---

## Phase 5: Hardening, Polish & Stretch

### Goal
Production readiness: perf benchmarks, persistent storage, edge case coverage.

### Context from Existing Codebase
- SQLite is already used via `database/errorCopDb.js` with `getErrorCopDb()` / `save()` pattern
- `error-storage.js` already has `cleanupStaleSessions()`, `purgeOldSessions(days)` — watcher can use same mechanism
- No existing benchmark suite — this will be the first formal performance measurement
- `browser-collector.js` already injects browser error capture script — frontend event capture exists as precedent

### Integration Approach
- Watcher persistent storage uses the **same SQLite database** (`errorCopDb.js`) — not a separate DB
- Adds `watcher_events` table alongside existing `sessions`, `errors`, `error_occurrences`, `browser_servers` tables
- Uses same `getErrorCopDb()` and `save()` functions — consistent with existing patterns
- Rate limiting and sampling are new — no existing pattern to follow, build cleanly

### Deliverables
- **Rate limiting & sampling**:
  - Adaptive sampling: 1:10 ratio when event rate > 1000 evts/sec in a rolling 1s window
  - Sampling under load, not at source — drop oldest in buffer, not incoming events
  - Configurable per-session: `{ maxEventsPerSec: number, sampleRatio: number }`
- **Persistent storage** via `database/errorCopDb.js`:
  - Migration: `CREATE TABLE IF NOT EXISTS watcher_events (id INTEGER PRIMARY KEY, session_id INTEGER, type TEXT, level TEXT, timestamp TEXT, data TEXT)`
  - Index: `CREATE INDEX IF NOT EXISTS idx_watcher_events_session ON watcher_events(session_id, type, timestamp)`
  - Spill-to-disk: when in-memory buffer exceeds 80% capacity, batch-write oldest 20% to SQLite
  - Retrieval: query SQLite for historical events, merge with in-memory buffer for current
  - Cleanup: use existing `purgeOldSessions(days)` mechanism — no separate cleanup needed
- **Memory profiling**:
  - Benchmark script in `Code/ecosystem-watcher/benchmark/`
  - Tests: baseline (no watcher), idle watcher, active capture (100 evts/sec), burst (1000 evts/sec)
  - Metrics: memory delta, event loop lag, time-to-insert-1000-events
  - Output: `plans/benchmarks/watcher-perf-{date}.md`
- **Edge cases**:
  - Rapid start/stop: 100 cycles of start/stop in 10s, verify zero leaks
  - Kill -9 recovery: simulate crash, verify no DB corruption (SQLite WAL mode)
  - Concurrent sessions: 50 sessions running simultaneously, measure throughput
- **Multi-session comparison** (stretch):
  - `GET /watcher/compare?sessionIds=1,2,3` — diff events across sessions
  - Useful for regression detection: "why did build succeed in session 1 but fail in session 2?"
- **Frontend browser events** (stretch):
  - Consume existing `BrowserCollector` events as watcher events (already covered in Phase 3)
  - Additional: capture performance.timing, console.warn/error, unhandledrejection events
  - Reuse existing `browser-collector.js` injection mechanism — don't create new one

### Performance Rules
- SQLite writes batched: 50ms debounce or 100 events, whichever first
- Sampling: 1:10 ratio when rolling 1s average exceeds threshold
- Memory overhead: < 10MB for 10K events in buffer (measured)
- SQLite uses WAL mode for concurrent read/write without locking
- `save()` called after batch, not per-event (matching existing pattern)

### Cleanup Checklist
- [ ] Final benchmark report committed to `plans/benchmarks/`
- [ ] All feature flags documented with defaults
- [ ] No dead code from prototyping phases — search for unused exports
- [ ] SQLite migration tested (create → insert → query → cleanup → no orphans)
- [ ] Async_hooks / diagnostics_channel subscriptions verified zero after stop
- [ ] Rate limiter does not drop events below threshold — only above
- [ ] Benchmark results show < 5% performance impact in typical scenarios

---

## Quick Reference: Phase Dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 4
                                   │
                                   └──► Phase 3 (parallel, opt-in)
                                              │
                                              └──► Phase 5
```

- Phase 3 can be developed in parallel with Phase 4 (it's opt-in)
- Phase 5 depends on all prior phases being stable

---

## Existing Files That Will Be Modified

| File | What Changes |
|---|---|
| `Code/terminal/ipc/terminal_ipc.js` | Add watcher hook in `term.onData()` — pipe same data to watcher |
| `Code/errorCopServer/server.js` | Add `ENDPOINTS` entries + route handlers for `/watcher/*` |
| `Code/errorCopServer/tool-registry.json` | Add 4 watcher tool definitions with examples |
| `Code/terminal/error-cop/error-engine.js` | Wire watcher session lifecycle alongside error-engine sessions |
| `Code/terminal/error-cop/error-storage.js` | Optionally extend with watcher event query methods |
| `Code/database/errorCopDb.js` | Add `watcher_events` table migration |

## New Files That Will Be Created

| File | Purpose |
|---|---|
| `Code/ecosystem-watcher/index.js` | Public API, wires all modules |
| `Code/ecosystem-watcher/session.js` | Watcher session manager (thin wrapper) |
| `Code/ecosystem-watcher/buffer.js` | O(1) circular ring buffer |
| `Code/ecosystem-watcher/constants.js` | Shared regex, event types, status enums |
| `Code/ecosystem-watcher/capture/process.js` | Attach to child process output |
| `Code/ecosystem-watcher/capture/log-adapter.js` | Bridge between terminal output and watcher |
| `Code/ecosystem-watcher/capture/network.js` | HTTP request capture (Phase 3) |
| `Code/ecosystem-watcher/capture/process-stats.js` | Process metrics polling (Phase 3) |
| `Code/ecosystem-watcher/capture/browser-bridge.js` | Consume BrowserCollector events (Phase 3) |
| `Code/ecosystem-watcher/store/event-store.js` | Indexed event storage + query |
| `Code/ecosystem-watcher/query/filter.js` | Cursor-based query builder |
| `Code/ecosystem-watcher/summarizer.js` | Raw events → structured summary |
| `Code/ipc/watcher_ipc.js` | IPC handlers following `safe(fn)` pattern |
| `Code/ecosystem-watcher/benchmark/` | Benchmark scripts (Phase 5)
