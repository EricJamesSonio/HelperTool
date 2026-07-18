'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { initFromJson, getIndexedData, getRepoInfo, closeDb } = require('./db');
const { queryRelevantCode } = require('./queryEngine');
const { KnowledgeGraph } = require('./graphBuilder');
const { exportAll, generatePrompt, loadGraphFromStorage } = require('./exporter');
const { RetrievalEngine } = require('./retrieval/retrieval-engine');

const REPO_PATH = process.argv[2] || null;
const START_PORT = parseInt(process.argv[3] || '3333', 10);

let _dbReady = false;
let _dbError = null;
let _actualPort = START_PORT;
let _repoPath = null;
let _serviceStopped = false;
let _graph = new KnowledgeGraph();
let _retrievalEngine = null;

function _initRetrievalEngine() {
  try {
    const result = loadGraphFromStorage(_repoPath);
    if (result.ok && result.graph) {
      _retrievalEngine = new RetrievalEngine(result.graph);
      process.stderr.write(`[graphify] Retrieval engine initialized: ${result.graph.nodes?.length || 0} nodes, ${result.graph.edges?.length || 0} edges\n`);
    } else {
      process.stderr.write(`[graphify] Retrieval engine unavailable: ${result.error || 'no graph data'}\n`);
    }
  } catch (err) {
    process.stderr.write(`[graphify] Retrieval engine init error: ${err.message}\n`);
    _retrievalEngine = null;
  }
}

function _buildGraph() {
  try {
    _graph = new KnowledgeGraph();
    const data = getIndexedData();
    if (!data) {
      process.stderr.write('[graphify] No data available, graph is empty\n');
      return;
    }
    _graph.initialize(data);
    _graph._scanMarkdown(_repoPath);
    _graph.runCommunityDetection();
    const s = _graph.getGraphStats();
    process.stderr.write(`[graphify] Knowledge graph built: ${s.totalNodes} nodes, ${s.totalEdges} edges, ${s.communityCount} communities\n`);
  } catch (err) {
    process.stderr.write(`[graphify] Graph build error: ${err.message}\n`);
    _graph = new KnowledgeGraph();
  }
}

