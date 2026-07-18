'use strict';

const { ipcMain } = require('electron');
const { spawn }   = require('child_process');
const path        = require('path');
const fs          = require('fs');
const readline    = require('readline');
const http        = require('http');

const symbolsJsonLoader = require('../database/symbolsJsonLoader');
const changeDetector = require('../database/changeDetector');

const DEFAULT_PORT = 3333;
const START_TIMEOUT = 10000;
const STORAGE_DIR = 'MCP/graphify/symbol-index-storage';
const GRAPHIFY_DIR = 'MCP/graphify/graphify-storage';

let _child     = null;
let _port      = DEFAULT_PORT;
let _ready     = false;
let _repoPath  = null;
let _app       = null;

function _getServerPath() {
  return path.join(__dirname, '..', 'graphify-service', 'server.js');
}

function _resolveDbPath(app) {
  return path.join(app.getPath('userData'), 'symbol-index', 'index.db');
}

function _isChildAlive() {
  return _child && _child.exitCode === null && !_child.killed;
}

function _spawn(app) {
  return new Promise((resolve, reject) => {
    if (_isChildAlive()) {
      resolve({ port: _port });
      return;
    }
    // Clean up any stale child reference
    _child = null;
    _ready = false;

    const serverPath = _getServerPath();
    const dbPath = _resolveDbPath(app);
    const args = [serverPath, _repoPath || '', String(_port), dbPath];
    _child = spawn(
      process.execPath,
      args,
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      }
    );

    const rl = readline.createInterface({ input: _child.stdout, terminal: false });
    rl.on('line', (line) => {
      line = line.trim();
      if (!line) return;
      try {
        const msg = JSON.parse(line);
        if (msg.ready) {
          _ready = true;
          _port  = msg.port || _port;
          rl.close();
          console.log(`[graphify_ipc] Server ready on port ${_port}`);
          resolve({ port: _port });
        }
      } catch (_) {}
    });

    _child.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.log(`[graphify] ${text}`);
    });

    _child.on('exit', (code) => {
      console.warn(`[graphify_ipc] Server exited with code ${code}`);
      _child = null;
      _ready = false;
      if (code !== 0 && code !== null) {
        console.warn(`[graphify_ipc] Server crashed (exit=${code}). It can be restarted via the Graphify UI.`);
      }
      reject(new Error(`Server exited with code ${code}`));
    });

    _child.on('error', (err) => {
      console.error(`[graphify_ipc] Spawn error: ${err.message}`);
      _child = null;
      _ready = false;
      reject(err);
    });

    setTimeout(() => {
      if (!_ready) {
        _stop();
        reject(new Error('Server did not become ready within timeout'));
      }
    }, START_TIMEOUT);
  });
}

function _stop() {
  if (_child) {
    try { _child.kill('SIGTERM'); } catch (_) {}
    _child = null;
  }
  _ready = false;
}

function _restart(app) {
  _stop();
  return new Promise(r => setTimeout(r, 300)).then(() => _spawn(app));
}

function _fetchInfo() {
  return new Promise((resolve) => {
    if (!_child || !_ready) {
      resolve({ error: 'Server not running', ready: false });
      return;
    }

    const req = http.get(`http://127.0.0.1:${_port}/info`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ error: 'Failed to parse info response' });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message });
    });

    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ error: 'Info request timed out' });
    });
  });
}

