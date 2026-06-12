class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this._map = new Map();
  }

  get(key) {
    if (!this._map.has(key)) return undefined;
    const value = this._map.get(key);
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this._map.has(key)) this._map.delete(key);
    if (this._map.size >= this.maxSize) {
      const first = this._map.keys().next().value;
      this._map.delete(first);
    }
    this._map.set(key, value);
  }

  clear() {
    this._map.clear();
  }
}

class SymbolCache {
  constructor() {
    this._store = new Map();
    this._searchCache = new LRUCache(20);
  }

  has(filePath) {
    return this._store.has(filePath);
  }

  get(filePath) {
    return this._store.get(filePath) || null;
  }

  set(filePath, data) {
    this._store.set(filePath, {
      symbols: data.symbols || [],
      imports: data.imports || [],
      mtime: Date.now(),
    });
  }

  delete(filePath) {
    this._store.delete(filePath);
  }

  getFileSymbols(filePath, limit, offset) {
    const entry = this._store.get(filePath);
    if (!entry) return { symbols: [], total: 0 };
    const total = entry.symbols.length;
    const start = offset || 0;
    const end = limit ? start + limit : total;
    return { symbols: entry.symbols.slice(start, end), total };
  }

  search(query, limit, offset) {
    const lower = query.toLowerCase();
    const all = [];
    for (const entry of this._store.values()) {
      for (const sym of entry.symbols) {
        if (sym.name.toLowerCase().includes(lower)) {
          all.push(sym);
        }
      }
    }
    const total = all.length;
    const start = offset || 0;
    const end = limit ? start + limit : total;
    return { results: all.slice(start, end), total };
  }

  getIndexedFiles() {
    return Array.from(this._store.keys());
  }

  getSymbolCount() {
    let count = 0;
    for (const entry of this._store.values()) {
      count += entry.symbols.length;
    }
    return count;
  }

  getFileList(limit, offset) {
    const all = Array.from(this._store.entries()).map(([filePath, entry]) => ({
      path: filePath, symbol_count: entry.symbols.length,
    }));
    const total = all.length;
    const start = offset || 0;
    const end = limit ? start + limit : total;
    return { files: all.slice(start, end), total };
  }

  getFileDeps(filePath, mode) {
    const entry = this._store.get(filePath);
    if (!entry) return null;

    const imports = entry.imports.map(imp => {
      const importPath = imp.import_path ?? imp.source;
      const importType = imp.import_type ?? 'require';
      const importedSymbols = imp.imported_symbols ?? imp.names ?? [];
      return {
        import_path: importPath, import_type: importType,
        line: imp.line ?? null, imported_symbols: importedSymbols,
      };
    });

    const imported_by = [];
    for (const [srcPath, srcEntry] of this._store) {
      if (srcPath === filePath) continue;
      for (const imp of srcEntry.imports) {
        const impPath = imp.import_path ?? imp.source;
        if (impPath === filePath || impPath === filePath.split('/').pop() || filePath.endsWith('/' + impPath)) {
          imported_by.push({
            source_path: srcPath, import_path: impPath,
            import_type: imp.import_type ?? 'require',
            imported_symbols: imp.imported_symbols ?? imp.names ?? [],
          });
        }
      }
    }

    if (mode === 'function') {
      const funcImports = imports.map(imp => {
        const resolvedEntry = this._store.get(imp.import_path);
        const symbols = resolvedEntry
          ? (imp.imported_symbols || []).length > 0
            ? resolvedEntry.symbols.filter(s => (imp.imported_symbols || []).includes(s.name)).map(s => ({ name: s.name, type: s.type, line: s.line }))
            : resolvedEntry.symbols.map(s => ({ name: s.name, type: s.type, line: s.line }))
          : (imp.imported_symbols || []).map(n => ({ name: n, type: 'unknown', line: null }));
        return { import_path: imp.import_path, import_type: imp.import_type, symbols };
      });

      const funcReverse = imported_by.map(rd => {
        const symbols = (rd.imported_symbols || []).length > 0
          ? entry.symbols.filter(s => (rd.imported_symbols || []).includes(s.name)).map(s => ({ name: s.name, type: s.type, line: s.line }))
          : entry.symbols.map(s => ({ name: s.name, type: s.type, line: s.line }));
        return { source_path: rd.source_path, import_type: rd.import_type, symbols };
      });

      return { imports, imported_by, funcImports, funcReverse };
    }

    return { imports, imported_by };
  }

