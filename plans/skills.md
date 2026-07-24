# Ecosystem Watcher — Build Skills & Anti-Patterns

This doc defines **how** we build the watcher: performance discipline, code hygiene,
anti-patterns to avoid, and integration conventions. Based on deep analysis of the
existing codebase at `Code/terminal/error-cop/`, `Code/errorCopServer/`,
`Code/ipc/`, and `Code/services/`.

---

## 1. Anti-Patterns: What NOT to Do

These are concrete violations found in the existing codebase that we **will not repeat**.

### ❌ Bare `catch {}` — swallows errors silently
```js
// BAD — found in opencode_ipc.js, opencode_ipc.js (dozens of times)
try { risky(); } catch (_) {}
try { risky(); } catch (e) {}
```
```js
// GOOD — always log or handle
try { risky(); } catch (e) {
  console.error('[watcher] risky failed:', e.message);
}
```

### ❌ `var` instead of `const`/`let`
```js
// BAD — found in errorCopServer/server.js (entire file uses var)
var PORT = 3334;
var _storage = null;
```
```js
// GOOD — use const (immutable binding) or let (mutable)
const PORT = 3334;
let _storage = null;
```

### ❌ Sync `fs` calls inside async functions
```js
// BAD — found in opencode_ipc.js async handlers
async function listRepos() {
  if (fs.existsSync(projectDir)) {          // blocks event loop
    const projects = fs.readdirSync(...);    // blocks event loop
  }
}
```
```js
// GOOD — use fs.promises inside async
async function listRepos() {
  try {
    await fs.promises.access(projectDir);
    const projects = await fs.promises.readdir(projectDir, { withFileTypes: true });
  } catch { return []; }
}
```

### ❌ Unbounded arrays with O(n) splice
```js
// BAD — found in error-detector.js (outputAccumulator)
this._outputAccumulator.push(line);
if (this._outputAccumulator.length > 10000) {
  this._outputAccumulator.splice(0, 1000);  // O(n) shift
}
```
```js
// GOOD — use ring buffer or capped with slice replacement
// If you need a rolling window, allocate once and rotate indices
const MAX = 10000;
let _head = 0, _count = 0;
const _buf = new Array(MAX);
function push(item) { _buf[_head] = item; _head = (_head + 1) % MAX; _count = Math.min(_count + 1, MAX); }
```

### ❌ Duplicated constants
```js
// BAD — found in BOTH error-parser.js AND error-detector.js
const PRE_FILTER = /error|warn|fail|exception|.../i;  // identical regex, duplicated
```
```js
// GOOD — shared constants file
// Code/ecosystem-watcher/constants.js
const PRE_FILTER = /error|warn|fail|exception|.../i;
module.exports = { PRE_FILTER, ... };
```

### ❌ Magic strings scattered throughout
```js
// BAD — found throughout errorCopServer
if (path === '/errors/latest') { ... }
if (path === '/errors/summary') { ... }
res.status = 'ended' ? 'failed' : ...
```
```js
// GOOD — named constants
const ROUTES = { LATEST: '/errors/latest', SUMMARY: '/errors/summary' };
const SESSION_STATUS = { RUNNING: 'running', ENDED: 'ended', FAILED: 'failed' };
```

### ❌ Unused catch binding
```js
// BAD — found throughout opencode_ipc.js, errorCopServer
catch (_) {}
catch (e) {}  // e never used
catch (e) { console.log('error'); }  // e never referenced — WHY catch it?
```
```js
// GOOD
catch (e) { console.error('[watcher]', e.message); }
```

### ❌ Dangling listeners (memory leaks)
```js
// BAD — onData/onExit without cleanup tracking
term.onData((data) => { ... });
term.onExit((code) => { ... });
// If term is replaced without removing listeners, old ones leak
```
```js
// GOOD — store references for cleanup
function onData(d) { ... }
function onExit(c) { ... }
term.on('data', onData);
term.on('exit', onExit);
// In cleanup: term.off('data', onData); term.off('exit', onExit);
```

