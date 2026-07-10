'use strict';

const ESTIMATED_TOKENS_PER_CHAR = 0.25;

class SubgraphBuilder {
  constructor(graphData) {
    this.graphData = graphData;
    this.nodes = graphData.nodes || [];
    this.edges = graphData.edges || [];
    this.features = graphData.features || {};
    this.concepts = graphData.concepts || {};
    this._nodeMap = null;
    this._buildIndex();
  }

  _buildIndex() {
    this._nodeMap = new Map();
    for (const n of this.nodes) {
      this._nodeMap.set(n.filePath, n);
      this._nodeMap.set(n.id, n);
    }
  }

  _filePathToId(fp) {
    return 'file-' + fp;
  }

  _idToFilePath(id) {
    return id.startsWith('file-') ? id.slice(5) : id;
  }

  buildSubgraph(seedFiles, options = {}) {
    const {
      depth = 1,
      edgeTypes = null,
      maxNodes = 50,
      includeFeatures = true,
      includeConcepts = true,
    } = options;

    const seedIds = new Set();
    for (const sf of seedFiles) {
      const id = sf.startsWith('file-') ? sf : this._filePathToId(sf);
      if (this._nodeMap.has(sf) || this._nodeMap.has(id)) {
        seedIds.add(id);
      }
    }

    if (seedIds.size === 0) {
      return { nodes: [], edges: [], features: [], concepts: [], stats: { total: 0 } };
    }

    const visited = new Map();
    const queue = [];
    for (const id of seedIds) {
      visited.set(id, 0);
      queue.push({ id, depth: 0 });
    }

    let i = 0;
    while (i < queue.length && visited.size < maxNodes) {
      const { id, depth: d } = queue[i++];
      if (d >= depth) continue;
      for (const e of this.edges) {
        if (edgeTypes && !edgeTypes.includes(e.type)) continue;
        let neighbor = null;
        if (e.source === id) neighbor = e.target;
        else if (e.target === id) neighbor = e.source;
        if (neighbor && !visited.has(neighbor) && visited.size < maxNodes) {
          visited.set(neighbor, d + 1);
          queue.push({ id: neighbor, depth: d + 1 });
        }
      }
    }

    const nodeIds = new Set(visited.keys());
    const subNodes = this.nodes.filter(n => nodeIds.has(n.id));
    const subEdges = this.edges.filter(e =>
      nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    let subFeatures = [];
    if (includeFeatures) {
      const featSet = new Set();
      for (const n of subNodes) {
        for (const f of n.features || []) featSet.add(f);
      }
      subFeatures = [...featSet];
    }

    let subConcepts = [];
    if (includeConcepts) {
      const concSet = new Set();
      for (const [name, conc] of Object.entries(this.concepts)) {
        const locs = conc.locations || [];
        for (const loc of locs) {
          if (nodeIds.has(this._filePathToId(loc))) {
            concSet.add(name);
            break;
          }
        }
      }
      subConcepts = [...concSet];
    }

    return {
      nodes: subNodes,
      edges: subEdges,
      features: subFeatures,
      concepts: subConcepts,
      stats: { total: subNodes.length },
    };
  }

  toPromptContext(subgraph, query = '') {
    const lines = [];
    const { nodes, edges, features, concepts } = subgraph;

    lines.push('=== Knowledge Graph Context ===');
    lines.push('');

    if (query) {
      lines.push(`Query: ${query}`);
      lines.push('');
    }

    lines.push(`Files (${nodes.length}):`);
    lines.push('');
    const sorted = [...nodes].sort((a, b) => {
      const ac = a.centrality?.centrality || 0;
      const bc = b.centrality?.centrality || 0;
      return bc - ac;
    });

    for (const n of sorted.slice(0, 30)) {
      const fp = n.filePath || n.id;
      const feats = (n.features || []).join(', ');
      const symCount = n.stats?.totalSymbols || n.symbols?.length || 0;
      const cent = n.centrality?.centrality ? n.centrality.centrality.toFixed(3) : '-';
      const mode = n.generationMode || '';
      const modeTag = mode ? ` [${mode}]` : '';

      lines.push(`  ${fp}${modeTag}`);
      lines.push(`    Summary: ${n.summary || 'N/A'}`);
      if (feats) lines.push(`    Features: ${feats}`);
      lines.push(`    Symbols: ${symCount} | Centrality: ${cent}`);

      if (n.responsibilities && n.responsibilities.length > 0) {
        const resp = n.responsibilities.slice(0, 5).join('; ');
        lines.push(`    Responsibilities: ${resp}`);
      }
      lines.push('');
    }

    if (nodes.length > 30) {
      lines.push(`  ... and ${nodes.length - 30} more files`);
      lines.push('');
    }

    if (edges.length > 0) {
      lines.push(`Relationships (${edges.length}):`);
      const byType = {};
      for (const e of edges) {
        if (!byType[e.type]) byType[e.type] = [];
        byType[e.type].push(e);
      }
      for (const [type, typedEdges] of Object.entries(byType)) {
        const sample = typedEdges.slice(0, 8);
        for (const e of sample) {
          const src = this._idToFilePath(e.source);
          const tgt = this._idToFilePath(e.target);
          lines.push(`  ${src} --[${type}]--> ${tgt}`);
        }
        if (typedEdges.length > 8) {
          lines.push(`  ... and ${typedEdges.length - 8} more ${type} edges`);
        }
      }
      lines.push('');
    }

    if (features.length > 0) {
      lines.push(`Features: ${features.join(', ')}`);
      lines.push('');
    }

    if (concepts.length > 0) {
      lines.push('Concepts:');
      for (const c of concepts) {
        const info = this.concepts[c];
        if (info) {
          lines.push(`  ${c}: ${info.description || ''}`);
          if (info.keywords) lines.push(`    Keywords: ${info.keywords.join(', ')}`);
        }
      }
      lines.push('');
    }

    lines.push('=== End Context ===');
    return lines.join('\n');
  }

  minimize(subgraph, tokenBudget = 4000) {
    const current = this.toPromptContext(subgraph);
    const currentTokens = Math.round(current.length * ESTIMATED_TOKENS_PER_CHAR);

    if (currentTokens <= tokenBudget) return subgraph;

    const sorted = [...subgraph.nodes].sort((a, b) => {
      const ac = a.centrality?.centrality || 0;
      const bc = b.centrality?.centrality || 0;
      return bc - ac;
    });

    let lo = 1, hi = sorted.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const testSub = {
        nodes: sorted.slice(0, mid),
        edges: subgraph.edges.filter(e => {
          const srcId = sorted.slice(0, mid).find(n => n.id === e.source);
          const tgtId = sorted.slice(0, mid).find(n => n.id === e.target);
          return srcId && tgtId;
        }),
        features: subgraph.features,
        concepts: subgraph.concepts,
      };
      const test = this.toPromptContext(testSub);
      if (test.length * ESTIMATED_TOKENS_PER_CHAR <= tokenBudget) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    const finalCount = Math.max(1, lo - 1);
    const finalNodes = sorted.slice(0, finalCount);
    const finalNodeIds = new Set(finalNodes.map(n => n.id));
    const finalEdges = subgraph.edges.filter(e =>
      finalNodeIds.has(e.source) && finalNodeIds.has(e.target)
    );

    return {
      nodes: finalNodes,
      edges: finalEdges,
      features: subgraph.features,
      concepts: subgraph.concepts,
    };
  }

  rankSubgraph(subgraph, query) {
    if (!query) return subgraph;
    const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2);

    const scored = subgraph.nodes.map(n => {
      const fp = (n.filePath || '').toLowerCase();
      const summary = (n.summary || '').toLowerCase();
      const symbols = (n.symbols || []).map(s => s.name.toLowerCase());
      const features = (n.features || []).join(' ').toLowerCase();

      let score = 0;
      for (const t of tokens) {
        const base = fp.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
        if (base === t) score += 10;
        else if (base.includes(t)) score += 5;
        if (summary.includes(t)) score += 3;
        if (features.includes(t)) score += 2;
        for (const s of symbols) {
          if (s === t) score += 6;
          else if (s.includes(t)) score += 3;
        }
      }
      return { ...n, _relevanceScore: score };
    });

    scored.sort((a, b) => (b._relevanceScore || 0) - (a._relevanceScore || 0));
    const reorderedIds = new Set(scored.map(n => n.id));
    const otherNodes = subgraph.nodes.filter(n => !reorderedIds.has(n.id));

    return {
      ...subgraph,
      nodes: [...scored, ...otherNodes],
    };
  }
}

module.exports = { SubgraphBuilder };
