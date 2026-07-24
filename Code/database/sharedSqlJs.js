// Eagerly load sql.js at require() time — moves ~600KB JS parse out of the app startup path
// into module loading, so window creation is NOT blocked by emscripten glue parsing.
const _initSqlJs = require('sql.js/dist/sql-wasm.js');

// Start WASM fetch + compile immediately (async, yields to event loop).
// By the time initDatabase() needs it, WASM may already be compiled.
const _initPromise = _initSqlJs().catch(err => {
  console.error('[sharedSqlJs] sql.js WASM init failed:', err);
  throw err; // re-throw so getSqlJs() rejects properly
});

async function getSqlJs() {
  return await _initPromise;
}

module.exports = { getSqlJs };
