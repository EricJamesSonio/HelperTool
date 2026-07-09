'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { initFromJson, getDb, getRawData, getRepoInfo, closeDb } = require('./db');
const { queryRelevantCode } = require('./queryEngine');
const { KnowledgeGraph } = require('./graphBuilder');
const { exportAll, generatePrompt, loadGraphFromStorage } = require('./exporter');

const REPO_PATH = process.argv[2] || null;
const START_PORT = parseInt(process.argv[3] || '3333', 10);

let _dbReady = false;
let _dbError = null;
let _actualPort = START_PORT;
let _repoPath = null;
let _graph = new KnowledgeGraph();

function _buildGraph() {
  try {
    _graph = new KnowledgeGraph();
    const db = getDb();
    if (!db) {
      process.stderr.write('[graphify] No DB available, graph is empty\n');
      return;
    }
    _graph.buildFromDb(db, 1, _repoPath);
    const s = _graph.getGraphStats();
    process.stderr.write(`[graphify] Knowledge graph built: ${s.totalNodes} nodes, ${s.totalEdges} edges, ${s.communityCount} communities\n`);
  } catch (err) {
    process.stderr.write(`[graphify] Graph build error: ${err.message}\n`);
    _graph = new KnowledgeGraph();
  }
}

async function boot() {
  let repoPath = REPO_PATH;

  if (!repoPath || !fs.existsSync(path.join(repoPath, 'symbol-index-storage', 'symbols.json'))) {
    const dbPath = process.argv[4] || null;
    if (dbPath && fs.existsSync(dbPath)) {
      const initSqlJs = require(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.js'));
      try {
        const SQL = await initSqlJs();
        const buffer = fs.readFileSync(dbPath);
        const tmpDb = new SQL.Database(buffer);
        const stmt = tmpDb.prepare('SELECT repo_path FROM repositories ORDER BY last_indexed DESC LIMIT 1');
        if (stmt.step()) {
          repoPath = stmt.getAsObject().repo_path;
        }
        stmt.free();
        tmpDb.close();
      } catch (_) {}
    }
  }

  if (!repoPath) {
    _dbError = 'Cannot determine repository path. Select a repo and start the server from the Graphify UI.';
    process.stderr.write(`[graphify] ${_dbError}\n`);
  } else {
    try {
      await initFromJson(repoPath);
      _repoPath = repoPath;
      _dbReady = true;
      process.stderr.write(`[graphify] Data loaded from ${repoPath}/symbol-index-storage/symbols.json\n`);
      _buildGraph();
    } catch (err) {
      _dbError = err.message;
      process.stderr.write(`[graphify] ${_dbError}\n`);
    }
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

  if (req.method === 'GET' && req.url === '/graph') {
    return handleGraphVisualization(req, res);
  }
  if (req.method === 'GET' && req.url === '/graph/data') {
    return handleGraphData(req, res);
  }
  if (req.method === 'GET' && req.url === '/graph/report') {
    return handleGraphReport(req, res);
  }
  if (req.method === 'GET' && req.url === '/graph/communities') {
    return handleGraphCommunities(req, res);
  }
  if (req.method === 'GET' && req.url === '/graph/stats') {
    return handleGraphStats(req, res);
  }
  if (req.method === 'POST' && req.url === '/graph/neighborhood') {
    return handleGraphNeighborhood(req, res);
  }
  if (req.method === 'POST' && req.url === '/graph/shortest-path') {
    return handleGraphShortestPath(req, res);
  }
  if (req.method === 'POST' && req.url === '/graph/affected') {
    return handleGraphAffected(req, res);
  }
  if (req.method === 'POST' && req.url === '/graph/search') {
    return handleGraphSearch(req, res);
  }

  if (req.method === 'POST' && req.url === '/export/symbols') {
    return handleExportSymbols(req, res);
  }
  if (req.method === 'POST' && req.url === '/export/prompt') {
    return handleGeneratePrompt(req, res);
  }
  if (req.method === 'POST' && req.url === '/export/all') {
    return handleExportAll(req, res);
  }
  if (req.method === 'GET' && req.url === '/graph/from-storage') {
    return handleLoadFromStorage(req, res);
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
    { method: 'GET',    path: '/graph',               description: 'Interactive knowledge-graph visualization (HTML)' },
    { method: 'GET',    path: '/graph/data',          description: 'Knowledge graph JSON data for vis.js' },
    { method: 'GET',    path: '/graph/report',        description: 'Graph analysis report (god nodes, surprises)' },
    { method: 'GET',    path: '/graph/communities',   description: 'Detected communities in the codebase' },
    { method: 'GET',    path: '/graph/stats',         description: 'Graph statistics (nodes, edges, communities)' },
    { method: 'POST',   path: '/graph/neighborhood',  description: 'Get neighborhood around a node. Body: { nodeId, depth? }' },
    { method: 'POST',   path: '/graph/shortest-path', description: 'Find shortest path between two nodes. Body: { from, to }' },
    { method: 'POST',   path: '/graph/affected',      description: 'Find reverse impact (affected by). Body: { nodeId, depth? }' },
    { method: 'POST',   path: '/graph/search',        description: 'Search nodes by name. Body: { query, limit? }' },
    { method: 'POST',   path: '/export/symbols',      description: 'Export symbol index to symbol-index-storage/symbols.json + generate prompt' },
    { method: 'POST',   path: '/export/prompt',       description: 'Regenerate only the AI prompt file' },
    { method: 'POST',   path: '/export/all',          description: 'Export symbols + generate prompt in one call' },
    { method: 'GET',    path: '/graph/from-storage',  description: 'Load AI-generated graph.json and graph.md from graphify-storage/' },
  ];
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ endpoints, port: _actualPort }));
}