### ❌ console.log in hot paths
```js
// BAD — found in error-detector.js, called on EVERY line of output
processLine(line) {
  console.log('[ErrorCop] processing line:', line.slice(0, 100));
  // ...
}
```
```js
// GOOD — debug flag pattern
const DEBUG = !!process.env.DEBUG_WATCHER;
const log = DEBUG ? (...a) => console.log('[watcher]', ...a) : () => {};
```

### ❌ Mixing export styles
```js
// BAD — project has 3 different export styles
module.exports = { func1, func2 };           // flat object
module.exports = ClassName;                  // single class
module.exports = { makeFactory };             // factory
```
```
// PREFERRED for this project — use flat object exports
// or factory functions (for configurable modules)
module.exports = { createWatcher, stopWatcher };
```

---

## 2. Harness: Safety Constraints (Always-On Rules)

These constraints prevent entire classes of bugs. They are **not negotiable**.

### Buffer Safety
- Every buffer **must** have a declared `MAX_SIZE` constant
- Write path **never** blocks — O(1) insert or drop
- Overflow policy is **drop-oldest** (not grow, not crash)
- Buffer memory is pre-allocated at session start

### Session Lifecycle
```
startSession() → events flow → endSession() → cleanup()
                                               ↓
                          MUST clean: timers, streams, listeners, file handles, Map entries
```
- One `cleanup()` function that handles ALL teardown
- Called from: `endSession()`, `stop()`, error paths, process exit
- Test: create 100 sessions rapidly, verify no resource leak

### Event Schema Validation
Every event MUST pass this check before storage:

```js
const VALID_TYPES = new Set(['log', 'error', 'request', 'process']);
const VALID_LEVELS = new Set(['info', 'warn', 'error', 'debug']);

function validateEvent(evt) {
  return (
    evt && typeof evt === 'object' &&
    typeof evt.timestamp === 'string' &&
    VALID_TYPES.has(evt.type) &&
    (!evt.level || VALID_LEVELS.has(evt.level))
  );
}
```

### Response Shape Consistency
Every external response MUST follow:
```js
{ success: true, data: ..., meta?: { count, duration } }
// or
{ success: false, error: 'human readable message' }
```
This matches the existing `errorCopServer/server.js` pattern.

### Timer Hygiene
- Every `setInterval` / `setTimeout` stores its ID for teardown
- `clearInterval` / `clearTimeout` called in cleanup
- No fire-and-forget timers

### Stream/Process Lifecycle
```js
// Every spawned process follows this contract:
function spawnAndWatch(...) {
  const proc = spawn(...);
  let closed = false;

  function cleanup() {
    if (closed) return;
    closed = true;
    proc.kill();
    proc.stdout.removeAllListeners();
    proc.stderr.removeAllListeners();
    proc.removeAllListeners();
  }

  proc.on('close', (code) => { cleanup(); });
  proc.on('error', (err) => { cleanup(); });
  return { proc, cleanup };
}
```

### Command Whitelist
- Commands executed by the watcher are validated against a whitelist
- No raw `eval()`, `exec()`, or `execSync()`
- Use `spawn()` with explicit args array (never shell string injection)

---

## 3. Performance Guardrails

### O(1) or O(log n) Hot Paths
- Event ingestion: O(1) — ring buffer pre-allocated
- Session lookup: O(1) — `Map<sessionId, Session>`
- Event query by session: O(log n) — index on `sessionId + type`
- Timeline query: cursor-based, not offset-based pagination
- No full buffer scans on read — slices by index range

### Batch Before Flush
- Disk writes: batch 50 events or 100ms, whichever first
- Network flush: batch 20 events or 50ms
- Use `setImmediate()` or microtask batching, not `process.nextTick`

### Lazy Init Pattern
```js
// watcher/index.js
let _initialized = false;
let _sessions = null;

function startSession(...) {
  if (!_initialized) { _init(); }
  // ...
}
function _init() {
  _sessions = new Map();
  _initialized = true;
}
```
- Nothing allocated at `require()` time
- No timers until `startSession()`
- All resources released in `stopAll()`

