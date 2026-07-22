let _SQL = null;
async function getSqlJs() {
  if (!_SQL) {
    const initSqlJs = require('sql.js/dist/sql-wasm.js');
    _SQL = await initSqlJs();
  }
  return _SQL;
}

module.exports = { getSqlJs };