function handleInfo(req, res) {
  if (!_dbReady) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: _dbError || 'Symbol index not loaded', ready: false }));
    return;
  }

  try {
    let info = _repoPath ? getRepoInfo(_repoPath) : null;
    if (info) {
      info.port = _actualPort;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(info));
    } else {
      const raw = getRawData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        repoPath: raw?.repoPath || _repoPath,
        repoName: raw?.repoName || 'unknown',
        totalFiles: raw?.overview?.totalFiles || 0,
        totalSymbols: raw?.overview?.totalSymbols || 0,
        port: _actualPort,
      }));
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
      const result = queryRelevantCode(query.trim(), repoPath || _repoPath);
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

// ── Graph endpoint handlers ──

function _graphGuard(res) {
  if (!_dbReady) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Symbol index not loaded. Please index your codebase first.' }));
    return false;
  }
  return true;
}

function _parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve(null); }
    });
  });
}

function handleGraphVisualization(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const html = _graph.generateHtml();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleGraphData(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const data = _graph.toVisData();
    const stats = _graph.getGraphStats();
    const communities = _graph.getCommunities();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ...data, stats, communities }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleGraphReport(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const godNodes = _graph.getGodNodes(15);
    const surprisingEdges = _graph.getSurprisingEdges(15);
    const communities = _graph.getCommunities();
    const stats = _graph.getGraphStats();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ stats, godNodes, surprisingEdges, communities }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleGraphCommunities(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const communities = _graph.getCommunities();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ communities }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleGraphStats(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const stats = _graph.getGraphStats();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(stats));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleGraphNeighborhood(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const body = await _parseBody(req);
    if (!body || !body.nodeId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing nodeId' }));
      return;
    }
    const depth = typeof body.depth === 'number' ? body.depth : 1;
    const result = _graph.getNeighborhood(body.nodeId, depth);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Node '${body.nodeId}' not found` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleGraphShortestPath(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const body = await _parseBody(req);
    if (!body || !body.from || !body.to) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing from or to node ID' }));
      return;
    }
    const result = _graph.shortestPath(body.from, body.to);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No path found between the specified nodes' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleGraphAffected(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const body = await _parseBody(req);
    if (!body || !body.nodeId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing nodeId' }));
      return;
    }
    const depth = typeof body.depth === 'number' ? body.depth : 1;
    const result = _graph.getAffected(body.nodeId, depth);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Node '${body.nodeId}' not found` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleGraphSearch(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const body = await _parseBody(req);
    if (!body || !body.query || typeof body.query !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing query' }));
      return;
    }
    const limit = typeof body.limit === 'number' ? body.limit : 20;
    const results = _graph.searchNodes(body.query, limit);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ results }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── AI-enrichment handlers ──

function handleExportSymbols(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const result = exportAll();
    if (result.ok && result.promptPath) {
      result.promptText = fs.readFileSync(result.promptPath, 'utf-8');
    }
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}

function handleGeneratePrompt(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const result = generatePrompt();
    if (result.ok && result.path) {
      result.promptText = fs.readFileSync(result.path, 'utf-8');
    }
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}

function handleExportAll(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const result = exportAll();
    if (result.ok && result.promptPath) {
      result.promptText = fs.readFileSync(result.promptPath, 'utf-8');
    }
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}

function handleLoadFromStorage(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const result = loadGraphFromStorage();
    res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}

process.on('SIGTERM', () => { closeDb(); process.exit(0); });
process.on('SIGINT',  () => { closeDb(); process.exit(0); });

boot();
