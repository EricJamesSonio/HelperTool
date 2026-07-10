const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const STAGES = {
  stage1: { name: 'Symbol Indexer', script: null, description: 'Already complete — symbols.json exists from the indexer service' },
  stage2: { name: 'AI File Summarizer', script: 'generate-summarizer-prompt.js', description: 'Generates AI prompt for fileSummaries.json. You must feed the prompt to an AI and save the result.' },
  stage3: { name: 'Graph Builder', script: 'generate-graph.js', description: 'Builds graph.json + graph.md from symbols.json + optional fileSummaries.json' },
};

function runScript(label, scriptPath) {
  console.log(`\n━━━ ${label} ━━━`);
  console.log(`Running: node ${scriptPath}`);
  try {
    const out = execSync(`node "${scriptPath}"`, { cwd: __dirname, stdio: 'pipe', timeout: 120000 });
    console.log(out.toString());
    return true;
  } catch (e) {
    console.error(e.stderr ? e.stderr.toString() : e.message);
    console.error(e.stdout ? e.stdout.toString() : '');
    return false;
  }
}

console.log('╔══════════════════════════════════════════════╗');
console.log('║  HelperTool Knowledge Graph Pipeline v1      ║');
console.log('╚══════════════════════════════════════════════╝');

// Check Stage 1
console.log(`\n${STAGES.stage1.name}`);
console.log(`  ${STAGES.stage1.description}`);
const symPath = path.join(__dirname, 'symbol-index-storage', 'symbols.json');
if (fs.existsSync(symPath)) {
  const raw = JSON.parse(fs.readFileSync(symPath, 'utf8'));
  console.log(`  ✓ symbols.json: ${raw.files.length} files, ${raw.symbols.length} symbols, ${(raw.imports || []).length} imports`);
} else {
  console.log('  ✗ symbols.json not found. Run the indexer first.');
  process.exit(1);
}

// Stage 2
console.log(`\n${STAGES.stage2.name}`);
console.log(`  ${STAGES.stage2.description}`);
const summariesPath = path.join(__dirname, 'symbol-index-storage', 'fileSummaries.json');
const hasSummaries = fs.existsSync(summariesPath);
if (hasSummaries) {
  const summaries = JSON.parse(fs.readFileSync(summariesPath, 'utf8'));
  console.log(`  ✓ fileSummaries.json: ${Array.isArray(summaries) ? summaries.length : '?'} files`);
} else {
  console.log('  ○ fileSummaries.json not found — will use heuristic summaries only');
}

// Stage 3
console.log(`\n${STAGES.stage3.name}`);
console.log(`  ${STAGES.stage3.description}`);
const stage3Ok = runScript(STAGES.stage3.name, STAGES.stage3.script);

// Verify output
console.log('\n━━━ Verification ━━━');
const graphPath = path.join(__dirname, 'graphify-storage', 'graph.json');
const mdPath = path.join(__dirname, 'graphify-storage', 'graph.md');

if (fs.existsSync(graphPath)) {
  const g = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  console.log(`  ✓ graph.json: ${g.nodes.length} nodes, ${g.edges.length} edges, ${Object.keys(g.features).length} features`);

  // Check centrality metrics
  const withCentrality = g.nodes.filter(n => n.centrality).length;
  const withAiSummary = g.nodes.filter(n => n.summarySource === 'ai').length;
  console.log(`    centrality on ${withCentrality}/${g.nodes.length} nodes`);
  console.log(`    AI summaries on ${withAiSummary}/${g.nodes.length} nodes`);

  if (g.nodes.length > 0) {
    const topCent = [...g.nodes].filter(n => n.centrality).sort((a, b) => b.centrality.centrality - a.centrality.centrality).slice(0, 5);
    console.log('    Top centrality:');
    for (const n of topCent) {
      console.log(`      ${n.filePath}: ${n.centrality.centrality.toFixed(3)} (fanIn=${n.centrality.fanIn}, fanOut=${n.centrality.fanOut})`);
    }
  }
} else {
  console.log('  ✗ graph.json not found');
}

if (fs.existsSync(mdPath)) {
  const mdSize = Buffer.byteLength(fs.readFileSync(mdPath, 'utf8'), 'utf8');
  console.log(`  ✓ graph.md: ${(mdSize / 1024).toFixed(0)} KB`);
}

console.log('\nDone.');
