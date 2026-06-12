const { ipcMain, safeStorage } = require('electron');
const dbi = require('../database/dbInspector.js');
const workerProxy = require('./workerProxy.js');

function encryptPassword(password) {
  if (!password) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(password).toString('base64');
    }
  } catch (_) { }
  return Buffer.from(password).toString('base64');
}

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

function _resolvePassword(conn) {
  if (conn.password) return conn.password;
  if (conn.encrypted_password) return decryptPassword(conn.encrypted_password);
  return '';
}

function register(shared) {
  // ── Heavy: proxied to worker ──
  ipcMain.handle('dbInspector:testConnection', async (event, conn) => {
    try {
      const password = _resolvePassword(conn);
      return await workerProxy.send('db:testConnection', { conn: { ...conn, password } });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dbInspector:scan', async (event, conn) => {
    try {
      const password = _resolvePassword(conn);
      const result = await workerProxy.send('db:scan', { conn: { ...conn, password } });
      if (!result.success) return result;

      const { schema } = result;
      const snapshotId = dbi.createSnapshot(conn.id || 'conn_' + Date.now(), conn.name || conn.database || 'Untitled');

      for (const table of schema.tables) {
        const tableId = dbi.insertTable(snapshotId, table.name, table.rowCount, table.schemaName);
        for (const col of table.columns || []) {
          dbi.insertColumn(tableId, col.name, col.dataType, col.nullable, col.isPk, col.defaultValue, col.ordinal);
        }
        for (const idx of table.indexes || []) {
          dbi.insertIndex(tableId, idx.name, idx.columns, idx.uniqueFlag);
        }
      }
      for (const rel of schema.relationships || []) {
        dbi.insertRelationship(snapshotId, rel.constraintName, rel.sourceTable, rel.sourceColumn, rel.targetTable, rel.targetColumn);
      }

      const graphData = dbi.getGraphData(snapshotId);
      return { success: true, snapshotId, graphData, summary: schema.summary, tables: schema.tables.map(t => t.name) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dbInspector:refreshSnapshot', async (event, snapshotId) => {
    try {
      const snapRes = require('../database/db.js').getDb().exec('SELECT connection_id FROM schema_snapshots WHERE id = ?', [snapshotId]);
      if (snapRes.length === 0 || snapRes[0].values.length === 0) return { success: false, error: 'Snapshot not found' };
      const connId = snapRes[0].values[0][0];
      const conn = dbi.getConnection(connId);
      if (!conn) return { success: false, error: 'Connection not found' };

      const password = decryptPassword(conn.encrypted_password || '');
      const oldTableNames = dbi.getSnapshotTableNames(snapshotId);

      const result = await workerProxy.send('db:scan', { conn: { ...conn, password } });
      if (!result.success) return result;

      const { schema } = result;
      const newTableNames = schema.tables.map(t => t.name);

      const added = [];
      const removed = [];
      const changed = [];

      for (const name of newTableNames) {
        if (!oldTableNames.includes(name)) {
          added.push({ type: 'table', name });
        }
      }
      for (const name of oldTableNames) {
        if (!newTableNames.includes(name)) {
          removed.push({ type: 'table', name });
        }
      }
      for (const name of newTableNames) {
        if (oldTableNames.includes(name)) {
          const newTable = schema.tables.find(t => t.name === name);
          const oldCols = dbi.getTableColumnDetails(snapshotId, name);
          const newColNames = newTable.columns.map(c => c.name);
          const oldColNames = oldCols.map(c => c.name);
          for (const cn of newColNames) {
            if (!oldColNames.includes(cn)) {
              added.push({ type: 'column', table: name, column: cn });
            }
          }
          for (const cn of oldColNames) {
            if (!newColNames.includes(cn)) {
              removed.push({ type: 'column', table: name, column: cn });
            }
          }
          for (const cn of newColNames) {
            if (oldColNames.includes(cn)) {
              const nc = newTable.columns.find(c => c.name === cn);
              const oc = oldCols.find(c => c.name === cn);
              if (nc.dataType !== oc.dataType) {
                changed.push({ type: 'column', table: name, column: cn, from: oc.dataType, to: nc.dataType });
              }
            }
          }
        }
      }

      dbi.deleteSnapshotsForConnection(connId);
      const newSnapshotId = dbi.createSnapshot(connId, conn.name || conn.database || 'Untitled');
      for (const table of schema.tables) {
        const tableId = dbi.insertTable(newSnapshotId, table.name, table.rowCount, table.schemaName);
        for (const col of table.columns || []) {
          dbi.insertColumn(tableId, col.name, col.dataType, col.nullable, col.isPk, col.defaultValue, col.ordinal);
        }
        for (const idx of table.indexes || []) {
          dbi.insertIndex(tableId, idx.name, idx.columns, idx.uniqueFlag);
        }
      }
      for (const rel of schema.relationships || []) {
        dbi.insertRelationship(newSnapshotId, rel.constraintName, rel.sourceTable, rel.sourceColumn, rel.targetTable, rel.targetColumn);
      }

      const graphData = dbi.getGraphData(newSnapshotId);
      return { success: true, snapshotId: newSnapshotId, graphData, summary: schema.summary, tables: schema.tables.map(t => t.name), diff: { added, removed, changed } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dbInspector:executeQuery', async (event, { snapshotId, query }) => {
    const timeout = 30000;
    try {
      const snapRes = require('../database/db.js').getDb().exec('SELECT connection_id FROM schema_snapshots WHERE id = ?', [snapshotId]);
      if (snapRes.length === 0 || snapRes[0].values.length === 0) return { success: false, error: 'Snapshot not found' };
      const connId = snapRes[0].values[0][0];
      const conn = dbi.getConnection(connId);
      if (!conn) return { success: false, error: 'Connection not found' };

      const password = decryptPassword(conn.encrypted_password || '');
      return await workerProxy.send('db:executeQuery', { conn: { ...conn, password }, query, timeout });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Light: local DB operations (keep in main process) ──
  ipcMain.handle('dbInspector:listConnections', async () => {
    const rows = dbi.listConnections();
    return rows.map(r => ({
      id: r[0], name: r[1], type: r[2], host: r[3], port: r[4],
      database: r[5], username: r[6], file_path: r[7],
      created_at: r[8], updated_at: r[9],
    }));
  });

  ipcMain.handle('dbInspector:saveConnection', async (event, conn) => {
    try {
      const encrypted = conn.password ? encryptPassword(conn.password) : conn.encrypted_password;
      dbi.saveConnection({
        id: conn.id || dbi.genId(),
        name: conn.name,
        type: conn.type,
        host: conn.host || null,
        port: conn.port || null,
        database: conn.database || null,
        username: conn.username || null,
        encrypted_password: encrypted || null,
        file_path: conn.file_path || null,
        connection_string: conn.connection_string || null,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dbInspector:deleteConnection', async (event, id) => {
    dbi.deleteConnection(id);
    return { success: true };
  });

  ipcMain.handle('dbInspector:getSnapshots', async (event, connectionId) => {
    const rows = dbi.listSnapshots(connectionId);
    return rows.map(r => ({ id: r[0], projectName: r[1], createdAt: r[2] }));
  });

  ipcMain.handle('dbInspector:getGraphData', async (event, snapshotId) => {
    return dbi.getGraphData(snapshotId);
  });

  ipcMain.handle('dbInspector:getTableDetails', async (event, snapshotId, tableName) => {
    return dbi.getTableDetails(snapshotId, tableName);
  });

  ipcMain.handle('dbInspector:encrypt', async (event, text) => {
    return encryptPassword(text);
  });

  // ── Seed Scripts ──
  ipcMain.handle('dbInspector:listSeeds', async (event, snapshotId) => {
    try {
      return { success: true, seeds: dbi.listSeeds(snapshotId) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dbInspector:saveSeed', async (event, data) => {
    try {
      const id = dbi.saveSeed(data);
      return { success: true, id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dbInspector:deleteSeed', async (event, id) => {
    try {
      dbi.deleteSeed(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
