const INTENT_MAP = [
  { type: 'dependencies', patterns: ['depend', 'import', 'uses', 'require', 'needs', 'imports from'] },
  { type: 'dependents',   patterns: ['who uses', 'who imports', 'used by', 'imported by', 'dependent'] },
  { type: 'symbols',      patterns: ['symbol', 'function', 'class', 'method', 'export', 'what is in', 'what does'] },
  { type: 'importChain',  patterns: ['chain', 'trace', 'tree', 'path', 'import chain'] },
  { type: 'circularDeps', patterns: ['circular', 'cycle', 'loop', 'recursive import'] },
];

const CASUAL_MAP = [
  { patterns: ['hello', 'hi', 'hey', 'yo'],         reply: "Hey! Ask me about any file in your codebase — type @ to pick one." },
  { patterns: ['thanks', 'thank you', 'thx', 'ty'], reply: "No problem! Let me know if you need anything else." },
  { patterns: ['help', 'what can you do', 'how'],   reply: "I can analyze your indexed files. Use @ to mention a file, then ask about its dependencies, symbols, who imports it, import chains, or circular deps." },
  { patterns: ['bye', 'goodbye', 'cya'],            reply: "See you! Come back when you need codebase help." },
  { patterns: ['good morning', 'good night'],       reply: "Hey! Ready to dig into some code?" },
];

export function extractFile(text, allFiles) {
  const atMatch = text.match(/@([\w./_-]+)/);
  if (atMatch) {
    const mention = atMatch[1].toLowerCase();
    const found = allFiles.find(f => f.path.toLowerCase().includes(mention));
    if (found) return found.path;
  }
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    if (word.length < 3) continue;
    const found = allFiles.find(f => f.path.toLowerCase().includes(word));
    if (found) return found.path;
  }
  return null;
}

export function parseIntent(text, allFiles) {
  const lower = text.toLowerCase().trim();

  for (const entry of CASUAL_MAP) {
    if (entry.patterns.some(p => lower.includes(p))) {
      return { type: 'casual', reply: entry.reply };
    }
  }

  const file = extractFile(text, allFiles);

  let queryType = null;
  for (const entry of INTENT_MAP) {
    if (entry.patterns.some(p => lower.includes(p))) {
      queryType = entry.type;
      break;
    }
  }

  if (file && queryType) return { type: 'query', file, queryType };
  if (file && !queryType) return { type: 'needsQuery', file };
  if (!file && queryType) return { type: 'needsFile', queryType };
  return { type: 'fallback' };
}

const FALLBACKS = [
  "I'm not sure what you mean. Try typing @ to pick a file, then ask about its dependencies or symbols.",
  "Hmm, I didn't catch that. You can ask things like \"@main.js dependencies\" or \"who uses @db.js\".",
  "I only know about your indexed codebase. Try mentioning a file with @ and what you want to know.",
];

let _fallbackIdx = 0;
export function getFallback() {
  return FALLBACKS[_fallbackIdx++ % FALLBACKS.length];
}
