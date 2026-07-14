'use strict';

const fs   = require('fs');
const path = require('path');

let _indexedData = null;

async function initFromJson(repoPath) {
  if (_indexedData) return true;

  const jsonPath = path.join(repoPath, 'graphify', 'symbol-index-storage', 'symbols.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`graphify/symbol-index-storage/symbols.json not found at ${repoPath}. Please index your codebase first.`);
  }

  let raw = fs.readFileSync(jsonPath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const data = JSON.parse(raw);

  const filesById = new Map();
  const filesByPath = new Map();
  const symsByFile = new Map();
  const impsByFile = new Map();
  const depEdges = [];

  for (const f of data.files) {
    const entry = { id: f.id, path: f.path, language: f.language || '', lastModified: f.lastModified || '' };
    filesById.set(f.id, entry);
    filesByPath.set(f.path, entry);
  }

  if (data.symbols) {
    for (const s of data.symbols) {
      const file = filesByPath.get(s.filePath);
      if (!file) continue;
      const fileId = file.id;
      if (!symsByFile.has(fileId)) symsByFile.set(fileId, []);
      symsByFile.get(fileId).push({
        name: s.name,
        type: s.type,
        line: s.line || 0,
        column: s.column || 0,
        isExported: !!s.isExported,
        className: s.className || null,
        signature: s.signature || '',
        filePath: s.filePath,
      });
    }
  }

  if (data.imports) {
    for (const imp of data.imports) {
      const src = filesByPath.get(imp.sourceFile);
      if (!src) continue;
      const fileId = src.id;
      if (!impsByFile.has(fileId)) impsByFile.set(fileId, []);
      impsByFile.get(fileId).push({
        importPath: imp.importPath,
        importType: imp.importType,
        resolvedFile: imp.resolvedFile || null,
        importedSymbols: imp.importedSymbols || [],
      });
      if (imp.resolvedFile) {
        depEdges.push({ source: imp.sourceFile, target: imp.resolvedFile });
      }
    }
  }

  _indexedData = {
    filesById,
    filesByPath,
    symsByFile,
    impsByFile,
    depEdges,
    repoInfo: {
      repoPath: data.repoPath || repoPath,
      repoName: data.repoName || path.basename(repoPath),
      totalFiles: data.overview?.totalFiles || data.files.length,
      totalSymbols: data.overview?.totalSymbols || (data.symbols ? data.symbols.length : 0),
    },
  };

  return true;
}

function getIndexedData() {
  if (!_indexedData) throw new Error('[graphify] Data not initialized. Call initFromJson() first.');
  return _indexedData;
}

function getRepoInfo(repoPath) {
  if (!_indexedData) return null;
  if (repoPath && _indexedData.repoInfo.repoPath !== repoPath) return null;
  return _indexedData.repoInfo;
}

function closeDb() {
  _indexedData = null;
}

module.exports = { initFromJson, getIndexedData, getRepoInfo, closeDb };
