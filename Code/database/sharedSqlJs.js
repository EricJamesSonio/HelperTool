const _promise = (async () => {
  const initSqlJs = require('sql.js/dist/sql-wasm.js');
  return await initSqlJs();
})();

async function getSqlJs() {
  return await _promise;
}

module.exports = { getSqlJs };
