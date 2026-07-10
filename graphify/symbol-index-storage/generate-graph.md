# Graphify AI Graph Generation Prompt

## Objective

You are an AI assistant. Your task is to analyze the provided `symbols.json` file containing the symbol index of a codebase, and produce two output files:

1. **`graphify-storage/graph.json`** — A structured knowledge graph with semantic labels
2. **`graphify-storage/graph.md`** — A human-readable markdown report

## Input: `symbols.json`

The `symbols.json` file contains:

### `files` (array)
Each file entry:
- `id`: numeric ID
- `path`: relative file path from repo root
- `language`: programming language (e.g. javascript, typescript, python)

### `symbols` (array)
Each symbol entry:
- `name`: symbol name (function, class, variable, etc.)
- `type`: symbol type (function, class, method, variable, constant, interface, type, enum, etc.)
- `line`, `column`: source location
- `isExported`: whether exported
- `className`: parent class (for methods)
- `signature`: full signature string
- `filePath`: which file the symbol belongs to

### `imports` (array)
Each import entry:
- `importPath`: the import string (e.g. "./utils", "react", "lodash")
- `importType`: default, named, namespace, side-effect, require, etc.
- `importedSymbols`: array of specific symbol names imported
- `sourcePath`: the file doing the importing
- `resolvedFile`: which file the import resolves to (null for externals)

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

Create `graph.json` with this exact schema:

```json
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
```

### Edge Types to Identify

Beyond obvious `IMPORTS` edges, identify **semantic relationships**:

| Edge Type | Meaning |
|-----------|---------|
| `IMPORTS` | Direct file import |
| `COLLABORATES_WITH` | Files that work together on the same feature |
| `DEPENDS_ON` | One file logically depends on another (not just import) |
| `ORCHESTRATES` | A file that coordinates multiple other files |
| `PROVIDES_TO` | A file provides data/services to another |
| `IMPLEMENTS` | A file implements an interface defined elsewhere |
| `SEQUENCES` | A processing pipeline step (A → B → C) |
| `CROSS_CUTTING` | Shared utility used across otherwise unrelated modules |

Only include meaningful semantic edges — don't just duplicate `IMPORTS`.

### Step 3: Generate a Human-Readable Report

Create `graph.md` with this structure:

```markdown
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
```

## Instructions for You

1. Be thorough but concise in summaries.
2. Group files by feature they belong to.
3. For `COLLABORATES_WITH` edges, only add them when files genuinely work together on the same logical feature.
4. The `features` section at the top level of `graph.json` should organize the entire codebase by feature.
5. The `concepts` section should document important domain concepts and where they appear.
6. Focus on making the graph useful for someone asking "how does X work?".

## Output

Write two files in the repository at `<repo-root>/graphify-storage/`:

1. `<repo-root>/graphify-storage/graph.json` — the structured graph
2. `<repo-root>/graphify-storage/graph.md` — the human-readable report
