// ── Performance measurement harness (Phase 0) ──
// Usage: require('./measure-perf.js').runBenchmark()
// Or set DEBUG_PERF=true env var for passive monitoring

const path = require('path');
const fs = require('fs');

const PERF_LOG_PATH = path.join(__dirname, '..', 'perf-baseline.json');

let _metrics = {};

function record(category, name, durationMs, meta) {
  if (!_metrics[category]) _metrics[category] = {};
  if (!_metrics[category][name]) _metrics[category][name] = { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0, samples: [] };
  const entry = _metrics[category][name];
  entry.count++;
  entry.totalMs += durationMs;
  if (durationMs < entry.minMs) entry.minMs = durationMs;
  if (durationMs > entry.maxMs) entry.maxMs = durationMs;
  if (entry.samples.length < 100) entry.samples.push(durationMs);
  if (meta) entry.lastMeta = meta;
}

function average(category, name) {
  const entry = _metrics[category] && _metrics[category][name];
  if (!entry || entry.count === 0) return 0;
  return entry.totalMs / entry.count;
}

function reset() {
  _metrics = {};
}

function summary() {
  const lines = [];
  for (const [cat, names] of Object.entries(_metrics)) {
    lines.push(`\n[${cat}]`);
    for (const [name, entry] of Object.entries(names)) {
      const avg = (entry.totalMs / entry.count).toFixed(2);
      lines.push(`  ${name}: avg=${avg}ms count=${entry.count} min=${entry.minMs.toFixed(1)}ms max=${entry.maxMs.toFixed(1)}ms`);
    }
  }
  return lines.join('\n');
}

function saveBaseline() {
  const report = {
    timestamp: new Date().toISOString(),
    metrics: _metrics,
  };
  fs.writeFileSync(PERF_LOG_PATH, JSON.stringify(report, null, 2));
  console.log(`[Perf] Baseline saved to ${PERF_LOG_PATH}`);
}

function loadBaseline() {
  try {
    return JSON.parse(fs.readFileSync(PERF_LOG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function compareWithBaseline() {
  const baseline = loadBaseline();
  if (!baseline) {
    console.log('[Perf] No baseline found. Run with SAVE_PERF=true first.');
    return;
  }
  const lines = [];
  for (const [cat, names] of Object.entries(_metrics)) {
    for (const [name, entry] of Object.entries(names)) {
      const avg = entry.totalMs / entry.count;
      const base = baseline.metrics[cat] && baseline.metrics[cat][name];
      if (base) {
        const baseAvg = base.totalMs / base.count;
        const diff = ((avg - baseAvg) / baseAvg * 100).toFixed(1);
        const symbol = diff.startsWith('-') ? '✓' : diff === '0.0' ? '=' : '✗';
        lines.push(`${symbol} ${cat}.${name}: ${avg.toFixed(2)}ms vs ${baseAvg.toFixed(2)}ms (${diff}%)`);
      } else {
        lines.push(`? ${cat}.${name}: ${avg.toFixed(2)}ms (new metric, no baseline)`);
      }
    }
  }
  console.log('[Perf] Comparison:\n' + lines.join('\n'));
}

async function measure(category, name, fn, iterations = 100) {
  // warmup
  for (let i = 0; i < 10; i++) await fn();
  // measure
  const start = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  const total = performance.now() - start;
  record(category, name, total / iterations, { iterations });
  return total / iterations;
}

async function benchmarkDb(db) {
  console.log('[Perf Bench] DB benchmarks...');
  const queries = [
    ['count repos', 'SELECT COUNT(*) FROM repositories'],
    ['count files', 'SELECT COUNT(*) FROM indexed_files'],
    ['count symbols', 'SELECT COUNT(*) FROM symbols'],
  ];
  for (const [name, sql] of queries) {
    await measure('db', name, () => { try { db.exec(sql); } catch (_) {} }, 50);
  }
}

async function benchmarkIpc(ipcInvoke) {
  console.log('[Perf Bench] IPC benchmarks...');
  const channels = [
    ['git:status'],
    ['prefetch:get', 'profile'],
  ];
  for (const [channel, arg] of channels) {
    try {
      await measure('ipc', channel, () => ipcInvoke(channel, arg), 20);
    } catch (_) { /* handler may not exist */ }
  }
}

module.exports = {
  record, average, reset, summary, saveBaseline, loadBaseline, compareWithBaseline,
  measure, benchmarkDb, benchmarkIpc,
};

// ── Auto-collect if env flag is set ──
if (process.env.SAVE_PERF) {
  process.on('exit', () => { saveBaseline(); });
}
