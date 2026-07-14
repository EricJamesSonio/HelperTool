# Graphify — Knowledge Graph API for AI Agents

A knowledge-graph server that makes any codebase queryable. Exposes code
relationships (imports, symbols, dependencies) as a graph and lets you ask
natural-language questions to find relevant files.

**Server:** `http://127.0.0.1:{port}` (default `3333`).

---

## AI Usage Rules (MANDATORY)

You are an AI assistant with access to a codebase knowledge graph.

- If the user asks anything about the repository, code, functions, files, or
  architecture → you **MUST** use the Graphify API.
- Do **NOT** guess or assume code behavior without calling the API.
- **Even if you think you know the answer, you MUST verify using the API.**
- Always start with `POST /graph/relevant-code`.
- You may call **multiple endpoints in sequence** to fully understand the code
  before answering.
- If the API results are unclear or insufficient → refine the query and call
  `/graph/relevant-code` again. Do not answer with low confidence.
- Do not call advanced endpoints unless necessary. Most questions can be
  answered using `/graph/relevant-code` + reading files.

---

## Quick Decision Guide

| What the user wants | What you call |
|---|---|
| "How does X work?" | `POST /graph/relevant-code` |
| "What depends on X?" | `POST /graph/search` → `POST /graph/affected` |
| "What does X use / import?" | `POST /graph/search` → `POST /graph/neighborhood` |
| "How are A and B connected?" | `POST /graph/shortest-path` |
| "Give me the architecture overview" | `GET /graph/report` |

---

## The 4 Endpoints You'll Use

### 1. `POST /graph/relevant-code` ← PRIMARY ENTRY POINT

This is the main way to understand the codebase. Always use this first to
locate relevant files before using other endpoints. Ask in plain English.

```
POST /graph/relevant-code
Content-Type: application/json

{ "query": "how does user authentication work" }
```

Returns ranked files with an explanation of why they matched:

```json
{
  "files": [
    { "path": "src/auth/login.tsx", "score": 85 },
    { "path": "src/auth/hooks.ts",   "score": 62 }
  ],
  "explanation": "Matched keywords 'auth', 'login'. Found symbol 'authenticateUser'. BFS import expansion."
}
```

---

### 2. `POST /graph/search` — Find nodes by name → get node IDs

```
POST /graph/search
Content-Type: application/json

{ "query": "PaymentGateway", "limit": 10 }
```

Returns matching graph nodes with their IDs and types:

```json
{
  "results": [
    { "id": "n42", "label": "PaymentGateway", "type": "class", "filePath": "src/payment/gateway.ts" }
  ]
}
```

Use the returned `id` in neighborhood / affected / shortest-path calls.

---

### 3. `POST /graph/neighborhood` — What is connected to this node

```
POST /graph/neighborhood
Content-Type: application/json

{ "nodeId": "n42", "depth": 2 }
```

Returns connected nodes and edges. Depth 1 = immediate neighbors, depth 2 =
neighbors-of-neighbors.

Use this to understand what a module imports, what depends on it, and what
other code is related.

---

### 4. `POST /graph/affected` — Impact analysis

```
POST /graph/affected
Content-Type: application/json

{ "nodeId": "n42", "depth": 1 }
```

Returns all nodes that would be affected if this module changes. Use before
refactoring to find everything that depends on a node.

---

### Bonus: `GET /graph/report` — Architecture overview

```
GET /graph/report
```

Returns total nodes/edges, highest-degree ("god") nodes, cross-community
(surprising) connections, and community clusters. Use this to understand the
big picture before diving in.

---

## Workflow Patterns

### Pattern A: "Find and explain"

```
1. POST /graph/relevant-code { query: "how does X work" }
   → get file paths with scores
2. Read the top files from disk
3. POST /graph/search { query: "<filename>" }
   → get the node ID
4. POST /graph/neighborhood { nodeId, depth: 1 }
   → see what else is connected
```

### Pattern B: "Impact check before changes"

```
1. POST /graph/search { query: "<module name>" }
   → get node ID
2. POST /graph/affected { nodeId, depth: 1 }
   → see everything that would be affected
3. For critical affected nodes → POST /graph/neighborhood { depth: 1 }
   → understand their context too
```

### Pattern C: "Architecture deep-dive"

```
1. GET /graph/report
   → see god nodes, communities, surprising edges
2. POST /graph/search { query: "<god node name>" }
   → get node ID
3. POST /graph/neighborhood { nodeId, depth: 2 }
   → explore its full context
```

---

## Answering Guidelines

- Base your answer on retrieved files and graph data.
- Mention relevant files and functions when explaining.
- Explain flow (e.g., Controller → Service → Model) when applicable.
- Keep answers concise but grounded in code.

---

## Example AI Behavior

**User:** "How does booking creation work?"

**AI:**
1. Calls `POST /graph/relevant-code` with query `"how does booking creation work"`
2. Reads the top-ranked files from disk
3. Optionally explores relationships via `POST /graph/neighborhood`
4. Answers using the retrieved context

**Never answer without step 1.**

---

## Node IDs

Nodes use IDs like `n0`, `n1`, `n42`. Every file and every symbol (class,
function, variable) is a node. Use `POST /graph/search` to find a node by
name/path, then use its ID in neighborhood / affected / shortest-path calls.
