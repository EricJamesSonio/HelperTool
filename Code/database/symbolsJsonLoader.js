const fs = require('fs');
const path = require('path');

const SYMBOLS_JSON_PATH = path.join(__dirname, '..', '..', 'graphify', 'symbol-index-storage', 'symbols.json');

let _cache = null;
let _cacheMtime = 0;

function load() {
  if (!fs.existsSync(SYMBOLS_JSON_PATH)) return null;
  const mtime = fs.statSync(SYMBOLS_JSON_PATH).mtimeMs;
  if (_cache && mtime <= _cacheMtime) return _cache;
  const raw = JSON.parse(fs.readFileSync(SYMBOLS_JSON_PATH, 'utf8'));
  _cache = raw;
  _cacheMtime = mtime;
  return _cache;
}

function clearCache() {
  _cache = null;
  _cacheMtime = 0;
}

function getForCodebaseMap(repoPath) {
  const data = load();
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
  const data = load();
  if (!data || data.repoPath !== repoPath) return [];
  return data.files.map(f => ({ id: f.id, path: f.path, language: f.language }));
}

function getSymbols(repoPath, filePath) {
  const data = load();
  if (!data || data.repoPath !== repoPath) return [];
  return data.symbols
    .filter(s => s.filePath === filePath)
    .map(s => ({ name: s.name, type: s.type, line: s.line, signature: s.signature }));
}

function getDependencies(repoPath, filePath) {
  const data = load();
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
  const data = load();
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
  const data = load();
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
  const data = load();
  if (!data || data.repoPath !== repoPath) return [];
  const depsMap = _buildDepGraph(data);
  const cycles = [];
  const visitStack = [];
  const visited = new Set();
  function dfs(p) {
    if (visitStack.includes(p)) {
      const idx = visitStack.indexOf(p);
      cycles.push([...visitStack.slice(idx), p]);
      return;
    }
    if (visited.has(p)) return;
    visited.add(p);
    visitStack.push(p);
    for (const dep of (depsMap.get(p) || [])) dfs(dep);
    visitStack.pop();
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
