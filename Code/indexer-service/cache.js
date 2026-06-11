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

  /** Return file list with per-file symbol count */
  getFileList() {
    const result = [];
    for (const [filePath, entry] of this._store) {
      result.push({ path: filePath, symbol_count: entry.symbols.length });
    }
    return result;
  }

  /** Clear all data */
  clear() {
    this._store.clear();
  }
}

module.exports = { SymbolCache };
