/**
 * graphify-service/server.js
 * Standalone HTTP server. Spawned as a child process by graphify_ipc.js.
 * Usage: node server.js <dbPath> [port]
 *
 * Opens the symbol index DB in read-only mode (never writes).
 * Exposes: POST /graph/relevant-code
 */

'use strict';

const http = require('http');
const { initDb, closeDb } = require('./db');
const { queryRelevantCode } = require('./queryEngine');

const DB_PATH = process.argv[2];
const PORT    = parseInt(process.argv[3] || '3333', 10);

if (!DB_PATH) {
  process.stderr.write('[graphify] ERROR: No dbPath provided as argv[2]\n');
  process.exit(1);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  try {
    await initDb(DB_PATH);
    process.stderr.write(`[graphify] DB loaded from ${DB_PATH}\n`);
  } catch (err) {
    process.stderr.write(`[graphify] DB init failed: ${err.message}\n`);
    process.exit(1);
  }

  const server = http.createServer(handleRequest);

  server.listen(PORT, '127.0.0.1', () => {
    // Signal to parent that we're ready — parent listens for this exact line
    process.stdout.write(JSON.stringify({ ready: true, port: PORT }) + '\n');
    process.stderr.write(`[graphify] Listening on http://127.0.0.1:${PORT}\n`);
  });

  server.on('error', (err) => {
    process.stderr.write(`[graphify] Server error: ${err.message}\n`);
    process.exit(1);
  });
}

// ── Request handler ───────────────────────────────────────────────────────────

function handleRequest(req, res) {
  // CORS for renderer (file:// or localhost origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/graph/relevant-code') {
    return handleQuery(req, res);
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

function handleQuery(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { query, repoPath } = payload || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing query' }));
      return;
    }

    const start = Date.now();
    try {
      const result = queryRelevantCode(query.trim(), repoPath || null);
      result.ms = Date.now() - start;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      process.stderr.write(`[graphify] Query error: ${err.message}\n`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

process.on('SIGTERM', () => { closeDb(); process.exit(0); });
process.on('SIGINT',  () => { closeDb(); process.exit(0); });

boot();