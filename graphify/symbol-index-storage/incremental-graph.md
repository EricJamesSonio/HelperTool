# Incremental Knowledge Graph Update

This is an **incremental** update to an existing knowledge graph.
Your task is to update `graph.json` with only the changed files listed below.
Preserve ALL existing nodes, edges, features, and concepts that have not changed.

---

## Source Repository

```
C:\Users\Windows 10\Desktop\Personal\Tools\HelperTool
```

## Symbol Index

The full symbol index is at:
```
C:\Users\Windows 10\Desktop\Personal\Tools\HelperTool\graphify\symbol-index-storage\symbols.json
```
Read `symbols.json` from disk to get the symbol data (files, symbols, imports) for all files.
Look up the changed files by their path to find their symbols and imports.

## Instructions

Read the actual source code from disk for the changed files listed below, then:

1. For each **modified file**: UPDATE its existing node in `graph.json` with new summary, responsibilities, features, tags, and per-symbol purpose/role. Keep the same node ID (`file-<path>`).
2. For each **new file**: ADD a new node following the same `graph.json` schema. Create edges to files it imports or collaborates with.
3. Update edges, features, and concepts as needed.
4. Update `meta.incremental`, `stats`, and `generatedAt`.
5. Preserve ALL unchanged nodes, edges, and data exactly as they were.
6. Write the updated `graph.json` to the previous location.
7. Write the updated `graph.md` report to the previous location.

## Changed Files (4)

  - Code/indexer/watcher.js
  - Code/renderer/graphify/graphifyState.js
  - Code/renderer/graphify/graphifyUI.js
  - Code/renderer/styles/graphify.css

## Output

Write the updated `graph.json` to:
```
C:\Users\Windows 10\Desktop\Personal\Tools\HelperTool\graphify\graphify-storage\graph.json
```

Write the updated report to:
```
C:\Users\Windows 10\Desktop\Personal\Tools\HelperTool\graphify\graphify-storage\graph.md
```

> IMPORTANT: Output the COMPLETE `graph.json` with ALL nodes and edges — not just the changed ones. The unchanged nodes/edges must be preserved exactly as they were.
