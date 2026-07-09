'use strict';

const { getDb }    = require('./db');
const { explain }  = require('./explainer');

const STOPWORDS = new Set([
  'a','an','the','is','it','in','on','at','to','do','how','what','where',
  'which','why','when','who','does','did','was','are','be','been','being',
  'have','has','had','will','would','could','should','may','might','can',
  'get','set','use','with','and','or','not','for','from','of','this','that',
  'there','their','they','them','then','than','its','our','your','my','we',
  'i','me','he','she','work','works','working','about','into','using',
  'called','call','calls','make','makes','made','create','creates','created',
]);

const DEPTH_SCORE = { 0: 0, 1: 5, 2: 2 };
const MAX_DEPTH   = 2;
const MAX_RESULTS = 7;
const MIN_SCORE   = 2;

function extractKeywords(query) {
  const caseSplit = query.replace(/([a-z])([A-Z])/g, '$1 $2');
  return caseSplit
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

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

  const stmt = db.prepare('SELECT id FROM repositories WHERE indexed = 1 ORDER BY last_indexed DESC LIMIT 1');
  if (stmt.step()) {
    const id = stmt.getAsObject().id;
    stmt.free();
    return id;
  }
  stmt.free();
  return null;
}

function matchFilesByPath(repoId, keywords) {
  const db = getDb();
  const hits = new Map();

  const stmt = db.prepare('SELECT path FROM indexed_files WHERE repo_id = ?');
  stmt.bind([repoId]);

  while (stmt.step()) {
    const { path: filePath } = stmt.getAsObject();
    const base = filePath.split('/').pop().toLowerCase().replace(/\.[^.]+$/, '');

    let score = 0;
    for (const kw of keywords) {
      if (base === kw) {
        score += 10;
      } else if (base.includes(kw)) {
        score += 5;
      }
    }

    if (score > 0) {
      hits.set(filePath, (hits.get(filePath) || 0) + score);
    }
  }
  stmt.free();

  return hits;
}

function matchFilesBySymbol(repoId, keywords) {
  const db = getDb();
  const hits = new Map();

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

function buildImportGraph(repoId) {
  const db = getDb();
  const forwardAdj = new Map();

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
    if (!forwardAdj.has(source)) forwardAdj.set(source, new Set());
    forwardAdj.get(source).add(target);
  }
  stmt.free();

  return forwardAdj;
}

function bfsExpand(entryFiles, forwardAdj, reverseAdj, maxDepth) {
  const visited = new Map();
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

    const fwdNeighbors = forwardAdj.get(file) || new Set();
    for (const neighbor of fwdNeighbors) {
      if (!visited.has(neighbor)) {
        visited.set(neighbor, depth + 1);
        queue.push({ file: neighbor, depth: depth + 1 });
      }
    }

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

function fuzzyFallback(repoId, keywords) {
  const db = getDb();
  const hits = new Map();

  const stmt = db.prepare('SELECT path FROM indexed_files WHERE repo_id = ?');
  stmt.bind([repoId]);

  while (stmt.step()) {
    const { path: filePath } = stmt.getAsObject();
    const lowerPath = filePath.toLowerCase();

    let score = 0;
    for (const kw of keywords) {
      if (lowerPath.includes(kw)) {
        score += 2;
      }
    }

    if (score > 0) {
      hits.set(filePath, (hits.get(filePath) || 0) + score);
    }
  }
  stmt.free();

  return hits;
}

function queryRelevantCode(query, repoPath) {
  const repoId = getRepoId(repoPath);
  if (!repoId) {
    return { files: [], explanation: 'No indexed repo found. Please index your codebase first.', scores: [] };
  }

  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return { files: [], explanation: 'Could not extract meaningful keywords from query.', scores: [] };
  }

  const pathHits   = matchFilesByPath(repoId, keywords);
  const symbolHits = matchFilesBySymbol(repoId, keywords);

  const entryScores = new Map();
  for (const [file, score] of pathHits)   entryScores.set(file, (entryScores.get(file) || 0) + score);
  for (const [file, score] of symbolHits) entryScores.set(file, (entryScores.get(file) || 0) + score);

  // Fuzzy fallback if nothing matched
  if (entryScores.size === 0) {
    const fuzzy = fuzzyFallback(repoId, keywords);
    if (fuzzy.size === 0) {
      return {
        files: [],
        explanation: `No files or symbols matched keywords: ${keywords.join(', ')}`,
        scores: [],
      };
    }
    // Use fuzzy results as entry points
    for (const [file, score] of fuzzy) {
      entryScores.set(file, score);
    }
  }

  const forwardAdj = buildImportGraph(repoId);

  const reverseAdj = new Map();
  for (const [source, targets] of forwardAdj) {
    for (const target of targets) {
      if (!reverseAdj.has(target)) reverseAdj.set(target, new Set());
      reverseAdj.get(target).add(source);
    }
  }

  const entryFiles = Array.from(entryScores.keys());
  const expanded   = bfsExpand(entryFiles, forwardAdj, reverseAdj, MAX_DEPTH);

  const finalScores = new Map();

  for (const [file, depth] of expanded) {
    const entryScore = entryScores.get(file) || 0;
    const depthPenalty = DEPTH_SCORE[depth] ?? 0;
    const score = entryScore > 0
      ? entryScore
      : depthPenalty;
    if (score > 0) finalScores.set(file, score);
  }

  const ranked = Array.from(finalScores.entries())
    .filter(([, s]) => s >= MIN_SCORE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RESULTS);

  const files  = ranked.map(([f]) => f);
  const scores = ranked.map(([f, s]) => ({ file: f, score: s }));

  return {
    files,
    explanation: explain(query, keywords, files),
    scores,
  };
}

module.exports = { queryRelevantCode };