  searchFromDb(db, query, limit, offset, repoId) {
    const lmt = Math.min(limit || 50, 200);
    const off = Math.min(offset || 0, 1000);
    const cacheKey = query + '|' + lmt + '|' + off + '|' + (repoId || '');

    const cached = this._searchCache.get(cacheKey);
    if (cached) return cached;

    const escaped = query.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const repoFilter = repoId ? 'repo_id = ? AND ' : '';
    const bindPrefix = repoId ? [repoId, escaped + '%', lmt, off] : [escaped + '%', lmt, off];
    const bindPrefixCount = repoId ? [repoId, escaped + '%'] : [escaped + '%'];

    // Step 1: Fast prefix search (uses idx_symbols_repo_name or idx_symbols_name_nocase)
    const prefixSql = 'SELECT name, type, line, column, is_exported FROM symbols WHERE ' + repoFilter + "name LIKE ? ESCAPE '\\' COLLATE NOCASE ORDER BY name LIMIT ? OFFSET ?";
    const prefixStmt = db.prepare(prefixSql);
    prefixStmt.bind(bindPrefix);
    const results = [];
    while (prefixStmt.step()) {
      const row = prefixStmt.getAsObject();
      results.push({ name: row.name, type: row.type, line: row.line, column: row.column, isExport: !!row.is_exported });
    }
    prefixStmt.free();

    // If prefix search returned enough, use it
    if (results.length >= lmt) {
      const countSql = 'SELECT COUNT(*) as cnt FROM symbols WHERE ' + repoFilter + "name LIKE ? ESCAPE '\\' COLLATE NOCASE";
      const countStmt = db.prepare(countSql);
      countStmt.bind(bindPrefixCount);
      let total = 0;
      if (countStmt.step()) total = countStmt.getAsObject().cnt;
      countStmt.free();
      const result = { results, total };
      this._searchCache.set(cacheKey, result);
      return result;
    }

    // Step 2: Fallback — infix search (broader, may scan). Infix is a superset of prefix
    // so we discard prefix results and use the full infix query for correctness.
    const infixLike = '%' + escaped + '%';
    const bindInfixCount = repoId ? [repoId, infixLike] : [infixLike];

    const countSql = 'SELECT COUNT(*) as cnt FROM symbols WHERE ' + repoFilter + "name LIKE ? ESCAPE '\\'";
    const countStmt = db.prepare(countSql);
    countStmt.bind(bindInfixCount);
    let total = 0;
    if (countStmt.step()) total = countStmt.getAsObject().cnt;
    countStmt.free();

    const stmt = db.prepare('SELECT name, type, line, column, is_exported FROM symbols WHERE ' + repoFilter + "name LIKE ? ESCAPE '\\' ORDER BY name LIMIT ? OFFSET ?");
    const bindInfill = repoId ? [repoId, infixLike, lmt, off] : [infixLike, lmt, off];
    stmt.bind(bindInfill);
    const infillResults = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      infillResults.push({ name: row.name, type: row.type, line: row.line, column: row.column, isExport: !!row.is_exported });
    }
    stmt.free();

    const result = { results: infillResults, total };
    this._searchCache.set(cacheKey, result);
    return result;
  }

  getFileSymbolsFromDb(db, filePath, limit, offset) {
    const lmt = Math.min(limit || 1000, 200);
    const off = offset || 0;

    const fileStmt = db.prepare('SELECT id FROM indexed_files WHERE path = ?');
    fileStmt.bind([filePath]);
    let fileId = null;
    if (fileStmt.step()) fileId = fileStmt.getAsObject().id;
    fileStmt.free();

    if (!fileId) return { symbols: [], total: 0 };

    const countStmt = db.prepare('SELECT COUNT(*) as cnt FROM symbols WHERE file_id = ?');
    countStmt.bind([fileId]);
    let total = 0;
    if (countStmt.step()) total = countStmt.getAsObject().cnt;
    countStmt.free();

    const stmt = db.prepare('SELECT name, type, line, column, is_exported FROM symbols WHERE file_id = ? ORDER BY line LIMIT ? OFFSET ?');
    stmt.bind([fileId, lmt, off]);
    const symbols = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      symbols.push({ name: row.name, type: row.type, line: row.line, column: row.column, isExport: !!row.is_exported });
    }
    stmt.free();

    return { symbols, total };
  }

  getCountsFromDb(db) {
    const fileStmt = db.prepare('SELECT COUNT(*) as cnt FROM indexed_files');
    let indexedFiles = 0;
    if (fileStmt.step()) indexedFiles = fileStmt.getAsObject().cnt;
    fileStmt.free();

    const symStmt = db.prepare('SELECT COUNT(*) as cnt FROM symbols');
    let totalSymbols = 0;
    if (symStmt.step()) totalSymbols = symStmt.getAsObject().cnt;
    symStmt.free();

    return { indexedFiles, totalSymbols };
  }

  clear() {
    this._store.clear();
    this._searchCache.clear();
  }
}

module.exports = { SymbolCache };
