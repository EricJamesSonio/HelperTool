'use strict';

const STOPWORDS = new Set([
  'a','an','the','is','it','in','on','at','to','do','how','what','where',
  'which','why','when','who','does','did','was','are','be','been','being',
  'have','has','had',
]);

class SymbolResolver {
  constructor(graphData) {
    this.nodes = graphData.nodes || [];
    this._fileSymbolMap = new Map();
    this._symbolNameIndex = new Map();
    this._buildIndex();
  }

  _buildIndex() {
    for (const n of this.nodes) {
      const fp = n.filePath;
      const syms = n.symbols || [];
      this._fileSymbolMap.set(fp, syms);
      for (const s of syms) {
        if (!this._symbolNameIndex.has(s.name)) this._symbolNameIndex.set(s.name, []);
        this._symbolNameIndex.get(s.name).push({ ...s, filePath: fp });
      }
    }
  }

  _tokenize(text) {
    const caseSplit = text.replace(/([a-z])([A-Z])/g, '$1 $2');
    return caseSplit
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 2 && !STOPWORDS.has(w));
  }

  resolveSymbol(name) {
    const occurrences = this._symbolNameIndex.get(name);
    if (!occurrences) return null;
    const primary = occurrences[0];
    return {
      name: primary.name,
      type: primary.type,
      line: primary.line,
      signature: primary.signature || '',
      purpose: primary.purpose || '',
      role: primary.role || '',
      filePath: primary.filePath,
      occurrences: occurrences.length,
      allFiles: [...new Set(occurrences.map(o => o.filePath))],
    };
  }

  searchSymbols(query, limit = 20) {
    const tokens = this._tokenize(query);
    if (tokens.length === 0) return [];

    const scores = [];
    for (const [name, occurrences] of this._symbolNameIndex) {
      const nameLower = name.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (nameLower === t) {
          const type = occurrences[0].type;
          const typeBoost = (type === 'class' || type === 'function') ? 12 : 8;
          score += typeBoost;
        } else if (nameLower.includes(t)) {
          score += 4;
        } else if (t.includes(nameLower)) {
          score += 2;
        }
      }
      if (score > 0) {
        const primary = occurrences[0];
        scores.push({
          name,
          type: primary.type,
          filePath: primary.filePath,
          line: primary.line,
          purpose: primary.purpose || '',
          occurrences: occurrences.length,
          score,
        });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit);
  }

  getSymbolUsage(name) {
    const occurrences = this._symbolNameIndex.get(name);
    if (!occurrences) return null;
    const definedIn = occurrences.filter(o => o.role === 'function' || o.role === 'class definition' || o.role === 'export');
    const usedIn = occurrences.filter(o =>
      o.role !== 'function' && o.role !== 'class definition' && o.role !== 'export'
    );
    return {
      name,
      defined: definedIn.map(o => ({ filePath: o.filePath, line: o.line })),
      importedBy: [],
      usedInFiles: [...new Set(usedIn.map(o => o.filePath))],
      totalOccurrences: occurrences.length,
    };
  }

  getFileSymbols(filePath) {
    return this._fileSymbolMap.get(filePath) || [];
  }

  getFilesContainingSymbol(name) {
    const occurrences = this._symbolNameIndex.get(name);
    if (!occurrences) return [];
    return [...new Set(occurrences.map(o => o.filePath))];
  }
}

module.exports = { SymbolResolver };
