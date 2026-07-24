var http = require('http');
var URL = require('url').URL;
var fs = require('fs');
var path = require('path');
var errorsApi = require('./routes/errors');
var sessionsApi = require('./routes/sessions');
var commandsApi = require('./routes/commands');
var urlsApi = require('./routes/urls');
var watcherApi = require('./routes/watcher');

var PORT = 3334;
var _storage = null;
var _notify = null;
var _runner = null;
var _urlTracker = null;
var _startTime = null;
var _server = null;

function getUptime() {
  return _startTime ? Math.floor((Date.now() - _startTime) / 1000) : 0;
}

var ENDPOINTS = [
  { method: 'GET', path: '/health', description: 'Server health check with uptime' },
  { method: 'GET', path: '/endpoints', description: 'This list of available endpoints' },
  { method: 'GET', path: '/errors/latest', description: 'Latest 10 errors (paginated shape: { data, pagination })' },
  { method: 'GET', path: '/errors', description: 'Query errors by level, limit, offset, date range (paginated)', params: { level: 'string', limit: 'number', offset: 'number', startDate: 'string', endDate: 'string' } },
  { method: 'GET', path: '/errors/session/:id', description: 'Errors for a specific terminal session', params: { sessionId: 'number' } },
  { method: 'GET', path: '/errors/summary', description: 'AI-optimized summary with recent, mostFrequent, byType' },
  { method: 'GET', path: '/errors/unread-count', description: 'Count of new/unread errors' },
  { method: 'GET', path: '/errors/:id', description: 'Single error detail with stack and occurrence lines', params: { id: 'number' } },
  { method: 'GET', path: '/errors/mark-read', description: 'Reset unread error count to 0' },
  { method: 'GET', path: '/sessions', description: 'Terminal sessions list', params: { limit: 'number' } },
  { method: 'GET', path: '/timeline', description: 'Chronological timeline of errors and events', params: { limit: 'number' } },
  { method: 'POST', path: '/commands/run', description: 'Run a command in a project folder and monitor for errors', params: { command: 'string (required)', cwd: 'string', shell: 'string' } },
  { method: 'POST', path: '/commands/stop', description: 'Stop a running command by id', params: { id: 'number (required)' } },
  { method: 'GET', path: '/commands', description: 'List all running commands with status and detected URLs' },
  { method: 'GET', path: '/commands/:id', description: 'Get status of a specific running command' },
  { method: 'GET', path: '/commands/:id/output', description: 'Get recent terminal output from a running command', params: { tail: 'number (lines, default 100)' } },
  { method: 'GET', path: '/urls', description: 'List all discovered dev server URLs' },
  { method: 'GET', path: '/urls/:port/health', description: 'Health check a discovered URL (GET request to the URL)' },
  { method: 'GET', path: '/urls/:port/test', description: 'Fetch a URL and return its content preview for AI inspection' },
  { method: 'GET', path: '/urls/:port/wait', description: 'Poll a URL until it responds (timeout in ms via ?timeout= param)', params: { timeout: 'number (default 30000)' } },
  { method: 'GET', path: '/watcher/health', description: 'Ecosystem Watcher health status' },
  { method: 'GET', path: '/watcher/sessions', description: 'List all watcher sessions' },
  { method: 'GET', path: '/watcher/events', description: 'Get session events with ?sessionId, start, limit', params: { sessionId: 'number (required)', start: 'number', limit: 'number' } },
  { method: 'GET', path: '/watcher/events/last', description: 'Get last N events for a session with ?sessionId, tail', params: { sessionId: 'number (required)', tail: 'number' } },
  { method: 'GET', path: '/watcher/timeline', description: 'Get event timeline for a session with ?sessionId, limit', params: { sessionId: 'number (required)', limit: 'number' } },
  { method: 'GET', path: '/watcher/query', description: 'Query events with filters: ?sessionId, type, level, after, limit', params: { sessionId: 'number (required)', type: 'string', level: 'string', after: 'number', limit: 'number' } },
  { method: 'GET', path: '/watcher/summary', description: 'Get AI-optimized summary for a session with ?sessionId', params: { sessionId: 'number (required)' } },
  { method: 'GET', path: '/watcher/snapshot', description: 'Get full runtime snapshot for a session with ?sessionId', params: { sessionId: 'number (required)' } },
];

