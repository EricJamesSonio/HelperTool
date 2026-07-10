const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GRAPH_VERSION = 2;
const AFFECTED_BFS_DEPTH = 1;

// ---------- helpers ----------
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const dirOf = p => { const i = p.lastIndexOf('/'); return i >= 0 ? p.slice(0, i) : ''; };
const baseName = p => { const i = p.lastIndexOf('/'); return i >= 0 ? p.slice(i + 1) : p; };
const round3 = n => Math.round(n * 1000) / 1000;

// Normalize source code for deterministic content hashing
function normalizeSourceCode(code) {
  return code
    .replace(/\r\n?/g, '\n')                           // normalize line endings
    .replace(/\/\/.*$/gm, '')                            // strip single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')                     // strip multi-line comments
    .replace(/[ \t]+$/gm, '')                             // trim trailing whitespace
    .replace(/\n{3,}/g, '\n\n')                           // collapse 3+ blank lines to 2
    .trim();
}

function computeContentHash(filePath, repoRoot) {
  try {
    const fullPath = path.join(repoRoot, filePath);
    if (!fs.existsSync(fullPath)) return '';
    const code = fs.readFileSync(fullPath, 'utf8');
    return crypto.createHash('sha256').update(normalizeSourceCode(code)).digest('hex');
  } catch {
    return '';
  }
}

function computeStructureHash(symbols, imports) {
  const data = JSON.stringify({ symbols, imports });
  return crypto.createHash('sha256').update(data).digest('hex');
}
// Affected Node Analyzer: BFS on previous graph edges from changed files
function analyzeAffectedNodes(changedFiles, newFiles, prevGraph, depth = 1) {
  const affected = new Set([...changedFiles, ...newFiles]);
  if (!prevGraph || !Array.isArray(prevGraph.edges) || prevGraph.edges.length === 0) {
    return { affected, generationMode: affected.size === 0 ? 'none' : 'full' };
  }
  let queue = [...affected];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const fp of queue) {
      const nodeId = 'file-' + fp;
      for (const e of prevGraph.edges) {
        if (e.source === nodeId && e.target !== nodeId) {
          const tgt = e.target.startsWith('file-') ? e.target.slice(5) : e.target;
          if (tgt && !affected.has(tgt)) { affected.add(tgt); next.push(tgt); }
        }
        if (e.target === nodeId && e.source !== nodeId) {
          const src = e.source.startsWith('file-') ? e.source.slice(5) : e.source;
          if (src && !affected.has(src)) { affected.add(src); next.push(src); }
        }
      }
    }
    queue = next;
  }
  const total = changedFiles.size + newFiles.size;
  const gm = total === 0 ? 'none' : affected.size === total ? 'minimal' : 'neighborhood';
  return { affected, generationMode: gm };
}

const resolveImport = (sourceFile, importPath, allFiles) => {
  if (!importPath.startsWith('.')) return null;
  const srcDir = dirOf(sourceFile);
  const candidates = [];
  // Try with .js extension
  let resolved = path.posix ? path.posix.normalize(srcDir + '/' + importPath) : importPath.replace(/\\/g, '/');
  // Manual normalize since path.posix may not be available
  const resolve = (base, rel) => {
    const parts = (base + '/' + rel).split('/');
    const out = [];
    for (const p of parts) {
      if (p === '.' || p === '') continue;
      if (p === '..') { if (out.length) out.pop(); }
      else out.push(p);
    }
    return out.join('/');
  };
  const base = resolve(srcDir, importPath);
  candidates.push(base + '.js');
  candidates.push(base + '/index.js');
  for (const c of candidates) {
    if (allFiles.has(c)) return c;
  }
  return null;
};

// ---------- load ----------
const raw = JSON.parse(fs.readFileSync('graphify/symbol-index-storage/symbols.json', 'utf8'));
const files = raw.files;
const symbols = raw.symbols;
const imports = raw.imports;

// ---------- incremental hash comparison (v2) ----------
const HASH_FILE = 'graphify/graphify-storage/.file-hashes.json';
const outDirIncr = 'graphify/graphify-storage';
if (!fs.existsSync(outDirIncr)) fs.mkdirSync(outDirIncr, { recursive: true });

let prevHashes = {};
if (fs.existsSync(HASH_FILE)) {
  try { prevHashes = JSON.parse(fs.readFileSync(HASH_FILE, 'utf8')); } catch {}
}

// Migrate v1 hashes ({ path: hex }) to v2 ({ path: { contentHash, structureHash, ... } })
const REPO_ROOT = raw.repoPath || '.';
let migratedCount = 0;
for (const [fp, val] of Object.entries(prevHashes)) {
  if (typeof val === 'string') {
    prevHashes[fp] = {
      contentHash: computeContentHash(fp, REPO_ROOT),
      structureHash: val,
      lastGenerated: new Date().toISOString(),
      graphVersion: 1
    };
    migratedCount++;
  }
}
if (migratedCount > 0) console.log(`Migrated ${migratedCount} v1 hashes to v2 format`);

