const { getDb, save } = require('./db.js');

function createInspectorSchema() {
  const db = getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS db_connections (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      type              TEXT NOT NULL,
      host              TEXT,
      port              INTEGER,
      database          TEXT,
      username          TEXT,
      encrypted_password TEXT,
      file_path         TEXT,
      connection_string TEXT,
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_snapshots (
      id            TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      project_name  TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (connection_id) REFERENCES db_connections(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_tables (
      id          TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      name        TEXT NOT NULL,
      row_count   INTEGER DEFAULT 0,
      schema_name TEXT,
      FOREIGN KEY (snapshot_id) REFERENCES schema_snapshots(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_columns (
      id              TEXT PRIMARY KEY,
      table_id        TEXT NOT NULL,
      name            TEXT NOT NULL,
      data_type       TEXT,
      nullable        INTEGER DEFAULT 1,
      is_primary_key  INTEGER DEFAULT 0,
      default_value   TEXT,
      ordinal_position INTEGER,
      FOREIGN KEY (table_id) REFERENCES schema_tables(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_relationships (
      id              TEXT PRIMARY KEY,
      snapshot_id     TEXT NOT NULL,
      constraint_name TEXT,
      source_table    TEXT NOT NULL,
      source_column   TEXT NOT NULL,
      target_table    TEXT NOT NULL,
      target_column   TEXT NOT NULL,
      FOREIGN KEY (snapshot_id) REFERENCES schema_snapshots(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_indexes (
      id          TEXT PRIMARY KEY,
      table_id    TEXT NOT NULL,
      name        TEXT NOT NULL,
      columns     TEXT,
      unique_flag INTEGER DEFAULT 0,
      FOREIGN KEY (table_id) REFERENCES schema_tables(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS seed_scripts (
      id          TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      name        TEXT NOT NULL,
      sql_content TEXT NOT NULL DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (snapshot_id) REFERENCES schema_snapshots(id) ON DELETE CASCADE
    )
  `);
  save();
}

function genId() { return 'dbi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

function listConnections() {
  const db = getDb();
  const r = db.exec('SELECT id, name, type, host, port, database, username, file_path, created_at, updated_at FROM db_connections ORDER BY updated_at DESC');
  return r.length > 0 ? r[0].values : [];
}

function getConnection(id) {
  const db = getDb();
  const r = db.exec('SELECT * FROM db_connections WHERE id = ?', [id]);
  if (r.length === 0 || r[0].values.length === 0) return null;
  const row = r[0].values[0];
  return {
    id: row[0], name: row[1], type: row[2], host: row[3], port: row[4],
    database: row[5], username: row[6], encrypted_password: row[7],
    file_path: row[8], connection_string: row[9], created_at: row[10], updated_at: row[11],
  };
}

function saveConnection(conn) {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(`INSERT OR REPLACE INTO db_connections (id, name, type, host, port, database, username, encrypted_password, file_path, connection_string, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [conn.id, conn.name, conn.type, conn.host || null, conn.port || null, conn.database || null, conn.username || null, conn.encrypted_password || null, conn.file_path || null, conn.connection_string || null, now]);
  save();
}

function deleteConnection(id) {
  const db = getDb();
  db.run('DELETE FROM db_connections WHERE id = ?', [id]);
  save();
}

function createSnapshot(connectionId, projectName) {
  const db = getDb();
  const id = genId();
  db.run('INSERT INTO schema_snapshots (id, connection_id, project_name) VALUES (?, ?, ?)', [id, connectionId, projectName]);
  save();
  return id;
}

function deleteSnapshotsForConnection(connectionId) {
  const db = getDb();
  db.run('DELETE FROM schema_snapshots WHERE connection_id = ?', [connectionId]);
  save();
}

function listSnapshots(connectionId) {
  const db = getDb();
  const r = db.exec('SELECT id, project_name, created_at FROM schema_snapshots WHERE connection_id = ? ORDER BY created_at DESC', [connectionId]);
  return r.length > 0 ? r[0].values : [];
}

function insertTable(snapshotId, name, rowCount, schemaName) {
  const db = getDb();
  const id = genId();
  db.run('INSERT INTO schema_tables (id, snapshot_id, name, row_count, schema_name) VALUES (?, ?, ?, ?, ?)',
    [id, snapshotId, name, rowCount || 0, schemaName || null]);
  return id;
}

function insertColumn(tableId, name, dataType, nullable, isPk, defaultValue, ordinal) {
  const db = getDb();
  db.run('INSERT INTO schema_columns (id, table_id, name, data_type, nullable, is_primary_key, default_value, ordinal_position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [genId(), tableId, name, dataType || null, nullable ? 1 : 0, isPk ? 1 : 0, defaultValue || null, ordinal || 0]);
}

function insertRelationship(snapshotId, constraintName, sourceTable, sourceColumn, targetTable, targetColumn) {
  const db = getDb();
  db.run('INSERT INTO schema_relationships (id, snapshot_id, constraint_name, source_table, source_column, target_table, target_column) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [genId(), snapshotId, constraintName || null, sourceTable, sourceColumn, targetTable, targetColumn]);
}

function insertIndex(tableId, name, columns, uniqueFlag) {
  const db = getDb();
  db.run('INSERT INTO schema_indexes (id, table_id, name, columns, unique_flag) VALUES (?, ?, ?, ?, ?)',
    [genId(), tableId, name, JSON.stringify(columns || []), uniqueFlag ? 1 : 0]);
}

function getGraphData(snapshotId) {
  const db = getDb();
  const tRes = db.exec('SELECT id, name, row_count FROM schema_tables WHERE snapshot_id = ?', [snapshotId]);
  const rRes = db.exec('SELECT source_table, source_column, target_table, target_column, constraint_name FROM schema_relationships WHERE snapshot_id = ?', [snapshotId]);
  const tableRows = tRes.length > 0 ? tRes[0].values : [];
  const relRows = rRes.length > 0 ? rRes[0].values : [];

  const nodes = [];
  const nodeMap = {};
  for (let i = 0; i < tableRows.length; i++) {
    const [tid, name, rowCount] = tableRows[i];
    const nodeId = 't_' + tid;
    nodeMap[name] = nodeId;
    nodes.push({
      id: nodeId,
      type: 'table',
      position: { x: 0, y: 0 },
      data: { label: name, rowCount: rowCount || 0, colorIndex: i },
    });
  }

  const edges = [];
  for (const [srcTable, srcCol, tgtTable, tgtCol, cName] of relRows) {
    const src = nodeMap[srcTable];
    const tgt = nodeMap[tgtTable];
    if (src && tgt) {
      edges.push({
        id: src + '-' + tgt,
        source: src,
        target: tgt,
        label: cName || '',
        sourceHandle: srcCol,
        targetHandle: tgtCol,
      });
    }
  }

  return { nodes, edges };
}

function getTableDetails(snapshotId, tableName) {
  const db = getDb();
  const tR = db.exec('SELECT id, name, row_count FROM schema_tables WHERE snapshot_id = ? AND name = ?', [snapshotId, tableName]);
  if (tR.length === 0 || tR[0].values.length === 0) return null;
  const [tid, tname, rowCount] = tR[0].values[0];

  const cR = db.exec('SELECT name, data_type, nullable, is_primary_key, default_value FROM schema_columns WHERE table_id = ? ORDER BY ordinal_position', [tid]);
  const iR = db.exec('SELECT name, columns, unique_flag FROM schema_indexes WHERE table_id = ?', [tid]);
  const relR = db.exec('SELECT constraint_name, source_column, target_table, target_column FROM schema_relationships WHERE snapshot_id = ? AND source_table = ?', [snapshotId, tableName]);
  const refR = db.exec('SELECT source_table, source_column, constraint_name FROM schema_relationships WHERE snapshot_id = ? AND target_table = ?', [snapshotId, tableName]);
  const colRows = cR.length > 0 ? cR[0].values : [];
  const idxRows = iR.length > 0 ? iR[0].values : [];
  const relRows = relR.length > 0 ? relR[0].values : [];
  const refByRows = refR.length > 0 ? refR[0].values : [];

  return {
    name: tname,
    rowCount: rowCount || 0,
    columns: colRows.map(r => ({ name: r[0], type: r[1], nullable: !!r[2], isPk: !!r[3], default: r[4] })),
    indexes: idxRows.map(r => ({ name: r[0], columns: JSON.parse(r[1] || '[]'), unique: !!r[2] })),
    relationships: relRows.map(r => ({ constraint: r[0], column: r[1], targetTable: r[2], targetColumn: r[3] })),
    referencedBy: refByRows.map(r => ({ table: r[0], column: r[1], constraint: r[2] })),
  };
}

function getSnapshotTableNames(snapshotId) {
  const db = getDb();
  const r = db.exec('SELECT name FROM schema_tables WHERE snapshot_id = ? ORDER BY name', [snapshotId]);
  return r.length > 0 ? r[0].values.map(v => v[0]) : [];
}

function getTableColumnDetails(snapshotId, tableName) {
  const db = getDb();
  const tR = db.exec('SELECT id FROM schema_tables WHERE snapshot_id = ? AND name = ?', [snapshotId, tableName]);
  if (tR.length === 0 || tR[0].values.length === 0) return [];
  const tid = tR[0].values[0][0];
  const cR = db.exec('SELECT name, data_type, is_primary_key, nullable FROM schema_columns WHERE table_id = ? ORDER BY ordinal_position', [tid]);
  return cR.length > 0 ? cR[0].values.map(r => ({ name: r[0], dataType: r[1], isPk: !!r[2], nullable: !!r[3] })) : [];
}

// ── Seed Scripts ────────────────────────────────────────────

function listSeeds(snapshotId) {
  const db = getDb();
  const r = db.exec('SELECT id, name, sql_content, created_at, updated_at FROM seed_scripts WHERE snapshot_id = ? ORDER BY updated_at DESC', [snapshotId]);
  return r.length > 0 ? r[0].values.map(row => ({
    id: row[0], name: row[1], sqlContent: row[2],
    createdAt: row[3], updatedAt: row[4],
  })) : [];
}

function saveSeed({ id, snapshotId, name, sqlContent }) {
  const db = getDb();
  const now = new Date().toISOString();
  const seedId = id || genId();
  if (id) {
    db.run('UPDATE seed_scripts SET name = ?, sql_content = ?, updated_at = ? WHERE id = ?', [name, sqlContent, now, id]);
  } else {
    db.run('INSERT INTO seed_scripts (id, snapshot_id, name, sql_content, updated_at) VALUES (?, ?, ?, ?, ?)',
      [seedId, snapshotId, name, sqlContent, now]);
  }
  save();
  return seedId;
}

function deleteSeed(id) {
  const db = getDb();
  db.run('DELETE FROM seed_scripts WHERE id = ?', [id]);
  save();
}

module.exports = {
  createInspectorSchema,
  listConnections, getConnection, saveConnection, deleteConnection,
  createSnapshot, deleteSnapshotsForConnection, listSnapshots,
  insertTable, insertColumn, insertRelationship, insertIndex,
  getGraphData, getTableDetails, getSnapshotTableNames, getTableColumnDetails,
  listSeeds, saveSeed, deleteSeed,
  genId,
};
