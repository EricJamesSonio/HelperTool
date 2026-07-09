'use strict';

const fs   = require('fs');
const path = require('path');
const { getDb } = require('./db');

const STORAGE_DIR = 'symbol-index-storage';
const GRAPHIFY_DIR = 'graphify-storage';

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

1. **\`graphify-storage/graph.json\`** — A structured knowledge graph with semantic labels
2. **\`graphify-storage/graph.md\`** — A human-readable markdown report

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
- \`signature\`: full signature string
- \`filePath\`: which file the symbol belongs to

### \`imports\` (array)
Each import entry:
- \`importPath\`: the import string (e.g. "./utils", "react", "lodash")
- \`importType\`: default, named, namespace, side-effect, require, etc.
- \`importedSymbols\`: array of specific symbol names imported
- \`sourcePath\`: the file doing the importing
- \`resolvedFile\`: which file the import resolves to (null for externals)

## Your Task

### Step 1: Analyze and Label

For each file in the codebase, determine:

- **What does this file do?** (1-2 sentence summary)
- **What feature/system does it belong to?** (e.g. "auth", "payment", "database", "routing", "api", "ui", "config", "logging", "utils", "testing")
- **What concepts does it relate to?** (comma-separated tags)

For each symbol (function, class, etc.), determine:

- **What is its purpose?** (brief description)
- **What role does it play in its file?** (e.g. "entry point", "helper", "orchestrator", "data model", "validator")

### Step 2: Build the Knowledge Graph

Create \`graph.json\` with this exact schema:

\`\`\`json
{
  "graphVersion": "1.0",
  "repoName": "...",
  "generatedAt": "ISO date",
  "nodes": [
    {
      "id": "file-<path>",
      "type": "file",
      "label": "filename.ext",
      "filePath": "path/to/file.ext",
      "language": "javascript",
      "summary": "Handles user authentication via JWT tokens and OAuth2 flows",
      "features": ["auth", "security", "user-management"],
      "tags": ["authentication", "jwt", "oauth", "login"],
      "symbols": [
        {
          "name": "loginUser",
          "type": "function",
          "line": 42,
          "signature": "async function loginUser(email, password)",
          "purpose": "Validates credentials and returns JWT token",
          "role": "entry point"
        }
      ]
    }
  ],
  "edges": [
    {
      "source": "file-1",
      "target": "file-2",
      "type": "IMPORTS",
      "description": "Uses utility functions from helpers"
    },
    {
      "source": "file-1",
      "target": "file-3",
      "type": "COLLABORATES_WITH",
      "description": "Both participate in the payment processing pipeline"
    }
  ],
  "features": {
    "auth": {
      "summary": "Authentication and authorization system",
      "files": ["file-1", "file-4"],
      "keyConcepts": ["JWT", "OAuth", "session", "permissions"]
    },
    "payment": {
      "summary": "Payment processing with Stripe integration",
      "files": ["file-3", "file-7"],
      "keyConcepts": ["Stripe", "checkout", "webhook", "invoice"]
    }
  },
  "concepts": {
    "JWT": {
      "summary": "JSON Web Token used for stateless authentication",
      "relatedFiles": ["file-1", "file-5"],
      "relatedSymbols": ["loginUser", "verifyToken", "refreshToken"]
    }
  }
}
\`\`\`

### Edge Types to Identify

Beyond obvious \`IMPORTS\` edges, identify **semantic relationships**:

| Edge Type | Meaning |
|-----------|---------|
| \`IMPORTS\` | Direct file import |
| \`COLLABORATES_WITH\` | Files that work together on the same feature |
| \`DEPENDS_ON\` | One file logically depends on another (not just import) |
| \`ORCHESTRATES\` | A file that coordinates multiple other files |
| \`PROVIDES_TO\` | A file provides data/services to another |
| \`IMPLEMENTS\` | A file implements an interface defined elsewhere |
| \`SEQUENCES\` | A processing pipeline step (A → B → C) |
| \`CROSS_CUTTING\` | Shared utility used across otherwise unrelated modules |

Only include meaningful semantic edges — don't just duplicate \`IMPORTS\`.

### Step 3: Generate a Human-Readable Report

Create \`graph.md\` with this structure:

\`\`\`markdown
# Graphify Report: <repo-name>

Generated: <date>

## Overview

- Total files: N
- Total symbols: N
- Features detected: N

## Features

### [Feature Name]
**Summary**: ...
**Key files**: file1.js, file2.js
**Key concepts**: concept1, concept2

## Key Files (God Nodes)

Files with highest connectivity / importance:

1. **file.js** — summary
   - Imports from: N files
   - Imported by: N files
   - Contains: N symbols

## Architecture Flow

[Describe how data/control flows through the system, feature by feature]

## Concepts Glossary

| Concept | Description | Related Files |
|---------|-------------|---------------|
| JWT | JSON Web Token | auth.js, middleware.js |

## Surprising Connections

Cross-feature or unexpected relationships detected.

## Notes

- Add any observations about code quality, architectural patterns, or areas of complexity.
\`\`\`

## Instructions for You

1. Be thorough but concise in summaries.
2. Group files by feature they belong to.
3. For \`COLLABORATES_WITH\` edges, only add them when files genuinely work together on the same logical feature.
4. The \`features\` section at the top level of \`graph.json\` should organize the entire codebase by feature.
5. The \`concepts\` section should document important domain concepts and where they appear.
6. Focus on making the graph useful for someone asking "how does X work?".

## Output

Write two files in the repository at \`<repo-root>/graphify-storage/\`:

1. \`<repo-root>/graphify-storage/graph.json\` — the structured graph
2. \`<repo-root>/graphify-storage/graph.md\` — the human-readable report
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

module.exports = { exportSymbolsJson, generatePrompt, exportAll, loadGraphFromStorage };