const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('symbol-index-storage/symbols.json', 'utf8'));
const files = raw.files;
const symbols = raw.symbols;

// Group symbols by file
const symsByFile = new Map();
for (const s of symbols) {
  if (!symsByFile.has(s.filePath)) symsByFile.set(s.filePath, []);
  symsByFile.get(s.filePath).push(s);
}

// Group imports by source file
const imports = raw.imports || [];
const importsByFile = new Map();
for (const im of imports) {
  if (!importsByFile.has(im.sourceFile)) importsByFile.set(im.sourceFile, []);
  importsByFile.get(im.sourceFile).push(im);
}

// Build a condensed file listing (first 200 chars of each file)
let fileEntries = '';
for (const f of files) {
  const syms = symsByFile.get(f.path) || [];
  const imps = importsByFile.get(f.path) || [];
  const exportedSyms = syms.filter(s => s.isExported).map(s => s.name);
  const allNames = syms.map(s => s.name);
  const impPaths = imps.map(im => im.importPath);

  fileEntries += `  - ${f.path}
    language: ${f.language || 'javascript'}
    total_symbols: ${syms.length}
    exported_symbols: ${exportedSyms.length}
    imports: ${impPaths.join(', ')}
    symbol_names: ${allNames.join(', ')}
`;
}

const prompt = `You are analyzing the HelperTool codebase, an Electron desktop developer toolkit. I have extracted structural data from the source code. Your task is to produce a semantic understanding for each file.

## Input

The codebase has ${files.length} files with ${symbols.length} symbols and ${imports.length} import relationships.

### Files

${fileEntries}
## Output Format

Return a JSON array (only JSON, no markdown fences) where each element has this schema:

[
  {
    "file": "Code/path/to/file.js",
    "summary": "1-2 sentence description of what this file does. Be specific about its purpose in the codebase.",
    "feature": "The feature area this belongs to (e.g., database, git, docker, canvas, video, chat, codeswamp, settings, shortcuts, secrets, automation, workspace, envManager, prompts, fileSeeder, symbolIndex, knowledgeGraph, indexer, gmail, github, apiTool, uiLayout, codebaseMap, blueprint, core, worker)",
    "responsibilities": [
      "List 1-4 specific responsibilities this module has. Be concrete, e.g. 'Initialize chat database and create tables' not just 'database operations'"
    ],
    "tags": ["array", "of", "relevant", "tags"],
    "symbols": [
      {
        "name": "functionOrClassName",
        "purpose": "What this specific function/class does. Be precise about its role.",
        "role": "Semantic role: one of: entry_point, factory, parser, validator, cache_manager, controller, database_gateway, worker, scheduler, orchestrator, adapter, helper, renderer, handler, provider, state_manager, initializer, utility, transformer, viewer, editor"
      }
    ]
  }
]

## Rules

1. Every file in the input must have an entry in the output array.
2. Be specific. "Reads config file" is better than "handles configuration".
3. For the "feature" field, use the most specific feature name from the list above.
4. For symbols, only include the most important ones (exported functions, classes, key methods that define the file's purpose). Max 10 symbols per file.
5. If a file has no meaningful symbols (e.g., CSS), you can omit the symbols array or leave it empty.
6. Do not include any text outside the JSON array.
7. Total output must be valid JSON that can be parsed with JSON.parse().

Generate the output now.`;

const outDir = 'symbol-index-storage';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Also write a human-readable prompt file
fs.writeFileSync(outDir + '/generate-summaries-prompt.txt', prompt, 'utf8');
console.log('Wrote AI summarizer prompt to ' + outDir + '/generate-summaries-prompt.txt');
console.log('Prompt size: ' + (Buffer.byteLength(prompt, 'utf8') / 1024).toFixed(0) + ' KB');
console.log('Files to summarize: ' + files.length);

// Write a smaller version that batches files (handles context limits)
const batches = [];
const BATCH_SIZE = 50;
for (let i = 0; i < files.length; i += BATCH_SIZE) {
  batches.push(files.slice(i, i + BATCH_SIZE));
}

const batchDir = outDir + '/summary-batches';
if (!fs.existsSync(batchDir)) fs.mkdirSync(batchDir, { recursive: true });

for (let b = 0; b < batches.length; b++) {
  const batchFiles = batches[b];
  let batchEntries = '';
  for (const f of batchFiles) {
    const syms = symsByFile.get(f.path) || [];
    const imps = importsByFile.get(f.path) || [];
    const exportedSyms = syms.filter(s => s.isExported).map(s => s.name);
    const allNames = syms.map(s => s.name);
    const impPaths = imps.map(im => im.importPath);

    batchEntries += `  - ${f.path}
    language: ${f.language || 'javascript'}
    total_symbols: ${syms.length}
    exported: ${exportedSyms.join(', ') || 'none'}
    imports: ${impPaths.join(', ') || 'none'}
    symbols: ${allNames.join(', ') || 'none'}
`;
  }

  const batchPrompt = `Analyze these ${batchFiles.length} files from HelperTool codebase.

Files:
${batchEntries}

Return a JSON array with one entry per file. Each entry:
{
  "file": "path",
  "summary": "1-2 sentence description",
  "feature": "feature area",
  "responsibilities": ["list"],
  "tags": ["tags"],
  "symbols": [{"name": "name", "purpose": "purpose", "role": "role"}]
}

Return ONLY the JSON array, no other text.`;

  fs.writeFileSync(`${batchDir}/batch-${String(b).padStart(2, '0')}.txt`, batchPrompt, 'utf8');
  console.log(`  Batch ${b + 1}/${batches.length}: ${batchFiles.length} files -> ${batchDir}/batch-${String(b).padStart(2, '0')}.txt`);
}

console.log('\nDone! Feed the prompt(s) to your AI to generate fileSummaries.json.');
console.log('Then place the result at: ' + outDir + '/fileSummaries.json');
