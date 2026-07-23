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
- **You can also launch commands** via `POST /commands/run` to start a dev server
  and monitor its output for errors in real time.
- **You can check running services** via `GET /urls` and test if a URL is
  responding via `GET /urls/:port/health` or fetch its content via
  `GET /urls/:port/test`.

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
| "Run the dev server and watch for errors" | `POST /commands/run` |
| "Is my dev server responding?" | `GET /urls` → `GET /urls/:port/health` |
| "What does the page look like?" | `GET /urls/:port/test` |
| "Stop the running command" | `POST /commands/stop` |
| "List running commands" | `GET /commands` |

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
| `POST /commands/run` | Run a command in a project folder and monitor for errors |
| `POST /commands/stop` | Stop a running command by id |
| `GET /commands` | List all running commands with status and detected URLs |
| `GET /commands/:id` | Get status of a specific running command |
| `GET /commands/:id/output` | Get recent terminal output from a running command |
| `GET /urls` | List all discovered dev server URLs |
| `GET /urls/:port/health` | Health check a discovered URL (GET request to the URL) |
| `GET /urls/:port/test` | Fetch a URL and return its content preview for AI inspection |
| `GET /urls/:port/wait` | Poll a URL until it responds (timeout in ms via ?timeout= param) |

---

### `POST /commands/run` — Run a command and monitor for errors

Starts a command in a project folder and pipes its output through ErrorCop
for real-time error detection. Detected dev server URLs are automatically
registered so you can health-check them later.

```json
POST /commands/run
{
  "command": "npm run dev",
  "cwd": "/path/to/project",
  "shell": "powershell.exe"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "sessionId": 3,
    "command": "npm run dev",
    "cwd": "/path/to/project"
  }
}
```

The `id` is the command runner ID. Use it with `POST /commands/stop` or
`GET /commands/:id/output`. The `sessionId` links to ErrorCop's session
error data (`GET /errors/session/:id`).

Use `GET /urls` after running to check if a dev server URL was detected.

---

### `POST /commands/stop` — Stop a running command

Kills a process started via `POST /commands/run`.

```json
POST /commands/stop
{
  "id": 1
}
```

```json
{
  "success": true
}
```

---

### `GET /commands` — List running commands

Returns all processes started via the command runner, their status,
and any detected dev server URLs.

```json
GET /commands
[
  {
    "id": 1,
    "sessionId": 3,
    "command": "npm run dev",
    "status": "running",
    "outputLength": 4520,
    "detectedUrls": [
      { "port": 5173, "framework": "Vite", "url": "http://localhost:5173" }
    ]
  }
]
```

---

### `GET /commands/:id` — Single command status

```
GET /commands/1
```

Returns the same shape as a single list entry, or `null` if not found.

---

### `GET /commands/:id/output` — Recent terminal output

Returns the last N lines of terminal output from a running or completed
command. Useful for seeing what happened beyond just errors.

```
GET /commands/1/output?tail=100
```

```json
{
  "id": 1,
  "output": "VITE v6.0.0 ready in 320ms\n\n  Local: http://localhost:5173/\n... "
}
```

---

### `GET /urls` — All discovered dev server URLs

Returns every URL that ErrorCop has detected (either from terminal output
or from the command runner). This is the starting point for checking if
a dev server is actually responding.

```json
GET /urls
[
  {
    "port": 5173,
    "url": "http://localhost:5173",
    "framework": "Vite",
    "source": "command-runner",
    "sessionId": 3,
    "detectedAt": "2026-07-22T12:00:00.000Z"
  }
]
```

---

### `GET /urls/:port/health` — Check if a URL responds

Makes a GET request to the URL and returns its HTTP status. Use this
to verify a dev server is actually running before trying to use it.

```
GET /urls/5173/health
```

```json
{
  "alive": true,
  "port": 5173,
  "url": "http://localhost:5173",
  "statusCode": 200,
  "statusMessage": "OK"
}
```

---

### `GET /urls/:port/test` — Fetch URL content for AI inspection

Fetches the full page content (up to 5000 chars) so you can inspect
the HTML, API response, or error page returned by the server.
Use this when the health check returns a non-200 status or you need
to understand what the server is serving.

```
GET /urls/5173/test
```

```json
{
  "success": true,
  "port": 5173,
  "url": "http://localhost:5173",
  "statusCode": 200,
  "contentType": "text/html",
  "bodyPreview": "<!DOCTYPE html>\n<html>...",
  "bodyLength": 12345,
  "truncated": true
}
```

---

### `GET /urls/:port/wait` — Poll until server responds

Polls the URL every second until it responds or the timeout expires.
Use this after launching a command to wait for the dev server to
finish starting up.

```
GET /urls/5173/wait?timeout=15000
```

Returns the same shape as `/health` once the server responds.

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

### Pattern D: "Launch and monitor"

```
1. POST /commands/run { "command": "npm run dev", "cwd": "/project" }
   → returns { id, sessionId }
2. GET /commands/:id/output?tail=50
   → wait until you see "Local: http://localhost:..."
3. GET /urls
   → find the detected dev server URL
4. GET /urls/:port/wait?timeout=30000
   → poll until the server responds with 200
5. GET /urls/:port/test
   → fetch the page content to verify it serves correctly
6. GET /errors/unread-count (or /errors/session/:sessionId)
   → check for any errors during startup
```

### Pattern E: "Check running services"

```
1. GET /urls
   → list all discovered URLs
2. For each URL: GET /urls/:port/health
   → check which are alive
3. For alive URLs: GET /urls/:port/test
   → fetch the page to understand what's running
```

---

## How Errors Are Captured

| Source | What's captured |
|---|---|
| Terminal output | Node.js errors, build failures, test failures, runtime exceptions |
| Browser console | Uncaught exceptions, unhandled promise rejections, HTTP errors, network failures |
| Page load events | Failed navigations, renderer crashes |
| Dev server logs | Framework server starts (Vite, Webpack, Next.js, etc.) |
| Command runner | Any process launched via `POST /commands/run` |

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
- If you launched a command, check `GET /commands` to see its status and URLs.
- Before debugging, try `GET /urls/:port/health` to confirm the server is up.

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

**User:** "Start the dev server for my project and check if it runs."

**AI:**
1. POST /commands/run { "command": "npm run dev", "cwd": "/project" }
2. GET /commands/1/output?tail=50
   → sees "Local: http://localhost:5173"
3. GET /urls/5173/wait?timeout=30000
   → server responds with 200
4. GET /urls/5173/test
   → fetches the HTML, confirms the app is running
5. GET /errors/unread-count
   → 0 errors during startup — clean launch
6. Answers: "Your dev server is running at http://localhost:5173 and started cleanly."

**Never answer without checking the API first.**
