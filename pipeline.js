const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const STAGES = {
  stage1: { name: 'Symbol Indexer', script: null, description: 'Already complete — symbols.json exists from the indexer service' },
  stage2: { name: 'Graph Builder', script: 'generate-graph.js', description: 'Builds graph.json + graph.md from symbols.json' },
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
const symPath = path.join(__dirname, 'graphify', 'symbol-index-storage', 'symbols.json');
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
const stage2Ok = runScript(STAGES.stage2.name, STAGES.stage2.script);

// Verify output
console.log('\n━━━ Verification ━━━');
const graphPath = path.join(__dirname, 'graphify', 'graphify-storage', 'graph.json');
const mdPath = path.join(__dirname, 'graphify', 'graphify-storage', 'graph.md');

if (fs.existsSync(graphPath)) {
  const g = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  console.log(`  ✓ graph.json: ${g.nodes.length} nodes, ${g.edges.length} edges, ${Object.keys(g.features).length} features`);

  // Check incremental info
  if (g.meta?.incremental) {
    const inc = g.meta.incremental;
    console.log(`    incremental: ${inc.reused} reused, ${inc.rebuilt} rebuilt (${inc.new} new, ${inc.changed} changed)`);
  }

  // Check centrality metrics
  const withCentrality = g.nodes.filter(n => n.centrality).length;
  console.log(`    centrality on ${withCentrality}/${g.nodes.length} nodes`);

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