async function boot() {
  let repoPath = REPO_PATH;

  if (!repoPath || !fs.existsSync(path.join(repoPath, 'MCP', 'graphify', 'symbol-index-storage', 'symbols.json'))) {
    const dbPath = process.argv[4] || null;
    if (dbPath && fs.existsSync(dbPath)) {
      try {
        const buffer = fs.readFileSync(dbPath);
        // Try to extract repo_path from the old sql.js DB file
        // This is a legacy path; prefer passing repoPath directly
        process.stderr.write(`[graphify] Legacy DB path provided: ${dbPath}. Ignoring, use REPO_PATH arg instead.\n`);
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
      process.stderr.write(`[graphify] Data loaded from ${repoPath}/MCP/graphify/symbol-index-storage/symbols.json\n`);
      _buildGraph();
      _initRetrievalEngine();
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

  if (req.method === 'POST' && req.url === '/admin/stop') {
    _serviceStopped = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method === 'POST' && req.url === '/admin/start') {
    _serviceStopped = false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method === 'POST' && req.url === '/admin/reload') {
    return handleAdminReload(req, res);
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

  if (req.method === 'GET' && req.url === '/api/stats') {
    return handleGraphStats(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/search')) {
    return handleApiSearch(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/node/')) {
    return handleApiNode(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/community/')) {
    return handleApiCommunity(req, res);
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

  if (req.method === 'POST' && req.url === '/retrieval/v1/query') {
    return handleRetrievalQuery(req, res);
  }
  if (req.method === 'GET' && req.url === '/retrieval/v1/features') {
    return handleRetrievalFeatures(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/retrieval/v1/concepts')) {
    return handleRetrievalConcepts(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/retrieval/v1/symbols')) {
    return handleRetrievalSymbols(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/retrieval/v1/dependencies')) {
    return handleRetrievalDependencies(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/retrieval/v1/path')) {
    return handleRetrievalPath(req, res);
  }
  if (req.method === 'GET' && req.url === '/retrieval/v1/stats') {
    return handleRetrievalStats(req, res);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

async function handleAdminReload(req, res) {
  try {
    process.stderr.write('[graphify] Reloading data...\n');
    await initFromJson(_repoPath);
    _buildGraph();
    _initRetrievalEngine();
    _serviceStopped = false;
    _dbError = null;
    _dbReady = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    _dbError = err.message;
    _dbReady = false;
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleHealth(req, res) {
  if (_serviceStopped) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, ready: false, stopped: true }));
  }
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
    { method: 'POST',   path: '/export/symbols',      description: 'Export symbol index to MCP/graphify/symbol-index-storage/symbols.json + generate prompt' },
    { method: 'POST',   path: '/export/prompt',       description: 'Regenerate only the AI prompt file' },
    { method: 'POST',   path: '/export/all',          description: 'Export symbols + generate prompt in one call' },
    { method: 'GET',    path: '/graph/from-storage',  description: 'Load AI-generated graph.json and graph.md from MCP/graphify/graphify-storage/' },
    { method: 'POST',   path: '/retrieval/v1/query',  description: 'Main retrieval query. Body: { query, limit?, depth?, tokenBudget?, diversify? }' },
    { method: 'GET',    path: '/retrieval/v1/features', description: 'List all features with file counts' },
    { method: 'GET',    path: '/retrieval/v1/concepts?q=', description: 'Search or list concepts' },
    { method: 'GET',    path: '/retrieval/v1/symbols?q=&limit=', description: 'Search symbols by name' },
    { method: 'GET',    path: '/retrieval/v1/dependencies?file=&depth=&direction=', description: 'Get dependency chain (forward/reverse)' },
    { method: 'GET',    path: '/retrieval/v1/path?from=&to=', description: 'Find shortest path between two files' },
    { method: 'GET',    path: '/retrieval/v1/stats', description: 'Retrieval engine statistics' },
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
    const info = getRepoInfo(_repoPath);
    if (info) {
      info.port = _actualPort;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(info));
    } else {
      const data = getIndexedData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        repoPath: data.repoInfo.repoPath || _repoPath,
        repoName: data.repoInfo.repoName || 'unknown',
        totalFiles: data.repoInfo.totalFiles || 0,
        totalSymbols: data.repoInfo.totalSymbols || 0,
        totalImports: data.repoInfo.totalImports || 0,
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

// ── Lightweight API handlers for Canvas UI ──

function handleApiSearch(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const query = url.searchParams.get('q');
    if (!query || !query.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing query parameter q' }));
      return;
    }
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const results = _graph.searchNodes(query.trim(), limit);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ results }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleApiNode(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const nodeId = req.url.replace('/api/node/', '').split('?')[0];
    const node = _graph.nodes.get(nodeId);
    if (!node) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Node not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(node));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleApiCommunity(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const commId = parseInt(req.url.replace('/api/community/', '').split('?')[0], 10);
    const members = [];
    for (const [id, node] of _graph.nodes) {
      if (node.community === commId) {
        members.push({ id, label: node.label, type: node.type, filePath: node.filePath, degree: node.degree });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ community: commId, nodeCount: members.length, members }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── Export handlers ──

function handleExportSymbols(req, res) {
  if (!_graphGuard(res)) return;
  try {
    const result = exportAll(_repoPath);
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
    const result = generatePrompt(_repoPath);
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
    const result = exportAll(_repoPath);
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
    const result = loadGraphFromStorage(_repoPath);
    res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}

// ── Retrieval Engine handlers ──

function _retrievalGuard(res) {
  if (!_retrievalEngine) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Retrieval engine not available. Run pipeline to generate graph.json first.' }));
    return false;
  }
  return true;
}

async function handleRetrievalQuery(req, res) {
  if (!_retrievalGuard(res)) return;
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }
    const { query, ...options } = payload || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing query' }));
      return;
    }
    try {
      const result = _retrievalEngine.retrieve(query.trim(), options);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result));
    } catch (err) {
      process.stderr.write(`[graphify] Retrieval error: ${err.message}\n`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

function handleRetrievalFeatures(req, res) {
  if (!_retrievalGuard(res)) return;
  try {
    const features = _retrievalEngine.featureResolver.listFeatures();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ features }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleRetrievalConcepts(req, res) {
  if (!_retrievalGuard(res)) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const q = url.searchParams.get('q');
    const concepts = q
      ? _retrievalEngine.conceptResolver.resolveByQuery(q)
      : _retrievalEngine.conceptResolver.listConcepts();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ concepts }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleRetrievalSymbols(req, res) {
  if (!_retrievalGuard(res)) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const q = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    if (!q) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing q parameter' }));
      return;
    }
    const symbols = _retrievalEngine.symbolResolver.searchSymbols(q, limit);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ symbols }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleRetrievalDependencies(req, res) {
  if (!_retrievalGuard(res)) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = url.searchParams.get('file');
    const depth = parseInt(url.searchParams.get('depth') || '1', 10);
    const direction = url.searchParams.get('direction') || 'forward';
    if (!file) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing file parameter' }));
      return;
    }
    const result = direction === 'reverse'
      ? _retrievalEngine.dependencyResolver.getDependents(file, depth)
      : _retrievalEngine.dependencyResolver.getDependencies(file, depth);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleRetrievalPath(req, res) {
  if (!_retrievalGuard(res)) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing from or to parameter' }));
      return;
    }
    const result = _retrievalEngine.pathFinder.shortestPath(from, to);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No path found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleRetrievalStats(req, res) {
  if (!_retrievalGuard(res)) return;
  try {
    const stats = _retrievalEngine.getStats();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(stats));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

process.on('SIGTERM', () => { closeDb(); process.exit(0); });
process.on('SIGINT',  () => { closeDb(); process.exit(0); });

process.on('unhandledRejection', (err) => {
  process.stderr.write(`[graphify] Unhandled rejection: ${err?.message || err}\n`);
});
process.on('uncaughtException', (err) => {
  process.stderr.write(`[graphify] Uncaught exception: ${err?.message || err}\n`);
});

boot();
