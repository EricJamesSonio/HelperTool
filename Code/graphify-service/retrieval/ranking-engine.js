'use strict';

const STOPWORDS = new Set([
  'a','an','the','is','it','in','on','at','to','do','how','what','where',
  'which','why','when','who','does','did','was','are','be','been','being',
  'have','has','had',
]);

class RankingEngine {
  constructor(graphData) {
    this.nodes = graphData.nodes || [];
    this.edges = graphData.edges || [];
    this.features = graphData.features || {};
    this._centralityMap = null;
    this._featureTags = null;
    this._buildIndex();
  }

  _buildIndex() {
    this._centralityMap = new Map();
    for (const n of this.nodes) {
      if (n.centrality) {
        this._centralityMap.set(n.filePath, n.centrality);
      }
    }
    this._featureTags = new Map();
    for (const [name, feat] of Object.entries(this.features)) {
      const tags = name.toLowerCase().split(/[-_]/);
      for (const t of tags) {
        if (!this._featureTags.has(t)) this._featureTags.set(t, new Set());
        this._featureTags.get(t).add(name);
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

  rank(candidates, query) {
    if (!candidates || candidates.length === 0) return [];
    if (!query || typeof query !== 'string') {
      return candidates.map(c => ({ item: c, score: 0, signals: {} }));
    }
    const tokens = this._tokenize(query);
    if (tokens.length === 0) {
      return candidates.map(c => ({ item: c, score: 0, signals: {} }));
    }

    const scored = [];
    for (const candidate of candidates) {
      const signals = this._computeSignals(candidate, tokens);
      const combined = this._combineSignals(signals);
      scored.push({ item: candidate, score: combined, signals });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  _computeSignals(candidate, tokens) {
    const fp = candidate.filePath || candidate.path || '';
    const name = candidate.name || candidate.label || '';
    const summary = (candidate.summary || '').toLowerCase();
    const features = candidate.features || [];

    const lowerFp = fp.toLowerCase();
    const lowerName = name.toLowerCase();
    const baseName = fp.split('/').pop()?.replace(/\.[^.]+$/, '').toLowerCase() || '';
    const pathParts = lowerFp.split('/');

    let keywordScore = 0;
    let exactNameMatch = 0;
    let featureAffinity = 0;

    for (const t of tokens) {
      if (baseName === t) exactNameMatch += 10;
      else if (baseName.includes(t)) exactNameMatch += 5;

      if (lowerName === t) exactNameMatch += 8;
      else if (lowerName.includes(t)) exactNameMatch += 3;

      for (const part of pathParts) {
        if (part === t) keywordScore += 3;
        else if (part.includes(t)) keywordScore += 1;
      }

      if (summary.includes(t)) keywordScore += 2;

      for (const feat of features) {
        const featLower = feat.toLowerCase();
        if (featLower === t) featureAffinity += 6;
        else if (featLower.includes(t)) featureAffinity += 3;
      }
    }

    const centrality = this._centralityMap.get(fp);
    const centralityBoost = centrality ? centrality.centrality * 10 : 0;

    const hasSymbols = candidate.symbols && candidate.symbols.length > 0;
    const symbolBonus = hasSymbols ? 1 : 0;

    return {
      keywordScore,
      exactNameMatch,
      featureAffinity,
      centralityBoost,
      symbolBonus,
    };
  }

  _combineSignals(signals) {
    return (
      signals.keywordScore * 1.0 +
      signals.exactNameMatch * 2.0 +
      signals.featureAffinity * 1.5 +
      signals.centralityBoost * 1.0 +
      signals.symbolBonus * 0.5
    );
  }

  diversify(results, limit = 10) {
    if (results.length <= limit) return results;
    const featureBuckets = new Map();
    const noFeature = [];

    for (const r of results) {
      const features = r.item.features || [];
      if (features.length === 0) {
        noFeature.push(r);
      } else {
        for (const f of features) {
          if (!featureBuckets.has(f)) featureBuckets.set(f, []);
          featureBuckets.get(f).push(r);
        }
      }
    }

    const selected = new Set();
    const output = [];
    const featureOrder = [...featureBuckets.keys()];

    let round = 0;
    while (output.length < limit && selected.size < results.length) {
      for (const feat of featureOrder) {
        const bucket = featureBuckets.get(feat) || [];
        for (const r of bucket) {
          const key = r.item.filePath || r.item.id;
          if (!selected.has(key)) {
            selected.add(key);
            output.push(r);
            break;
          }
        }
        if (output.length >= limit) break;
      }
      for (const r of noFeature) {
        const key = r.item.filePath || r.item.id;
        if (!selected.has(key)) {
          selected.add(key);
          output.push(r);
          break;
        }
        if (output.length >= limit) break;
      }
      round++;
      if (round > 10) break;
    }

    return output.slice(0, limit);
  }

  rerankWithContext(results, contextQuery) {
    if (!contextQuery || results.length === 0) return results;
    const ctxTokens = this._tokenize(contextQuery);
    if (ctxTokens.length === 0) return results;

    const enriched = results.map(r => {
      const ctxSignals = this._computeSignals(r.item, ctxTokens);
      const ctxScore = this._combineSignals(ctxSignals);
      return { ...r, score: r.score + ctxScore * 0.3 };
    });

    enriched.sort((a, b) => b.score - a.score);
    return enriched;
  }
}

module.exports = { RankingEngine };
