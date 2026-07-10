'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORAGE_DIR = 'graphify/symbol-index-storage';
const GRAPHIFY_DIR = 'graphify/graphify-storage';
const GRAPH_VERSION = 2;

function loadSymbols(repoPath) {
  const p = path.join(repoPath, STORAGE_DIR, 'symbols.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function groupByFile(symbols, imports) {
  const symsByFile = new Map();
  for (const s of symbols) {
    if (!symsByFile.has(s.filePath)) symsByFile.set(s.filePath, []);
    symsByFile.get(s.filePath).push(s);
  }
  const impsByFile = new Map();
  for (const im of imports) {
    if (!impsByFile.has(im.sourceFile)) impsByFile.set(im.sourceFile, []);
    impsByFile.get(im.sourceFile).push(im);
  }
  return { symsByFile, impsByFile };
}

function computeStructureHash(symbols, imports) {
  const data = JSON.stringify({ symbols, imports });
  return crypto.createHash('sha256').update(data).digest('hex');
}

function computeContentHash(filePath, repoRoot) {
  try {
    const fullPath = path.join(repoRoot, filePath);
    if (!fs.existsSync(fullPath)) return '';
    const code = fs.readFileSync(fullPath, 'utf8');
    const normalized = code
      .replace(/\r\n?/g, '\n')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  } catch {
    return '';
  }
}

function loadPrevHashes(repoPath) {
  const p = path.join(repoPath, GRAPHIFY_DIR, '.file-hashes.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function buildCurHashes(files, symsByFile, impsByFile, repoRoot) {
  const curHashes = {};
  for (const f of files) {
    const fp = f.path;
    const syms = symsByFile.get(fp) || [];
    const imps = impsByFile.get(fp) || [];
    curHashes[fp] = {
      contentHash: computeContentHash(fp, repoRoot),
      structureHash: computeStructureHash(syms, imps),
      lastGenerated: new Date().toISOString(),
      graphVersion: GRAPH_VERSION,
    };
  }
  return curHashes;
}

function buildCurHashesStructureOnly(files, symsByFile, impsByFile) {
  const curHashes = {};
  for (const f of files) {
    const fp = f.path;
    const syms = symsByFile.get(fp) || [];
    const imps = impsByFile.get(fp) || [];
    curHashes[fp] = computeStructureHash(syms, imps);
  }
  return curHashes;
}

function compareHashes(curHashes, prevHashes) {
  const changedFiles = [];
  const unchangedFiles = [];
  const newFiles = [];

  for (const fp of Object.keys(curHashes)) {
    const prev = prevHashes[fp];
    if (prev === undefined) {
      newFiles.push(fp);
    } else {
      const curHash = typeof curHashes[fp] === 'string' ? curHashes[fp] : curHashes[fp].structureHash;
      const prevHash = typeof prev === 'string' ? prev : prev.structureHash;
      if (curHash !== prevHash) {
        changedFiles.push(fp);
      } else {
        unchangedFiles.push(fp);
      }
    }
  }

  for (const fp of Object.keys(prevHashes)) {
    if (curHashes[fp] === undefined) {
      if (!changedFiles.includes(fp)) changedFiles.push(fp);
    }
  }

  return { changedFiles, unchangedFiles, newFiles };
}

function loadPrevGraph(repoPath) {
  const p = path.join(repoPath, GRAPHIFY_DIR, 'graph.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function analyzeAffectedNodes(changedFiles, newFiles, prevGraph, depth) {
  if (depth === undefined) depth = 1;
  const affected = new Set([...changedFiles, ...newFiles]);
  if (!prevGraph || !Array.isArray(prevGraph.edges) || prevGraph.edges.length === 0) {
    return { affected, generationMode: affected.size === 0 ? 'none' : 'full' };
  }
  let queue = [...affected];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const fp of queue) {
      const nodeId = 'file-' + fp;
      for (const e of prevGraph.edges) {
        if (e.source === nodeId && e.target !== nodeId) {
          const tgt = e.target.startsWith('file-') ? e.target.slice(5) : e.target;
          if (tgt && !affected.has(tgt)) { affected.add(tgt); next.push(tgt); }
        }
        if (e.target === nodeId && e.source !== nodeId) {
          const src = e.source.startsWith('file-') ? e.source.slice(5) : e.source;
          if (src && !affected.has(src)) { affected.add(src); next.push(src); }
        }
      }
    }
    queue = next;
  }
  const total = changedFiles.length + newFiles.length;
  const gm = total === 0 ? 'none' : affected.size === total ? 'minimal' : 'neighborhood';
  return { affected, generationMode: gm };
}

function buildPrevNodesByPath(prevGraph) {
  const map = new Map();
  if (prevGraph && Array.isArray(prevGraph.nodes)) {
    for (const n of prevGraph.nodes) {
      if (n.filePath) map.set(n.filePath, n);
    }
  }
  return map;
}

function detectChanges(repoPath) {
  const data = loadSymbols(repoPath);
  if (!data || data.repoPath !== repoPath) return null;

  const { files, symbols, imports } = data;
  const { symsByFile, impsByFile } = groupByFile(symbols, imports);
  const prevHashes = loadPrevHashes(repoPath);
  const curHashes = buildCurHashes(files, symsByFile, impsByFile, repoPath);
  const { changedFiles, newFiles, unchangedFiles } = compareHashes(curHashes, prevHashes);
  const prevGraph = loadPrevGraph(repoPath);
  const { affected, generationMode } = analyzeAffectedNodes(changedFiles, newFiles, prevGraph);
  const neighborCount = [...affected].filter(f => !changedFiles.includes(f) && !newFiles.includes(f)).length;
  const unaffected = unchangedFiles.filter(f => !affected.has(f));
  const changeRatio = (changedFiles.length + newFiles.length) / files.length;

  return {
    data, files, symbols, imports, symsByFile, impsByFile,
    prevHashes, curHashes,
    changedFiles, newFiles, unchangedFiles: [...unaffected],
    affectedSet: affected,
    neighborCount, generationMode, changeRatio,
    prevGraph, prevNodesByPath: buildPrevNodesByPath(prevGraph),
    hasPreviousGraph: !!prevGraph,
  };
}

function detectChangesSimple(repoPath) {
  const data = loadSymbols(repoPath);
  if (!data || data.repoPath !== repoPath) return null;

  const { files, symbols, imports } = data;
  const { symsByFile, impsByFile } = groupByFile(symbols, imports);
  const curHashes = buildCurHashesStructureOnly(files, symsByFile, impsByFile);

  let prevHashes = loadPrevHashes(repoPath);
  // Flatten v2 hashes to v1 for simple comparison
  const flatPrev = {};
  for (const [fp, val] of Object.entries(prevHashes)) {
    flatPrev[fp] = typeof val === 'string' ? val : val.structureHash;
  }
  const { changedFiles, newFiles } = compareHashes(curHashes, flatPrev);
  const prevGraph = loadPrevGraph(repoPath);
  const changeRatio = (changedFiles.length + newFiles.length) / files.length;

  return {
    data, files, symbols, imports, symsByFile, impsByFile,
    changedFiles, newFiles,
    changeRatio,
    hasPreviousGraph: !!prevGraph,
    prevGraph, prevNodesByPath: buildPrevNodesByPath(prevGraph),
  };
}

module.exports = {
  loadSymbols,
  groupByFile,
  computeStructureHash,
  computeContentHash,
  loadPrevHashes,
  buildCurHashes,
  compareHashes,
  loadPrevGraph,
  analyzeAffectedNodes,
  buildPrevNodesByPath,
  detectChanges,
  detectChangesSimple,
};