// Compute current hashes
const symsByFileForHash = new Map();
for (const s of symbols) {
  if (!symsByFileForHash.has(s.filePath)) symsByFileForHash.set(s.filePath, []);
  symsByFileForHash.get(s.filePath).push(s);
}
const impsByFileForHash = new Map();
for (const im of imports) {
  if (!impsByFileForHash.has(im.sourceFile)) impsByFileForHash.set(im.sourceFile, []);
  impsByFileForHash.get(im.sourceFile).push(im);
}

const curHashes = {};
for (const f of files) {
  const fp = f.path;
  const syms = symsByFileForHash.get(fp) || [];
  const imps = impsByFileForHash.get(fp) || [];
  curHashes[fp] = {
    contentHash: computeContentHash(fp, REPO_ROOT),
    structureHash: computeStructureHash(syms, imps),
    lastGenerated: new Date().toISOString(),
    graphVersion: GRAPH_VERSION
  };
}

// Determine which files changed (based on structureHash)
const changedFiles = new Set();
const unchangedFiles = new Set();
const newFiles = new Set();
for (const fp of Object.keys(curHashes)) {
  if (prevHashes[fp] === undefined) newFiles.add(fp);
  else if (prevHashes[fp].structureHash !== curHashes[fp].structureHash) changedFiles.add(fp);
  else unchangedFiles.add(fp);
}
for (const fp of Object.keys(prevHashes)) {
  if (curHashes[fp] === undefined) changedFiles.add(fp);
}

