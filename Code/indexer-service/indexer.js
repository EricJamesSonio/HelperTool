/**
 * Indexer Service — standalone child process.
 * Communicates with the Electron main process via JSON-line IPC over stdin/stdout.
 *
 * Protocol:
 *   Request (stdin):  { id: string, type: string, payload: any }
 *   Response (stdout): { id: string, type: string, ok: bool, data?: any, error?: string }
 *
 * Supported message types:
 *   - indexFile       → parse and cache a single file
 *   - indexFiles      → parse and cache multiple files
 *   - symbols:get     → return cached symbols for a file (with limit/offset)
 *   - search          → search across all cached symbols
 *   - status          → return summary of indexed files/symbols
 *   - removeFile      → remove a file from cache
 *   - clear           → clear all cached data
 */

const { SymbolCache } = require('./cache.js');
const { parseFile } = require('./parser.js');
const readline = require('readline');

const cache = new SymbolCache();

function respond(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handle(msg) {
  const { id, type, payload } = msg || {};
  if (!id || !type) return;

  try {
    switch (type) {
      case 'indexFile': {
        const { filePath, content } = payload || {};
        if (!filePath || content == null) {
          return respond({ id, type, ok: false, error: 'Missing filePath or content' });
        }
        const result = parseFile(content, filePath);
        cache.set(filePath, result);
        return respond({ id, type, ok: true, data: { symbols: result.symbols.length, imports: result.imports.length } });
      }

      case 'indexFiles': {
        const { files } = payload || {};
        if (!files || !Array.isArray(files)) {
          return respond({ id, type, ok: false, error: 'Missing files array' });
        }
        const results = [];
        for (const { filePath, content } of files) {
          if (filePath && content != null) {
            const result = parseFile(content, filePath);
            cache.set(filePath, result);
            results.push({ filePath, symbols: result.symbols.length, imports: result.imports.length });
          }
        }
        const totalSymbols = results.reduce((sum, r) => sum + r.symbols, 0);
        const totalImports = results.reduce((sum, r) => sum + r.imports, 0);
        return respond({ id, type, ok: true, data: { indexed: results.length, total: files.length, totalSymbols, totalImports } });
      }

      case 'symbols:get': {
        const { filePath, limit, offset } = payload || {};
        if (!filePath) {
          return respond({ id, type, ok: false, error: 'Missing filePath' });
        }
        const result = cache.getFileSymbols(filePath, limit, offset);
        return respond({ id, type, ok: true, data: result });
      }

      case 'search': {
        const { query, limit, offset } = payload || {};
        if (!query) {
          return respond({ id, type, ok: false, error: 'Missing query' });
        }
        const result = cache.search(query, limit, offset);
        return respond({ id, type, ok: true, data: result });
      }

      case 'status': {
        const files = cache.getIndexedFiles();
        return respond({
          id, type, ok: true,
          data: {
            indexedFiles: files.length,
            totalSymbols: cache.getSymbolCount(),
            files,
          },
        });
      }

      case 'removeFile': {
        const { filePath } = payload || {};
        if (filePath) cache.delete(filePath);
        return respond({ id, type, ok: true });
      }

      case 'clear':
        cache.clear();
        return respond({ id, type, ok: true });

      case 'getFileList': {
        const list = cache.getFileList();
        return respond({ id, type, ok: true, data: { files: list } });
      }

      default:
        return respond({ id, type, ok: false, error: `Unknown message type: ${type}` });
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
    // Can't respond without id/type — write raw error
    process.stderr.write(`[indexer] Invalid JSON: ${err.message}\n`);
  }
});

rl.on('close', () => {
  process.exit(0);
});

// Signal readiness
process.stdout.write(JSON.stringify({ id: 'bootstrap', type: 'ready', ok: true }) + '\n');
