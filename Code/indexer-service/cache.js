/**
 * In-memory symbol store for the indexer service.
 * key: filePath, value: { symbols: [], imports: [], mtime: number }
 */
class SymbolCache {
  constructor() {
    this._store = new Map();
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

  /** Return symbols for a file with pagination */
  getFileSymbols(filePath, limit, offset) {
    const entry = this._store.get(filePath);
    if (!entry) return { symbols: [], total: 0 };
    const total = entry.symbols.length;
    const start = offset || 0;
    const end = limit ? start + limit : total;
    return { symbols: entry.symbols.slice(start, end), total };
  }

  /** Search across all stored symbols */
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

  /** Get all indexed file paths */
  getIndexedFiles() {
    return Array.from(this._store.keys());
  }

  /** Total symbol count */
  getSymbolCount() {
    let count = 0;
    for (const entry of this._store.values()) {
      count += entry.symbols.length;
    }
    return count;
  }

  /** Return paginated file list with per-file symbol count */
  getFileList(limit, offset) {
    const all = Array.from(this._store.entries()).map(([filePath, entry]) => ({
      path: filePath, symbol_count: entry.symbols.length,
    }));
    const total = all.length;
    const start = offset || 0;
    const end = limit ? start + limit : total;
    return { files: all.slice(start, end), total };
  }

  /** Get dependency data for a file: imports + reverse deps, with optional symbol enrichment */
  getFileDeps(filePath, mode) {
    const entry = this._store.get(filePath);
    if (!entry) return null;

    const imports = entry.imports.map(imp => ({
      import_path: imp.import_path, import_type: imp.import_type,
      line: imp.line, imported_symbols: imp.imported_symbols || [],
    }));

    const imported_by = [];
    for (const [srcPath, srcEntry] of this._store) {
      if (srcPath === filePath) continue;
      for (const imp of srcEntry.imports) {
        if (imp.import_path === filePath || imp.import_path === filePath.split('/').pop() || filePath.endsWith('/' + imp.import_path)) {
          imported_by.push({
            source_path: srcPath, import_path: imp.import_path,
            import_type: imp.import_type, imported_symbols: imp.imported_symbols || [],
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

      const ourNames = new Set(entry.symbols.map(s => s.name));
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

  /** Clear all data */
  clear() {
    this._store.clear();
  }
}

module.exports = { SymbolCache };
