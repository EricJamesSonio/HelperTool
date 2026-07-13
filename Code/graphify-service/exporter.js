'use strict';

const fs   = require('fs');
const path = require('path');
const { getDb } = require('./db');

const STORAGE_DIR = 'graphify/symbol-index-storage';
const GRAPHIFY_DIR = 'graphify/graphify-storage';

function _getRepoPath() {
  const db = getDb();

  let stmt = db.prepare('SELECT repo_path FROM repositories WHERE indexed = 1 ORDER BY last_indexed DESC LIMIT 1');
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.repo_path;
  }
  stmt.free();

  stmt = db.prepare('SELECT repo_path FROM repositories ORDER BY last_indexed DESC LIMIT 1');
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.repo_path;
  }
  stmt.free();

  return null;
}

function exportSymbolsJson() {
  const repoPath = _getRepoPath();
  if (!repoPath) {
    return { ok: false, error: 'No repository found in the symbol index. Please index your codebase first.' };
  }

  const outDir = path.join(repoPath, STORAGE_DIR);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const db = getDb();
  const data = {
    exportedAt: new Date().toISOString(),
    repoPath: repoPath,
    repoName: repoPath.split(/[/\\]/).pop(),
    files: [],
    symbols: [],
    imports: [],
    overview: {},
  };

  const stmt1 = db.prepare('SELECT repo_path, name, total_files, total_symbols FROM repositories WHERE repo_path = ? LIMIT 1');
  stmt1.bind([repoPath]);
  if (stmt1.step()) {
    const r = stmt1.getAsObject();
    data.overview = {
      totalFiles: r.total_files || 0,
      totalSymbols: r.total_symbols || 0,
    };
  }
  stmt1.free();

  const stmtFiles = db.prepare('SELECT id, path, language FROM indexed_files WHERE repo_id = (SELECT id FROM repositories WHERE repo_path = ?)');
  stmtFiles.bind([repoPath]);
  while (stmtFiles.step()) {
    const f = stmtFiles.getAsObject();
    data.files.push({
      id: f.id,
      path: f.path,
      language: f.language,
    });
  }
  stmtFiles.free();

  const fileIdMap = new Map();
  data.files.forEach(f => fileIdMap.set(f.id, f.path));

  const stmtSym = db.prepare(`
    SELECT s.name, s.type, s.line, s.column, s.is_exported, s.class_name, s.signature, s.file_id
    FROM symbols s
    WHERE s.repo_id = (SELECT id FROM repositories WHERE repo_path = ?)
  `);
  stmtSym.bind([repoPath]);
  while (stmtSym.step()) {
    const s = stmtSym.getAsObject();
    data.symbols.push({
      name: s.name,
      type: s.type,
      line: s.line,
      column: s.column,
      isExported: !!s.is_exported,
      className: s.class_name || null,
      signature: s.signature || '',
      filePath: fileIdMap.get(s.file_id) || null,
    });
  }
  stmtSym.free();

  const stmtImp = db.prepare(`
    SELECT fi.import_path, fi.import_type, fi.imported_symbols, fi.resolved_file_id, fi.file_id
    FROM file_imports fi
    WHERE fi.repo_id = (SELECT id FROM repositories WHERE repo_path = ?)
  `);
  stmtImp.bind([repoPath]);
  while (stmtImp.step()) {
    const i = stmtImp.getAsObject();
    let importedSymbols = [];
    try { importedSymbols = JSON.parse(i.imported_symbols || '[]'); } catch (_) {}
    data.imports.push({
      importPath: i.import_path,
      importType: i.import_type,
      importedSymbols,
      sourceFile: fileIdMap.get(i.file_id) || null,
      resolvedFile: i.resolved_file_id ? (fileIdMap.get(i.resolved_file_id) || null) : null,
    });
  }
  stmtImp.free();

  const symbolsPath = path.join(outDir, 'symbols.json');
  fs.writeFileSync(symbolsPath, JSON.stringify(data, null, 2), 'utf-8');

  return { ok: true, path: symbolsPath, stats: { files: data.files.length, symbols: data.symbols.length, imports: data.imports.length } };
}

