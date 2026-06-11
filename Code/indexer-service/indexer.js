const { SymbolCache } = require('./cache.js');
const { parseFile } = require('./parser.js');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cache = new SymbolCache();

function respond(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

// ── Sync handlers ──

function h_indexFile(id, type, payload) {
  const { filePath, content } = payload || {};
  if (!filePath || content == null) {
    return respond({ id, type, ok: false, error: 'Missing filePath or content' });
  }
  const result = parseFile(content, filePath);
  cache.set(filePath, result);
  const importData = result.imports.map(i => ({ import_path: i.import_path, import_type: i.import_type, line: i.line, column: i.column, imported_symbols: i.imported_symbols || [] }));
  return respond({ id, type, ok: true, data: { symbols: result.symbols.length, imports: result.imports.length, importData } });
}

function h_indexFiles(id, type, payload) {
  const { files } = payload || {};
  if (!files || !Array.isArray(files)) {
    return respond({ id, type, ok: false, error: 'Missing files array' });
  }
  const results = [];
  for (const { filePath, content } of files) {
    if (filePath && content != null) {
      const result = parseFile(content, filePath);
      cache.set(filePath, result);
      results.push({ filePath, symbols: result.symbols.length, imports: result.imports.map(i => ({ import_path: i.import_path, import_type: i.import_type, line: i.line, column: i.column, imported_symbols: i.imported_symbols || [] })) });
    }
  }
  const totalSymbols = results.reduce((sum, r) => sum + r.symbols, 0);
  return respond({ id, type, ok: true, data: { indexed: results.length, total: files.length, totalSymbols, fileResults: results } });
}

function h_symbolsGet(id, type, payload) {
  const { filePath, limit, offset } = payload || {};
  if (!filePath) return respond({ id, type, ok: false, error: 'Missing filePath' });
  const result = cache.getFileSymbols(filePath, limit, offset);
  return respond({ id, type, ok: true, data: result });
}

function h_search(id, type, payload) {
  const { query, limit, offset } = payload || {};
  if (!query) return respond({ id, type, ok: false, error: 'Missing query' });
  const result = cache.search(query, limit, offset);
  return respond({ id, type, ok: true, data: result });
}

function h_status(id, type) {
  const files = cache.getIndexedFiles();
  return respond({ id, type, ok: true, data: { indexedFiles: files.length, totalSymbols: cache.getSymbolCount(), files } });
}

function h_removeFile(id, type, payload) {
  const { filePath } = payload || {};
  if (filePath) cache.delete(filePath);
  return respond({ id, type, ok: true });
}

function h_clear(id, type) {
  cache.clear();
  return respond({ id, type, ok: true });
}

function h_getFileList(id, type, payload) {
  const { limit, offset } = payload || {};
  const result = cache.getFileList(limit, offset);
  return respond({ id, type, ok: true, data: result });
}

function h_getFileDeps(id, type, payload) {
  const { filePath, mode } = payload || {};
  if (!filePath) return respond({ id, type, ok: false, error: 'Missing filePath' });
  const result = cache.getFileDeps(filePath, mode);
  if (!result) return respond({ id, type, ok: false, error: 'File not found in index' });
  return respond({ id, type, ok: true, data: result });
}

// ── Async handlers (self-driven — send their own responses) ──

async function h_indexStart(id, type, payload) {
  const { repoPath, files } = payload || {};
  if (!repoPath || !files || !Array.isArray(files)) {
    return respond({ id, type, ok: false, error: 'Missing repoPath or files array' });
  }

  const BATCH_SIZE = 10;
  let indexedCount = 0;
  let totalSymbols = 0;
  const total = files.length;

  let lastProgress = 0;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(batch.map(async (filePath) => {
      const fullPath = path.join(repoPath, filePath);
      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const hash = crypto.createHash('md5').update(content).digest('hex');
        const result = parseFile(content, filePath);
        cache.set(filePath, result);
        totalSymbols += result.symbols.length;
      } catch (_) {}
    }));

    indexedCount += batch.length;

    const now = Date.now();
    if (now - lastProgress > 100) {
      lastProgress = now;
      respond({
        id: 'progress', type: 'progress',
        data: { current: indexedCount, total, percent: Math.round((indexedCount / total) * 100) },
      });
    }
  }

  respond({ id, type, ok: true, data: { totalFiles: total, totalSymbols } });
}

async function h_indexFilesById(id, type, payload) {
  const { repoPath, files } = payload || {};
  if (!repoPath || !files || !Array.isArray(files)) {
    return respond({ id, type, ok: false, error: 'Missing repoPath or files array' });
  }

  const BATCH_SIZE = 10;
  let indexedCount = 0;
  let totalSymbols = 0;
  const total = files.length;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(batch.map(async (filePath) => {
      const fullPath = path.join(repoPath, filePath);
      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const result = parseFile(content, filePath);
        cache.set(filePath, result);
        totalSymbols += result.symbols.length;
      } catch (_) {}
    }));

    indexedCount += batch.length;

    respond({
      id: 'progress', type: 'progress',
      data: { current: indexedCount, total, percent: Math.round((indexedCount / total) * 100) },
    });
  }

  respond({ id, type, ok: true, data: { totalFiles: total, totalSymbols } });
}

// ── Router ──

function handle(msg) {
  const { id, type, payload } = msg || {};
  if (!id || !type) return;

  try {
    switch (type) {
      case 'indexFile': return h_indexFile(id, type, payload);
      case 'indexFiles': return h_indexFiles(id, type, payload);
      case 'index:start': return h_indexStart(id, type, payload);
      case 'index:files': return h_indexFilesById(id, type, payload);
      case 'symbols:get': return h_symbolsGet(id, type, payload);
      case 'search': return h_search(id, type, payload);
      case 'status': return h_status(id, type);
      case 'removeFile': return h_removeFile(id, type, payload);
      case 'clear': return h_clear(id, type);
      case 'getFileList': return h_getFileList(id, type);
      case 'getFileDeps': return h_getFileDeps(id, type, payload);
      default: return respond({ id, type, ok: false, error: `Unknown message type: ${type}` });
    }
  } catch (err) {
    return respond({ id, type, ok: false, error: err.message });
  }
}

// ── Main loop ──

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;
  try {
    const msg = JSON.parse(line);
    handle(msg);
  } catch (err) {
    process.stderr.write(`[indexer] Invalid JSON: ${err.message}\n`);
  }
});

rl.on('close', () => {
  process.exit(0);
});

process.stdout.write(JSON.stringify({ id: 'bootstrap', type: 'ready', ok: true }) + '\n');