### Pre-Filter Before Parse
(follow existing `error-parser.js` pattern but don't duplicate it)
- Cheap regex pre-check rejects 90% of input
- Full parse only on matches
- Pre-filter regex is a **single shared constant**, not duplicated

### Measure Before/After
Every capture-path change includes a perf note:
```js
// perf: parseLine() avg 0.012ms per call (measured with performance.now() over 10k samples)
// perf: buffer insert avg 0.003ms
```

---

## 4. Code Conventions (Enforced)

### Module Format
- CommonJS (`require` / `module.exports`)
- `'use strict';` at top of every file
- Flat object export or factory function — no class exports unless state is complex

### File Structure
```js
'use strict';

const dep1 = require('dep1');

// ─── Constants ───
const MAX_EVENTS = 5000;

// ─── Private State ───
let _sessions = null;        // null until init
let _timer = null;

// ─── Public API ───
function start() { ... }
function stop() { ... }

module.exports = { start, stop };
```

### Naming
| What | Convention | Example |
|---|---|---|
| Files | `kebab-case.js` | `event-store.js` |
| Functions | `camelCase` | `getSession()` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_EVENTS` |
| Module-private | `_prefixed` | `_sessions`, `_flush()` |
| Event types | lowercase | `'log'`, `'error'` |
| Error messages | sentence case | `'Session not found'` |

### Store Pattern (for persistence, matching existing)
```js
const STORE_PATH = path.join(app.getPath('userData'), 'watcher-store.json');

function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); }
  catch { return { sessions: [], events: [] }; }
}

function writeStore(data) {
  const tmp = STORE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  fs.renameSync(tmp, STORE_PATH);   // atomic write
}
```

---

## 5. Integration Map

### Where Things Plug In

| Component | Location | Integration Point |
|---|---|---|
| Event capture | `Code/ecosystem-watcher/capture/` | Pipes from spawned processes |
| Event store | `Code/ecosystem-watcher/store/` | In-memory ring buffer + optional SQLite |
| HTTP API | `Code/errorCopServer/server.js` | Register new routes in `ENDPOINTS` + handler chain |
| AI tools | `Code/errorCopServer/tool-registry.json` | Add tool definition with name, params, examples |
| IPC bridge | `Code/ipc/error_cop_ipc.js` | Register `ipcMain.handle()` handlers |

### How to Register a New Route (copied pattern)
In `errorCopServer/server.js`:
1. Add entry to `ENDPOINTS` array
2. Add `if (path === '/watcher/...')` handler with `json(res, 200, ...)` response
3. Response format: `{ success: true, data, meta? }` or `{ success: false, error }`

### How to Register an AI Tool
In `errorCopServer/tool-registry.json`:
```json
{
  "name": "get_runtime_snapshot",
  "description": "Get current runtime state for a session, including recent events and errors.",
  "when_to_use": ["After running a command", "When debugging a failure"],
  "priority": 1,
  "cost": "low",
  "endpoint": { "method": "GET", "url": "http://localhost:3334/watcher/snapshot/:sessionId" },
  "input": { "sessionId": "number" },
  "output": { "type": "object", "schema": { ... } },
  "examples": [...]
}
```

---

## 6. Phase Completion Sign-Off Checklist

Before marking any phase complete:

- [ ] Zero `console.log` / `debugger` in production paths (debug flag ok)
- [ ] Zero `var` declarations
- [ ] Zero bare `catch {}` — every catch handles or logs
- [ ] Zero sync `fs` calls inside async functions
- [ ] Zero duplicated constants/magic strings
- [ ] All buffers have explicit `MAX_SIZE` and O(1) write
- [ ] All timers/intervals stored and cleaned on stop
- [ ] All stream listeners removable on stop
- [ ] Session lifecycle tested: start → stop → no leaks
- [ ] Event schema validated before storage
- [ ] Response shape follows `{ success, data, error? }` contract
- [ ] Perf note added for any new capture-path code
- [ ] No new npm deps without written justification
