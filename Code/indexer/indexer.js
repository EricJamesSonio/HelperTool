const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const parser = require('./parser');
const resolver = require('./resolver');
const db = require('../database/db');

let _repoDb = require('../database/repositories');
let _fileDb = require('../database/indexedFiles');
let _symbolDb = require('../database/symbols');
let _importDb = require('../database/imports');

const BATCH_SIZE = 8;
const PROGRESS_THROTTLE_PCT = 1; // at most one IPC per 1% change

function detectLanguage(ext) {
  const map = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.py': 'python',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'css',
    '.less': 'css',
  };
  return map[ext] || null;
}

async function indexRepo(repoPath, docignoreUtils, onProgress, onError) {
  const repoName = path.basename(repoPath);
  const repoId = _repoDb.upsert(repoPath, repoName, {});

  const allFiles = await asyncWalkDir(repoPath, repoPath, docignoreUtils);

  let indexedCount = 0;
  let symbolCount = 0;
  const totalFiles = allFiles.length;
  let lastReportedPct = -1;

  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    const batch = allFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(filePath => indexFile(repoId, repoPath, filePath))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        symbolCount += result.value.symbolsCount;
      } else if (result.status === 'rejected' && onError) {
        onError(result.reason?.message || 'Unknown error');
      }
      indexedCount++;
    }

    // Throttled progress
    const pct = Math.round((indexedCount / totalFiles) * 100);
    if (pct !== lastReportedPct && onProgress) {
      lastReportedPct = pct;
      onProgress({
        current: indexedCount,
        total: totalFiles,
        phase: 'indexing',
        percent: pct,
      });
    }

  }

  _repoDb.markIndexed(repoId, totalFiles, symbolCount);
  db.saveImmediate();

  return { totalFiles, symbolCount };
}

async function indexFile(repoId, repoPath, relPath) {
  const fullPath = path.join(repoPath, relPath);
  let stat;
  try { stat = await fs.promises.stat(fullPath); } catch { return null; }

  const ext = path.extname(relPath).toLowerCase();
  const language = detectLanguage(ext);
  const existingFile = _fileDb.getByRepoAndPath(repoId, relPath);

  // Fast path: mtime matches — file content hasn't changed, skip read+hash
  if (existingFile && existingFile.last_modified === stat.mtime.toISOString()) {
    return { fileId: existingFile.id, symbolsCount: 0, reused: true };
  }

  const content = await fs.promises.readFile(fullPath, 'utf-8');
  const hash = crypto.createHash('md5').update(content).digest('hex');

  if (existingFile && existingFile.file_hash === hash) {
    return { fileId: existingFile.id, symbolsCount: 0, reused: true };
  }

  if (existingFile) {
    _symbolDb.deleteByFile(existingFile.id);
    _importDb.deleteByFile(existingFile.id);
  }

  const fileId = _fileDb.insert(repoId, relPath, language, hash, stat.mtime.toISOString());

  if (!language) return { fileId, symbolsCount: 0, reused: false };

  try {
    const result = parser.parseFile(content, relPath);
    const symbols = result.symbols || [];
    const imports = result.imports || [];

    if (symbols.length > 0) {
      _symbolDb.insertBatch(symbols.map(s => ({
        ...s,
        repo_id: repoId,
        file_id: fileId,
        language,
      })));
    }

    // Resolve and store imports
    if (imports.length > 0) {
      const enriched = imports.map(imp => {
        const resolvedFull = resolver.resolveImport(relPath, imp.import_path, repoPath);
        let resolvedFileId = null;
        if (resolvedFull) {
          const resolvedRel = resolver.toRelPath(resolvedFull, repoPath);
          const resolvedFile = _fileDb.getByRepoAndPath(repoId, resolvedRel);
          if (resolvedFile) resolvedFileId = resolvedFile.id;
        }
        return {
          repo_id: repoId,
          file_id: fileId,
          import_path: imp.import_path,
          import_type: imp.import_type,
          imported_symbols: imp.imported_symbols || [],
          resolved_file_id: resolvedFileId,
          line: imp.line,
          column: imp.column,
        };
      });
      _importDb.insertBatch(enriched);
    }

    return { fileId, symbolsCount: symbols.length, reused: false };
  } catch (parseErr) {
    if (existingFile) {
      _fileDb.markDirty(repoId, relPath);
    }
    return { fileId, symbolsCount: 0, reused: false, error: parseErr.message };
  }
}

