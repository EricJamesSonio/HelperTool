'use strict';

const STOPWORDS = new Set([
  'a','an','the','is','it','in','on','at','to','do','how','what','where',
  'which','why','when','who','does','did','was','are','be','been','being',
  'have','has','had','will','would','could','should','may','might','can',
  'get','set','use','with','and','or','not','for','from','of','this','that',
]);

class FeatureResolver {
  constructor(graphData) {
    this.features = graphData.features || {};
    this.nodes = graphData.nodes || [];
    this.edges = graphData.edges || [];
    this._fileFeatureMap = null;
    this._buildIndex();
  }

  _buildIndex() {
    this._fileFeatureMap = new Map();
    for (const n of this.nodes) {
      for (const feat of n.features || []) {
        if (!this._fileFeatureMap.has(feat)) this._fileFeatureMap.set(feat, []);
        this._fileFeatureMap.get(feat).push(n.filePath);
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

  resolveByQuery(text) {
    const tokens = this._tokenize(text);
    const scores = [];
    for (const [name, feat] of Object.entries(this.features)) {
      const nameLower = name.toLowerCase();
      let score = 0;
      let matchCount = 0;
      for (const t of tokens) {
        if (nameLower === t) { score += 10; matchCount++; }
        else if (nameLower.includes(t)) { score += 5; matchCount++; }
        else if (t.includes(nameLower)) { score += 3; matchCount++; }
      }
      if (feat.description) {
        const descLower = feat.description.toLowerCase();
        for (const t of tokens) {
          if (descLower.includes(t)) score += 1;
        }
      }
      if (score > 0) {
        scores.push({ name, score, matchCount, fileCount: feat.files?.length || 0 });
      }
    }
    scores.sort((a, b) => b.score - a.score);
    return scores;
  }

  getFeatureFiles(featureName) {
    const feat = this.features[featureName];
    if (!feat) return [];
    return feat.files || [];
  }

  getFeatureGraph(featureName) {
    const files = new Set(this.getFeatureFiles(featureName));
    if (files.size === 0) return { nodes: [], edges: [] };
    const nodeIds = new Set();
    for (const n of this.nodes) {
      if (files.has(n.filePath)) nodeIds.add(n.id);
    }
    const subNodes = this.nodes.filter(n => nodeIds.has(n.id));
    const subEdges = this.edges.filter(e =>
      nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    return { nodes: subNodes, edges: subEdges };
  }

  getRelatedFeatures(featureName) {
    const files = new Set(this.getFeatureFiles(featureName));
    if (files.size === 0) return [];
    const related = new Map();
    for (const n of this.nodes) {
      if (files.has(n.filePath)) {
        for (const f of n.features || []) {
          if (f !== featureName) {
            related.set(f, (related.get(f) || 0) + 1);
          }
        }
      }
    }
    return Array.from(related.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, sharedFiles: count }));
  }

  listFeatures() {
    return Object.entries(this.features).map(([name, feat]) => ({
      name,
      description: feat.description || '',
      fileCount: feat.files?.length || 0,
    }));
  }
}

module.exports = { FeatureResolver };
