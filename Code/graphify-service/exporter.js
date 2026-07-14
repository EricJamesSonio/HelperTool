'use strict';

const fs   = require('fs');
const path = require('path');
const { getIndexedData } = require('./db');

const STORAGE_DIR = 'graphify/symbol-index-storage';
const GRAPHIFY_DIR = 'graphify/graphify-storage';

function exportSymbolsJson(repoPath) {
  if (!repoPath) return { ok: false, error: 'No repository path provided.' };

  const outDir = path.join(repoPath, STORAGE_DIR);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const data = getIndexedData();
  const { filesById, filesByPath, symsByFile, impsByFile, repoInfo } = data;

  const out = {
    exportedAt: new Date().toISOString(),
    repoPath: repoPath,
    repoName: repoPath.split(/[/\\]/).pop(),
    files: Array.from(filesById.values()),
    symbols: [],
    imports: [],
    overview: {
      totalFiles: filesById.size,
      totalSymbols: 0,
    },
  };

  for (const [fileId, symbols] of symsByFile) {
    for (const sym of symbols) {
      out.symbols.push({
        name: sym.name,
        type: sym.type,
        line: sym.line,
        column: sym.column,
        isExported: sym.isExported,
        className: sym.className,
        signature: sym.signature,
        filePath: sym.filePath,
      });
    }
  }
  out.overview.totalSymbols = out.symbols.length;

  for (const [fileId, imports] of impsByFile) {
    const fileInfo = filesById.get(fileId);
    const sourcePath = fileInfo ? fileInfo.path : null;
    for (const imp of imports) {
      out.imports.push({
        importPath: imp.importPath,
        importType: imp.importType,
        importedSymbols: imp.importedSymbols,
        sourceFile: sourcePath,
        resolvedFile: imp.resolvedFile,
      });
    }
  }

  const symbolsPath = path.join(outDir, 'symbols.json');
  fs.writeFileSync(symbolsPath, JSON.stringify(out, null, 2), 'utf-8');

  return { ok: true, path: symbolsPath, stats: { files: out.files.length, symbols: out.symbols.length, imports: out.imports.length } };
}

function generatePrompt(repoPath) {
  if (!repoPath) {
    return { ok: false, error: 'No repository path provided.' };
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

function exportAll(repoPath) {
  const exportResult = exportSymbolsJson(repoPath);
  if (!exportResult.ok) return exportResult;

  const promptResult = generatePrompt(repoPath);
  if (!promptResult.ok) return promptResult;

  return {
    ok: true,
    symbolsPath: exportResult.path,
    promptPath: promptResult.path,
    stats: exportResult.stats,
  };
}

function loadGraphFromStorage(repoPath) {
  if (!repoPath) {
    return { ok: false, error: 'No repository path provided.' };
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
  if (!fs.existsSync(symbolsPath)) {
    return { ok: false, error: 'symbols.json not found. Re-index the codebase first.' };
  }

  var outDir = path.join(repoPath, STORAGE_DIR);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  var fileList = (changedFiles || []).map(function(fp) { return '  - ' + fp; }).join('\n');

  var prompt = '# Incremental Knowledge Graph Update\n' +
    '\n' +
    'This is an **incremental** update to an existing knowledge graph.\n' +
    'Your task is to update `graph.json` with only the changed files listed below.\n' +
    'Preserve ALL existing nodes, edges, features, and concepts that have not changed.\n' +
    '\n' +
    '---\n' +
    '\n' +
    '## Source Repository\n' +
    '\n' +
    '```\n' +
    repoPath + '\n' +
    '```\n' +
    '\n' +
    '## Symbol Index\n' +
    '\n' +
    'The full symbol index is at:\n' +
    '```\n' +
    symbolsPath + '\n' +
    '```\n' +
    'Read `symbols.json` from disk to get the symbol data (files, symbols, imports) for all files.\n' +
    'Look up the changed files by their path to find their symbols and imports.\n' +
    '\n' +
    '## Instructions\n' +
    '\n' +
    'Read the actual source code from disk for the changed files listed below, then:\n' +
    '\n' +
    '1. For each **modified file**: UPDATE its existing node in `graph.json` with new summary, responsibilities, features, tags, and per-symbol purpose/role. Keep the same node ID (`file-<path>`).\n' +
    '2. For each **new file**: ADD a new node following the same `graph.json` schema. Create edges to files it imports or collaborates with.\n' +
    '3. Update edges, features, and concepts as needed.\n' +
    '4. Update `meta.incremental`, `stats`, and `generatedAt`.\n' +
    '5. Preserve ALL unchanged nodes, edges, and data exactly as they were.\n' +
    '6. Write the updated `graph.json` to the previous location.\n' +
    '7. Write the updated `graph.md` report to the previous location.\n' +
    '\n' +
    '## Changed Files (' + (changedFiles ? changedFiles.length : 0) + ')\n' +
    '\n' +
    fileList + '\n' +
    '\n' +
    '## Output\n' +
    '\n' +
    'Write the updated `graph.json` to:\n' +
    '```\n' +
    path.join(repoPath, GRAPHIFY_DIR, 'graph.json') + '\n' +
    '```\n' +
    '\n' +
    'Write the updated report to:\n' +
    '```\n' +
    path.join(repoPath, GRAPHIFY_DIR, 'graph.md') + '\n' +
    '```\n' +
    '\n' +
    '> IMPORTANT: Output the COMPLETE `graph.json` with ALL nodes and edges — not just the changed ones. The unchanged nodes/edges must be preserved exactly as they were.\n';

  var promptPath = path.join(outDir, 'incremental-graph.md');
  fs.writeFileSync(promptPath, prompt, 'utf-8');

  return {
    ok: true,
    path: promptPath,
  };
}

module.exports = { exportSymbolsJson, generatePrompt, exportAll, loadGraphFromStorage, generateIncrementalPrompt };