function json(res, status, data) {
  var body = JSON.stringify(data, null, 2) + '\n';
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function error(res, status, msg) {
  json(res, status, { error: msg });
}

function getStorage() { return _storage; }
function getNotify() { return _notify; }

function setEngine(engine) {
  _storage = engine ? engine.getStorage() : null;
  _notify = engine ? engine.getNotify() : null;
  _runner = engine ? engine.getCommandRunner() : null;
  _urlTracker = engine ? engine.getUrlTracker() : null;
}

function generateCheatsheet(outputPath) {
  try {
    var cheatsheetPath = outputPath || path.resolve(__dirname, '..', '..', 'MCP', 'errorCop', 'errorcop-cheatsheet.md');
    var epTable = ENDPOINTS.map(function (e) {
      return '| `' + e.method + ' ' + e.path + '` | ' + e.description + ' |';
    }).join('\n');

    var content = '# ErrorCop \u2014 Runtime Error API for AI Agents\n' +
'\n' +
'A real-time error monitoring server that captures terminal and browser errors.\n' +
'Lets you inspect, query, and summarize runtime failures without reading raw logs.\n' +
'\n' +
'**Server:** `http://127.0.0.1:' + PORT + '`\n' +
'\n' +
'---\n' +
'\n' +
'## AI Usage Rules (MANDATORY)\n' +
'\n' +
'You are an AI assistant with access to a runtime error monitoring system.\n' +
'\n' +
'- If the user reports an error, crash, or unexpected behavior \u2192 you **MUST** check\n' +
'  ErrorCop before guessing the cause.\n' +
'- Do **NOT** guess what error occurred \u2014 fetch the actual errors from the API.\n' +
'- **Even if you think you know the error, you MUST verify using the API.**\n' +
'- Always start with `GET /errors/unread-count` (cheapest check), then escalate:\n' +
'  `GET /errors/latest` \u2192 `GET /errors/session/:id` if you need session context.\n' +
'- If no errors are found, try `GET /sessions` to see if there are recent terminal\n' +
'  sessions, then `GET /errors/session/:id` for specific sessions.\n' +
'- You may call **multiple endpoints in sequence** to trace the full error\n' +
'  context before answering.\n' +
'- **You can also launch commands** via `POST /commands/run` to start a dev server\n' +
'  and monitor its output for errors in real time.\n' +
'- **You can check running services** via `GET /urls` and test if a URL is\n' +
'  responding via `GET /urls/:port/health` or fetch its content via\n' +
'  `GET /urls/:port/test`.\n' +
'\n' +
'---\n' +
'\n' +
'## Quick Decision Guide\n' +
'\n' +
'| Situation | What you call |\n' +
'|---|---|\n' +
'| "Something is broken, check for errors" | `GET /errors/unread-count` \u2192 `GET /errors/latest` |\n' +
'| "Show me all errors from the last run" | `GET /errors/session/:id` (find session via `GET /sessions`) |\n' +
'| "What errors keep happening the most?" | `GET /errors/summary` |\n' +
'| "Show me only warnings" | `GET /errors?level=warning` |\n' +
'| "What happened between 2pm and 3pm?" | `GET /errors?startDate=...&endDate=...` |\n' +
'| "Walk me through what failed step by step" | `GET /timeline` |\n' +
'| "Quick check \u2014 any new issues?" | `GET /errors/unread-count` |\n' +
'| "Server alive?" | `GET /health` |\n' +
'| "What endpoints are available?" | `GET /endpoints` |\n' +
'| "Run the dev server and watch for errors" | `POST /commands/run` |\n' +
'| "Is my dev server responding?" | `GET /urls` \u2192 `GET /urls/:port/health` |\n' +
'| "What does the page look like?" | `GET /urls/:port/test` |\n' +
'| "Stop the running command" | `POST /commands/stop` |\n' +
'| "List running commands" | `GET /commands` |\n' +
'\n' +
'---\n' +
'\n' +
'## All Endpoints\n' +
'\n' +
'| Method + Path | Description |\n' +
'|---|---|\n' +
'' + epTable + '\n' +
'\n' +
'---\n' +
'\n' +
'### `POST /commands/run` \u2014 Run a command and monitor for errors\n' +
'\n' +
'Starts a command in a project folder and pipes its output through ErrorCop\n' +
'for real-time error detection. Detected dev server URLs are automatically\n' +
'registered so you can health-check them later.\n' +
'\n' +
'```json\n' +
'POST /commands/run\n' +
'{\n' +
'  "command": "npm run dev",\n' +
'  "cwd": "/path/to/project",\n' +
'  "shell": "powershell.exe"\n' +
'}\n' +
'```\n' +
'\n' +
'Response:\n' +
'```json\n' +
'{\n' +
'  "success": true,\n' +
'  "data": {\n' +
'    "id": 1,\n' +
'    "sessionId": 3,\n' +
'    "command": "npm run dev",\n' +
'    "cwd": "/path/to/project"\n' +
'  }\n' +
'}\n' +
'```\n' +
'\n' +
'The `id` is the command runner ID. Use it with `POST /commands/stop` or\n' +
'`GET /commands/:id/output`. The `sessionId` links to ErrorCop\'s session\n' +
'error data (`GET /errors/session/:id`).\n' +
'\n' +
'Use `GET /urls` after running to check if a dev server URL was detected.\n' +
'\n' +
'---\n' +
'\n' +
'### `POST /commands/stop` \u2014 Stop a running command\n' +
'\n' +
'Kills a process started via `POST /commands/run`.\n' +
'\n' +
'```json\n' +
'POST /commands/stop\n' +
'{\n' +
'  "id": 1\n' +
'}\n' +
'```\n' +
'\n' +
'```json\n' +
'{\n' +
'  "success": true\n' +
'}\n' +
'```\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /commands` \u2014 List running commands\n' +
'\n' +
'Returns all processes started via the command runner, their status,\n' +
'and any detected dev server URLs.\n' +
'\n' +
'```json\n' +
'GET /commands\n' +
'[\n' +
'  {\n' +
'    "id": 1,\n' +
'    "sessionId": 3,\n' +
'    "command": "npm run dev",\n' +
'    "status": "running",\n' +
'    "outputLength": 4520,\n' +
'    "detectedUrls": [\n' +
'      { "port": 5173, "framework": "Vite", "url": "http://localhost:5173" }\n' +
'    ]\n' +
'  }\n' +
']\n' +
'```\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /commands/:id` \u2014 Single command status\n' +
'\n' +
'```\n' +
'GET /commands/1\n' +
'```\n' +
'\n' +
'Returns the same shape as a single list entry, or `null` if not found.\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /commands/:id/output` \u2014 Recent terminal output\n' +
'\n' +
'Returns the last N lines of terminal output from a running or completed\n' +
'command. Useful for seeing what happened beyond just errors.\n' +
'\n' +
'```\n' +
'GET /commands/1/output?tail=100\n' +
'```\n' +
'\n' +
'```json\n' +
'{\n' +
'  "id": 1,\n' +
'  "output": "VITE v6.0.0 ready in 320ms\\n\\n  Local: http://localhost:5173/\\n... "\n' +
'}\n' +
'```\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /urls` \u2014 All discovered dev server URLs\n' +
'\n' +
'Returns every URL that ErrorCop has detected (either from terminal output\n' +
'or from the command runner). This is the starting point for checking if\n' +
'a dev server is actually responding.\n' +
'\n' +
'```json\n' +
'GET /urls\n' +
'[\n' +
'  {\n' +
'    "port": 5173,\n' +
'    "url": "http://localhost:5173",\n' +
'    "framework": "Vite",\n' +
'    "source": "command-runner",\n' +
'    "sessionId": 3,\n' +
'    "detectedAt": "2026-07-22T12:00:00.000Z"\n' +
'  }\n' +
']\n' +
'```\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /urls/:port/health` \u2014 Check if a URL responds\n' +
'\n' +
'Makes a GET request to the URL and returns its HTTP status. Use this\n' +
'to verify a dev server is actually running before trying to use it.\n' +
'\n' +
'```\n' +
'GET /urls/5173/health\n' +
'```\n' +
'\n' +
'```json\n' +
'{\n' +
'  "alive": true,\n' +
'  "port": 5173,\n' +
'  "url": "http://localhost:5173",\n' +
'  "statusCode": 200,\n' +
'  "statusMessage": "OK"\n' +
'}\n' +
'```\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /urls/:port/test` \u2014 Fetch URL content for AI inspection\n' +
'\n' +
'Fetches the full page content (up to 5000 chars) so you can inspect\n' +
'the HTML, API response, or error page returned by the server.\n' +
'Use this when the health check returns a non-200 status or you need\n' +
'to understand what the server is serving.\n' +
'\n' +
'```\n' +
'GET /urls/5173/test\n' +
'```\n' +
'\n' +
'```json\n' +
'{\n' +
'  "success": true,\n' +
'  "port": 5173,\n' +
'  "url": "http://localhost:5173",\n' +
'  "statusCode": 200,\n' +
'  "contentType": "text/html",\n' +
'  "bodyPreview": "<!DOCTYPE html>\\n<html>...",\n' +
'  "bodyLength": 12345,\n' +
'  "truncated": true\n' +
'}\n' +
'```\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /urls/:port/wait` \u2014 Poll until server responds\n' +
'\n' +
'Polls the URL every second until it responds or the timeout expires.\n' +
'Use this after launching a command to wait for the dev server to\n' +
'finish starting up.\n' +
'\n' +
'```\n' +
'GET /urls/5173/wait?timeout=15000\n' +
'```\n' +
'\n' +
'Returns the same shape as `/health` once the server responds.\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /errors/latest` \u2190 PRIMARY ENTRY POINT\n' +
'\n' +
'Start here after confirming there are unread errors. Returns the 10 most recent\n' +
'errors with file/line, sessionId, and project info.\n' +
'\n' +
'```\n' +
'GET /errors/latest\n' +
'```\n' +
'\n' +
'```json\n' +
'{\n' +
'  "data": [\n' +
'    {\n' +
'      "id": 42,\n' +
'      "sessionId": 3,\n' +
'      "project": "my-app",\n' +
'      "type": "error",\n' +
'      "message": "TypeError: Cannot read properties of undefined (reading \'map\')",\n' +
'      "file": "/src/components/TaskList.tsx",\n' +
'      "line": 153,\n' +
'      "timestamp": 1734567890000,\n' +
'      "occurrences": 3\n' +
'    }\n' +
'  ],\n' +
'  "pagination": {\n' +
'    "total": 15,\n' +
'    "hasMore": true,\n' +
'    "limit": 10,\n' +
'    "offset": 0\n' +
'  }\n' +
'}\n' +
'```\n' +
'\n' +
'The `file` and `line` fields are extracted from stack traces when available.\n' +
'The `sessionId` links to the terminal session that produced the error.\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /errors` \u2014 Query with filters\n' +
'\n' +
'Filter by severity, paginate, or scope to a date range.\n' +
'\n' +
'```\n' +
'GET /errors?level=error&limit=5\n' +
'GET /errors?level=warning&limit=20&offset=10\n' +
'GET /errors?startDate=2026-07-16T00:00:00Z&endDate=2026-07-17T00:00:00Z\n' +
'```\n' +
'\n' +
'| Param | Type | Description |\n' +
'|---|---|---|\n' +
'| `level` | string | Filter: `error`, `warning`, or `info` |\n' +
'| `limit` | number | Max results (default 50) |\n' +
'| `offset` | number | Pagination offset |\n' +
'| `startDate` | string | ISO date \u2014 start of range |\n' +
'| `endDate` | string | ISO date \u2014 end of range |\n' +
'\n' +
'Response shape:\n' +
'\n' +
'```json\n' +
'{\n' +
'  "data": [\n' +
'    {\n' +
'      "id": 42,\n' +
'      "sessionId": 3,\n' +
'      "project": "my-app",\n' +
'      "type": "error",\n' +
'      "message": "...",\n' +
'      "file": "/src/foo.ts",\n' +
'      "line": 42,\n' +
'      "timestamp": 1734567890000,\n' +
'      "occurrences": 1\n' +
'    }\n' +
'  ],\n' +
'  "pagination": {\n' +
'    "total": 100,\n' +
'    "hasMore": true,\n' +
'    "limit": 5,\n' +
'    "offset": 0\n' +
'  }\n' +
'}\n' +
'```\n' +
'\n' +
'Use `pagination.hasMore` to know if there are additional results beyond the\n' +
'current page. If `hasMore` is true, increment `offset` by `limit` and call\n' +
'again.\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /errors/session/:id` \u2014 Errors from one terminal session\n' +
'\n' +
'When you know which session (terminal run) to investigate. First find the\n' +
'session ID via `GET /sessions`.\n' +
'\n' +
'```\n' +
'GET /errors/session/3\n' +
'```\n' +
'\n' +
'Returns all errors from that session, oldest first. Each entry follows the\n' +
'same shape as `/errors/latest` entries (includes `sessionId`, `project`).\n' +
'Returns a bare array (no pagination wrapper).\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /errors/:id` \u2014 Single error detail\n' +
'\n' +
'Get the full details of a specific error, including the raw stack trace\n' +
'and all occurrence lines.\n' +
'\n' +
'```\n' +
'GET /errors/42\n' +
'```\n' +
'\n' +
'```json\n' +
'{\n' +
'  "id": 42,\n' +
'  "sessionId": 3,\n' +
'  "project": "my-app",\n' +
'  "type": "error",\n' +
'  "source": "terminal",\n' +
'  "title": "TypeError",\n' +
'  "message": "TypeError: Cannot read properties of undefined",\n' +
'  "stack": "TypeError: Cannot read properties of undefined\\n    at render (/src/App.tsx:42:10)",\n' +
'  "file": "/src/App.tsx",\n' +
'  "line": 42,\n' +
'  "timestamp": 1734567890000,\n' +
'  "occurrences": 5,\n' +
'  "occurrenceLines": [\n' +
'    {\n' +
'      "timestamp": 1734567890000,\n' +
'      "message": "TypeError: Cannot read properties of undefined",\n' +
'      "level": "error"\n' +
'    }\n' +
'  ],\n' +
'  "firstSeen": 1734567890000,\n' +
'  "lastSeen": 1734567895000,\n' +
'  "fingerprint": "a1b2c3d4e5f6...",\n' +
'  "resolved": false\n' +
'}\n' +
'```\n' +
'\n' +
'Returns 404 if the error ID does not exist.\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /errors/summary` \u2014 AI-optimized overview\n' +
'\n' +
'A single call that gives you the full picture: recent errors, most frequent\n' +
'recurring errors (aggregated across all sessions by fingerprint), and counts\n' +
'by severity.\n' +
'\n' +
'```\n' +
'GET /errors/summary\n' +
'```\n' +
'\n' +
'```json\n' +
'{\n' +
'  "recent": [\n' +
'    {\n' +
'      "id": 45,\n' +
'      "sessionId": 3,\n' +
'      "project": "my-app",\n' +
'      "type": "error",\n' +
'      "message": "TypeError: Cannot read properties of undefined",\n' +
'      "file": "/src/app.tsx",\n' +
'      "line": 88,\n' +
'      "timestamp": 1734567895000,\n' +
'      "occurrences": 5\n' +
'    }\n' +
'  ],\n' +
'  "mostFrequent": [\n' +
'    {\n' +
'      "id": 45,\n' +
'      "sessionId": 3,\n' +
'      "project": "my-app",\n' +
'      "type": "error",\n' +
'      "message": "TypeError: Cannot read properties of undefined",\n' +
'      "file": "/src/app.tsx",\n' +
'      "line": 88,\n' +
'      "timestamp": 1734567895000,\n' +
'      "occurrences": 5\n' +
'    }\n' +
'  ],\n' +
'  "byType": {\n' +
'    "error": 7,\n' +
'    "warning": 3,\n' +
'    "info": 0\n' +
'  }\n' +
'}\n' +
'```\n' +
'\n' +
'The `mostFrequent` list is computed by SQL GROUP BY fingerprint across all\n' +
'errors, so it reflects true recurrence rather than just the last 20.\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /errors/unread-count` \u2014 Quick health check\n' +
'\n' +
'The cheapest call. Use this first to decide if you need to investigate\n' +
'further.\n' +
'\n' +
'```\n' +
'GET /errors/unread-count\n' +
'```\n' +
'\n' +
'```json\n' +
'{\n' +
'  "count": 5\n' +
'}\n' +
'```\n' +
'\n' +
'If `count > 0`, escalate to `GET /errors/latest` or `GET /errors/summary`.\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /errors/mark-read` \u2014 Reset unread count\n' +
'\n' +
'Resets the unread error counter to 0. Call this after the AI has inspected\n' +
'all new errors so that subsequent health checks reflect only new issues.\n' +
'\n' +
'```\n' +
'GET /errors/mark-read\n' +
'```\n' +
'\n' +
'```json\n' +
'{\n' +
'  "success": true\n' +
'}\n' +
'```\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /sessions` \u2014 Terminal sessions\n' +
'\n' +
'Lists recent terminal sessions so you can pick one to debug.\n' +
'\n' +
'```\n' +
'GET /sessions?limit=5\n' +
'```\n' +
'\n' +
'```json\n' +
'[\n' +
'  {\n' +
'    "id": 3,\n' +
'    "command": "npm run dev",\n' +
'    "cwd": "/project",\n' +
'    "status": "failed",\n' +
'    "startedAt": 1734567800000,\n' +
'    "endedAt": 1734567890000,\n' +
'    "totalErrors": 2,\n' +
'    "totalWarnings": 1,\n' +
'    "totalLines": 452\n' +
'  }\n' +
']\n' +
'```\n' +
'\n' +
'Use the session `id` in `GET /errors/session/:id` to drill into errors from\n' +
'a specific run. Pay attention to `status` \u2014 `failed` sessions are the most\n' +
'relevant for debugging.\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /timeline` \u2014 Chronological event feed\n' +
'\n' +
'Shows errors in time order so you can understand the sequence of failures.\n' +
'Each entry now includes `file`, `line`, `sessionId`, and `project` context.\n' +
'\n' +
'```\n' +
'GET /timeline?limit=10\n' +
'```\n' +
'\n' +
'```json\n' +
'[\n' +
'  {\n' +
'    "timestamp": 1734567890000,\n' +
'    "type": "error",\n' +
'    "title": "Build Failed",\n' +
'    "message": "Failed to compile. Check terminal for details.",\n' +
'    "level": "error",\n' +
'    "file": "/src/App.tsx",\n' +
'    "line": 42,\n' +
'    "sessionId": 3,\n' +
'    "project": "my-app",\n' +
'    "command": "npm run build",\n' +
'    "occurrences": 1\n' +
'  }\n' +
']\n' +
'```\n' +
'\n' +
'Each entry includes the session\'s command so you can trace which operation\n' +
'triggered the error. The `file` and `line` fields let you jump directly to\n' +
'the failing code. Use this when debugging multi-step build or deploy\n' +
'processes.\n' +
'\n' +
'---\n' +
'\n' +
'## Workflow Patterns\n' +
'\n' +
'### Pattern A: "Quick triage"\n' +
'\n' +
'```\n' +
'1. GET /errors/unread-count\n' +
'   \u2192 if count === 0 \u2192 nothing to investigate\n' +
'   \u2192 if count > 0 \u2192 continue\n' +
'2. GET /errors/latest\n' +
'   \u2192 see the most recent errors with file/line\n' +
'3. Read the failing files from disk\n' +
'4. GET /errors/mark-read to reset the counter\n' +
'5. Answer based on the actual errors\n' +
'```\n' +
'\n' +
'### Pattern B: "Deep investigation"\n' +
'\n' +
'```\n' +
'1. GET /errors/summary\n' +
'   \u2192 see most frequent errors + breakdown by type\n' +
'2. GET /errors/:id for the highest-occurrence error\n' +
'   \u2192 get full stack trace and all occurrence lines\n' +
'3. GET /errors/session/:id for the session with the most errors\n' +
'   \u2192 see every error from that run in order\n' +
'4. GET /timeline?limit=20\n' +
'   \u2192 understand the sequence of failures\n' +
'5. Read the failing files from disk\n' +
'6. Answer with root cause + affected files\n' +
'```\n' +
'\n' +
'### Pattern C: "Session-first investigation"\n' +
'\n' +
'```\n' +
'1. GET /sessions?limit=5\n' +
'   \u2192 find failed sessions\n' +
'2. GET /errors/session/:id for each failed session\n' +
'   \u2192 compare errors across runs\n' +
'3. GET /errors?level=error&limit=50\n' +
'   \u2192 broader search if needed\n' +
'```\n' +
'\n' +
'### Pattern D: "Launch and monitor"\n' +
'\n' +
'```\n' +
'1. POST /commands/run { "command": "npm run dev", "cwd": "/project" }\n' +
'   \u2192 returns { id, sessionId }\n' +
'2. GET /commands/:id/output?tail=50\n' +
'   \u2192 wait until you see "Local: http://localhost:..."\n' +
'3. GET /urls\n' +
'   \u2192 find the detected dev server URL\n' +
'4. GET /urls/:port/wait?timeout=30000\n' +
'   \u2192 poll until the server responds with 200\n' +
'5. GET /urls/:port/test\n' +
'   \u2192 fetch the page content to verify it serves correctly\n' +
'6. GET /errors/unread-count (or /errors/session/:sessionId)\n' +
'   \u2192 check for any errors during startup\n' +
'```\n' +
'\n' +
'### Pattern E: "Check running services"\n' +
'\n' +
'```\n' +
'1. GET /urls\n' +
'   \u2192 list all discovered URLs\n' +
'2. For each URL: GET /urls/:port/health\n' +
'   \u2192 check which are alive\n' +
'3. For alive URLs: GET /urls/:port/test\n' +
'   \u2192 fetch the page to understand what\'s running\n' +
'```\n' +
'\n' +
'---\n' +
'\n' +
'## How Errors Are Captured\n' +
'\n' +
'| Source | What\'s captured |\n' +
'|---|---|\n' +
'| Terminal output | Node.js errors, build failures, test failures, runtime exceptions |\n' +
'| Browser console | Uncaught exceptions, unhandled promise rejections, HTTP errors, network failures |\n' +
'| Page load events | Failed navigations, renderer crashes |\n' +
'| Dev server logs | Framework server starts (Vite, Webpack, Next.js, etc.) |\n' +
'| Command runner | Any process launched via `POST /commands/run` |\n' +
'\n' +
'Errors are deduplicated by content fingerprint. The `occurrences` field tells\n' +
'you how many times the same error was seen.\n' +
'\n' +
'---\n' +
'\n' +
'## Answering Guidelines\n' +
'\n' +
'- Base your answer on fetched error data, not assumptions.\n' +
'- Mention the file and line where the error occurred.\n' +
'- If `occurrences > 1`, note that it\'s a recurring issue.\n' +
'- When multiple errors exist, prioritize by severity (`error` > `warning`) and\n' +
'  frequency (`occurrences`).\n' +
'- Keep answers concise but grounded in actual error data.\n' +
'- If you launched a command, check `GET /commands` to see its status and URLs.\n' +
'- Before debugging, try `GET /urls/:port/health` to confirm the server is up.\n' +
'\n' +
'---\n' +
'\n' +
'## Example AI Behavior\n' +
'\n' +
'**User:** "The app is crashing when I try to create a booking."\n' +
'\n' +
'**AI:**\n' +
'1. Calls `GET /errors/unread-count` \u2192 returns `{ "count": 3 }`\n' +
'2. Calls `GET /errors/latest` \u2192 sees `TypeError` in `BookingForm.tsx:42`\n' +
'3. Reads `BookingForm.tsx` from disk to understand the context\n' +
'4. Answers: "There\'s a TypeError on line 42 of `BookingForm.tsx` \u2014 it\'s trying to\n' +
'   call `.map()` on an undefined value. The `occurrences` field shows this\n' +
'   happened 3 times. The `attendees` prop likely isn\'t being passed correctly."\n' +
'\n' +
'**User:** "Start the dev server for my project and check if it runs."\n' +
'\n' +
'**AI:**\n' +
'1. POST /commands/run { "command": "npm run dev", "cwd": "/project" }\n' +
'2. GET /commands/1/output?tail=50\n' +
'   \u2192 sees "Local: http://localhost:5173"\n' +
'3. GET /urls/5173/wait?timeout=30000\n' +
'   \u2192 server responds with 200\n' +
'4. GET /urls/5173/test\n' +
'   \u2192 fetches the HTML, confirms the app is running\n' +
'5. GET /errors/unread-count\n' +
'   \u2192 0 errors during startup \u2014 clean launch\n' +
'6. Answers: "Your dev server is running at http://localhost:5173 and started cleanly."\n' +
'\n' +
'**Never answer without checking the API first.**\n';

    fs.mkdirSync(path.dirname(cheatsheetPath), { recursive: true });
    fs.writeFileSync(cheatsheetPath, content, 'utf8');
    console.log('[ErrorCopServer] Cheatsheet written to ' + cheatsheetPath);
    return { success: true, content: content };
  } catch (e) {
    console.error('[ErrorCopServer] Failed to write cheatsheet:', e.message);
    return { success: false, error: e.message };
  }
}

function stop() {
  if (_server) {
    _server.close();
    _server = null;
    _startTime = null;
    console.log('[ErrorCopServer] Stopped');
  }
}

function isRunning() {
  return _server !== null;
}

function start(engine) {
  stop();
  setEngine(engine);

  _server = http.createServer(function (req, res) {
    try {
      var parsed = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
      var path = parsed.pathname;
      var method = req.method;

      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
      }

      if (method === 'POST') {
        if (path === '/commands/run') {
          commandsApi.getBody(req).then(function (body) {
            json(res, 200, commandsApi.runCommand(_runner, body));
          });
          return;
        }
        if (path === '/commands/stop') {
          commandsApi.getBody(req).then(function (body) {
            json(res, 200, commandsApi.stopCommand(_runner, body));
          });
          return;
        }
        error(res, 404, 'Not found');
        return;
      }

      if (method !== 'GET') {
        error(res, 405, 'Method not allowed');
        return;
      }

      if (path === '/health') {
        json(res, 200, { status: 'ok', uptime: getUptime(), port: PORT });
        return;
      }

      if (path === '/endpoints' || path === '/') {
        json(res, 200, { endpoints: ENDPOINTS, port: PORT });
        return;
      }

      if (path === '/errors/latest') {
        json(res, 200, errorsApi.getErrors(getStorage(), { limit: 10 }));
        return;
      }

      if (path === '/errors/unread-count') {
        json(res, 200, errorsApi.getUnreadCount(getNotify()));
        return;
      }

      if (path === '/errors/summary') {
        json(res, 200, errorsApi.getSummary(getStorage()));
        return;
      }

      if (path === '/errors/mark-read') {
        json(res, 200, errorsApi.markRead(getNotify()));
        return;
      }

      if (path === '/errors') {
        var level = parsed.searchParams.get('level') || undefined;
        var limit = parseInt(parsed.searchParams.get('limit'), 10) || 50;
        var offset = parseInt(parsed.searchParams.get('offset'), 10) || 0;
        var startDate = parsed.searchParams.get('startDate') || undefined;
        var endDate = parsed.searchParams.get('endDate') || undefined;
        json(res, 200, errorsApi.getErrors(getStorage(), { level: level, limit: limit, offset: offset, startDate: startDate, endDate: endDate }));
        return;
      }

      var errorDetailMatch = path.match(/^\/errors\/(\d+)$/);
      if (errorDetailMatch) {
        var detail = errorsApi.getErrorDetail(getStorage(), parseInt(errorDetailMatch[1], 10));
        if (detail) {
          json(res, 200, detail);
        } else {
          error(res, 404, 'Error not found');
        }
        return;
      }

      var sessionMatch = path.match(/^\/errors\/session\/(\d+)$/);
      if (sessionMatch) {
        json(res, 200, errorsApi.getSessionErrors(getStorage(), parseInt(sessionMatch[1], 10)));
        return;
      }

      if (path === '/sessions') {
        var sLimit = parseInt(parsed.searchParams.get('limit'), 10) || 20;
        json(res, 200, sessionsApi.getSessions(getStorage(), sLimit));
        return;
      }

      if (path === '/timeline') {
        var tLimit = parseInt(parsed.searchParams.get('limit'), 10) || 50;
        json(res, 200, errorsApi.getTimeline(getStorage(), { limit: tLimit }));
        return;
      }

      if (path === '/commands') {
        json(res, 200, commandsApi.listCommands(_runner));
        return;
      }

      var cmdIdMatch = path.match(/^\/commands\/(\d+)$/);
      if (cmdIdMatch) {
        var cmdId = parseInt(cmdIdMatch[1], 10);
        json(res, 200, commandsApi.getCommand(_runner, cmdId));
        return;
      }

      var cmdOutputMatch = path.match(/^\/commands\/(\d+)\/output$/);
      if (cmdOutputMatch) {
        var cmdOutId = parseInt(cmdOutputMatch[1], 10);
        var tail = parseInt(parsed.searchParams.get('tail'), 10) || 100;
        json(res, 200, { id: cmdOutId, output: commandsApi.getCommandOutput(_runner, cmdOutId, tail) });
        return;
      }

      if (path === '/urls') {
        json(res, 200, urlsApi.listUrls(_urlTracker));
        return;
      }

      var urlHealthMatch = path.match(/^\/urls\/(\d+)\/health$/);
      if (urlHealthMatch) {
        var healthPort = parseInt(urlHealthMatch[1], 10);
        urlsApi.healthCheck(_urlTracker, healthPort).then(function (result) {
          json(res, 200, result);
        });
        return;
      }

      var urlTestMatch = path.match(/^\/urls\/(\d+)\/test$/);
      if (urlTestMatch) {
        var testPort = parseInt(urlTestMatch[1], 10);
        urlsApi.fetchTest(_urlTracker, testPort).then(function (result) {
          json(res, 200, result);
        });
        return;
      }

      var urlWaitMatch = path.match(/^\/urls\/(\d+)\/wait$/);
      if (urlWaitMatch) {
        var waitPort = parseInt(urlWaitMatch[1], 10);
        var waitTimeout = parseInt(parsed.searchParams.get('timeout'), 10) || 30000;
        urlsApi.waitForReady(_urlTracker, waitPort, waitTimeout).then(function (result) {
          json(res, 200, result);
        });
        return;
      }

      // ── Watcher routes ──
      if (path === '/watcher/health') {
        json(res, 200, watcherApi.getHealth());
        return;
      }

      if (path === '/watcher/sessions') {
        json(res, 200, watcherApi.getSessions());
        return;
      }

      if (path === '/watcher/events') {
        var wsId = parseInt(parsed.searchParams.get('sessionId'), 10);
        if (!wsId) { error(res, 400, 'sessionId required'); return; }
        var wStart = parseInt(parsed.searchParams.get('start'), 10) || 0;
        var wLimit = parseInt(parsed.searchParams.get('limit'), 10) || 50;
        json(res, 200, watcherApi.getSessionEvents(wsId, { start: wStart, limit: wLimit }));
        return;
      }

      if (path === '/watcher/events/last') {
        var wsLastId = parseInt(parsed.searchParams.get('sessionId'), 10);
        if (!wsLastId) { error(res, 400, 'sessionId required'); return; }
        var wTail = parseInt(parsed.searchParams.get('tail'), 10) || 50;
        json(res, 200, watcherApi.getLastEvents(wsLastId, { tail: wTail }));
        return;
      }

      if (path === '/watcher/timeline') {
        var wsTimelineId = parseInt(parsed.searchParams.get('sessionId'), 10);
        if (!wsTimelineId) { error(res, 400, 'sessionId required'); return; }
        var wTLimit = parseInt(parsed.searchParams.get('limit'), 10) || 100;
        json(res, 200, watcherApi.getTimeline(wsTimelineId, { limit: wTLimit }));
        return;
      }

      if (path === '/watcher/query') {
        json(res, 200, watcherApi.getSessionQuery({
          sessionId: parsed.searchParams.get('sessionId'),
          type: parsed.searchParams.get('type'),
          level: parsed.searchParams.get('level'),
          after: parsed.searchParams.get('after'),
          limit: parsed.searchParams.get('limit'),
        }));
        return;
      }

      if (path === '/watcher/summary') {
        var wsSumId = parseInt(parsed.searchParams.get('sessionId'), 10);
        if (!wsSumId) { error(res, 400, 'sessionId required'); return; }
        json(res, 200, watcherApi.getSummary(wsSumId));
        return;
      }

      if (path === '/watcher/snapshot') {
        var wsSnapId = parseInt(parsed.searchParams.get('sessionId'), 10);
        if (!wsSnapId) { error(res, 400, 'sessionId required'); return; }
        json(res, 200, watcherApi.getSnapshot(wsSnapId));
        return;
      }

      error(res, 404, 'Not found');
    } catch (e) {
      console.error('[ErrorCopServer]', e);
      error(res, 500, 'Internal server error');
    }
  });

  _startTime = Date.now();

  _server.listen(PORT, '127.0.0.1', function () {
    console.log('[ErrorCopServer] Listening on http://127.0.0.1:' + PORT);
    console.log('[ErrorCopServer] Available endpoints (' + ENDPOINTS.length + '):');
    ENDPOINTS.forEach(function (ep) {
      console.log('[ErrorCopServer]   ' + ep.method + ' ' + ep.path);
    });
    generateCheatsheet();
  });

  _server.on('error', function (e) {
    console.error('[ErrorCopServer] Failed to start:', e.message);
  });

  return _server;
}

module.exports = { start, stop, isRunning, setEngine, generateCheatsheet };