// Load previous graph.json for BFS traversal
let prevGraph = null;
const GRAPH_FILE = 'graphify/graphify-storage/graph.json';
if (fs.existsSync(GRAPH_FILE)) {
  try { prevGraph = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8')); } catch {}
}

// Run Affected Node Analyzer
const { affected: affectedSet, generationMode } = analyzeAffectedNodes(changedFiles, newFiles, prevGraph, AFFECTED_BFS_DEPTH);
const unaffectedFiles = new Set([...unchangedFiles].filter(f => !affectedSet.has(f)));
const neighborCount = [...affectedSet].filter(f => !changedFiles.has(f) && !newFiles.has(f)).length;

const totalFiles = files.length;
console.log(`Incremental: ${totalFiles} files (${newFiles.size} new, ${changedFiles.size} changed, ${unaffectedFiles.size} unaffected + ${neighborCount} neighbor-affected)`);
console.log(`  Affected set: ${affectedSet.size} files (mode: ${generationMode})`);

// ---------- classify features ----------
const featureMap = new Map(); // filePath -> Set of feature names
const fileDirSet = new Set(files.map(f => dirOf(f.path)));

const featureRules = [
  { re: /\/config\//,              feat: 'core', tag: 'config' },
  { re: /\/database\//,            feat: 'database', tag: 'database' },
  { re: /\/database\/chatDb/,      feat: 'chat', tag: 'chat-db' },
  { re: /\/graphify-service\//,    feat: 'knowledgeGraph', tag: 'graphify' },
  { re: /\/indexer\//,             feat: 'indexer', tag: 'indexer' },
  { re: /\/indexer-service\//,     feat: 'indexer', tag: 'indexer-service' },
  { re: /\/ipc\/[^/]+_ipc\.js$/,   feat: 'core', tag: 'ipc' },
  { re: /\/ipc\/opencode_ipc/,     feat: 'core', tag: 'ipc-openCode' },
  { re: /\/ipc\/git_ipc/,          feat: 'git', tag: 'ipc-git' },
  { re: /\/ipc\/profile/,          feat: 'core', tag: 'ipc-profile' },
  { re: /\/preload\//,             feat: 'core', tag: 'preload' },
  { re: /\/renderer\/app_manager/, feat: 'automation', tag: 'app-manager' },
  { re: /\/renderer\/automationSketch/, feat: 'automation', tag: 'automation-sketch' },
  { re: /\/renderer\/canvasTool/,  feat: 'canvas', tag: 'canvas' },
  { re: /\/renderer\/codebaseMap/, feat: 'codebaseMap', tag: 'codebase-map' },
  { re: /\/renderer\/codebbaseChat/, feat: 'chat', tag: 'chat-ui' },
  { re: /\/renderer\/codeswampUI/, feat: 'codeswamp', tag: 'code-swamp' },
  { re: /\/renderer\/databaseInspector/, feat: 'dbInspector', tag: 'db-inspector' },
  { re: /\/renderer\/dockerTool/,  feat: 'docker', tag: 'docker' },
  { re: /\/renderer\/envManager/,  feat: 'envManager', tag: 'env-manager' },
  { re: /\/renderer\/fileSeederTool/, feat: 'fileSeeder', tag: 'file-seeder' },
  { re: /\/renderer\/gitTool/,     feat: 'git', tag: 'git-ui' },
  { re: /\/renderer\/githubExplorer/, feat: 'github', tag: 'github' },
  { re: /\/renderer\/gmailTool/,   feat: 'gmail', tag: 'gmail' },
  { re: /\/renderer\/graphify/,    feat: 'knowledgeGraph', tag: 'graphify-ui' },
  { re: /\/renderer\/promptTool/,  feat: 'prompts', tag: 'prompts' },
  { re: /\/renderer\/secretHolder/, feat: 'secrets', tag: 'secrets' },
  { re: /\/renderer\/settingsManager/, feat: 'settings', tag: 'settings' },
  { re: /\/renderer\/shortcutMode/, feat: 'shortcuts', tag: 'shortcut-mode' },
  { re: /\/renderer\/shortcuts/,   feat: 'shortcuts', tag: 'shortcuts' },
  { re: /\/renderer\/symbolIndex/, feat: 'symbolIndex', tag: 'symbol-index' },
  { re: /\/renderer\/uiLayoutHelper/, feat: 'uiLayout', tag: 'ui-layout' },
  { re: /\/renderer\/videoTool/,   feat: 'video', tag: 'video' },
  { re: /\/renderer\/workspace/,   feat: 'workspace', tag: 'workspace' },
  { re: /\/renderer\/dependencies/, feat: 'core', tag: 'dependencies' },
  { re: /\/renderer\/locDetector/, feat: 'core', tag: 'loc-detector' },
  { re: /\/renderer\/terminal/,    feat: 'core', tag: 'terminal' },
  { re: /\/renderer\/blueprint/,   feat: 'blueprint', tag: 'blueprint' },
  { re: /\/renderer\/filter/,      feat: 'core', tag: 'filter' },
  { re: /\/renderer\/apiTool/,     feat: 'apiTool', tag: 'api-tool' },
  { re: /\/renderer\/diffViewer/,  feat: 'git', tag: 'diff-viewer' },
  { re: /\/services\//,            feat: 'core', tag: 'services' },
  { re: /\/utils\//,               feat: 'core', tag: 'utils' },
  { re: /\/worker-service\//,      feat: 'worker', tag: 'worker' },
  { re: /\/main\.js$/,             feat: 'core', tag: 'main-process' },
  { re: /\/preload\.js$/,          feat: 'core', tag: 'preload' },
];

for (const f of files) {
  const feats = new Set();
  for (const rule of featureRules) {
    if (rule.re.test(f.path)) feats.add(rule.feat);
  }
  if (feats.size === 0) feats.add('core');
  featureMap.set(f.path, feats);
}

// Also add tag info to features
const tagMap = new Map();
for (const f of files) {
  const tags = new Set();
  for (const rule of featureRules) {
    if (rule.re.test(f.path) && rule.tag) tags.add(rule.tag);
  }
  if (tags.size === 0 && f.path.endsWith('.js')) tags.add('javascript');
  tagMap.set(f.path, tags);
}

// ---------- build file index ----------
const fileIndex = new Map(); // path -> file obj
for (const f of files) fileIndex.set(f.path, f);

// ---------- gather symbols per file ----------
const symsByFile = new Map();
for (const s of symbols) {
  if (!symsByFile.has(s.filePath)) symsByFile.set(s.filePath, []);
  symsByFile.get(s.filePath).push(s);
}

// ---------- gather imports per file (outgoing) ----------
const importsByFile = new Map();
for (const im of imports) {
  if (!importsByFile.has(im.sourceFile)) importsByFile.set(im.sourceFile, []);
  importsByFile.get(im.sourceFile).push(im);
}

// ---------- BUILD NODES ----------
const nodes = [];
const nodeIds = new Set();

// Index previous graph nodes by file path for incremental reuse
const prevNodesByPath = new Map();
if (prevGraph && Array.isArray(prevGraph.nodes)) {
  for (const n of prevGraph.nodes) {
    if (n.filePath) prevNodesByPath.set(n.filePath, n);
  }
}

let reusedCount = 0;

for (const f of files) {
  const p = f.path;

  // Reuse existing node if unaffected by any change (preserves AI-enriched data)
  if (unaffectedFiles.has(p) && prevNodesByPath.has(p)) {
    const oldNode = prevNodesByPath.get(p);
    // Update only the deterministic fields that might have drifted
    // (stats are regenerated from fresh symbol data; everything else preserved)
    nodes.push(oldNode);
    nodeIds.add(oldNode.id);
    reusedCount++;
    continue;
  }
  const syms = symsByFile.get(p) || [];
  const feats = [...(featureMap.get(p) || ['core'])];
  const tags = [...(tagMap.get(p) || [])];
  if (f.language) tags.push(f.language);

  // Count symbols by type for summary
  const typeCounts = {};
  let exportedCount = 0;
  const funSyms = [];
  for (const s of syms) {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
    if (s.isExported) exportedCount++;
    if (s.type === 'function' || s.type === 'class' || s.type === 'method') {
      funSyms.push(s);
    }
  }

  // Generate summary based on path and symbols
  const dir = dirOf(p);
  const bn = baseName(p);
  let summary = '';
  const parts = p.split('/');

  if (p === 'Code/main.js') {
    summary = 'Electron main process entry point. Initializes databases, registers IPC handlers, creates browser window, manages app lifecycle.';
  } else if (p === 'Code/preload.js') {
    summary = 'Preload script exposing limited, safe IPC bridge to renderer processes via contextBridge.';
  } else if (bn.includes('ipc') && parts.includes('ipc')) {
    const area = bn.replace(/_ipc\.js$/, '').replace(/_/g, ' ');
    summary = `IPC handler for ${area} operations. Registers ipcMain.handle() listeners bridging main process to renderer.`;
  } else if (dir.endsWith('/database')) {
    summary = `Database access layer for ${bn.replace('.js', '')}. Provides CRUD operations via better-sqlite3 or sql.js.`;
  } else if (dir.endsWith('/graphify-service')) {
    summary = `Graphify service ${bn.replace('.js', '')}. Part of the knowledge graph system for codebase analysis.`;
  } else if (dir.endsWith('/indexer')) {
    summary = `Codebase indexer ${bn.replace('.js', '')}. Parses source code to extract symbols, imports, and structure.`;
  } else if (dir.endsWith('/indexer-service')) {
    summary = `Indexer service ${bn.replace('.js', '')}. Manages background indexing of repositories.`;
  } else if (dir.endsWith('/preload')) {
    summary = `Preload script for ${bn.replace('.js', '')}. Exposes IPC channels to renderer via contextBridge.`;
  } else if (dir.endsWith('/services')) {
    summary = `Backend service ${bn.replace('.js', '')}. Handles API integrations and business logic.`;
  } else if (dir.endsWith('/utils')) {
    summary = `Utility module: ${bn.replace('.js', '')}. Provides helper functions used across the codebase.`;
  } else if (dir.endsWith('/styles')) {
    summary = `Stylesheet: ${bn}. CSS styles for the ${bn.replace('.css', '')} feature module.`;
  } else if (dir.includes('/renderer/')) {
    const rendererIdx = parts.indexOf('renderer');
    let uiName = parts.slice(rendererIdx + 1).join('/');
    uiName = bn + ' (' + uiName.replace(/\/[^/]+$/, '') + ')';
    summary = `Renderer UI component: ${bn.replace('.js', '')}. Handles DOM rendering and user interaction for ${uiName}.`;
  } else if (dir.endsWith('/worker-service/tasks')) {
    summary = `Worker task: ${bn.replace('.js', '')}. Runs in a background worker thread for non-blocking execution.`;
  } else if (dir.endsWith('/worker-service')) {
    summary = `Worker service management. Coordinates background task execution.`;
  } else {
    summary = `Module: ${bn.replace('.js', '')}. Part of the HelperTool application.`;
  }

  const embeddedSyms = funSyms.slice(0, 10).map(s => ({
    name: s.name,
    type: s.type,
    line: s.line,
    signature: s.signature || '',
    purpose: `Defined in ${p} at line ${s.line}`,
    role: s.type === 'class' ? 'class definition' : s.type === 'function' ? 'function' : 'export'
  }));

  const node = {
    id: 'file-' + p,
    type: 'file',
    label: bn,
    filePath: p,
    language: f.language || 'javascript',
    summary: summary,
    responsibilities: [],
    features: feats,
    tags: [...new Set(tags)],
    stats: {
      totalSymbols: syms.length,
      exportedSymbols: exportedCount,
      functions: typeCounts['function'] || 0,
      classes: typeCounts['class'] || 0,
      methods: typeCounts['method'] || 0,
      variables: typeCounts['variable'] || 0
    },
    symbols: embeddedSyms,
    summarySource: 'heuristic',
    graphVersion: GRAPH_VERSION,
    updatedAt: curHashes[p]?.lastGenerated || new Date().toISOString(),
    structureHash: curHashes[p]?.structureHash || '',
    contentHash: curHashes[p]?.contentHash || '',
    generationMode: newFiles.has(p) ? 'new' : changedFiles.has(p) ? 'changed' : 'neighborhood'
  };

  nodes.push(node);
  nodeIds.add(node.id);
}

// Ensure all nodes have v2 metadata (post-processing for reused nodes)
for (const n of nodes) {
  n.graphVersion = n.graphVersion || GRAPH_VERSION;
  n.updatedAt = n.updatedAt || curHashes[n.filePath]?.lastGenerated || new Date().toISOString();
  n.structureHash = n.structureHash || curHashes[n.filePath]?.structureHash || '';
  n.contentHash = n.contentHash || curHashes[n.filePath]?.contentHash || '';
  n.generationMode = n.generationMode || 'reused';
}

// ---------- BUILD EDGES ----------
const edges = [];
const allFilePaths = new Set(files.map(f => f.path));

// 1. Import edges (from symbols.json imports, resolving relative paths)
for (const im of imports) {
  const src = 'file-' + im.sourceFile;
  let resolvedTarget = im.resolvedFile;
  if (!resolvedTarget && im.importPath.startsWith('.')) {
    resolvedTarget = resolveImport(im.sourceFile, im.importPath, allFilePaths);
  }
  if (resolvedTarget) {
    const tgt = 'file-' + resolvedTarget;
    if (nodeIds.has(src) && nodeIds.has(tgt)) {
      edges.push({
        source: src,
        target: tgt,
        type: 'IMPORTS',
        weight: 2,
        description: `${im.sourceFile} imports from ${resolvedTarget}`
      });
    }
  }
}

// 2. Feature-based semantic edges: files in same feature collaborate
const featureGroups = {};
for (const f of files) {
  const feats = featureMap.get(f.path) || ['core'];
  for (const feat of feats) {
    if (!featureGroups[feat]) featureGroups[feat] = [];
    featureGroups[feat].push(f.path);
  }
}

for (const [feat, paths] of Object.entries(featureGroups)) {
  if (paths.length < 2 || paths.length > 15) continue;
  // Connect files within same feature (not too many)
  for (let i = 0; i < paths.length - 1; i++) {
    const src = 'file-' + paths[i];
    const tgt = 'file-' + paths[i + 1];
    if (nodeIds.has(src) && nodeIds.has(tgt)) {
      edges.push({
        source: src,
        target: tgt,
        type: 'COLLABORATES_WITH',
        weight: 1,
        description: `Both part of ${feat} feature`
      });
    }
  }
  // Connect first and last
  if (paths.length > 2) {
    const src = 'file-' + paths[0];
    const tgt = 'file-' + paths[paths.length - 1];
    if (nodeIds.has(src) && nodeIds.has(tgt)) {
      edges.push({
        source: src,
        target: tgt,
        type: 'COLLABORATES_WITH',
        weight: 1,
        description: `Both part of ${feat} feature`
      });
    }
  }
}

// 3. Cross-cutting edges: main.js orchestrates others
const mainNode = 'file-Code/main.js';
if (nodeIds.has(mainNode)) {
  // Connect main.js to all ipc handlers it registers
  for (const f of files) {
    if (f.path.startsWith('Code/ipc/') && f.path !== 'Code/main.js') {
      const tgt = 'file-' + f.path;
      if (nodeIds.has(tgt)) {
        edges.push({
          source: mainNode,
          target: tgt,
          type: 'ORCHESTRATES',
          weight: 3,
          description: 'Main process registers this IPC handler'
        });
      }
    }
  }
  // Connect main.js to database layer
  for (const f of files) {
    if (f.path.startsWith('Code/database/')) {
      const tgt = 'file-' + f.path;
      if (nodeIds.has(tgt)) {
        edges.push({
          source: mainNode,
          target: tgt,
          type: 'INITIALIZES',
          weight: 2,
          description: 'Main process initializes this database module'
        });
      }
    }
  }
}

// 4. Worker service edges: worker-service orchestrates task files
const workerNode = 'file-Code/worker-service/worker.js';
for (const f of files) {
  if (f.path.startsWith('Code/worker-service/tasks/') && nodeIds.has(workerNode)) {
    const src = workerNode;
    const tgt = 'file-' + f.path;
    if (nodeIds.has(src) && nodeIds.has(tgt)) {
      edges.push({
        source: src,
        target: tgt,
        type: 'EXECUTES',
        weight: 2,
        description: 'Worker service dispatches this task'
      });
    }
  }
}

// Deduplicate edges
const edgeKey = e => `${e.source}|${e.target}|${e.type}`;
const edgeMap = new Map();
for (const e of edges) {
  const key = edgeKey(e);
  if (!edgeMap.has(key) || edgeMap.get(key).weight < e.weight) {
    edgeMap.set(key, e);
  }
}
const uniqueEdges = [...edgeMap.values()];

// ---------- COMPUTE CENTRALITY METRICS ----------
const outDegree = {};  // all outgoing edges per node
const inDegree = {};   // all incoming edges per node
const importCounts = {};    // how many IMPORTS edges each file sources
const importedByCounts = {}; // how many IMPORTS edges each file targets

for (const e of uniqueEdges) {
  outDegree[e.source] = (outDegree[e.source] || 0) + 1;
  inDegree[e.target] = (inDegree[e.target] || 0) + 1;
  if (e.type === 'IMPORTS') {
    importCounts[e.source] = (importCounts[e.source] || 0) + 1;
    importedByCounts[e.target] = (importedByCounts[e.target] || 0) + 1;
  }
}

// Build node-level metrics
const nodeMetrics = new Map();
const totalNodes = nodes.length;
for (const n of nodes) {
  const id = n.id;
  const degree = (outDegree[id] || 0) + (inDegree[id] || 0);
  const totalPossibleEdges = totalNodes - 1;
  const centrality = totalPossibleEdges > 0 ? round3(degree / totalPossibleEdges) : 0;
  nodeMetrics.set(id, {
    fanIn: importedByCounts[id] || 0,
    fanOut: importCounts[id] || 0,
    degree,
    centrality,
    importCount: importCounts[id] || 0,
    importedByCount: importedByCounts[id] || 0,
    inDegree: inDegree[id] || 0,
    outDegree: outDegree[id] || 0
  });
}

// Apply metrics to nodes
for (const n of nodes) {
  const m = nodeMetrics.get(n.id);
  if (m) n.centrality = m;
}

// ---------- BUILD FEATURES ----------
const features = {
  core: {
    description: 'Core application infrastructure: main process, IPC, preload, utilities, and services',
    color: '#4A90D9',
    files: files.filter(f => featureMap.get(f.path)?.has('core')).map(f => f.path)
  },
  database: {
    description: 'SQLite database access layer for all persistent storage',
    color: '#7B61FF',
    files: files.filter(f => featureMap.get(f.path)?.has('database')).map(f => f.path)
  },
  indexing: {
    description: 'Source code indexing: parsing, symbol extraction, and symbol index management',
    color: '#F5A623',
    files: files.filter(f => featureMap.get(f.path)?.has('indexer')).map(f => f.path)
  },
  knowledgeGraph: {
    description: 'Knowledge graph system: graph building, query engine, visualization, and AI enrichment',
    color: '#50E3C2',
    files: files.filter(f => featureMap.get(f.path)?.has('knowledgeGraph')).map(f => f.path)
  },
  git: {
    description: 'Git integration: repository management, branch management, diff viewing',
    color: '#F53240',
    files: files.filter(f => featureMap.get(f.path)?.has('git')).map(f => f.path)
  },
  chat: {
    description: 'Chat interface for codebase conversations and AI-assisted development',
    color: '#4A90D9',
    files: files.filter(f => featureMap.get(f.path)?.has('chat')).map(f => f.path)
  },
  codeswamp: {
    description: 'CodeSwamp: multi-terminal management with code execution and output handling',
    color: '#BD10E0',
    files: files.filter(f => featureMap.get(f.path)?.has('codeswamp')).map(f => f.path)
  },
  canvas: {
    description: 'Canvas tool: visual drawing and diagramming within the application',
    color: '#F5A623',
    files: files.filter(f => featureMap.get(f.path)?.has('canvas')).map(f => f.path)
  },
  dbInspector: {
    description: 'Database inspector: browse, query, and visualize SQLite database contents',
    color: '#7B61FF',
    files: files.filter(f => featureMap.get(f.path)?.has('dbInspector')).map(f => f.path)
  },
  docker: {
    description: 'Docker container management: build, run, and monitor containers',
    color: '#0DB7ED',
    files: files.filter(f => featureMap.get(f.path)?.has('docker')).map(f => f.path)
  },
  secrets: {
    description: 'Secret management: secure storage and retrieval of sensitive credentials',
    color: '#F53240',
    files: files.filter(f => featureMap.get(f.path)?.has('secrets')).map(f => f.path)
  },
  video: {
    description: 'Video tool: screen recording, video capture, and media processing',
    color: '#F53240',
    files: files.filter(f => featureMap.get(f.path)?.has('video')).map(f => f.path)
  },
  settings: {
    description: 'Settings management: application configuration, preferences, and theming',
    color: '#9B9B9B',
    files: files.filter(f => featureMap.get(f.path)?.has('settings')).map(f => f.path)
  },
  shortcuts: {
    description: 'Keyboard shortcuts: shortcut definitions, mode management, and key bindings',
    color: '#4A90D9',
    files: files.filter(f => featureMap.get(f.path)?.has('shortcuts')).map(f => f.path)
  },
  workspace: {
    description: 'Workspace management: file tree, project navigation, and workspace organization',
    color: '#50E3C2',
    files: files.filter(f => featureMap.get(f.path)?.has('workspace')).map(f => f.path)
  },
  envManager: {
    description: 'Environment variable manager: view and edit environment configurations',
    color: '#7B61FF',
    files: files.filter(f => featureMap.get(f.path)?.has('envManager')).map(f => f.path)
  },
  prompts: {
    description: 'Prompt management: AI prompt templates and prompt engineering tools',
    color: '#F5A623',
    files: files.filter(f => featureMap.get(f.path)?.has('prompts')).map(f => f.path)
  },
  fileSeeder: {
    description: 'File seeder: generate boilerplate files and project scaffolding',
    color: '#50E3C2',
    files: files.filter(f => featureMap.get(f.path)?.has('fileSeeder')).map(f => f.path)
  },
  automation: {
    description: 'Automation: app manager, automation sketch, and workflow automation',
    color: '#BD10E0',
    files: files.filter(f => featureMap.get(f.path)?.has('automation')).map(f => f.path)
  },
  worker: {
    description: 'Worker service: background thread execution for CPU-intensive tasks',
    color: '#9B9B9B',
    files: files.filter(f => featureMap.get(f.path)?.has('worker')).map(f => f.path)
  },
  gmail: {
    description: 'Gmail integration: send, read, and manage email through Gmail API',
    color: '#F53240',
    files: files.filter(f => featureMap.get(f.path)?.has('gmail')).map(f => f.path)
  },
  github: {
    description: 'GitHub integration: browse repositories, manage issues and pull requests',
    color: '#333333',
    files: files.filter(f => featureMap.get(f.path)?.has('github')).map(f => f.path)
  },
  symbolIndex: {
    description: 'Symbol index UI: browse and search indexed code symbols',
    color: '#F5A623',
    files: files.filter(f => featureMap.get(f.path)?.has('symbolIndex')).map(f => f.path)
  },
  apiTool: {
    description: 'API tool: HTTP client for testing and debugging REST APIs',
    color: '#4A90D9',
    files: files.filter(f => featureMap.get(f.path)?.has('apiTool')).map(f => f.path)
  },
  uiLayout: {
    description: 'UI layout helper: panel management, resizing, and layout persistence',
    color: '#7B61FF',
    files: files.filter(f => featureMap.get(f.path)?.has('uiLayout')).map(f => f.path)
  },
  codebaseMap: {
    description: 'Codebase map: interactive graph visualization of the codebase structure',
    color: '#50E3C2',
    files: files.filter(f => featureMap.get(f.path)?.has('codebaseMap')).map(f => f.path)
  },
  blueprint: {
    description: 'Blueprint library: reusable code patterns and component templates',
    color: '#0DB7ED',
    files: files.filter(f => featureMap.get(f.path)?.has('blueprint')).map(f => f.path)
  }
};

// ---------- BUILD CONCEPTS ----------
const concepts = {
  'IPC-Communication': {
    description: 'Inter-Process Communication between main and renderer processes via Electron ipcMain/ipcRenderer',
    locations: files.filter(f => f.path.includes('/ipc/') || f.path.includes('/preload/')).map(f => f.path),
    keywords: ['ipcMain', 'ipcRenderer', 'contextBridge', 'handle', 'invoke', 'on']
  },
  'Database-Access': {
    description: 'SQLite database operations using better-sqlite3 in main process and sql.js in renderer',
    locations: files.filter(f => f.path.startsWith('Code/database/')).map(f => f.path),
    keywords: ['db', 'database', 'sql', 'query', 'better-sqlite3', 'sql.js']
  },
  'Code-Indexing': {
    description: 'Source code parsing and symbol extraction pipeline',
    locations: files.filter(f => f.path.includes('/indexer')).map(f => f.path),
    keywords: ['parse', 'tokenize', 'symbol', 'AST', 'extract']
  },
  'Knowledge-Graph': {
    description: 'Graph-based codebase analysis with community detection, query engine, and visualization',
    locations: files.filter(f => f.path.includes('/graphify')).map(f => f.path),
    keywords: ['graph', 'node', 'edge', 'community', 'visualization']
  },
  'UI-Components': {
    description: 'React/Vanilla JS UI components for the renderer process',
    locations: files.filter(f => f.path.includes('/renderer/')).map(f => f.path),
    keywords: ['render', 'component', 'UI', 'panel', 'widget']
  },
  'Worker-Tasks': {
    description: 'Background worker thread tasks for CPU-intensive operations',
    locations: files.filter(f => f.path.includes('/worker-service/')).map(f => f.path),
    keywords: ['worker', 'thread', 'task', 'background']
  },
  'Git-Integration': {
    description: 'Git operations: clone, commit, branch, diff, log, and repository management',
    locations: files.filter(f => featureMap.get(f.path)?.has('git')).map(f => f.path),
    keywords: ['git', 'branch', 'commit', 'diff', 'repository']
  },
  'Authentication-Secrets': {
    description: 'Secure credential storage and API authentication management',
    locations: files.filter(f => f.path.includes('/secretHolder') || f.path.includes('/gmail')).map(f => f.path),
    keywords: ['secret', 'credential', 'auth', 'token', 'encrypt']
  },
  'File-System-Operations': {
    description: 'File reading, writing, watching, and directory traversal utilities',
    locations: files.filter(f => f.path.includes('/utils/') || f.path.includes('/fileSeeder')).map(f => f.path),
    keywords: ['fs', 'file', 'path', 'read', 'write', 'watch']
  }
};

// ---------- BUILD graph.json ----------
const graph = {
  graphVersion: String(GRAPH_VERSION),
  repoName: 'HelperTool',
  repoPath: raw.repoPath,
  generatedAt: new Date().toISOString(),
  exportedAt: raw.exportedAt,
  meta: {
    incremental: {
      total: files.length,
      reused: reusedCount,
      rebuilt: files.length - reusedCount,
      new: newFiles.size,
      changed: changedFiles.size,
      neighborAffected: neighborCount,
      generationMode,
      affectedSetSize: affectedSet.size,
      bfsDepth: AFFECTED_BFS_DEPTH
    }
  },
  stats: {
    totalFiles: files.length,
    totalSymbols: symbols.length,
    totalImports: imports.length,
    totalNodes: nodes.length,
    totalEdges: uniqueEdges.length,
    totalFeatures: Object.keys(features).length,
    totalConcepts: Object.keys(concepts).length
  },
  nodes,
  edges: uniqueEdges,
  features,
  concepts
};

// Write graph.json
const outDir = 'graphify/graphify-storage';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Write in chunks to avoid memory issues
fs.writeFileSync(outDir + '/graph.json', JSON.stringify(graph, null, 2), 'utf8');
const jsonSize = (Buffer.byteLength(JSON.stringify(graph), 'utf8') / 1024).toFixed(0);
console.log('Wrote graph.json (' + jsonSize + ' KB)');
const rebuiltCount = nodes.length - reusedCount;
console.log('  Nodes: ' + nodes.length + ' (' + reusedCount + ' reused, ' + rebuiltCount + ' rebuilt)');
console.log('  Generation mode: ' + generationMode + ' (neighbor-affected: ' + neighborCount + ')');
console.log('  Edges: ' + uniqueEdges.length);

// Save file hashes for next incremental run
fs.writeFileSync(HASH_FILE, JSON.stringify(curHashes, null, 2), 'utf8');
console.log('Saved file hashes (' + Object.keys(curHashes).length + ' files)');

// ---------- BUILD graph.md ----------
let md = `# HelperTool Knowledge Graph Report

Generated: ${new Date().toISOString()}

## Overview

- **Repository**: ${raw.repoName}
- **Files**: ${files.length}
- **Symbols**: ${symbols.length}
- **Imports**: ${imports.length}
- **Graph Nodes**: ${nodes.length}
- **Graph Edges**: ${uniqueEdges.length}
- **Features**: ${Object.keys(features).length}
- **Concepts**: ${Object.keys(concepts).length}
- **Build**: ${reusedCount} nodes reused, ${nodes.length - reusedCount} rebuilt (${newFiles.size} new, ${changedFiles.size} changed, ${neighborCount} neighbor-affected)
- **Generation Mode**: ${generationMode} (BFS depth: ${AFFECTED_BFS_DEPTH})

---

## Feature Map

`;

for (const [name, feat] of Object.entries(features)) {
  md += `### ${name}\n`;
  md += `- **Description**: ${feat.description}\n`;
  md += `- **Files**: ${feat.files.length} files\n`;
  const featFiles = feat.files.slice(0, 10);
  for (const f of featFiles) md += `  - \`${f}\`\n`;
  if (feat.files.length > 10) md += `  - ... and ${feat.files.length - 10} more\n`;
  md += '\n';
}

md += `---

## Top Files by Symbol Count

| File | Symbols | Exported | Functions | Classes | Centrality |
|------|---------|----------|-----------|---------|------------|
`;

const topFiles = [...nodes].sort((a, b) => b.stats.totalSymbols - a.stats.totalSymbols).slice(0, 20);
for (const n of topFiles) {
  const cent = n.centrality ? n.centrality.centrality.toFixed(3) : '-';
  md += `| \`${n.filePath}\` | ${n.stats.totalSymbols} | ${n.stats.exportedSymbols} | ${n.stats.functions} | ${n.stats.classes} | ${cent} |\n`;
}

md += `
---

## Top Files by Centrality

| File | Centrality | Fan-In | Fan-Out | Degree |
|------|------------|--------|---------|--------|
`;

const topCentral = [...nodes].filter(n => n.centrality).sort((a, b) => b.centrality.centrality - a.centrality.centrality).slice(0, 20);
for (const n of topCentral) {
  const c = n.centrality;
  md += `| \`${n.filePath}\` | ${c.centrality.toFixed(3)} | ${c.fanIn} | ${c.fanOut} | ${c.degree} |\n`;
}

md += `
---

## Import Graph Stats

- **Total import relationships**: ${uniqueEdges.filter(e => e.type === 'IMPORTS').length}
- **Total semantic edges**: ${uniqueEdges.filter(e => e.type !== 'IMPORTS').length}

---

## Concepts

`;

for (const [name, conc] of Object.entries(concepts)) {
  md += `### ${name}\n`;
  md += `- **Description**: ${conc.description}\n`;
  md += `- **Keywords**: ${conc.keywords.join(', ')}\n`;
  md += `- **Locations**: ${conc.locations.length} files\n`;
  const locs = conc.locations.slice(0, 5);
  for (const l of locs) md += `  - \`${l}\`\n`;
  if (conc.locations.length > 5) md += `  - ... and ${conc.locations.length - 5} more\n`;
  md += '\n';
}

md += `---

## Architecture Overview

The HelperTool is an Electron desktop application organized in a three-tier architecture:

### 1. Main Process (\`Code/main.js\`, \`Code/ipc/\`, \`Code/services/\`)
- Entry point and lifecycle management
- IPC handlers bridging main and renderer
- Backend service integrations (Gmail, etc.)

### 2. Renderer Process (\`Code/renderer/\`)
- UI components for all features
- DOM-based rendering (no React/Vue framework)
- Feature modules: git, docker, canvas, video, chat, etc.

### 3. Worker Process (\`Code/worker-service/\`)
- Background thread for CPU-intensive tasks
- Task-based architecture with 18 task modules

### Shared Layers
- **Database** (\`Code/database/\`): SQLite access via better-sqlite3 (main) and sql.js (renderer)
- **Indexer** (\`Code/indexer/\`, \`Code/indexer-service/\`): Code parsing and symbol extraction
- **Knowledge Graph** (\`Code/graphify-service/\`): Graph-based codebase analysis
- **Utils** (\`Code/utils/\`): Shared helper functions

---

## Edge Type Summary

| Type | Count | Description |
|------|-------|-------------|
`;

const edgeTypeCounts = {};
for (const e of uniqueEdges) {
  edgeTypeCounts[e.type] = (edgeTypeCounts[e.type] || 0) + 1;
}
for (const [type, count] of Object.entries(edgeTypeCounts).sort((a, b) => b[1] - a[1])) {
  let desc = '';
  switch (type) {
    case 'IMPORTS': desc = 'File imports another file (resolved dependency)'; break;
    case 'COLLABORATES_WITH': desc = 'Files belonging to the same feature'; break;
    case 'ORCHESTRATES': desc = 'Main process registers/controls IPC handlers'; break;
    case 'INITIALIZES': desc = 'Main process initializes database modules'; break;
    case 'EXECUTES': desc = 'Worker service dispatches background tasks'; break;
    default: desc = 'Semantic relationship';
  }
  md += `| ${type} | ${count} | ${desc} |\n`;
}

md += `
---

## Symbol Type Distribution

| Type | Count |
|------|-------|
`;

const symTypeCounts = {};
for (const s of symbols) {
  symTypeCounts[s.type] = (symTypeCounts[s.type] || 0) + 1;
}
for (const [type, count] of Object.entries(symTypeCounts).sort((a, b) => b[1] - a[1])) {
  md += `| ${type} | ${count} |\n`;
}

md += '\n';

fs.writeFileSync(outDir + '/graph.md', md, 'utf8');
console.log('Wrote graph.md (' + (Buffer.byteLength(md, 'utf8') / 1024).toFixed(0) + ' KB)');

console.log('\\nDone!');
