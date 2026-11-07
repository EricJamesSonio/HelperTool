const FALLBACK_MAX_NAMES = 8;
const MAX_SYMBOL_NAMES = 16;
const TRY_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.vue', '.py', '.php', '.css', '.scss', '.html'];
const INDEX_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.py', '.php'];
const JS_SWAP = {
  '.js': ['.ts', '.tsx', '.jsx'],
  '.jsx': ['.tsx', '.ts'],
  '.mjs': ['.mts', '.ts'],
  '.cjs': ['.cts', '.ts'],
};

function normalize(p) {
  return String(p || '').replace(/\\/g, '/');
}

function findRootPrefix(paths) {
  if (!paths.length) return '';
  const first = normalize(paths[0]).split('/')[0];
  if (!first) return '';
  for (const p of paths) {
    if (!normalize(p).startsWith(first + '/')) return '';
  }
  return first + '/';
}

function symbolNames(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => {
      if (typeof s === 'string') return s;
      if (s && typeof s === 'object') return s.name || s.local || s.imported || '';
      return '';
    })
    .filter(Boolean);
}

function joinPosix(dir, rel) {
  const out = dir ? dir.split('/') : [];
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (out.length) out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

function dirOf(p) {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

function lookup(fileSet, base) {
  if (!base) return null;
  for (const ext of TRY_EXTS) {
    const cand = base + ext;
    if (fileSet.has(cand)) return cand;
  }
  const dot = base.lastIndexOf('.');
  if (dot > base.lastIndexOf('/')) {
    const stem = base.slice(0, dot);
    const swaps = JS_SWAP[base.slice(dot)];
    if (swaps) {
      for (const ext of swaps) {
        if (fileSet.has(stem + ext)) return stem + ext;
      }
    }
  }
  for (const ext of INDEX_EXTS) {
    const cand = base + '/index' + ext;
    if (fileSet.has(cand)) return cand;
  }
  return null;
}

function ancestorsOf(filePath) {
  const parts = filePath.split('/');
  parts.pop();
  const list = [];
  for (let i = parts.length; i >= 0; i--) {
    list.push(parts.slice(0, i).join('/'));
  }
  return list;
}

function resolveSpecifier(fileSet, fromPath, spec) {
  if (!spec) return null;
  const clean = String(spec).split('?')[0].split('#')[0];
  if (clean.startsWith('.')) {
    return lookup(fileSet, joinPosix(dirOf(fromPath), clean));
  }
  if (clean.startsWith('/')) {
    return lookup(fileSet, joinPosix('', clean));
  }

  let rest = null;
  if (clean.startsWith('@/') || clean.startsWith('~/') || clean.startsWith('#/')) {
    rest = clean.slice(2);
  } else if (clean.includes('/')) {
    rest = clean;
  }
  if (!rest) return null;

  for (const anc of ancestorsOf(fromPath)) {
    const bases = anc ? [anc + '/src/' + rest, anc + '/' + rest] : ['src/' + rest, rest];
    for (const base of bases) {
      const hit = lookup(fileSet, base);
      if (hit) return hit;
    }
  }
  return null;
}

function buildFlowGraph({ files, symbols, imports, repoPath }) {
  const safeFiles = files || [];
  const safeSymbols = symbols || [];
  const safeImports = imports || [];

  const prefix = findRootPrefix(safeFiles.map((f) => f.path));
  const strip = (p) => {
    const n = normalize(p);
    return prefix && n.startsWith(prefix) ? n.slice(prefix.length) : n;
  };

  const symbolCounts = new Map();
  const symbolNameMap = new Map();
  for (const s of safeSymbols) {
    const key = strip(s.file_path);
    symbolCounts.set(key, (symbolCounts.get(key) || 0) + 1);
    const nm = typeof s.name === 'string' ? s.name : '';
    if (!nm) continue;
    let arr = symbolNameMap.get(key);
    if (!arr) {
      arr = [];
      symbolNameMap.set(key, arr);
    }
    if (arr.length < MAX_SYMBOL_NAMES && !arr.includes(nm)) arr.push(nm);
  }

  const fileSet = new Set();
  const outFiles = [];
  for (const f of safeFiles) {
    const p = strip(f.path);
    if (!p || fileSet.has(p)) continue;
    fileSet.add(p);
    outFiles.push({
      path: p,
      language: f.language || '',
      symbols: symbolCounts.get(p) || 0,
      symbolNames: symbolNameMap.get(p) || [],
    });
  }

  const edgeMap = new Map();
  let resolvedByIndexer = 0;
  let resolvedByFallback = 0;
  let unresolved = 0;

  for (const imp of safeImports) {
    const from = strip(imp.source_path);
    if (!from || !fileSet.has(from)) continue;

    let to = null;
    if (imp.resolved_path) {
      const candidate = strip(imp.resolved_path);
      if (fileSet.has(candidate)) {
        to = candidate;
        resolvedByIndexer += 1;
      }
    }
    if (!to) {
      to = resolveSpecifier(fileSet, from, imp.import_path);
      if (to) resolvedByFallback += 1;
    }
    if (!to) {
      unresolved += 1;
      continue;
    }
    if (to === from) continue;

    const key = from + '\n' + to;
    let edge = edgeMap.get(key);
    if (!edge) {
      edge = { from: from, to: to, count: 0, names: new Set() };
      edgeMap.set(key, edge);
    }
    edge.count += 1;
    for (const name of symbolNames(imp.imported_symbols)) {
      edge.names.add(name);
    }
  }

  const edges = [];
  for (const edge of edgeMap.values()) {
    edges.push({
      from: edge.from,
      to: edge.to,
      count: edge.count,
      names: Array.from(edge.names).slice(0, FALLBACK_MAX_NAMES),
    });
  }

  const rootName = repoPath ? normalize(repoPath).split('/').filter(Boolean).pop() || 'root' : 'root';

  return {
    rootName: rootName,
    strippedPrefix: prefix,
    files: outFiles,
    edges: edges,
    stats: {
      resolvedByIndexer: resolvedByIndexer,
      resolvedByFallback: resolvedByFallback,
      unresolved: unresolved,
    },
  };
}

module.exports = { buildFlowGraph };