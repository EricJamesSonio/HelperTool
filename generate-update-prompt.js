const fs = require('fs');
const crypto = require('crypto');

const HASH_FILE = 'graphify/graphify-storage/.file-hashes.json';
const SYMS_FILE = 'graphify/symbol-index-storage/symbols.json';
const GRAPH_FILE = 'graphify/graphify-storage/graph.json';
const OUT_PROMPT = 'graphify/prompts/file-updates-prompt.txt';

const raw = JSON.parse(fs.readFileSync(SYMS_FILE, 'utf8'));
const files = raw.files;
const symbols = raw.symbols;
const imports = raw.imports || [];

// Group symbols and imports by file
const symsByFile = new Map();
for (const s of symbols) {
  if (!symsByFile.has(s.filePath)) symsByFile.set(s.filePath, []);
  symsByFile.get(s.filePath).push(s);
}
const impsByFile = new Map();
for (const im of imports) {
  if (!impsByFile.has(im.sourceFile)) impsByFile.set(im.sourceFile, []);
  impsByFile.get(im.sourceFile).push(im);
}

// Load previous hashes
let prevHashes = {};
if (fs.existsSync(HASH_FILE)) {
  try { prevHashes = JSON.parse(fs.readFileSync(HASH_FILE, 'utf8')); } catch {}
}

// Compute current hashes
const curHashes = {};
for (const f of files) {
  const fp = f.path;
  const syms = symsByFile.get(fp) || [];
  const imps = impsByFile.get(fp) || [];
  const hashData = JSON.stringify({ symbols: syms, imports: imps });
  curHashes[fp] = crypto.createHash('sha256').update(hashData).digest('hex');
}

// Detect changed/new files
const changedFiles = [];
const newFiles = [];
for (const fp of Object.keys(curHashes)) {
  if (prevHashes[fp] === undefined) newFiles.push(fp);
  else if (prevHashes[fp].structureHash !== curHashes[fp] && prevHashes[fp].structureHash !== undefined) changedFiles.push(fp);
  else if (typeof prevHashes[fp] === 'string' && prevHashes[fp] !== curHashes[fp]) changedFiles.push(fp);
  else if (prevHashes[fp].structureHash !== curHashes[fp]) changedFiles.push(fp);
}

const allUpdates = [...newFiles, ...changedFiles];
if (allUpdates.length === 0) {
  console.log('No changed files detected — nothing to update.');
  fs.writeFileSync(OUT_PROMPT, '', 'utf8');
  process.exit(0);
}

// If most files changed, suggest full re-enrich instead
const totalFiles = files.length;
const changePct = (allUpdates.length / totalFiles * 100).toFixed(1);
if (changePct > 50) {
  console.log(`  Warning: ${allUpdates.length}/${totalFiles} files changed (${changePct}%).`);
  console.log('  Consider a full graph re-generation instead of incremental updates.');
  console.log(`  Run: node exporter.js (to export the full generate-graph.md prompt)`);
  console.log('');
}

// Load existing graph.json to show old summaries
let prevGraph = null;
if (fs.existsSync(GRAPH_FILE)) {
  try { prevGraph = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8')); } catch {}
}
const prevNodesByPath = new Map();
if (prevGraph && Array.isArray(prevGraph.nodes)) {
  for (const n of prevGraph.nodes) {
    if (n.filePath) prevNodesByPath.set(n.filePath, n);
  }
}

// Build entries for each changed file
let fileEntries = '';
for (const fp of allUpdates) {
  const syms = symsByFile.get(fp) || [];
  const imps = impsByFile.get(fp) || [];
  const exportedSyms = syms.filter(s => s.isExported).map(s => s.name);
  const allNames = syms.map(s => s.name);
  const impPaths = imps.map(im => im.importPath);
  const oldNode = prevNodesByPath.get(fp);
  const oldSummary = oldNode?.summary || 'N/A';
  const oldFeatures = oldNode?.features?.join(', ') || 'N/A';
  const oldPurpose = oldNode?.symbols?.slice(0, 5).map(s => `    ${s.name}: ${s.purpose}`).join('\n') || '  (none)';

  fileEntries += `  - ${fp}
    language: ${files.find(f => f.path === fp)?.language || 'javascript'}
    total_symbols: ${syms.length}
    exported: ${exportedSyms.join(', ') || 'none'}
    imports: ${impPaths.join(', ') || 'none'}
    symbols: ${allNames.join(', ') || 'none'}
    --- OLD enrichment data (verify and update) ---
    old_summary: ${oldSummary}
    old_features: [${oldFeatures}]
    old_symbol_roles:
${oldPurpose}
`;
}

const prompt = `You are updating a knowledge graph for the HelperTool codebase. The following ${allUpdates.length} files have changed and need re-enrichment.

## Instructions

For each file listed below:
1. Read the actual source code from the repository
2. Update the enrichment data — summary, feature, responsibilities, tags, and per-symbol purpose/role
3. Use the old enrichment data as reference — improve it if possible, fix it if it was wrong
4. Return ONLY a JSON array, no other text

## Output format

Return a JSON array (only JSON, no markdown fences) where each element has this schema:

[
  {
    "file": "Code/path/to/file.js",
    "summary": "1-2 sentence description of what this file does. Be specific.",
    "feature": "The primary feature area this belongs to (e.g., database, git, docker, canvas, video, chat, codeswamp, settings, shortcuts, secrets, automation, workspace, envManager, knowledgeGraph, indexer, gmail, github, core)",
    "responsibilities": [
      "List 1-4 specific responsibilities this module has. Be concrete."
    ],
    "tags": ["array", "of", "relevant", "tags"],
    "symbols": [
      {
        "name": "functionOrClassName",
        "purpose": "What this specific function/class does. Be precise.",
        "role": "One of: entry_point, factory, parser, validator, cache_manager, controller, database_gateway, worker, scheduler, orchestrator, adapter, helper, renderer, handler, provider, state_manager, initializer, utility, transformer, viewer, editor"
      }
    ]
  }
]

## Files to update (${allUpdates.length})

${fileEntries}
Generate the output now.`;

fs.writeFileSync(OUT_PROMPT, prompt, 'utf8');
console.log(`Detected ${allUpdates.length} changed files (${newFiles.length} new, ${changedFiles.length} modified)`);
console.log(`Update prompt written to ${OUT_PROMPT}`);
console.log(`Prompt size: ${(Buffer.byteLength(prompt, 'utf8') / 1024).toFixed(0)} KB`);
console.log('');
console.log('Next steps:');
console.log(`1. Feed ${OUT_PROMPT} to your AI`);
console.log(`2. Save the AI's JSON response as graphify/symbol-index-storage/file-updates.json`);
console.log(`3. Run: node generate-graph.js`);
