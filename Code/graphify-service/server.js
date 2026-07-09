'use strict';

const http = require('http');
const { initDb, getDb, getRepoInfo, closeDb } = require('./db');
const { queryRelevantCode } = require('./queryEngine');

const DB_PATH = process.argv[2];
const START_PORT = parseInt(process.argv[3] || '3333', 10);

let _dbReady = false;
let _dbError = null;
let _actualPort = START_PORT;

if (!DB_PATH) {
  process.stderr.write('[graphify] ERROR: No dbPath provided as argv[2]\n');
  process.exit(1);
}

async function boot() {
  try {
    await initDb(DB_PATH);
    _dbReady = true;
    process.stderr.write(`[graphify] DB loaded from ${DB_PATH}\n`);
  } catch (err) {
    _dbError = `Symbol index not found: ${err.message}. Please index your codebase first.`;
    process.stderr.write(`[graphify] ${_dbError}\n`);
  }

  const server = http.createServer(handleRequest);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && _actualPort < START_PORT + 10) {
      _actualPort++;
      process.stderr.write(`[graphify] Port ${_actualPort - 1} in use, trying ${_actualPort}...\n`);
      server.listen(_actualPort, '127.0.0.1');
    } else {
      process.stderr.write(`[graphify] Server error: ${err.message}\n`);
      process.exit(1);
    }
  });

  server.listen(_actualPort, '127.0.0.1', () => {
    process.stdout.write(JSON.stringify({ ready: true, port: _actualPort }) + '\n');
    process.stderr.write(`[graphify] Listening on http://127.0.0.1:${_actualPort}\n`);
  });
}

function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    return handleHealth(req, res);
  }

  if (req.method === 'GET' && req.url === '/info') {
    return handleInfo(req, res);
  }

  if (req.method === 'GET' && (req.url === '/endpoints' || req.url === '/')) {
    return handleEndpoints(req, res);
  }

  if (req.method === 'POST' && req.url === '/graph/relevant-code') {
    return handleQuery(req, res);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

function handleHealth(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, ready: _dbReady }));
}

function handleEndpoints(req, res) {
  const endpoints = [
    { method: 'GET',    path: '/health',              description: 'Server health check (returns ok + ready)' },
    { method: 'GET',    path: '/info',                description: 'Repo statistics (files, symbols, port)' },
    { method: 'GET',    path: '/endpoints',           description: 'This list of available endpoints' },
    { method: 'POST',   path: '/graph/relevant-code', description: 'Find relevant code. Body: { query, repoPath? }' },
  ];
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ endpoints, port: _actualPort }));
}

function handleInfo(req, res) {
  if (!_dbReady) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: _dbError || 'DB not loaded', ready: false }));
    return;
  }

  try {
    const db = getDb();
    const stmt = db.prepare('SELECT repo_path FROM repositories WHERE indexed = 1 ORDER BY last_indexed DESC LIMIT 1');
    let repoPath = null;
    if (stmt.step()) {
      repoPath = stmt.getAsObject().repo_path;
    }
    stmt.free();

    let info = null;
    if (repoPath) {
      info = getRepoInfo(repoPath);
    }

    if (info) {
      info.port = _actualPort;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(info));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ repoPath: null, repoName: 'unknown', totalFiles: 0, totalSymbols: 0, port: _actualPort }));
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleQuery(req, res) {
  if (!_dbReady) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: _dbError || 'Symbol index not loaded. Please index your codebase first.', files: [], scores: [], explanation: '' }));
    return;
  }

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

process.on('SIGTERM', () => { closeDb(); process.exit(0); });
process.on('SIGINT',  () => { closeDb(); process.exit(0); });

boot();
