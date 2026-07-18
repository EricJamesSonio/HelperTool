# ErrorCop — Runtime Error API for AI Agents

A real-time error monitoring server that captures terminal and browser errors.
Lets you inspect, query, and summarize runtime failures without reading raw logs.

**Server:** `http://127.0.0.1:3334`

---

## AI Usage Rules (MANDATORY)

You are an AI assistant with access to a runtime error monitoring system.

- If the user reports an error, crash, or unexpected behavior → you **MUST** check
  ErrorCop before guessing the cause.
- Do **NOT** guess what error occurred — fetch the actual errors from the API.
- **Even if you think you know the error, you MUST verify using the API.**
- Always start with `GET /errors/unread-count` (cheapest check), then escalate:
  `GET /errors/latest` → `GET /errors/session/:id` if you need session context.
- If no errors are found, try `GET /sessions` to see if there are recent terminal
  sessions, then `GET /errors/session/:id` for specific sessions.
- You may call **multiple endpoints in sequence** to trace the full error
  context before answering.

---

## Quick Decision Guide

| Situation | What you call |
|---|---|
| "Something is broken, check for errors" | `GET /errors/unread-count` → `GET /errors/latest` |
| "Show me all errors from the last run" | `GET /errors/session/:id` (find session via `GET /sessions`) |
| "What errors keep happening the most?" | `GET /errors/summary` |
| "Show me only warnings" | `GET /errors?level=warning` |
| "What happened between 2pm and 3pm?" | `GET /errors?startDate=...&endDate=...` |
| "Walk me through what failed step by step" | `GET /timeline` |
| "Quick check — any new issues?" | `GET /errors/unread-count` |
| "Server alive?" | `GET /health` |
| "What endpoints are available?" | `GET /endpoints` |

---

## All Endpoints

| Method + Path | Description |
|---|---|
| `GET /health` | Server health check with uptime |
| `GET /endpoints` | This list of available endpoints |
| `GET /errors/latest` | Latest 10 errors (paginated shape: { data, pagination }) |
| `GET /errors` | Query errors by level, limit, offset, date range (paginated) |
| `GET /errors/session/:id` | Errors for a specific terminal session |
| `GET /errors/summary` | AI-optimized summary with recent, mostFrequent, byType |
| `GET /errors/unread-count` | Count of new/unread errors |
| `GET /errors/:id` | Single error detail with stack and occurrence lines |
| `GET /errors/mark-read` | Reset unread error count to 0 |
| `GET /sessions` | Terminal sessions list |
| `GET /timeline` | Chronological timeline of errors and events |

---

### `GET /errors/latest` ← PRIMARY ENTRY POINT

Start here after confirming there are unread errors. Returns the 10 most recent
errors with file/line, sessionId, and project info.

```
GET /errors/latest
```

```json
{
  "data": [
    {
      "id": 42,
      "sessionId": 3,
      "project": "my-app",
      "type": "error",
      "message": "TypeError: Cannot read properties of undefined (reading 'map')",
      "file": "/src/components/TaskList.tsx",
      "line": 153,
      "timestamp": 1734567890000,
      "occurrences": 3
    }
  ],
  "pagination": {
    "total": 15,
    "hasMore": true,
    "limit": 10,
    "offset": 0
  }
}
```

The `file` and `line` fields are extracted from stack traces when available.
The `sessionId` links to the terminal session that produced the error.

---

### `GET /errors` — Query with filters

Filter by severity, paginate, or scope to a date range.

```
GET /errors?level=error&limit=5
GET /errors?level=warning&limit=20&offset=10
GET /errors?startDate=2026-07-16T00:00:00Z&endDate=2026-07-17T00:00:00Z
```

| Param | Type | Description |
|---|---|---|
| `level` | string | Filter: `error`, `warning`, or `info` |
| `limit` | number | Max results (default 50) |
| `offset` | number | Pagination offset |
| `startDate` | string | ISO date — start of range |
| `endDate` | string | ISO date — end of range |

Response shape:

```json
{
  "data": [
    {
      "id": 42,
      "sessionId": 3,
      "project": "my-app",
      "type": "error",
      "message": "...",
      "file": "/src/foo.ts",
      "line": 42,
      "timestamp": 1734567890000,
      "occurrences": 1
    }
  ],
  "pagination": {
    "total": 100,
    "hasMore": true,
    "limit": 5,
    "offset": 0
  }
}
```

Use `pagination.hasMore` to know if there are additional results beyond the
current page. If `hasMore` is true, increment `offset` by `limit` and call
again.

---

### `GET /errors/session/:id` — Errors from one terminal session

When you know which session (terminal run) to investigate. First find the
session ID via `GET /sessions`.

```
GET /errors/session/3
```

Returns all errors from that session, oldest first. Each entry follows the
same shape as `/errors/latest` entries (includes `sessionId`, `project`).
Returns a bare array (no pagination wrapper).

---

### `GET /errors/:id` — Single error detail

Get the full details of a specific error, including the raw stack trace
and all occurrence lines.

```
GET /errors/42
```

```json
{
  "id": 42,
  "sessionId": 3,
  "project": "my-app",
  "type": "error",
  "source": "terminal",
  "title": "TypeError",
  "message": "TypeError: Cannot read properties of undefined",
  "stack": "TypeError: Cannot read properties of undefined\n    at render (/src/App.tsx:42:10)",
  "file": "/src/App.tsx",
  "line": 42,
  "timestamp": 1734567890000,
  "occurrences": 5,
  "occurrenceLines": [
    {
      "timestamp": 1734567890000,
      "message": "TypeError: Cannot read properties of undefined",
      "level": "error"
    }
  ],
  "firstSeen": 1734567890000,
  "lastSeen": 1734567895000,
  "fingerprint": "a1b2c3d4e5f6...",
  "resolved": false
}
```

