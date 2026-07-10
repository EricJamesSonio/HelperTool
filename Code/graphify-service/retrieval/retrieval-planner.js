'use strict';

const STOPWORDS = new Set([
  'a','an','the','is','it','in','on','at','to','do','how','what','where',
  'which','why','when','who','does','did','was','are','be','been','being',
  'have','has','had','will','would','could','should','may','might','can',
  'get','set','use','with','and','or','not','for','from','of','this','that',
  'there','their','they','them','then','than','its','our','your','my','we',
  'i','me','he','she','work','works','working','about','into','using',
  'called','call','calls','make','makes','made','create','creates','created',
  'show','find','list','tell','give','need','want','help','explain','describe',
  'look','search','find','locate','get','retrieve',
]);

const INTENT_PATTERNS = {
  dependency: [
    /import|depend|require|use\s.*library|module\b/i,
    /what\s.*(import|use|depend)|who\s.*import|which\s.*module/i,
    /dependency\s.*graph|import\s.*chain|circular/i,
  ],
  concept: [
    /concept|architecture|design|pattern|overview|high.level/i,
    /how\s.*work|how\s.*organize|what\s.*pattern|explain\s.*system/i,
  ],
  feature: [
    /feature|module|component|subsystem|functionality/i,
    /what\s.*(do|feature|module)|how\s.*feature/i,
  ],
  symbol: [
    /function|class|method|variable|symbol|define|implement/i,
    /where\s.*(define|implement|declare)|find\s.*function|find\s.*class/i,
  ],
  path: [
    /connect|relat|link|between|relation|relationship/i,
    /how\s.*(connect|relate|link)|path\s.*between|shortest.*path/i,
  ],
};

class RetrievalPlanner {
  constructor(graphData) {
    this.features = graphData.features || {};
    this.concepts = graphData.concepts || {};
    this.nodes = graphData.nodes || [];
  }

