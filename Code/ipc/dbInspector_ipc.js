const { ipcMain, safeStorage } = require('electron');
const fs = require('fs');
const dbi = require('../database/dbInspector.js');

let _SQL = null;
async function getSqlJs() {
  if (!_SQL) {
    const initSqlJs = require('sql.js/dist/sql-wasm.js');
    _SQL = await initSqlJs();
  }
  return _SQL;
}

function wrapSqlJsDb(sqlJsDb) {
  return {
    prepare(sql) {
      const stmt = sqlJsDb.prepare(sql);
      let _cols = null;
      return {
        columns() {
          if (!_cols) _cols = stmt.getColumnNames().map(n => ({ name: n }));
          return _cols;
        },
        all() {
          this.columns();
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
        get() {
          this.columns();
          const has = stmt.step();
          const row = has ? stmt.getAsObject() : undefined;
          stmt.free();
          return row;
        },
        free() { stmt.free(); },
      };
    },
    close() { sqlJsDb.close(); },
  };
}

function register(shared) {
  ipcMain.handle('dbInspector:testConnection', async (event, conn) => {
    try {
      const client = await connect(conn);
      await client.end();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dbInspector:scan', async (event, conn) => {
    try {
      const client = await connect(conn);
      const schema = await extractSchema(client, conn.type);

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

      const password = conn.encrypted_password ? decryptPassword(conn.encrypted_password) : '';
      const client = await connect({ ...conn, password });
      const schema = await extractSchema(client, conn.type);

      const oldTableNames = dbi.getSnapshotTableNames(snapshotId);
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

  ipcMain.handle('dbInspector:executeQuery', async (event, { snapshotId, query }) => {
    const timeout = 30000;
    try {
      const snapRes = require('../database/db.js').getDb().exec('SELECT connection_id FROM schema_snapshots WHERE id = ?', [snapshotId]);
      if (snapRes.length === 0 || snapRes[0].values.length === 0) return { success: false, error: 'Snapshot not found' };
      const connId = snapRes[0].values[0][0];
      const conn = dbi.getConnection(connId);
      if (!conn) return { success: false, error: 'Connection not found' };

      const password = conn.encrypted_password ? decryptPassword(conn.encrypted_password) : '';
      const client = await connect({ ...conn, password });
      const timer = setTimeout(() => { try { client.end(); } catch (_) {} }, timeout);

      try {
        const result = await runQuery(client, conn.type, query);
        clearTimeout(timer);
        try { await client.end(); } catch (_) {}
        return { success: true, ...result };
      } catch (err) {
        clearTimeout(timer);
        try { await client.end(); } catch (_) {}
        return { success: false, error: err.message };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Seed Scripts ──────────────────────────────────────────────────────────────
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

function encryptPassword(password) {
  if (!password) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(password).toString('base64');
    }
  } catch (_) { /* fallback */ }
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

async function connect(conn) {
  switch (conn.type) {
    case 'postgres': return connectPostgres(conn);
    case 'mysql':    return connectMysql(conn);
    case 'sqlite':   return connectSqlite(conn);
    case 'mongodb':  return connectMongo(conn);
    default: throw new Error('Unsupported database type: ' + conn.type);
  }
}

async function connectPostgres(conn) {
  const { Client } = require('pg');
  const client = new Client({
    host: conn.host || 'localhost',
    port: conn.port || 5432,
    database: conn.database,
    user: conn.username,
    password: conn.password,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  return client;
}

async function connectMysql(conn) {
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: conn.host || 'localhost',
    port: conn.port || 3306,
    database: conn.database,
    user: conn.username,
    password: conn.password,
    connectTimeout: 5000,
  });
  return connection;
}

async function connectSqlite(conn) {
  if (!conn.file_path) throw new Error('SQLite requires a file path');
  if (!fs.existsSync(conn.file_path)) throw new Error('SQLite file not found: ' + conn.file_path);
  const SQL = await getSqlJs();
  const buffer = fs.readFileSync(conn.file_path);
  const db = new SQL.Database(buffer);
  return wrapSqlJsDb(db);
}

async function connectMongo(conn) {
  const { MongoClient } = require('mongodb');
  const url = conn.connection_string || `mongodb://${conn.username ? encodeURIComponent(conn.username) + ':' + encodeURIComponent(conn.password) + '@' : ''}${conn.host || 'localhost'}:${conn.port || 27017}/${conn.database || ''}`;
  const client = new MongoClient(url, { connectTimeoutMS: 5000, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  return client;
}

async function extractSchema(client, type) {
  switch (type) {
    case 'postgres': return extractPostgresSchema(client);
    case 'mysql':    return extractMysqlSchema(client);
    case 'sqlite':   return extractSqliteSchema(client);
    case 'mongodb':  return extractMongoSchema(client);
    default: throw new Error('Unsupported type: ' + type);
  }
}

// ── PostgreSQL Schema Extractor ──
async function extractPostgresSchema(client) {
  const tables = [];
  let totalTables = 0, totalColumns = 0;

  const tableRes = await client.query(`
    SELECT table_name, (SELECT reltuples::integer FROM pg_class WHERE relname = table_name) AS row_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  for (const row of tableRes.rows) {
    totalTables++;
    const tableName = row.table_name;
    const columns = [];
    const indexes = [];

    const colRes = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default, ordinal_position
      FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position
    `, [tableName]);

    const pkRes = await client.query(`
      SELECT kcu.column_name FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
    `, [tableName]);
    const pkCols = new Set(pkRes.rows.map(r => r.column_name));

    for (const c of colRes.rows) {
      totalColumns++;
      columns.push({
        name: c.column_name,
        dataType: c.data_type,
        nullable: c.is_nullable === 'YES',
        isPk: pkCols.has(c.column_name),
        defaultValue: c.column_default,
        ordinal: c.ordinal_position,
      });
    }

    const idxRes = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1
    `, [tableName]);
    for (const i of idxRes.rows) {
      const cols = i.indexdef.match(/\(([^)]+)\)/);
      indexes.push({
        name: i.indexname,
        columns: cols ? cols[1].split(',').map(s => s.trim()) : [],
        uniqueFlag: i.indexdef.toUpperCase().includes('UNIQUE'),
      });
    }

    tables.push({ name: tableName, rowCount: row.row_count || 0, schemaName: 'public', columns, indexes });
  }

  const fkRes = await client.query(`
    SELECT tc.constraint_name, kcu.table_name AS source_table, kcu.column_name,
           ccu.table_name AS target_table, ccu.column_name AS target_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_name = kcu.table_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
  `);
  const relationships = fkRes.rows.map(r => ({
    constraintName: r.constraint_name,
    sourceTable: r.source_table,
    sourceColumn: r.column_name,
    targetTable: r.target_table,
    targetColumn: r.target_column,
  }));

  await client.end();
  return { tables, relationships, summary: { tables: totalTables, columns: totalColumns } };
}

// ── MySQL Schema Extractor ──
async function extractMysqlSchema(client) {
  const tables = [];
  const relationships = [];
  let totalTables = 0, totalColumns = 0;
  const dbName = client.config.database;

  const [tableRows] = await client.query(`
    SELECT table_name, table_rows FROM information_schema.tables
    WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name
  `, [dbName]);

  for (const row of tableRows) {
    totalTables++;
    const tableName = row.TABLE_NAME;
    const columns = [];
    const indexes = [];

    const [colRows] = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default, ordinal_position, column_key
      FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position
    `, [dbName, tableName]);

    for (const c of colRows) {
      totalColumns++;
      columns.push({
        name: c.COLUMN_NAME,
        dataType: c.DATA_TYPE,
        nullable: c.IS_NULLABLE === 'YES',
        isPk: c.COLUMN_KEY === 'PRI',
        defaultValue: c.COLUMN_DEFAULT,
        ordinal: c.ORDINAL_POSITION,
      });
    }

    const [idxRows] = await client.query(`SHOW INDEX FROM \`${tableName}\` FROM \`${dbName}\``);
    const idxMap = {};
    for (const i of idxRows) {
      if (!idxMap[i.Key_name]) idxMap[i.Key_name] = { name: i.Key_name, columns: [], unique: !i.Non_unique };
      idxMap[i.Key_name].columns.push(i.Column_name);
    }
    for (const key in idxMap) {
      indexes.push(idxMap[key]);
    }

    tables.push({ name: tableName, rowCount: row.TABLE_ROWS || 0, schemaName: dbName, columns, indexes });
  }

  const [fkRows] = await client.query(`
    SELECT tc.constraint_name, kcu.table_name AS source_table, kcu.column_name, kcu.referenced_table_name, kcu.referenced_column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = ? AND tc.constraint_type = 'FOREIGN KEY'
  `, [dbName]);
  for (const r of fkRows) {
    relationships.push({
      constraintName: r.constraint_name,
      sourceTable: r.source_table,
      sourceColumn: r.column_name,
      targetTable: r.referenced_table_name,
      targetColumn: r.referenced_column_name,
    });
  }

  await client.end();
  return { tables, relationships, summary: { tables: totalTables, columns: totalColumns } };
}

// ── SQLite Schema Extractor ──
async function extractSqliteSchema(client) {
  const tables = [];
  const relationships = [];
  let totalTables = 0, totalColumns = 0;

  const tableRows = client.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();

  for (const row of tableRows) {
    totalTables++;
    const tableName = row.name;
    const columns = [];
    const indexes = [];

    const colInfos = client.prepare(`PRAGMA table_info(\`${tableName}\`)`).all();
    for (const c of colInfos) {
      totalColumns++;
      columns.push({
        name: c.name,
        dataType: c.type || 'TEXT',
        nullable: !c.notnull,
        isPk: !!c.pk,
        defaultValue: c.dflt_value,
        ordinal: c.cid,
      });
    }

    const idxList = client.prepare(`PRAGMA index_list(\`${tableName}\`)`).all();
    for (const i of idxList) {
      const idxInfo = client.prepare(`PRAGMA index_info(\`${i.name}\`)`).all();
      indexes.push({
        name: i.name,
        columns: idxInfo.map(ii => ii.name),
        uniqueFlag: !!i.unique,
      });
    }

    let rowCount = 0;
    try {
      const countRow = client.prepare(`SELECT COUNT(*) as cnt FROM \`${tableName}\``).get();
      rowCount = countRow.cnt;
    } catch (_) { }

    tables.push({ name: tableName, rowCount, schemaName: null, columns, indexes });

    const fkInfos = client.prepare(`PRAGMA foreign_key_list(\`${tableName}\`)`).all();
    for (const fk of fkInfos) {
      relationships.push({
        constraintName: fk.id ? `fk_${tableName}_${fk.id}` : null,
        sourceTable: tableName,
        sourceColumn: fk.from,
        targetTable: fk.table,
        targetColumn: fk.to,
      });
    }
  }

  client.close();
  return { tables, relationships, summary: { tables: totalTables, columns: totalColumns } };
}

// ── MongoDB Schema Extractor ──
async function extractMongoSchema(client) {
  const tables = [];
  const relationships = [];
  let totalTables = 0, totalColumns = 0;
  const db = client.db();

  const collections = await db.listCollections().toArray();

  for (const coll of collections) {
    totalTables++;
    const name = coll.name;
    const columns = [];
    const fieldTypes = {};
    let docCount = 0;

    try {
      docCount = await db.collection(name).countDocuments({}, { timeout: 3000 });
      const sample = await db.collection(name).find().limit(100).toArray();
      for (const doc of sample) {
        for (const key of Object.keys(doc)) {
          if (key === '_id') continue;
          const val = doc[key];
          let type = typeof val;
          if (val === null) type = 'null';
          else if (Array.isArray(val)) type = 'array';
          else if (type === 'object') type = 'object';
          if (!fieldTypes[key]) fieldTypes[key] = new Set();
          fieldTypes[key].add(type);
        }
      }
    } catch (_) { }

    for (const [fieldName, types] of Object.entries(fieldTypes)) {
      totalColumns++;
      columns.push({
        name: fieldName,
        dataType: Array.from(types).join('|'),
        nullable: types.has('null'),
        isPk: fieldName === '_id',
        defaultValue: null,
        ordinal: 0,
      });
    }

    tables.push({ name, rowCount: docCount, schemaName: db.databaseName, columns, indexes: [] });
  }

  await client.close();
  return { tables, relationships, summary: { tables: totalTables, columns: totalColumns } };
}

async function runQuery(client, type, query) {
  switch (type) {
    case 'postgres': return runPostgresQuery(client, query);
    case 'mysql':    return runMysqlQuery(client, query);
    case 'sqlite':   return runSqliteQuery(client, query);
    case 'mongodb':  return runMongoQuery(client, query);
    default: throw new Error('Unsupported type: ' + type);
  }
}

async function runPostgresQuery(client, query) {
  const result = await client.query(query);
  if (result.rows && result.rows.length !== undefined) {
    const columns = result.fields ? result.fields.map(f => f.name) : [];
    return { columns, rows: result.rows.map(r => columns.map(c => r[c])) };
  }
  return { columns: [], rows: [], affectedCount: result.rowCount || 0 };
}

async function runMysqlQuery(client, query) {
  const [rows, fields] = await client.query(query);
  if (Array.isArray(rows)) {
    const columns = fields ? fields.map(f => f.name) : (rows.length > 0 ? Object.keys(rows[0]) : []);
    return { columns, rows: rows.map(r => columns.map(c => r[c])) };
  }
  return { columns: [], rows: [], affectedCount: rows.affectedRows || 0 };
}

async function runSqliteQuery(client, query) {
  const stmt = client.prepare(query);
  const columns = stmt.columns().map(c => c.name);
  const rows = stmt.all();
  stmt.free();
  return { columns, rows: rows.map(r => columns.map(c => r[c])) };
}

async function runMongoQuery(client, query) {
  const db = client.db();
  const parsed = JSON.parse(query.replace(/'/g, '"'));
  const collName = parsed.collection;
  if (!collName) throw new Error('MongoDB query requires { collection, ... }');
  const coll = db.collection(collName);
  const pipeline = parsed.pipeline || [];
  const docs = await coll.aggregate(pipeline).toArray();
  const columns = docs.length > 0 ? Object.keys(docs[0]) : [];
  return { columns, rows: docs.map(d => columns.map(c => d[c])) };
}

module.exports = { register };
