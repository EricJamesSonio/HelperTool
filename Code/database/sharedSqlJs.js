let _initPromise = null;

async function getSqlJs() {
  if (!_initPromise) {
    const _initSqlJs = require('sql.js/dist/sql-wasm.js');
    _initPromise = _initSqlJs().catch(err => {
      console.error('[sharedSqlJs] sql.js WASM init failed:', err);
      throw err;
    });
  }
  return await _initPromise;
}

module.exports = { getSqlJs };