  _tokenize(text) {
    const caseSplit = text.replace(/([a-z])([A-Z])/g, '$1 $2');
    return caseSplit
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 2 && !STOPWORDS.has(w));
  }

  _detectIntent(query) {
    const intents = [];
    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      for (const re of patterns) {
        if (re.test(query)) {
          intents.push(intent);
          break;
        }
      }
    }
    return intents.length > 0 ? intents : ['combined'];
  }

  _findCandidateFeatures(tokens) {
    const matches = [];
    for (const [name, feat] of Object.entries(this.features)) {
      const nameLower = name.toLowerCase();
      const descLower = (feat.description || '').toLowerCase();
      for (const t of tokens) {
        if (nameLower === t || nameLower.includes(t)) {
          matches.push({ name, score: 10, source: 'feature' });
        } else if (descLower.includes(t)) {
          matches.push({ name, score: 3, source: 'feature' });
        }
      }
    }
    return matches;
  }

  _findCandidateConcepts(tokens) {
    const matches = [];
    for (const [name, conc] of Object.entries(this.concepts)) {
      const nameLower = name.toLowerCase();
      const descLower = (conc.description || '').toLowerCase();
      for (const t of tokens) {
        if (nameLower === t || nameLower.includes(t)) {
          matches.push({ name, score: 8, source: 'concept' });
        } else if (descLower.includes(t)) {
          matches.push({ name, score: 2, source: 'concept' });
        }
      }
    }
    return matches;
  }

  _findCandidateFiles(tokens) {
    const matches = [];
    for (const n of this.nodes) {
      const fp = n.filePath || '';
      const lowerFp = fp.toLowerCase();
      const base = fp.split('/').pop()?.replace(/\.[^.]+$/, '')?.toLowerCase() || '';
      for (const t of tokens) {
        if (base === t) {
          matches.push({ filePath: fp, score: 10, source: 'file' });
        } else if (lowerFp.includes(t)) {
          matches.push({ filePath: fp, score: 5, source: 'file' });
        }
      }
    }
    return matches;
  }

  plan(query) {
    const tokens = this._tokenize(query);
    if (tokens.length === 0) {
      return { query, tokens: [], intents: ['combined'], strategies: [], expectedResults: [] };
    }

    const intents = this._detectIntent(query);
    const strategies = [];

    const featureCandidates = this._findCandidateFeatures(tokens);
    const conceptCandidates = this._findCandidateConcepts(tokens);
    const fileCandidates = this._findCandidateFiles(tokens);

    for (const intent of intents) {
      switch (intent) {
        case 'feature': {
          const top = featureCandidates.filter(c => c.score >= 5).slice(0, 5);
          if (top.length > 0) {
            strategies.push({
              resolver: 'feature',
              params: { features: top.map(c => c.name), query },
              priority: 1,
              candidates: top,
            });
          }
          break;
        }
        case 'concept': {
          const top = conceptCandidates.filter(c => c.score >= 5).slice(0, 5);
          if (top.length > 0) {
            strategies.push({
              resolver: 'concept',
              params: { concepts: top.map(c => c.name), query },
              priority: 1,
              candidates: top,
            });
          }
          break;
        }
        case 'symbol': {
          strategies.push({
            resolver: 'symbol',
            params: { query, limit: 20 },
            priority: 2,
            candidates: [],
          });
          break;
        }
        case 'dependency': {
          const topFiles = fileCandidates.filter(c => c.score >= 5).slice(0, 3);
          if (topFiles.length > 0) {
            strategies.push({
              resolver: 'dependency',
              params: { files: topFiles.map(c => c.filePath), depth: 1 },
              priority: 3,
              candidates: topFiles,
            });
          }
          break;
        }
        case 'path': {
          strategies.push({
            resolver: 'path',
            params: { query, tokens },
            priority: 4,
            candidates: fileCandidates.slice(0, 10),
          });
          break;
        }
        case 'combined': {
          const hasFeature = featureCandidates.some(c => c.score >= 5);
          const hasConcept = conceptCandidates.some(c => c.score >= 5);
          const hasFile = fileCandidates.some(c => c.score >= 5);
          if (hasFeature) {
            strategies.push({
              resolver: 'feature',
              params: { features: featureCandidates.filter(c => c.score >= 5).map(c => c.name), query },
              priority: 1,
              candidates: featureCandidates.filter(c => c.score >= 5),
            });
          }
          if (hasConcept) {
            strategies.push({
              resolver: 'concept',
              params: { concepts: conceptCandidates.filter(c => c.score >= 5).map(c => c.name), query },
              priority: 2,
              candidates: conceptCandidates.filter(c => c.score >= 5),
            });
          }
          strategies.push({
            resolver: 'symbol',
            params: { query, limit: 15 },
            priority: 3,
            candidates: [],
          });
          if (hasFile) {
            strategies.push({
              resolver: 'file',
              params: { files: fileCandidates.filter(c => c.score >= 5).map(c => c.filePath), query },
              priority: 4,
              candidates: fileCandidates.filter(c => c.score >= 5),
            });
          }
          break;
        }
      }
    }

    const expectedResults = [
      ...featureCandidates.map(c => ({ ...c, intent: 'feature' })),
      ...conceptCandidates.map(c => ({ ...c, intent: 'concept' })),
      ...fileCandidates.map(c => ({ ...c, intent: 'file' })),
    ];

    return { query, tokens, intents, strategies, expectedResults };
  }

  executePlan(plan, resolvers) {
    const { strategies } = plan;
    const allResults = [];
    const seenFiles = new Set();

    strategies.sort((a, b) => a.priority - b.priority);

    for (const strategy of strategies) {
      const resolverFn = resolvers[strategy.resolver];
      if (!resolverFn) continue;

      try {
        const results = resolverFn(strategy.params);
        if (Array.isArray(results)) {
          for (const r of results) {
            const key = r.filePath || r.name || r.id;
            if (!seenFiles.has(key)) {
              seenFiles.add(key);
              allResults.push({ ...r, _strategy: strategy.resolver });
            }
          }
        }
      } catch (err) {
        // skip failed strategy
      }
    }

    return allResults;
  }
}

module.exports = { RetrievalPlanner };