Returns 404 if the error ID does not exist.

---

### `GET /errors/summary` — AI-optimized overview

A single call that gives you the full picture: recent errors, most frequent
recurring errors (aggregated across all sessions by fingerprint), and counts
by severity.

```
GET /errors/summary
```

```json
{
  "recent": [
    {
      "id": 45,
      "sessionId": 3,
      "project": "my-app",
      "type": "error",
      "message": "TypeError: Cannot read properties of undefined",
      "file": "/src/app.tsx",
      "line": 88,
      "timestamp": 1734567895000,
      "occurrences": 5
    }
  ],
  "mostFrequent": [
    {
      "id": 45,
      "sessionId": 3,
      "project": "my-app",
      "type": "error",
      "message": "TypeError: Cannot read properties of undefined",
      "file": "/src/app.tsx",
      "line": 88,
      "timestamp": 1734567895000,
      "occurrences": 5
    }
  ],
  "byType": {
    "error": 7,
    "warning": 3,
    "info": 0
  }
}
```

The `mostFrequent` list is computed by SQL GROUP BY fingerprint across all
errors, so it reflects true recurrence rather than just the last 20.

---

### `GET /errors/unread-count` — Quick health check

The cheapest call. Use this first to decide if you need to investigate
further.

```
GET /errors/unread-count
```

```json
{
  "count": 5
}
```

If `count > 0`, escalate to `GET /errors/latest` or `GET /errors/summary`.

---

### `GET /errors/mark-read` — Reset unread count

Resets the unread error counter to 0. Call this after the AI has inspected
all new errors so that subsequent health checks reflect only new issues.

```
GET /errors/mark-read
```

```json
{
  "success": true
}
```

---

### `GET /sessions` — Terminal sessions

Lists recent terminal sessions so you can pick one to debug.

```
GET /sessions?limit=5
```

```json
[
  {
    "id": 3,
    "command": "npm run dev",
    "cwd": "/project",
    "status": "failed",
    "startedAt": 1734567800000,
    "endedAt": 1734567890000,
    "totalErrors": 2,
    "totalWarnings": 1,
    "totalLines": 452
  }
]
```

Use the session `id` in `GET /errors/session/:id` to drill into errors from
a specific run. Pay attention to `status` — `failed` sessions are the most
relevant for debugging.

---

### `GET /timeline` — Chronological event feed

Shows errors in time order so you can understand the sequence of failures.
Each entry now includes `file`, `line`, `sessionId`, and `project` context.

```
GET /timeline?limit=10
```

```json
[
  {
    "timestamp": 1734567890000,
    "type": "error",
    "title": "Build Failed",
    "message": "Failed to compile. Check terminal for details.",
    "level": "error",
    "file": "/src/App.tsx",
    "line": 42,
    "sessionId": 3,
    "project": "my-app",
    "command": "npm run build",
    "occurrences": 1
  }
]
```

Each entry includes the session's command so you can trace which operation
triggered the error. The `file` and `line` fields let you jump directly to
the failing code. Use this when debugging multi-step build or deploy
processes.

---

## Workflow Patterns

### Pattern A: "Quick triage"

```
1. GET /errors/unread-count
   → if count === 0 → nothing to investigate
   → if count > 0 → continue
2. GET /errors/latest
   → see the most recent errors with file/line
3. Read the failing files from disk
4. GET /errors/mark-read to reset the counter
5. Answer based on the actual errors
```

### Pattern B: "Deep investigation"

```
1. GET /errors/summary
   → see most frequent errors + breakdown by type
2. GET /errors/:id for the highest-occurrence error
   → get full stack trace and all occurrence lines
3. GET /errors/session/:id for the session with the most errors
   → see every error from that run in order
4. GET /timeline?limit=20
   → understand the sequence of failures
5. Read the failing files from disk
6. Answer with root cause + affected files
```

### Pattern C: "Session-first investigation"

```
1. GET /sessions?limit=5
   → find failed sessions
2. GET /errors/session/:id for each failed session
   → compare errors across runs
3. GET /errors?level=error&limit=50
   → broader search if needed
```

---

## How Errors Are Captured

| Source | What's captured |
|---|---|
| Terminal output | Node.js errors, build failures, test failures, runtime exceptions |
| Browser console | Uncaught exceptions, unhandled promise rejections, HTTP errors, network failures |
| Page load events | Failed navigations, renderer crashes |
| Dev server logs | Framework server starts (Vite, Webpack, Next.js, etc.) |

Errors are deduplicated by content fingerprint. The `occurrences` field tells
you how many times the same error was seen.

---

## Answering Guidelines

- Base your answer on fetched error data, not assumptions.
- Mention the file and line where the error occurred.
- If `occurrences > 1`, note that it's a recurring issue.
- When multiple errors exist, prioritize by severity (`error` > `warning`) and
  frequency (`occurrences`).
- Keep answers concise but grounded in actual error data.

---

## Example AI Behavior

**User:** "The app is crashing when I try to create a booking."

**AI:**
1. Calls `GET /errors/unread-count` → returns `{ "count": 3 }`
2. Calls `GET /errors/latest` → sees `TypeError` in `BookingForm.tsx:42`
3. Reads `BookingForm.tsx` from disk to understand the context
4. Answers: "There's a TypeError on line 42 of `BookingForm.tsx` — it's trying to
   call `.map()` on an undefined value. The `occurrences` field shows this
   happened 3 times. The `attendees` prop likely isn't being passed correctly."

**Never answer without checking the API first.**