function _generatePromptText(repoPath) {
  const repoName = repoPath.split(/[/\\]/).pop();
  return `# Graphify AI Graph Generation Prompt

## Objective

You are an AI assistant. Your task is to analyze the provided \`symbols.json\` file containing the symbol index of a codebase, and produce two output files:

1. **\`MCP/graphify/graphify-storage/graph.json\`** â€” A structured knowledge graph with semantic labels
2. **\`MCP/graphify/graphify-storage/graph.md\`** â€” A human-readable markdown report

## The Challenge

\`symbols.json\` contains raw structural data â€” file paths, symbol names, import relationships. But it lacks **semantic context**: what does each file actually do? What features does it belong to? What is the purpose of each symbol?

Your job is to add that missing context. You will produce a \`graph.json\` where every file has a meaningful summary, every symbol has a purpose and role, files are grouped into coherent features, and semantic relationships between files are identified.

## Input: \`symbols.json\`

The \`symbols.json\` file contains:

### \`files\` (array)
Each file entry:
- \`id\`: numeric ID
- \`path\`: relative file path from repo root
- \`language\`: programming language (e.g. javascript, typescript, python)

### \`symbols\` (array)
Each symbol entry:
- \`name\`: symbol name (function, class, variable, etc.)
- \`type\`: symbol type (function, class, method, variable, constant, interface, type, enum, etc.)
- \`line\`, \`column\`: source location
- \`isExported\`: whether exported
- \`className\`: parent class (for methods)
- \`signature\`: full signature string (may be empty)
- \`filePath\`: which file the symbol belongs to

### \`imports\` (array)
Each import entry:
- \`importPath\`: the import string (e.g. "./utils", "react", "lodash")
- \`importType\`: default, named, namespace, side-effect, require, etc.
- \`importedSymbols\`: array of specific symbol names imported
- \`sourceFile\`: the file doing the importing
- \`resolvedFile\`: which file the import resolves to (null for externals like npm packages)

You DO have access to the actual source code. The repository is located at:

\`\`\`
${repoPath}
\`\`\`

For every file in \`symbols.json\`, **read its source code** from the repository on disk before writing anything about it. Do NOT guess or hallucinate what a file does based on its name or the symbols listed here. Read the actual file contents to determine:

- What does this file actually do? (based on its real code, not its name)
- What symbols does it actually contain and what do they really do? (read the function bodies)
- What responsibilities does it actually have?
- What features does it genuinely belong to?

For each symbol (function, class, method), read its actual implementation to write accurate \`purpose\` and \`role\` descriptions. If a symbol name suggests one thing but the code does something else, the code is truth.

## Your Task

### Step 1: Analyze and Label Every File

For each file in the codebase, determine:

- **What does this file do?** (1-2 sentence summary)
- **What feature/system does it belong to?** (e.g. "auth", "database", "git", "docker", "core", "ui", "worker")
- **What tags describe it?** (comma-separated, e.g. "ipc", "config", "database", "renderer")

For each symbol (function, class, method, etc.), determine:

- **What is its purpose?** (brief description of what it does)
- **What role does it play in its file?** (e.g. "entry point", "helper", "orchestrator", "data model", "validator", "handler", "utility")

### Step 2: Build the Knowledge Graph

Create \`graph.json\` with this exact schema:

#### Top-Level Structure

\`\`\`json
{
  "graphVersion": "2",
  "repoName": "${repoName}",
  "repoPath": "${repoPath}",
  "generatedAt": "<ISO-timestamp>",
  "exportedAt": "<ISO-timestamp-from-symbols.json>",
  "meta": {
    "incremental": {
      "total": <file-count>,
      "reused": 0,
      "rebuilt": <file-count>,
      "new": <file-count>,
      "changed": 0,
      "neighborAffected": 0,
      "generationMode": "ai_generated",
      "affectedSetSize": <file-count>,
      "bfsDepth": 0
    }
  },
  "stats": {
    "totalFiles": <file-count>,
    "totalSymbols": <symbol-count>,
    "totalImports": <import-count>,
    "totalNodes": <file-count>,
    "totalEdges": <edge-count>,
    "totalFeatures": <feature-count>,
    "totalConcepts": <concept-count>
  },
  "nodes": [...],
  "edges": [...],
  "features": {...},
  "concepts": {...}
}
\`\`\`

#### Node Schema

Each file in \`symbols.json\` becomes one node. Use this exact shape:

\`\`\`json
{
  "id": "file-Code/services/git.js",
  "type": "file",
  "label": "git.js",
  "filePath": "Code/services/git.js",
  "language": "javascript",
  "summary": "Handles Git operations: clone, commit, push, pull, and branch management via shell commands.",
  "responsibilities": [
    "Executes git CLI commands",
    "Manages repository checkout and cloning",
    "Handles branch creation and switching"
  ],
  "features": ["git", "core"],
  "tags": ["git", "version-control", "services", "javascript"],
  "stats": {
    "totalSymbols": 12,
    "exportedSymbols": 5,
    "functions": 8,
    "classes": 1,
    "methods": 0,
    "variables": 3
  },
  "symbols": [
    {
      "name": "cloneRepo",
      "type": "function",
      "line": 42,
      "signature": "async function cloneRepo(url, dest)",
      "purpose": "Clones a remote git repository to the local filesystem",
      "role": "entry point"
    }
  ],
  "summarySource": "ai",
  "centrality": {
    "fanIn": 3,
    "fanOut": 1,
    "degree": 4,
    "centrality": 0.0103,
    "importCount": 1,
    "importedByCount": 3,
    "inDegree": 3,
    "outDegree": 1
  },
  "graphVersion": 2,
  "updatedAt": "<ISO-timestamp>",
  "structureHash": "",
  "contentHash": "",
  "generationMode": "ai_generated"
}
\`\`\`

Field notes:
- \`responsibilities\`: 1-5 brief bullet points of what this file does (can be empty array)
- \`features\`: one or more feature names this file belongs to (the primary feature first)
- \`tags\`: descriptive tags for searching/filtering
- \`stats\`: counts â€” derive from the symbols array for this file
- \`symbols\`: include ALL function, class, and method symbols (skip pure variables/constants unless important), each with \`purpose\` and \`role\`
- \`summarySource\`: always \`"ai"\`
- \`centrality\`: compute from the edges you create (fanIn = how many files import this file, fanOut = how many files this file imports, degree = fanIn + fanOut, centrality = degree / (totalNodes - 1))
- \`graphVersion\`: 2
- \`generationMode\`: \`"ai_generated"\`
- \`structureHash\` and \`contentHash\`: leave as empty strings

#### Edge Schema

\`\`\`json
{
  "source": "file-Code/main.js",
  "target": "file-Code/ipc/git_ipc.js",
  "type": "ORCHESTRATES",
  "weight": 3,
  "description": "Main process registers this IPC handler"
}
\`\`\`

Fields:
- \`source\`, \`target\`: full node IDs (\`"file-<path>"\`)
- \`type\`: one of the edge types below
- \`weight\`: 1-5 indicating strength (1=weak, 5=strong)
- \`description\`: brief explanation of why this edge exists

#### Edge Types to Identify

| Type | When to Use | Weight Guidance |
|------|-------------|-----------------|
| \`IMPORTS\` | File A directly imports file B (from \`symbols.json\` imports with \`resolvedFile\`) | 2 |
| \`COLLABORATES_WITH\` | Files that work together on the same feature or closely related features | 1 |
| \`ORCHESTRATES\` | A file coordinates or manages multiple other files (e.g. main process â†’ handlers) | 3 |
| \`DEPENDS_ON\` | File A logically depends on file B even if not directly imported (semantic dependency) | 2 |
| \`PROVIDES_TO\` | File A provides data, services, or utilities consumed by file B | 2 |
| \`IMPLEMENTS\` | File A implements an interface, protocol, or contract defined in file B | 2 |
| \`SEQUENCES\` | Processing pipeline where A â†’ B â†’ C in a data/control flow | 2 |
| \`INITIALIZES\` | File A initializes or bootstraps file B during startup | 2 |
| \`EXECUTES\` | File A dispatches or spawns work in file B (e.g. worker â†’ task) | 2 |
| \`CROSS_CUTTING\` | Shared utility used across otherwise unrelated modules | 1 |

Include \`IMPORTS\` edges for every resolved import. For semantic edges, only add them when you are confident the relationship exists â€” quality over quantity. Each edge should have a meaningful \`description\`.

#### Features Schema

\`\`\`json
{
  "core": {
    "description": "Core application infrastructure: main process, IPC, preload, utilities, and services",
    "color": "#4A90D9",
    "files": ["Code/main.js", "Code/preload.js", "Code/utils/helpers.js"]
  },
  "database": {
    "description": "SQLite database access layer for all persistent storage",
    "color": "#7B61FF",
    "files": ["Code/database/db.js", "Code/database/chatDb.js"]
  }
}
\`\`\`

Each feature:
- \`description\`: what this feature encompasses
- \`color\`: hex color for visualization (pick distinct colors)
- \`files\`: array of file paths (not node IDs â€” raw paths like \`"Code/file.js"\`)

Every file should belong to at least one feature. Features should be coherent groupings â€” don't create too many. 5-15 features is typical for a moderate codebase.

#### Concepts Schema

\`\`\`json
{
  "IPC-Communication": {
    "description": "Inter-Process Communication between main and renderer processes via Electron ipcMain/ipcRenderer",
    "locations": ["Code/ipc/git_ipc.js", "Code/ipc/docker_ipc.js", "Code/preload.js"],
    "keywords": ["ipcMain", "ipcRenderer", "contextBridge", "handle", "invoke"]
  }
}
\`\`\`

Each concept:
- \`description\`: what this concept represents
- \`locations\`: array of file paths related to this concept
- \`keywords\`: search terms associated with this concept (symbol names, technical terms)

Concepts should capture important domain ideas, architectural patterns, and technical mechanisms. 5-15 concepts is typical.

### Step 3: Generate a Human-Readable Report

Create \`graph.md\` with this structure:

\`\`\`markdown
# Graphify Report: ${repoName}

Generated: <date>

## Overview

- Total files: N
- Total symbols: N
- Total imports: N
- Graph nodes: N
- Graph edges: N
- Features: N
- Concepts: N
- Build: AI generated

## Feature Map

### [Feature Name]
- **Description**: ...
- **Files**: N files
  - \`file1.js\`
  - \`file2.js\`

## Top Files by Symbol Count

| File | Symbols | Exported | Functions | Classes | Centrality |
|------|---------|----------|-----------|---------|------------|

## Top Files by Centrality

| File | Centrality | Fan-In | Fan-Out | Degree |
|------|------------|--------|---------|--------|

## Architecture Flow

[Describe how data/control flows through the system, feature by feature. Explain the main processing pipelines, key entry points, and how features relate to each other.]

## Concepts Glossary

| Concept | Description | Keywords | Files |
|---------|-------------|----------|-------|

## Edge Type Summary

| Type | Count | Description |
|------|-------|-------------|

## Surprising Connections

Cross-feature or unexpected relationships detected.

## Notes

- Add any observations about architecture, design patterns, or areas of complexity.
\`\`\`

## Instructions for You

1. Be thorough but concise in summaries. Every file needs a meaningful summary that tells someone what it does.
2. Group files by feature. A file can belong to multiple features but should have a primary feature.
3. For \`COLLABORATES_WITH\` edges, only add them when files genuinely work together on the same logical feature.
4. For semantic edges (\`DEPENDS_ON\`, \`PROVIDES_TO\`, \`IMPLEMENTS\`, etc.), be conservative â€” only add them when you have strong evidence from file names, symbol names, or import patterns.
5. The \`features\` section should organize the entire codebase by coherent feature groups.
6. The \`concepts\` section should document important domain or architectural concepts.
7. Compute centrality values correctly: \`centrality = degree / (totalNodes - 1)\`.
8. Focus on making the graph useful for someone asking "how does X work?".
9. Do NOT include \`stats\` objects in feature or concept entries â€” they go only on nodes.
10. The \`symbols\` array per node should include meaningful \`purpose\` and \`role\` for every symbol listed.

## Output

Write two files:

1. \`${repoPath}\\MCP\\graphify\\graphify-storage\\graph.json\` â€” the structured graph (must match the schema above exactly)
2. \`${repoPath}\\MCP\\graphify\\graphify-storage\\graph.md\` â€” the human-readable report
`;

function _generateIncrementalPromptText(repoPath, changedFiles, newFiles, symsByFile, impsByFile, files, prevNodesByPath) {
function _generateIncrementalPromptText(repoPath, changedFiles, newFiles, symsByFile, impsByFile, files, prevNodesByPath) {
  const repoName = repoPath.split(/[/\\]/).pop();
  const allUpdates = [...newFiles, ...changedFiles];

  let fileEntries = '';
  for (const fp of allUpdates) {
    const syms = (symsByFile.get(fp) || []);
    const imps = (impsByFile.get(fp) || []);
    const exportedSyms = syms.filter(s => s.isExported).map(s => s.name);
    const allNames = syms.map(s => s.name);
    const impPaths = imps.map(im => im.importPath);
    const oldNode = prevNodesByPath ? prevNodesByPath.get(fp) : null;
    const oldSummary = oldNode?.summary || 'N/A';
    const oldFeatures = oldNode?.features?.join(', ') || 'N/A';
    const oldPurpose = oldNode?.symbols?.slice(0, 5).map(s => `    ${s.name}: ${s.purpose}`).join('\n') || '  (none)';

    fileEntries += `  - ${fp}
    language: ${(files.find(f => f.path === fp) || {}).language || 'javascript'}
    total_symbols: ${syms.length}
    exported: ${exportedSyms.join(', ') || 'none'}
    imports: ${impPaths.join(', ') || 'none'}
    symbols: ${allNames.join(', ') || 'none'}
    --- OLD enrichment data (verify and update) ---
    old_summary: ${oldSummary}
    old_features: [${oldFeatures}]
    old_symbol_roles:
${oldPurpose}
`;
  }

  return `You are updating a knowledge graph for the ${repoName} codebase. The following ${allUpdates.length} files have changed and need re-enrichment.

## Instructions

For each file listed below:
1. Read the actual source code from the repository
2. Update the enrichment data â€” summary, feature, responsibilities, tags, and per-symbol purpose/role
3. Use the old enrichment data as reference â€” improve it if possible, fix it if it was wrong
4. Return ONLY a JSON array, no other text

## Output format

Return a JSON array (only JSON, no markdown fences) where each element has this schema:

[
  {
    "file": "Code/path/to/file.js",
    "summary": "1-2 sentence description of what this file does. Be specific.",
    "feature": "The primary feature area this belongs to",
    "responsibilities": ["List 1-4 specific responsibilities this module has."],
    "tags": ["array", "of", "relevant", "tags"],
    "symbols": [
      {
        "name": "functionOrClassName",
        "purpose": "What this specific function/class does. Be precise.",
        "role": "One of: entry_point, factory, parser, validator, cache_manager, controller, database_gateway, worker, scheduler, orchestrator, adapter, helper, renderer, handler, provider, state_manager, initializer, utility, transformer, viewer, editor"
      }
    ]
  }
]

## Files to update (${allUpdates.length})

${fileEntries}
Generate the output now.`;
}


// register function placeholder
function register(app) {}
function shutdown() {}
module.exports = { register, shutdown };
