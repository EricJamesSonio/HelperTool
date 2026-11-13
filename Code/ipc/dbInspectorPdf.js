const { ipcMain, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dbi = require('../database/dbInspector.js');
const { getDb } = require('../database/db.js');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtCount(n) {
  return typeof n === 'number' && n >= 0 ? n.toLocaleString('en-US') : '-';
}

function getSnapshotMeta(snapshotId) {
  const r = getDb().exec('SELECT project_name, created_at FROM schema_snapshots WHERE id = ?', [snapshotId]);
  if (r.length === 0 || r[0].values.length === 0) return null;
  return { name: r[0].values[0][0], createdAt: r[0].values[0][1] };
}

function collectSchema(snapshotId) {
  const names = dbi.getSnapshotTableNames(snapshotId);
  const tables = [];
  const relationships = [];
  for (const name of names) {
    const d = dbi.getTableDetails(snapshotId, name);
    if (!d) continue;
    tables.push(d);
    for (const r of d.relationships) {
      relationships.push({
        constraint: r.constraint,
        sourceTable: d.name,
        sourceColumn: r.column,
        targetTable: r.targetTable,
        targetColumn: r.targetColumn,
      });
    }
  }
  return { tables, relationships };
}

function buildHtml(meta, tables, relationships) {
  const totalColumns = tables.reduce((n, t) => n + t.columns.length, 0);

  const tableBlocks = tables.map(t => {
    const fkCols = new Set(t.relationships.map(r => r.column));
    const fkTarget = {};
    for (const r of t.relationships) fkTarget[r.column] = r.targetTable + '.' + r.targetColumn;

    const colRows = t.columns.map(c => {
      const flags = [];
      if (c.isPk) flags.push('<span class="b pk">PK</span>');
      if (fkCols.has(c.name)) flags.push('<span class="b fk">FK</span>');
      if (!c.nullable) flags.push('<span class="b nn">NOT NULL</span>');
      const ref = fkTarget[c.name] ? '<div class="ref">&rarr; ' + esc(fkTarget[c.name]) + '</div>' : '';
      return '<tr>'
        + '<td class="mono">' + esc(c.name) + ref + '</td>'
        + '<td class="mono">' + esc(c.type) + '</td>'
        + '<td>' + flags.join(' ') + '</td>'
        + '<td class="mono dim">' + esc(c.default) + '</td>'
        + '</tr>';
    }).join('');

    const idxRows = t.indexes.map(i => {
      return '<tr>'
        + '<td class="mono">' + esc(i.name) + '</td>'
        + '<td class="mono">' + esc(i.columns.join(', ')) + '</td>'
        + '<td>' + (i.unique ? '<span class="b uq">UNIQUE</span>' : '') + '</td>'
        + '</tr>';
    }).join('');

    const idxBlock = t.indexes.length
      ? '<table class="sub"><thead><tr><th>Index</th><th>Columns</th><th></th></tr></thead><tbody>' + idxRows + '</tbody></table>'
      : '';

    return '<section class="tbl">'
      + '<div class="tbl-head"><h2>' + esc(t.name) + '</h2><span class="rows">' + fmtCount(t.rowCount) + ' rows</span></div>'
      + '<table><thead><tr><th>Column</th><th>Type</th><th>Constraints</th><th>Default</th></tr></thead><tbody>'
      + (colRows || '<tr><td colspan="4" class="dim">No columns</td></tr>')
      + '</tbody></table>'
      + idxBlock
      + '</section>';
  }).join('');

  const relRows = relationships.map(r => {
    return '<tr>'
      + '<td class="mono">' + esc(r.sourceTable) + '.' + esc(r.sourceColumn) + '</td>'
      + '<td class="arrow">&rarr;</td>'
      + '<td class="mono">' + esc(r.targetTable) + '.' + esc(r.targetColumn) + '</td>'
      + '<td class="mono dim">' + esc(r.constraint) + '</td>'
      + '</tr>';
  }).join('');

  const relSection = '<section class="rel"><h1>Relationships</h1>'
    + (relationships.length
      ? '<table><thead><tr><th>From</th><th></th><th>To</th><th>Constraint</th></tr></thead><tbody>' + relRows + '</tbody></table>'
      : '<div class="dim">No relationships</div>')
    + '</section>';

  const when = meta && meta.createdAt ? esc(meta.createdAt) : '';

  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(meta ? meta.name : 'Database Schema') + '</title>'
    + '<style>'
    + '@page { size: A4; margin: 14mm 12mm; }'
    + '* { box-sizing: border-box; }'
    + 'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5pt; color: #1b2233; margin: 0; }'
    + '.mono { font-family: Consolas, "Courier New", monospace; font-size: 8.8pt; }'
    + '.dim { color: #7a859c; }'
    + '.cover { border-bottom: 3px solid #3b82f6; padding-bottom: 10px; margin-bottom: 18px; }'
    + '.cover h1 { font-size: 22pt; margin: 0 0 4px; }'
    + '.cover .meta { color: #5b6780; font-size: 10pt; }'
    + '.stats { display: flex; gap: 10px; margin-top: 10px; }'
    + '.stat { background: #f1f5fb; border-radius: 6px; padding: 6px 12px; }'
    + '.stat b { display: block; font-size: 14pt; color: #2563eb; }'
    + '.stat span { font-size: 8pt; color: #5b6780; text-transform: uppercase; letter-spacing: .04em; }'
    + 'h1 { font-size: 15pt; margin: 0 0 8px; }'
    + 'section.tbl { margin-bottom: 14px; page-break-inside: avoid; }'
    + '.tbl-head { display: flex; justify-content: space-between; align-items: baseline; background: #1e2a44; color: #fff; padding: 5px 10px; border-radius: 5px 5px 0 0; }'
    + '.tbl-head h2 { font-size: 11.5pt; margin: 0; font-family: Consolas, "Courier New", monospace; }'
    + '.rows { font-size: 8.5pt; color: #b9c4dc; }'
    + 'table { width: 100%; border-collapse: collapse; }'
    + 'thead { display: table-header-group; }'
    + 'th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #5b6780; background: #eef2f9; padding: 4px 8px; }'
    + 'td { padding: 4px 8px; border-bottom: 1px solid #e3e8f2; vertical-align: top; word-break: break-word; }'
    + 'tr { page-break-inside: avoid; }'
    + 'table.sub { margin-top: 6px; }'
    + '.ref { font-size: 7.8pt; color: #7a859c; font-family: Consolas, monospace; }'
    + '.b { display: inline-block; font-size: 7pt; font-weight: 700; padding: 1px 5px; border-radius: 3px; }'
    + '.pk { background: #fde7b0; color: #8a5a00; }'
    + '.fk { background: #d5e6ff; color: #1d4ed8; }'
    + '.nn { background: #e6e9f0; color: #4b5670; }'
    + '.uq { background: #d9f5e5; color: #166534; }'
    + 'section.rel { page-break-before: always; }'
    + '.arrow { width: 24px; color: #3b82f6; text-align: center; }'
    + '</style></head><body>'
    + '<div class="cover"><h1>' + esc(meta ? meta.name : 'Database Schema') + '</h1>'
    + '<div class="meta">Schema snapshot' + (when ? ' &middot; ' + when : '') + '</div>'
    + '<div class="stats">'
    + '<div class="stat"><b>' + tables.length + '</b><span>Tables</span></div>'
    + '<div class="stat"><b>' + totalColumns + '</b><span>Columns</span></div>'
    + '<div class="stat"><b>' + relationships.length + '</b><span>Relationships</span></div>'
    + '</div></div>'
    + tableBlocks
    + relSection
    + '</body></html>';
}

async function renderPdf(html) {
  const tmpFile = path.join(os.tmpdir(), 'dbi_schema_' + Date.now() + '.html');
  fs.writeFileSync(tmpFile, html, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadFile(tmpFile);
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' },
    });
  } finally {
    try { win.destroy(); } catch (_) {}
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

function register() {
  ipcMain.handle('dbInspector:exportPdf', async (event, snapshotId) => {
    try {
      const meta = getSnapshotMeta(snapshotId);
      if (!meta) return { success: false, error: 'Snapshot not found' };

      const { tables, relationships } = collectSchema(snapshotId);
      if (tables.length === 0) return { success: false, error: 'No tables in this snapshot' };

      const parent = BrowserWindow.fromWebContents(event.sender);
      const safeName = String(meta.name || 'database').replace(/[^a-z0-9_-]+/gi, '_');
      const pick = await dialog.showSaveDialog(parent, {
        title: 'Save schema as PDF',
        defaultPath: safeName + '_schema.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (pick.canceled || !pick.filePath) return { success: false, canceled: true };

      const pdf = await renderPdf(buildHtml(meta, tables, relationships));
      fs.writeFileSync(pick.filePath, pdf);
      return { success: true, filePath: pick.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };