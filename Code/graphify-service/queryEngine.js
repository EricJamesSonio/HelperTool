'use strict';

const { getIndexedData } = require('./db');
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

function matchFilesByPath(keywords) {
  const data = getIndexedData();
  const hits = new Map();

  for (const [id, fileInfo] of data.filesById) {
    const base = fileInfo.path.split('/').pop().toLowerCase().replace(/\.[^.]+$/, '');
    let score = 0;
    for (const kw of keywords) {
      if (base === kw) {
        score += 10;
      } else if (base.includes(kw)) {
        score += 5;
      }
    }
    if (score > 0) {
      hits.set(fileInfo.path, (hits.get(fileInfo.path) || 0) + score);
    }
  }

  return hits;
}

function matchFilesBySymbol(keywords) {
  const data = getIndexedData();
  const hits = new Map();

  for (const [fileId, symbols] of data.symsByFile) {
    const fileInfo = data.filesById.get(fileId);
    if (!fileInfo) continue;

    for (const sym of symbols) {
      const nameLower = (sym.name || '').toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (nameLower === kw) {
          const typeBoost = (sym.type === 'class' || sym.type === 'function') ? 12 : 8;
          score += typeBoost;
        } else if (nameLower.includes(kw) || kw.includes(nameLower)) {
          score += 4;
        }
      }
      if (score > 0) {
        hits.set(fileInfo.path, (hits.get(fileInfo.path) || 0) + score);
      }
    }
  }

  return hits;
}

function buildImportGraph() {
  const data = getIndexedData();
  const forwardAdj = new Map();

  for (const edge of data.depEdges) {
    if (!forwardAdj.has(edge.source)) forwardAdj.set(edge.source, new Set());
    forwardAdj.get(edge.source).add(edge.target);
  }

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

function fuzzyFallback(keywords) {
  const data = getIndexedData();
  const hits = new Map();

  for (const [id, fileInfo] of data.filesById) {
    const lowerPath = fileInfo.path.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (lowerPath.includes(kw)) {
        score += 2;
      }
    }
    if (score > 0) {
      hits.set(fileInfo.path, (hits.get(fileInfo.path) || 0) + score);
    }
  }

  return hits;
}

function queryRelevantCode(query, repoPath) {
  const data = getIndexedData();
  if (!data) {
    return { files: [], explanation: 'No indexed data found. Please index your codebase first.', scores: [] };
  }

  if (repoPath && data.repoInfo.repoPath !== repoPath) {
    return { files: [], explanation: `Repo path mismatch. Indexed: ${data.repoInfo.repoPath}, requested: ${repoPath}`, scores: [] };
  }

  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return { files: [], explanation: 'Could not extract meaningful keywords from query.', scores: [] };
  }

  const pathHits   = matchFilesByPath(keywords);
  const symbolHits = matchFilesBySymbol(keywords);

  const entryScores = new Map();
  for (const [file, score] of pathHits)   entryScores.set(file, (entryScores.get(file) || 0) + score);
  for (const [file, score] of symbolHits) entryScores.set(file, (entryScores.get(file) || 0) + score);

  if (entryScores.size === 0) {
    const fuzzy = fuzzyFallback(keywords);
    if (fuzzy.size === 0) {
      return {
        files: [],
        explanation: `No files or symbols matched keywords: ${keywords.join(', ')}`,
        scores: [],
      };
    }
    for (const [file, score] of fuzzy) {
      entryScores.set(file, score);
    }
  }

  const forwardAdj = buildImportGraph();

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
