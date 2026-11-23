const { ipcMain, safeStorage } = require('electron');
const dbi = require('../database/dbInspector.js');
const workerProxy = require('./workerProxy.js');

function decryptPassword(encrypted) {
  if (!encrypted) return '';
  try {
    const buf = Buffer.from(encrypted, 'base64');
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    return buf.toString('utf8');
  } catch (_) {
    return Buffer.from(encrypted, 'base64').toString('utf8');
  }
}

function register() {
  ipcMain.handle('dbInspector:gatherTables', async (event, payload) => {
    try {
      const { snapshotId, tables, limit } = payload || {};
      if (!snapshotId) return { success: false, error: 'No active snapshot' };
      if (!Array.isArray(tables) || tables.length === 0) {
        return { success: false, error: 'Select at least one table' };
      }

      const snapRes = require('../database/db.js').getDb().exec('SELECT connection_id FROM schema_snapshots WHERE id = ?', [snapshotId]);
      if (snapRes.length === 0 || snapRes[0].values.length === 0) {
        return { success: false, error: 'Snapshot not found' };
      }
      const conn = dbi.getConnection(snapRes[0].values[0][0]);
      if (!conn) return { success: false, error: 'Connection not found' };

      const known = new Set(dbi.getSnapshotTableNames(snapshotId));
      const wanted = tables.filter(name => known.has(name));
      if (wanted.length === 0) return { success: false, error: 'Selected tables not found in snapshot' };

      const password = decryptPassword(conn.encrypted_password || '');
      return await workerProxy.send('db:executeQuery', {
        conn: { ...conn, password },
        query: { gather: true, tables: wanted, limit: Number(limit) || 0 },
        timeout: 120000,
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };