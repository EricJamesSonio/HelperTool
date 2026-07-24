# Ecosystem Watcher (Runtime Knowledge Base) – Project Overview & Planning

## Overview
The **Ecosystem Watcher** is a runtime observability and knowledge system for applications.
It enables AI agents to **observe, understand, and debug applications in real-time** without relying on user-provided logs.

It captures the **full runtime ecosystem** by composing existing tools and adding new data streams:
- Logs — new capture layer
- Errors — **reuses Error Cop** (unchanged, stays as error authority)
- Network requests — new capture (opt-in)
- Process state — new capture (opt-in)
- Event timeline — new unified view built on top of existing error timeline

> **Key relationship**: Error Cop is **not replaced**. It remains the dedicated error detection and storage engine. The watcher reads from Error Cop's storage for error data and adds the non-error event stream alongside it. They are complementary layers.

---

## Core Objective

> Provide a structured, real-time, AI-readable view of a running application.

---

## Key Capabilities

### 1. Session-Based Monitoring
- Each running app instance = a **session**
- AI can attach/detach from sessions
- Supports both:
  - User-managed sessions
  - AI-managed sessions

---

### 2. Unified Event System

All runtime data is normalized into events:

```json
{
  "timestamp": "...",
  "type": "log | error | request | process",
  "data": {}
}
```

---

### 3. Runtime Data Streams

#### Logs
- stdout / stderr
- structured logs

#### Errors
- runtime exceptions, stack traces, deduplication
- **reuses Error Cop** in-place — no replacement, no duplication
- Watcher queries Error Cop's storage for error data on demand
- Error Cop's `error-engine.js`, `error-storage.js`, `error-detector.js` are unchanged
- All existing Error Cop API endpoints (`/errors/*`, `/sessions`, `/timeline`) remain active
- Watcher's timeline includes Error Cop errors as one event type alongside logs/network data

#### Network Requests
- API calls
- status codes
- durations

#### Process State
- running / stopped
- memory usage
- uptime

---

### 4. Event Timeline
- Chronological sequence of all events
- Enables cause → effect reasoning

---

## Architecture

```plaintext
Execution Tool → runs app
        ↓
Ecosystem Watcher ————————————————
        │                              │
    ┌───┴──────────────┐               │
    │  Error Cop       │ ← stays as    │
    │  (error engine,  │   the error   │
    │   storage, API)  │   authority   │
    └───┬──────────────┘               │
        │                              │
    ┌───┴──────────────┐               │
    │  Watcher Layer   │ ← adds log,   │
    │  (log capture,   │   network,    │
    │   event buffer,  │   process     │
    │   timeline)      │   streams     │
    └───┬──────────────┘               │
        │                              │
        └──────────┬───────────────────┘
                   ↓
    Runtime Knowledge Base → unified event stream
                   ↓
    AI Agent → queries + reasons
                   ↓
    Graphify → code understanding
                   ↓
    Fix loop
```

> Error Cop's existing HTTP API (`GET /errors/*`, `GET /sessions`, `GET /timeline`), SQLite storage, and tool registry (`tool-registry.json`) remain fully intact. The watcher adds new endpoints (`/watcher/*`) alongside them, not in place of them.

---

## Data Management

### Session Model

```json
{
  "sessionId": "sess_1",
  "source": "user | ai",
  "status": "running",
  "command": "npm run dev",
  "startedAt": "..."
}
```

---

### Storage Strategy

- In-memory event buffer (circular)
- Max events: 500–1000 per session
- TTL: 12 hours per session

---

## Relationship with Error Cop

| Aspect | Error Cop (stays) | Watcher (adds) |
|---|---|---|
| **Error detection** | Authority — `error-detector.js`, `error-parser.js`, `deduplicator.js` | Reads errors from Error Cop storage, does not re-detect |
| **Error storage** | SQLite via `error-storage.js` | Queries it; does not duplicate |
| **Session management** | `createSession()`, `endSession()`, `deleteSessions()` | Wraps engine sessions with additional event buffer |
| **Error API** | `GET /errors/*`, `GET /sessions`, `GET /timeline` | Stays as-is; watcher adds `/watcher/*` routes |
| **AI tools** | `tool-registry.json` entries for errors | Adds new entries for event stream, snapshots |
| **Log capture** | Not handled | New — piped from terminal output |
| **Network capture** | Not handled | New — opt-in HTTP monitoring |
| **Process stats** | Not handled | New — opt-in memory/CPU polling |
| **Browser monitoring** | `browser-collector.js` | Consumed as event source, not re-implemented |

### What physically stays the same
- `Code/terminal/error-cop/` — all 8 files untouched (engine, storage, detector, parser, dedup, browser, notification, browser-discovery)
- `Code/errorCopServer/server.js` — existing routes stay; watcher routes added alongside
- `Code/errorCopServer/tool-registry.json` — existing error tools stay; watcher tools added alongside
- `Code/ipc/error_cop_ipc.js` — handlers stay; watcher gets its own `watcher_ipc.js`
- `Code/database/errorCopDb.js` — shared DB; watcher adds `watcher_events` table alongside existing tables

### What changes minimally
- `Code/terminal/ipc/terminal_ipc.js` — ONE line addition: pipe `term.onData()` data to watcher buffer (in addition to existing `errorEngine.processOutput()` call)

---

## Constraints & Limitations

### Time Retention
- Sessions expire after 12 hours
- Old sessions automatically cleaned

### Memory Limits
- Event buffer capped
- Prevents memory overflow

### Noise Control
- Log levels: info, warn, error, debug
- AI defaults to ignore debug

### Safety
- Execution restricted via whitelist
- No system-level destructive commands

---

## AI Interaction Model

### Core Flow

```plaintext
1. list_sessions()
2. attach OR create session
3. run_command()
4. get_runtime_snapshot()
5. analyze events
6. fix issue
7. repeat
```

---

## Output Optimization

### Raw → Structured → Summarized

Example:

```json
{
  "summary": "API /users failed with 500 due to null reference",
  "keyEvents": [
    "request:/users → 500",
    "error:null reference"
  ]
}
```

---

## Validation Rules

- All events validated against schema before entering buffer
- Session existence checked against Error Cop engine (single source of truth)
- Error events sourced from Error Cop storage, not re-parsed
- Command safety validated by Error Cop's existing whitelist mechanism
- Watcher never stores duplicate error data — queries Error Cop on demand

---

## Evaluation Framework

### Metrics
- Detect errors correctly
- Identify root cause
- Suggest valid fixes

### Test Harness
- Predefined debugging scenarios
- Measure AI performance

---

## Future Enhancements

- Frontend monitoring (browser events)
- Performance profiling
- Persistent storage (optional)
- Multi-session comparison

---

## Final Vision

> A system where AI can fully observe, understand, and debug applications autonomously.

---

Generated on: 2026-07-22 15:43:23.913322