function generatePrompt() {
  const repoPath = _getRepoPath();
  if (!repoPath) {
    return { ok: false, error: 'No repository found in symbol index. Please index your codebase first.' };
  }

  const outDir = path.join(repoPath, STORAGE_DIR);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const prompt = `# Graphify AI Graph Generation Prompt

## Objective

You are an AI assistant. Your task is to analyze the provided \`symbols.json\` file containing the symbol index of a codebase, and produce two output files:

1. **\`graphify/graphify-storage/graph.json\`** — A structured knowledge graph with semantic labels
2. **\`graphify/graphify-storage/graph.md\`** — A human-readable markdown report

## The Challenge

\`symbols.json\` contains raw structural data — file paths, symbol names, import relationships. But it lacks **semantic context**: what does each file actually do? What features does it belong to? What is the purpose of each symbol?

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
  "repoName": "<repo-name>",
  "repoPath": "<absolute-repo-path>",
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
- \`stats\`: counts — derive from the symbols array for this file
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
| \`ORCHESTRATES\` | A file coordinates or manages multiple other files (e.g. main process → handlers) | 3 |
| \`DEPENDS_ON\` | File A logically depends on file B even if not directly imported (semantic dependency) | 2 |
| \`PROVIDES_TO\` | File A provides data, services, or utilities consumed by file B | 2 |
| \`IMPLEMENTS\` | File A implements an interface, protocol, or contract defined in file B | 2 |
| \`SEQUENCES\` | Processing pipeline where A → B → C in a data/control flow | 2 |
| \`INITIALIZES\` | File A initializes or bootstraps file B during startup | 2 |
| \`EXECUTES\` | File A dispatches or spawns work in file B (e.g. worker → task) | 2 |
| \`CROSS_CUTTING\` | Shared utility used across otherwise unrelated modules | 1 |

Include \`IMPORTS\` edges for every resolved import. For semantic edges, only add them when you are confident the relationship exists — quality over quantity. Each edge should have a meaningful \`description\`.

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
- \`files\`: array of file paths (not node IDs — raw paths like \`"Code/file.js"\`)

Every file should belong to at least one feature. Features should be coherent groupings — don't create too many. 5-15 features is typical for a moderate codebase.

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
# Graphify Report: <repo-name>

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
4. For semantic edges (\`DEPENDS_ON\`, \`PROVIDES_TO\`, \`IMPLEMENTS\`, etc.), be conservative — only add them when you have strong evidence from file names, symbol names, or import patterns.
5. The \`features\` section should organize the entire codebase by coherent feature groups.
6. The \`concepts\` section should document important domain or architectural concepts.
7. Compute centrality values correctly: \`centrality = degree / (totalNodes - 1)\`.
8. Focus on making the graph useful for someone asking "how does X work?".
9. Do NOT include \`stats\` objects in feature or concept entries — they go only on nodes.
10. The \`symbols\` array per node should include meaningful \`purpose\` and \`role\` for every symbol listed.

## Output

Write two files:

1. \`${repoPath}\\graphify\\graphify-storage\\graph.json\` — the structured graph (must match the schema above exactly)
2. \`${repoPath}\\graphify\\graphify-storage\\graph.md\` — the human-readable report
`;

  const promptPath = path.join(outDir, 'generate-graph.md');
  fs.writeFileSync(promptPath, prompt, 'utf-8');

  return { ok: true, path: promptPath };
}

function exportAll() {
  const exportResult = exportSymbolsJson();
  if (!exportResult.ok) return exportResult;

  const promptResult = generatePrompt();
  if (!promptResult.ok) return promptResult;

  return {
    ok: true,
    symbolsPath: exportResult.path,
    promptPath: promptResult.path,
    stats: exportResult.stats,
  };
}

function loadGraphFromStorage() {
  const repoPath = _getRepoPath();
  if (!repoPath) {
    return { ok: false, error: 'No repository found in symbol index. Please index your codebase first.' };
  }

  const graphPath = path.join(repoPath, GRAPHIFY_DIR, 'graph.json');
  const reportPath = path.join(repoPath, GRAPHIFY_DIR, 'graph.md');

  if (!fs.existsSync(graphPath)) {
    return { ok: false, error: 'graph.json not found. Run the prompt with your AI first.' };
  }

  try {
    const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
    const reportMd = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf-8') : '';

    return { ok: true, graph: graphData, report: reportMd };
  } catch (err) {
    return { ok: false, error: `Failed to load graph: ${err.message}` };
  }
}

