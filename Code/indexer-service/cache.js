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

  searchFromDb(db, query, limit, offset) {
    const lmt = limit || 50;
    const off = offset || 0;
    const like = '%' + query.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';

    const countStmt = db.prepare('SELECT COUNT(*) as cnt FROM symbols WHERE name LIKE ? ESCAPE \'\\\\\'');
    countStmt.bind([like]);
    let total = 0;
    if (countStmt.step()) total = countStmt.getAsObject().cnt;
    countStmt.free();

    const stmt = db.prepare('SELECT name, type, line, column, is_exported FROM symbols WHERE name LIKE ? ESCAPE \'\\\\\' ORDER BY name LIMIT ? OFFSET ?');
    stmt.bind([like, lmt, off]);
    const results = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({ name: row.name, type: row.type, line: row.line, column: row.column, isExport: !!row.is_exported });
    }
    stmt.free();

    return { results, total };
  }

  getFileSymbolsFromDb(db, filePath, limit, offset) {
    const lmt = limit || 1000;
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
  }
}

module.exports = { SymbolCache };
