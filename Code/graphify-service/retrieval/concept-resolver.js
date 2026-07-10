'use strict';

const STOPWORDS = new Set([
  'a','an','the','is','it','in','on','at','to','do','how','what','where',
  'which','why','when','who','does','did','was','are','be','been','being',
  'have','has','had',
]);

class ConceptResolver {
  constructor(graphData) {
    this.concepts = graphData.concepts || {};
    this._conceptIndex = null;
    this._buildIndex();
  }

  _buildIndex() {
    this._conceptIndex = [];
    for (const [name, conc] of Object.entries(this.concepts)) {
      const tokens = new Set();
      for (const k of conc.keywords || []) tokens.add(k.toLowerCase());
      for (const part of name.split(/[-_]/)) tokens.add(part.toLowerCase());
      this._conceptIndex.push({
        name,
        description: conc.description || '',
        locations: conc.locations || [],
        keywords: conc.keywords || [],
        tokens,
      });
    }
  }

  _tokenize(text) {
    const caseSplit = text.replace(/([a-z])([A-Z])/g, '$1 $2');
    return caseSplit
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 2 && !STOPWORDS.has(w));
  }

  resolveByQuery(text) {
    const tokens = this._tokenize(text);
    if (tokens.length === 0) return [];

    const scores = [];
    for (const entry of this._conceptIndex) {
      let score = 0;
      for (const t of tokens) {
        if (entry.tokens.has(t)) score += 8;
        if (entry.name.toLowerCase().includes(t)) score += 5;
        if (entry.description.toLowerCase().includes(t)) score += 2;
      }
      if (score > 0) {
        scores.push({
          name: entry.name,
          description: entry.description,
          locationCount: entry.locations.length,
          score,
        });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores;
  }

  findConcepts(text) {
    const lower = text.toLowerCase();
    const results = [];
    for (const entry of this._conceptIndex) {
      if (entry.name.toLowerCase().includes(lower) ||
          lower.includes(entry.name.toLowerCase())) {
        results.push({
          name: entry.name,
          description: entry.description,
          locationCount: entry.locations.length,
          score: entry.name.toLowerCase() === lower ? 10 : 5,
        });
      }
    }
    return results;
  }

  getConceptFiles(conceptName) {
    const conc = this.concepts[conceptName];
    if (!conc) return [];
    return conc.locations || [];
  }

  getConceptContext(conceptName) {
    const conc = this.concepts[conceptName];
    if (!conc) return null;
    return {
      name: conceptName,
      description: conc.description || '',
      keywords: conc.keywords || [],
      files: (conc.locations || []).slice(0, 50),
      fileCount: (conc.locations || []).length,
    };
  }

  listConcepts() {
    return Object.entries(this.concepts).map(([name, conc]) => ({
      name,
      description: conc.description || '',
      keywords: conc.keywords || [],
      locationCount: (conc.locations || []).length,
    }));
  }
}

module.exports = { ConceptResolver };
