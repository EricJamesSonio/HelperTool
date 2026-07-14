const fs = require('fs');
const path = require('path');

let _cache = null;
let _cachePath = null;

function _buildIndexes(data) {
  if (data.__indexed) return;
  const symsByFile = new Map();
  const lowerNames = [];
  for (const s of data.symbols) {
    if (!symsByFile.has(s.filePath)) symsByFile.set(s.filePath, []);
    symsByFile.get(s.filePath).push(s);
    lowerNames.push({ lower: s.name.toLowerCase(), sig: (s.signature || '').toLowerCase() });
  }
  data.__symsByFile = symsByFile;
  data.__symNames = lowerNames;
  const typeCounts = {};
  for (const s of data.symbols) {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  }
  data.__typeCounts = typeCounts;
  data.__indexed = true;
}

function load(repoPath) {
  if (!repoPath) return null;
  const jsonPath = path.join(repoPath, 'graphify', 'symbol-index-storage', 'symbols.json');
  if (_cache && _cachePath === jsonPath) return _cache;
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    _buildIndexes(raw);
    _cache = raw;
    _cachePath = jsonPath;
    return _cache;
  } catch {
    return null;
  }
}

function clearCache() {
  _cache = null;
  _cachePath = null;
}

function getForCodebaseMap(repoPath) {
  const data = load(repoPath);
  if (!data || data.repoPath !== repoPath) return null;
  return {
    files: data.files,
    symbols: data.symbols.map(s => ({
      ...s,
      file_path: s.filePath,
      is_exported: s.isExported,
      class_name: s.className,
    })),
    imports: data.imports.map(i => ({
      ...i,
      source_path: i.sourceFile,
      resolved_path: i.resolvedFile,
      import_path: i.importPath,
      import_type: i.importType,
      imported_symbols: i.importedSymbols,
    })),
    repoPath: data.repoPath,
  };
}

function getFiles(repoPath) {
  const data = load(repoPath);
  if (!data || data.repoPath !== repoPath) return [];
  return data.files.map(f => ({ id: f.id, path: f.path, language: f.language }));
}

function getSymbols(repoPath, filePath) {
  const data = load(repoPath);
  if (!data || data.repoPath !== repoPath) return [];
  const syms = data.__symsByFile.get(filePath) || [];
  return syms.map(s => ({ name: s.name, type: s.type, line: s.line, signature: s.signature }));
}

function getDependencies(repoPath, filePath) {
  const data = load(repoPath);
  if (!data || data.repoPath !== repoPath) return [];
  return data.imports
    .filter(i => i.sourceFile === filePath)
    .map(i => ({
      import_path: i.importPath,
      import_type: i.importType,
      imported_symbols: i.importedSymbols || [],
      resolved_path: i.resolvedFile,
    }));
}

function getDependents(repoPath, filePath) {
  const data = load(repoPath);
  if (!data || data.repoPath !== repoPath) return [];
  return data.imports
    .filter(i => i.resolvedFile === filePath)
    .map(i => ({
      path: i.sourceFile,
      import_type: i.importType,
      imported_symbols: i.importedSymbols || [],
    }));
}

function _buildDepGraph(data) {
  const depsMap = new Map();
  for (const i of data.imports) {
    if (!i.resolvedFile) continue;
    if (!depsMap.has(i.sourceFile)) depsMap.set(i.sourceFile, []);
    depsMap.get(i.sourceFile).push(i.resolvedFile);
  }
  return depsMap;
}

function getImportChain(repoPath, filePath) {
  const data = load(repoPath);
  if (!data || data.repoPath !== repoPath) return null;
  const depsMap = _buildDepGraph(data);
  const visited = new Set();
  const maxDepth = 6;
  function dfs(p, depth) {
    if (depth > maxDepth || visited.has(p)) return { path: p, children: [], cycle: visited.has(p) };
    visited.add(p);
    const children = (depsMap.get(p) || []).map(d => dfs(d, depth + 1));
    return { path: p, children };
  }
  visited.clear();
  return dfs(filePath, 0);
}

function getCircularDeps(repoPath, filePath) {
  const data = load(repoPath);
  if (!data || data.repoPath !== repoPath) return [];
  const depsMap = _buildDepGraph(data);
  const cycles = [];
  const visitStack = new Set();
  const pathStack = [];
  const visited = new Set();
  function dfs(p) {
    if (visitStack.has(p)) {
      const idx = pathStack.indexOf(p);
      cycles.push([...pathStack.slice(idx), p]);
      return;
    }
    if (visited.has(p)) return;
    visited.add(p);
    visitStack.add(p);
    pathStack.push(p);
    for (const dep of (depsMap.get(p) || [])) dfs(dep);
    pathStack.pop();
    visitStack.delete(p);
  }
  dfs(filePath);
  return cycles;
}

module.exports = {
  load,
  clearCache,
  getForCodebaseMap,
  getFiles,
  getSymbols,
  getDependencies,
  getDependents,
  getImportChain,
  getCircularDeps,
};