async function reindexDirty(repoPath, onProgress, onError) {
  const repo = _repoDb.getByPath(repoPath);
  if (!repo) return { totalFiles: 0, symbolCount: 0 };

  const dirtyFiles = _fileDb.getDirtyByRepo(repo.id);
  let symbolCount = 0;
  let lastReportedPct = -1;

  for (let i = 0; i < dirtyFiles.length; i += BATCH_SIZE) {
    const batch = dirtyFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(df => indexFile(repo.id, repoPath, df.path))
    );

    for (let j = 0; j < results.length; j++) {
      const df = batch[j];
      const result = results[j];
      if (result.status === 'fulfilled' && result.value) {
        _fileDb.markClean(df.id);
        symbolCount += result.value.symbolsCount;
      } else if (result.status === 'rejected' && onError) {
        onError(`Failed to reindex ${df.path}: ${result.reason?.message || 'Unknown'}`);
        _fileDb.markClean(df.id);
      }
    }

    const pct = Math.round((Math.min(i + BATCH_SIZE, dirtyFiles.length) / dirtyFiles.length) * 100);
    if (pct !== lastReportedPct && onProgress) {
      lastReportedPct = pct;
      onProgress({
        current: Math.min(i + BATCH_SIZE, dirtyFiles.length),
        total: dirtyFiles.length,
        phase: 'reindex-dirty',
        percent: pct,
      });
    }
  }

  _repoDb.markIndexed(repo.id, repo.total_files, symbolCount);
  db.saveImmediate();

  return { totalFiles: dirtyFiles.length, symbolCount };
}

function walkDir(dirPath, results, repoPath, docignoreUtils, prefix) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = (prefix ? path.join(prefix, entry.name) : entry.name).replace(/\\/g, '/');
      const fullPath = path.join(dirPath, entry.name);

      if (docignoreUtils.isIgnored(fullPath, repoPath)) continue;

      if (entry.isDirectory()) {
        walkDir(fullPath, results, repoPath, docignoreUtils, relPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (detectLanguage(ext)) {
          results.push(relPath);
        }
      }
    }
  } catch (err) {
    // Permission denied, skip
  }
}

async function asyncWalkDir(dirPath, repoPath, docignoreUtils, prefix, results) {
  const out = results || [];
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const dirs = [];
    for (const entry of entries) {
      const relPath = (prefix ? path.join(prefix, entry.name) : entry.name).replace(/\\/g, '/');
      const fullPath = path.join(dirPath, entry.name);

      if (docignoreUtils.isIgnored(fullPath, repoPath)) continue;

      if (entry.isDirectory()) {
        dirs.push(asyncWalkDir(fullPath, repoPath, docignoreUtils, relPath, out));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (detectLanguage(ext)) {
          out.push(relPath);
        }
      }
    }
    await Promise.all(dirs);
  } catch (err) {
    // Permission denied, skip
  }
  return out;
}

function resetIndex(repoPath) {
  const repo = _repoDb.getByPath(repoPath);
  if (!repo) return;
  _symbolDb.deleteByRepo(repo.id);
  _fileDb.removeByRepo(repo.id);
  _repoDb.markUnindexed(repo.id);
  db.saveImmediate();
}

function deleteIndex(repoPath) {
  const repo = _repoDb.getByPath(repoPath);
  if (!repo) return;
  _symbolDb.deleteByRepo(repo.id);
  _fileDb.removeByRepo(repo.id);
  _repoDb.remove(repoPath);
  db.saveImmediate();
}

function setDbs(dbs) {
  if (dbs.repoDb) _repoDb = dbs.repoDb;
  if (dbs.fileDb) _fileDb = dbs.fileDb;
  if (dbs.symbolDb) _symbolDb = dbs.symbolDb;
  if (dbs.importDb) _importDb = dbs.importDb;
}

module.exports = {
  indexRepo, indexFile, reindexDirty, walkDir, asyncWalkDir,
  resetIndex, deleteIndex, setDbs,
};
