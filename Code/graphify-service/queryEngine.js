/**
 * graphify-service/queryEngine.js
 *
 * The brain of Graphify.
 *
 * Flow:
 *   1. Extract keywords from natural language query
 *   2. Find entry-point files by matching keywords against:
 *      - file paths (basename)
 *      - symbol names (functions, classes, methods)
 *   3. BFS-expand through import graph (max depth 2)
 *   4. Score each file: direct match > depth-1 neighbor > depth-2 neighbor
 *   5. Return top 7 files + explanation
 *
 * Only reads from DB — uses getDb() which is read-only.
 */

'use strict';

const { getDb }    = require('./db');
const { explain }  = require('./explainer');

// Words that add no signal for code search
const STOPWORDS = new Set([
  'a','an','the','is','it','in','on','at','to','do','how','what','where',
  'which','why','when','who','does','did','was','are','be','been','being',
  'have','has','had','will','would','could','should','may','might','can',
  'get','set','use','with','and','or','not','for','from','of','this','that',
  'there','their','they','them','then','than','its','our','your','my','we',
  'i','me','he','she','work','works','working','about','into','using',
  'called','call','calls','make','makes','made','create','creates','created',
]);

// ── 1. Keyword extraction ─────────────────────────────────────────────────────

function extractKeywords(query) {
  return query
    .toLowerCase()
    // split on non-alphanumeric
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

// ── 2. DB helpers ─────────────────────────────────────────────────────────────

/**
 * Get repo_id for the given repoPath.
 * If repoPath is null, use the most recently indexed repo.
 */
function getRepoId(repoPath) {
  const db = getDb();

  if (repoPath) {
    const stmt = db.prepare('SELECT id FROM repositories WHERE repo_path = ? LIMIT 1');
    stmt.bind([repoPath]);
    if (stmt.step()) {
      const id = stmt.getAsObject().id;
      stmt.free();
      return id;
    }
    stmt.free();
    return null;
  }

  // Fall back to most recently indexed repo
  const stmt = db.prepare('SELECT id FROM repositories WHERE indexed = 1 ORDER BY last_indexed DESC LIMIT 1');
  if (stmt.step()) {
    const id = stmt.getAsObject().id;
    stmt.free();
    return id;
  }
  stmt.free();
  return null;
}

/**
 * Find files whose path basename matches any keyword.
 * Returns Map<filePath, score>
 */
function matchFilesByPath(repoId, keywords) {
  const db = getDb();
  const hits = new Map(); // filePath → score

  const stmt = db.prepare('SELECT path FROM indexed_files WHERE repo_id = ?');
  stmt.bind([repoId]);

  while (stmt.step()) {
    const { path: filePath } = stmt.getAsObject();
    const base = filePath.split('/').pop().toLowerCase().replace(/\.[^.]+$/, ''); // basename no ext

    let score = 0;
    for (const kw of keywords) {
      if (base === kw) {
        score += 10; // exact match
      } else if (base.includes(kw)) {
        score += 5;  // partial match
      }
    }

    if (score > 0) {
      hits.set(filePath, (hits.get(filePath) || 0) + score);
    }
  }
  stmt.free();

  return hits;
}

/**
 * Find files that define symbols matching any keyword.
 * Returns Map<filePath, score>
 */
function matchFilesBySymbol(repoId, keywords) {
  const db = getDb();
  const hits = new Map();

  // We query all symbols for the repo joined to their file path.
  // For a large repo this could be many rows, but sql.js is in-memory so it's fast.
  const stmt = db.prepare(`
    SELECT s.name, s.type, f.path as file_path
    FROM symbols s
    JOIN indexed_files f ON f.id = s.file_id
    WHERE s.repo_id = ?
  `);
  stmt.bind([repoId]);

  while (stmt.step()) {
    const { name, type, file_path } = stmt.getAsObject();
    const nameLower = (name || '').toLowerCase();

    let score = 0;
    for (const kw of keywords) {
      if (nameLower === kw) {
        // Boost classes and functions more than variables
        const typeBoost = (type === 'class' || type === 'function') ? 12 : 8;
        score += typeBoost;
      } else if (nameLower.includes(kw) || kw.includes(nameLower)) {
        score += 4;
      }
    }

    if (score > 0) {
      hits.set(file_path, (hits.get(file_path) || 0) + score);
    }
  }
  stmt.free();

  return hits;
}

/**
 * Build a forward import adjacency map for the repo.
 * adjacency[filePath] = Set of filePaths it imports (resolved only)
 *
 * We only use resolved_file_id rows — unresolved external imports are ignored.
 */
function buildImportGraph(repoId) {
  const db = getDb();
  const adj = new Map(); // filePath → Set<filePath>

  const stmt = db.prepare(`
    SELECT f.path as source, rf.path as target
    FROM file_imports fi
    JOIN indexed_files f  ON f.id  = fi.file_id
    JOIN indexed_files rf ON rf.id = fi.resolved_file_id
    WHERE fi.repo_id = ? AND fi.resolved_file_id IS NOT NULL
  `);
  stmt.bind([repoId]);

  while (stmt.step()) {
    const { source, target } = stmt.getAsObject();
    if (!adj.has(source)) adj.set(source, new Set());
    adj.get(source).add(target);
    // Also track reverse (imported_by) in same map using a reverse key
    // We'll build reverse separately when needed
  }
  stmt.free();

  return adj;
}

/**
 * BFS from a set of entry files through the import graph.
 * Returns Map<filePath, depthReached> for all files within maxDepth.
 */
function bfsExpand(entryFiles, forwardAdj, reverseAdj, maxDepth) {
  const visited = new Map(); // filePath → depth
  const queue   = [];

  for (const f of entryFiles) {
    if (!visited.has(f)) {
      visited.set(f, 0);
      queue.push({ file: f, depth: 0 });
    }
  }

  let i = 0;
  while (i < queue.length) {
    const { file, depth } = queue[i++];
    if (depth >= maxDepth) continue;

    // Follow forward imports (files this file imports)
    const fwdNeighbors = forwardAdj.get(file) || new Set();
    for (const neighbor of fwdNeighbors) {
      if (!visited.has(neighbor)) {
        visited.set(neighbor, depth + 1);
        queue.push({ file: neighbor, depth: depth + 1 });
      }
    }

    // Follow reverse imports (files that import this file)
    const revNeighbors = reverseAdj.get(file) || new Set();
    for (const neighbor of revNeighbors) {
      if (!visited.has(neighbor)) {
        visited.set(neighbor, depth + 1);
        queue.push({ file: neighbor, depth: depth + 1 });
      }
    }
  }

  return visited;
}

// ── 3. Main query function ────────────────────────────────────────────────────

const DEPTH_SCORE = { 0: 0, 1: 5, 2: 2 };
const MAX_DEPTH   = 2;
const MAX_RESULTS = 7;

function queryRelevantCode(query, repoPath) {
  const repoId = getRepoId(repoPath);
  if (!repoId) {
    return { files: [], explanation: 'No indexed repo found. Please index your codebase first.', scores: [] };
  }

  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return { files: [], explanation: 'Could not extract meaningful keywords from query.', scores: [] };
  }

  // Step 1 — Find entry points
  const pathHits   = matchFilesByPath(repoId, keywords);
  const symbolHits = matchFilesBySymbol(repoId, keywords);

  // Merge entry point scores
  const entryScores = new Map();
  for (const [file, score] of pathHits)   entryScores.set(file, (entryScores.get(file) || 0) + score);
  for (const [file, score] of symbolHits) entryScores.set(file, (entryScores.get(file) || 0) + score);

  if (entryScores.size === 0) {
    return {
      files: [],
      explanation: `No files or symbols matched keywords: ${keywords.join(', ')}`,
      scores: [],
    };
  }

  // Step 2 — Build import graph
  const forwardAdj = buildImportGraph(repoId);

  // Build reverse adjacency
  const reverseAdj = new Map();
  for (const [source, targets] of forwardAdj) {
    for (const target of targets) {
      if (!reverseAdj.has(target)) reverseAdj.set(target, new Set());
      reverseAdj.get(target).add(source);
    }
  }

  // Step 3 — BFS expand from entry points
  const entryFiles = Array.from(entryScores.keys());
  const expanded   = bfsExpand(entryFiles, forwardAdj, reverseAdj, MAX_DEPTH);

  // Step 4 — Score all reachable files
  const finalScores = new Map();

  for (const [file, depth] of expanded) {
    const entryScore = entryScores.get(file) || 0;
    const depthPenalty = DEPTH_SCORE[depth] ?? 0;
    // Entry points keep their full score; neighbors get a traversal bonus only
    const score = entryScore > 0
      ? entryScore                    // direct match — use its real score
      : depthPenalty;                 // reached by traversal only
    if (score > 0) finalScores.set(file, score);
  }

  // Step 5 — Sort and limit
  const ranked = Array.from(finalScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RESULTS);

  const files  = ranked.map(([f]) => f);
  const scores = ranked.map(([f, s]) => ({ file: f, score: s }));

  return {
    files,
    explanation: explain(query, keywords, files),
    scores, // included so UI can show relevance badges
  };
}

module.exports = { queryRelevantCode };