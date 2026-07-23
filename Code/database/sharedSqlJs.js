let _promise = null;

async function getSqlJs() {
  if (!_promise) {
    _promise = (async () => {
      const initSqlJs = require('sql.js/dist/sql-wasm.js');
      return await initSqlJs();
    })();
  }
  return await _promise;
}

module.exports = { getSqlJs };