function generateIncrementalPrompt(repoPath, changedFiles) {
  if (!repoPath) {
    return { ok: false, error: 'No repository path provided.' };
  }

  var symbolsPath = path.join(repoPath, STORAGE_DIR, 'symbols.json');
  var graphPath = path.join(repoPath, GRAPHIFY_DIR, 'graph.json');

  if (!fs.existsSync(symbolsPath)) {
    return { ok: false, error: 'symbols.json not found. Re-index the codebase first.' };
  }

  var symbolsData, graphData;
  try { symbolsData = JSON.parse(fs.readFileSync(symbolsPath, 'utf-8')); } catch (e) {
    return { ok: false, error: 'Failed to parse symbols.json: ' + e.message };
  }
  try {
    graphData = fs.existsSync(graphPath) ? JSON.parse(fs.readFileSync(graphPath, 'utf-8')) : null;
  } catch (e) {
    graphData = null;
  }

  // Build a map of filePath → symbols for quick lookup
  var symbolsByFile = {};
  (symbolsData.symbols || []).forEach(function(s) {
    var fp = s.filePath;
    if (!symbolsByFile[fp]) symbolsByFile[fp] = [];
    symbolsByFile[fp].push(s);
  });

  // Build a map of filePath → imports
  var importsByFile = {};
  (symbolsData.imports || []).forEach(function(i) {
    var sf = i.sourceFile;
    if (!importsByFile[sf]) importsByFile[sf] = [];
    importsByFile[sf].push(i);
  });

  // Build a map filePath → file entry
  var filesMap = {};
  (symbolsData.files || []).forEach(function(f) { filesMap[f.path] = f; });

  var prevTotalNodes = graphData ? (graphData.stats ? graphData.stats.totalNodes : 0) : 0;
  var prevTotalEdges = graphData ? (graphData.stats ? graphData.stats.totalEdges : 0) : 0;

  // Build changed files detail
  var modifiedFiles = [];
  var newFiles = [];
  (changedFiles || []).forEach(function(fp) {
    var fe = filesMap[fp];
    var syms = symbolsByFile[fp] || [];
    var imps = importsByFile[fp] || [];
    var lang = fe ? fe.language : 'unknown';
    var detail = { path: fp, language: lang, symbols: syms, imports: imps };
    // Check if this file exists in the previous graph (has a node)
    var existed = graphData && graphData.nodes && graphData.nodes.some(function(n) {
      return n.filePath === fp;
    });
    if (existed) {
      modifiedFiles.push(detail);
    } else {
      newFiles.push(detail);
    }
  });

  var outDir = path.join(repoPath, STORAGE_DIR);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  var now = new Date().toISOString();
  var lines = [];

  lines.push('# Incremental Knowledge Graph Update');
  lines.push('');
  lines.push('This is an **incremental** update to an existing knowledge graph.');
  lines.push('Your task is to update `graph.json` with only the changed files described below.');
  lines.push('Preserve ALL existing nodes, edges, features, and concepts that have not changed.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Previous Graph State');
  lines.push('');
  lines.push('- Total nodes: ' + prevTotalNodes);
  lines.push('- Total edges: ' + prevTotalEdges);
  if (graphData && graphData.generatedAt) {
    lines.push('- Generated at: ' + graphData.generatedAt);
  }
  lines.push('');
  lines.push('## Source Repository');
  lines.push('');
  lines.push('```');
  lines.push(repoPath);
  lines.push('```');
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push('Read the source code of the changed files listed below from disk, then:');
  lines.push('');
  lines.push('1. For each **modified file**: UPDATE its existing node in `graph.json` with new symbols, responsibilities, features, tags, and summary if the code changed significantly. Keep the same node ID (`file-<path>`). Do NOT delete the old node — update it in place.');
  lines.push('2. For each **new file**: ADD a new node following the same `graph.json` schema. Create edges between this file and files it imports or collaborates with.');
  lines.push('3. Update `edges` — add new edges for new relationships, update existing edges if their weight or description changed.');
  lines.push('4. Update `features` — add new files to existing features or create new features as needed.');
  lines.push('5. Update `concepts` — add new concepts or update existing ones.');
  lines.push('6. Update `meta.incremental` in the top-level object:');
  lines.push('   - `total`: total number of files in the updated graph');
  lines.push('   - `reused`: previous total - (modified + new)');
  lines.push('   - `rebuilt`: modified files count');
  lines.push('   - `new`: new files count');
  lines.push('   - `changed`: modified files count');
  lines.push('   - `generationMode`: "ai_incremental"');
  lines.push('7. Update `stats` with new totals.');
  lines.push('8. Set `generatedAt` to the current timestamp.');
  lines.push('');
  lines.push('## Files Changed (' + (modifiedFiles.length + newFiles.length) + ' total)');
  lines.push('');

  if (modifiedFiles.length > 0) {
    lines.push('### Modified Files (' + modifiedFiles.length + ')');
    lines.push('');
    modifiedFiles.forEach(function(f) {
      lines.push('#### `' + f.path + '`');
      lines.push('');
      lines.push('- Language: ' + f.language);
      if (f.symbols.length > 0) {
        lines.push('- Symbols (' + f.symbols.length + '):');
        f.symbols.forEach(function(s) {
          lines.push('  - `' + s.name + '` — type: ' + s.type + (s.isExported ? ', exported' : '') + (s.signature ? ', signature: `' + s.signature + '`' : ''));
        });
      } else {
        lines.push('- Symbols: (none)');
      }
      if (f.imports.length > 0) {
        lines.push('- Imports (' + f.imports.length + '):');
        f.imports.forEach(function(i) {
          lines.push('  - `' + i.importPath + '` (' + i.importType + (i.resolvedFile ? ' → ' + i.resolvedFile : '') + ')');
        });
      } else {
        lines.push('- Imports: (none)');
      }
      lines.push('');
    });
  }

  if (newFiles.length > 0) {
    lines.push('### New Files (' + newFiles.length + ')');
    lines.push('');
    newFiles.forEach(function(f) {
      lines.push('#### `' + f.path + '`');
      lines.push('');
      lines.push('- Language: ' + f.language);
      if (f.symbols.length > 0) {
        lines.push('- Symbols (' + f.symbols.length + '):');
        f.symbols.forEach(function(s) {
          lines.push('  - `' + s.name + '` — type: ' + s.type + (s.isExported ? ', exported' : '') + (s.signature ? ', signature: `' + s.signature + '`' : ''));
        });
      } else {
        lines.push('- Symbols: (none)');
      }
      if (f.imports.length > 0) {
        lines.push('- Imports (' + f.imports.length + '):');
        f.imports.forEach(function(i) {
          lines.push('  - `' + i.importPath + '` (' + i.importType + (i.resolvedFile ? ' → ' + i.resolvedFile : '') + ')');
        });
      } else {
        lines.push('- Imports: (none)');
      }
      lines.push('');
    });
  }

  lines.push('## Output');
  lines.push('');
  lines.push('Write the updated `graph.json` to:');
  lines.push('```');
  lines.push(path.join(repoPath, GRAPHIFY_DIR, 'graph.json'));
  lines.push('```');
  lines.push('');
  lines.push('Write the updated report to:');
  lines.push('```');
  lines.push(path.join(repoPath, GRAPHIFY_DIR, 'graph.md'));
  lines.push('```');
  lines.push('');
  lines.push('> IMPORTANT: Output the COMPLETE `graph.json` with ALL nodes and edges — not just the changed ones. The unchanged nodes/edges must be preserved exactly as they were.');

  var prompt = lines.join('\n');
  var promptPath = path.join(outDir, 'incremental-graph.md');
  fs.writeFileSync(promptPath, prompt, 'utf-8');

  return {
    ok: true,
    path: promptPath,
  };
}

module.exports = { exportSymbolsJson, generatePrompt, exportAll, loadGraphFromStorage, generateIncrementalPrompt };