'use strict';

const fs = require('fs');
const path = require('path');

function exportRepoToJson(db, repoId) {
  const rStmt = db.prepare('SELECT repo_path, name, total_files, total_symbols FROM repositories WHERE id = ?');
  rStmt.bind([repoId]);
  if (!rStmt.step()) { rStmt.free(); return null; }
  const repo = rStmt.getAsObject();
  rStmt.free();

  const outDir = path.join(repo.repo_path, 'MCP', 'graphify', 'symbol-index-storage');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const data = {
    exportedAt: new Date().toISOString(),
    repoPath: repo.repo_path,
    repoName: repo.name,
    files: [],
    symbols: [],
    imports: [],
    overview: { totalFiles: 0, totalSymbols: 0 },
  };

  const fileIdMap = new Map();
  const fStmt = db.prepare('SELECT id, path, language FROM indexed_files WHERE repo_id = ?');
  fStmt.bind([repoId]);
  while (fStmt.step()) {
    const f = fStmt.getAsObject();
    data.files.push({ id: f.id, path: f.path, language: f.language });
    fileIdMap.set(f.id, f.path);
  }
  fStmt.free();
  data.overview.totalFiles = data.files.length;

  const sStmt = db.prepare(`
    SELECT s.name, s.type, s.line, s.column, s.is_exported, s.class_name, s.signature, s.file_id
    FROM symbols s WHERE s.repo_id = ?
  `);
  sStmt.bind([repoId]);
  while (sStmt.step()) {
    const s = sStmt.getAsObject();
    data.symbols.push({
      name: s.name, type: s.type, line: s.line, column: s.column,
      isExported: !!s.is_exported, className: s.class_name || null,
      signature: s.signature || '', filePath: fileIdMap.get(s.file_id) || null,
    });
  }
  sStmt.free();
  data.overview.totalSymbols = data.symbols.length;

  const iStmt = db.prepare(`
    SELECT fi.import_path, fi.import_type, fi.imported_symbols, fi.resolved_file_id, fi.file_id
    FROM file_imports fi WHERE fi.repo_id = ?
  `);
  iStmt.bind([repoId]);
  while (iStmt.step()) {
    const i = iStmt.getAsObject();
    let importedSymbols = [];
    try { importedSymbols = JSON.parse(i.imported_symbols || '[]'); } catch (_) {}
    data.imports.push({
      importPath: i.import_path, importType: i.import_type,
      importedSymbols, sourceFile: fileIdMap.get(i.file_id) || null,
      resolvedFile: i.resolved_file_id ? (fileIdMap.get(i.resolved_file_id) || null) : null,
    });
  }
  iStmt.free();

  const jsonPath = path.join(outDir, 'symbols.json');
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');

  return { symbolsPath: jsonPath, stats: { files: data.files.length, symbols: data.symbols.length, imports: data.imports.length } };
}

module.exports = { exportRepoToJson };
