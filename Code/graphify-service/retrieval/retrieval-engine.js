'use strict';

const fs = require('fs');
const path = require('path');

const { FeatureResolver } = require('./feature-resolver');
const { SymbolResolver } = require('./symbol-resolver');
const { ConceptResolver } = require('./concept-resolver');
const { DependencyResolver } = require('./dependency-resolver');
const { PathFinder } = require('./path-finder');
const { RankingEngine } = require('./ranking-engine');
const { SubgraphBuilder } = require('./subgraph-builder');
const { RetrievalPlanner } = require('./retrieval-planner');

class RetrievalEngine {
  constructor(graphData) {
    this.graphData = graphData;

    this.featureResolver = new FeatureResolver(graphData);
    this.symbolResolver = new SymbolResolver(graphData);
    this.conceptResolver = new ConceptResolver(graphData);
    this.dependencyResolver = new DependencyResolver(graphData);
    this.pathFinder = new PathFinder(graphData);
    this.rankingEngine = new RankingEngine(graphData);
    this.subgraphBuilder = new SubgraphBuilder(graphData);
    this.retrievalPlanner = new RetrievalPlanner(graphData);

    this._totalQueries = 0;
    this._cache = new Map();
  }

  static loadFromFile(graphJsonPath) {
    const resolved = path.resolve(graphJsonPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Graph file not found: ${resolved}`);
    }
    const raw = fs.readFileSync(resolved, 'utf8');
    const data = JSON.parse(raw);
    return new RetrievalEngine(data);
  }

  retrieve(query, options = {}) {
    const {
      limit = 20,
      depth = 1,
      edgeTypes = null,
      includeFeatures = true,
      includeConcepts = true,
      tokenBudget = 4000,
      diversify = true,
      buildSubgraph = true,
    } = options;

    this._totalQueries++;
    const start = Date.now();

    const plan = this.retrievalPlanner.plan(query);

    const resolvers = {
      feature: (params) => {
        const results = [];
        for (const featName of params.features || []) {
          const files = this.featureResolver.getFeatureFiles(featName);
          for (const fp of files) {
            const node = this.graphData.nodes.find(n => n.filePath === fp);
            if (node) {
              results.push({ ...node, _matchType: 'feature', _matchLabel: featName });
            }
          }
        }
        return results;
      },
      concept: (params) => {
        const results = [];
        for (const concName of params.concepts || []) {
          const files = this.conceptResolver.getConceptFiles(concName);
          for (const fp of files) {
            const node = this.graphData.nodes.find(n => n.filePath === fp);
            if (node) {
              results.push({ ...node, _matchType: 'concept', _matchLabel: concName });
            }
          }
        }
        return results;
      },
      symbol: (params) => {
        const symResults = this.symbolResolver.searchSymbols(params.query, params.limit || 20);
        const results = [];
        for (const sr of symResults) {
          const node = this.graphData.nodes.find(n => n.filePath === sr.filePath);
          if (node) {
            results.push({
              ...node,
              _matchType: 'symbol',
              _matchLabel: sr.name,
              _symbolScore: sr.score,
              _symbolName: sr.name,
              _symbolType: sr.type,
            });
          }
        }
        return results;
      },
      file: (params) => {
        const results = [];
        for (const fp of params.files || []) {
          const node = this.graphData.nodes.find(n => n.filePath === fp);
          if (node) {
            results.push({ ...node, _matchType: 'file', _matchLabel: fp });
          }
        }
        return results;
      },
      dependency: (params) => {
        const results = [];
        for (const fp of params.files || []) {
          const deps = this.dependencyResolver.getDependencies(fp, params.depth || 1);
          for (const d of deps.dependencies || []) {
            const node = this.graphData.nodes.find(n => n.filePath === d.filePath);
            if (node) {
              results.push({ ...node, _matchType: 'dependency', _matchLabel: fp, _depDepth: d.depth });
            }
          }
        }
        return results;
      },
      path: () => {
        return [];
      },
    };

    const ranked = this.rankingEngine.rank(
      this.retrievalPlanner.executePlan(plan, resolvers),
      query
    );

    const topCandidates = ranked.slice(0, limit).map(r => r.item);
    const diversified = diversify
      ? this.rankingEngine.diversify(ranked.slice(0, Math.min(limit * 3, ranked.length)), limit).map(r => r.item)
      : topCandidates;

    const filePaths = [...new Set(diversified.map(r => r.filePath).filter(Boolean))];

    let subgraph = null;
    let context = '';
    if (buildSubgraph && filePaths.length > 0) {
      subgraph = this.subgraphBuilder.buildSubgraph(filePaths, {
        depth,
        edgeTypes,
        maxNodes: Math.max(50, limit * 3),
        includeFeatures,
        includeConcepts,
      });
      context = this.subgraphBuilder.toPromptContext(subgraph, query);
    }

    const ms = Date.now() - start;

    return {
      query,
      results: diversified,
      subgraph,
      context,
      plan: {
        intents: plan.intents,
        strategies: plan.strategies.map(s => ({ resolver: s.resolver, priority: s.priority })),
      },
      stats: {
        totalResults: diversified.length,
        ms,
        totalStrategies: plan.strategies.length,
        intents: plan.intents,
        subgraphNodes: subgraph?.nodes?.length || 0,
        subgraphEdges: subgraph?.edges?.length || 0,
        totalQueries: this._totalQueries,
      },
    };
  }

  getStats() {
    return {
      totalQueries: this._totalQueries,
      cacheSize: this._cache.size,
      graphNodes: this.graphData.nodes?.length || 0,
      graphEdges: this.graphData.edges?.length || 0,
      features: Object.keys(this.graphData.features || {}).length,
      concepts: Object.keys(this.graphData.concepts || {}).length,
    };
  }
}

module.exports = { RetrievalEngine };
