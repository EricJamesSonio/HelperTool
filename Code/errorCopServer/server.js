var http = require('http');
var URL = require('url').URL;
var fs = require('fs');
var path = require('path');
var errorsApi = require('./routes/errors');
var sessionsApi = require('./routes/sessions');

var PORT = 3334;
var _storage = null;
var _notify = null;
var _startTime = null;
var _server = null;

function getUptime() {
  return _startTime ? Math.floor((Date.now() - _startTime) / 1000) : 0;
}

var ENDPOINTS = [
  { method: 'GET', path: '/health', description: 'Server health check with uptime' },
  { method: 'GET', path: '/endpoints', description: 'This list of available endpoints' },
  { method: 'GET', path: '/errors/latest', description: 'Latest 10 errors', params: {} },
  { method: 'GET', path: '/errors', description: 'Query errors by level, limit, offset, date range', params: { level: 'string', limit: 'number', offset: 'number', startDate: 'string', endDate: 'string' } },
  { method: 'GET', path: '/errors/session/:id', description: 'Errors for a specific terminal session', params: { sessionId: 'number' } },
  { method: 'GET', path: '/errors/summary', description: 'AI-optimized summary with recent, mostFrequent, byType' },
  { method: 'GET', path: '/errors/unread-count', description: 'Count of new/unread errors' },
  { method: 'GET', path: '/sessions', description: 'Terminal sessions list', params: { limit: 'number' } },
  { method: 'GET', path: '/timeline', description: 'Chronological timeline of errors and events', params: { limit: 'number' } },
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
}

function generateCheatsheet() {
  try {
    var cheatsheetPath = path.resolve(__dirname, '..', '..', 'MCP', 'errorCop', 'errorcop-cheatsheet.md');
    var epTable = ENDPOINTS.map(function (e) {
      return '| `' + e.method + ' ' + e.path + '` | ' + e.description + ' |';
    }).join('\n');

    var content = '# ErrorCop — Runtime Error API for AI Agents\n' +
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
'### `GET /errors/latest` \u2190 PRIMARY ENTRY POINT\n' +
'\n' +
'Start here after confirming there are unread errors. Returns the 10 most recent\n' +
'errors with file/line info extracted from stack traces.\n' +
'\n' +
'```\n' +
'GET /errors/latest\n' +
'```\n' +
'\n' +
'```json\n' +
'[\n' +
'  {\n' +
'    "id": 42,\n' +
'    "type": "error",\n' +
'    "message": "TypeError: Cannot read properties of undefined (reading \'map\')",\n' +
'    "file": "/src/components/TaskList.tsx",\n' +
'    "line": 153,\n' +
'    "timestamp": 1734567890000,\n' +
'    "occurrences": 3\n' +
'  }\n' +
']\n' +
'```\n' +
'\n' +
'The `file` and `line` fields are extracted from stack traces when available.\n' +
'Use them to jump directly to the failing code.\n' +
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
'Response is the same array format as `/errors/latest`.\n' +
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
'Returns all errors from that session, oldest first. Same format as above.\n' +
'\n' +
'---\n' +
'\n' +
'### `GET /errors/summary` \u2014 AI-optimized overview\n' +
'\n' +
'A single call that gives you the full picture: recent errors, most frequent\n' +
'recurring errors, and counts by severity.\n' +
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
'Use this to quickly identify the most impactful errors (high `occurrences`)\n' +
'and decide what to fix first.\n' +
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
'    "sessionId": 3,\n' +
'    "command": "npm run build",\n' +
'    "occurrences": 1\n' +
'  }\n' +
']\n' +
'```\n' +
'\n' +
'Each entry includes the session\'s command so you can trace which operation\n' +
'triggered the error. Use this when debugging multi-step build or deploy\n' +
'processes.\n' +
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
'4. Answer based on the actual errors\n' +
'```\n' +
'\n' +
'### Pattern B: "Deep investigation"\n' +
'\n' +
'```\n' +
'1. GET /errors/summary\n' +
'   \u2192 see most frequent errors + breakdown by type\n' +
'2. GET /errors/session/:id for the session with the most errors\n' +
'   \u2192 see every error from that run in order\n' +
'3. GET /timeline?limit=20\n' +
'   \u2192 understand the sequence of failures\n' +
'4. Read the failing files from disk\n' +
'5. Answer with root cause + affected files\n' +
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
'**Never answer without checking the API first.**\n';

    fs.mkdirSync(path.dirname(cheatsheetPath), { recursive: true });
    fs.writeFileSync(cheatsheetPath, content, 'utf8');
    console.log('[ErrorCopServer] Cheatsheet written to ' + cheatsheetPath);
  } catch (e) {
    console.error('[ErrorCopServer] Failed to write cheatsheet:', e.message);
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
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
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

      if (path === '/errors') {
        var level = parsed.searchParams.get('level') || undefined;
        var limit = parseInt(parsed.searchParams.get('limit'), 10) || 50;
        var offset = parseInt(parsed.searchParams.get('offset'), 10) || 0;
        var startDate = parsed.searchParams.get('startDate') || undefined;
        var endDate = parsed.searchParams.get('endDate') || undefined;
        json(res, 200, errorsApi.getErrors(getStorage(), { level: level, limit: limit, offset: offset, startDate: startDate, endDate: endDate }));
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

module.exports = { start, stop, isRunning, setEngine };
