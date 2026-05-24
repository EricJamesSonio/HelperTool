const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const parser = require('./parser');
const repoDb = require('../database/repositories');
const fileDb = require('../database/indexedFiles');
const symbolDb = require('../database/symbols');
const db = require('../database/db');

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
  const repoId = repoDb.upsert(repoPath, repoName, {});

  const allFiles = [];
  walkDir(repoPath, allFiles, repoPath, docignoreUtils);

  let indexedCount = 0;
  let symbolCount = 0;
  const totalFiles = allFiles.length;

  for (const filePath of allFiles) {
    try {
      const fileResult = await indexFile(repoId, repoPath, filePath);
      if (fileResult) symbolCount += fileResult.symbolsCount;
      indexedCount++;

      if (onProgress) {
        onProgress({
          current: indexedCount,
          total: totalFiles,
          phase: 'indexing',
          percent: Math.round((indexedCount / totalFiles) * 100),
        });
      }
    } catch (err) {
      if (onError) onError(`Failed to index ${filePath}: ${err.message}`);
    }
  }

  repoDb.markIndexed(repoId, totalFiles, symbolCount);
  db.save();

  return { totalFiles, symbolCount };
}

async function indexFile(repoId, repoPath, relPath) {
  const fullPath = path.join(repoPath, relPath);
  if (!fs.existsSync(fullPath)) return null;

  const stat = fs.statSync(fullPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const hash = crypto.createHash('md5').update(content).digest('hex');
  const ext = path.extname(relPath).toLowerCase();
  const language = detectLanguage(ext);

  const existingFile = fileDb.getByRepoAndPath(repoId, relPath);
  if (existingFile && existingFile.file_hash === hash) {
    return { fileId: existingFile.id, symbolsCount: 0, reused: true };
  }

  if (existingFile) {
    symbolDb.deleteByFile(existingFile.id);
  }

  const fileId = fileDb.insert(repoId, relPath, language, hash, stat.mtime.toISOString());

  if (!language) return { fileId, symbolsCount: 0, reused: false };

  try {
    const symbols = parser.parseFile(content, relPath);
    if (symbols.length > 0) {
      symbolDb.insertBatch(symbols.map(s => ({
        ...s,
        repo_id: repoId,
        file_id: fileId,
        language,
      })));
    }
    return { fileId, symbolsCount: symbols.length, reused: false };
  } catch (parseErr) {
    if (existingFile) {
      fileDb.markDirty(repoId, relPath);
    }
    return { fileId, symbolsCount: 0, reused: false, error: parseErr.message };
  }
}

async function reindexDirty(repoPath, onProgress, onError) {
  const repo = repoDb.getByPath(repoPath);
  if (!repo) return { totalFiles: 0, symbolCount: 0 };

  const dirtyFiles = fileDb.getDirtyByRepo(repo.id);
  let symbolCount = 0;

  for (let i = 0; i < dirtyFiles.length; i++) {
    const df = dirtyFiles[i];
    try {
      const result = await indexFile(repo.id, repoPath, df.path);
      if (result) {
        fileDb.markClean(df.id);
        symbolCount += result.symbolsCount;
      }
    } catch (err) {
      if (onError) onError(`Failed to reindex ${df.path}: ${err.message}`);
    }

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: dirtyFiles.length,
        phase: 'reindex-dirty',
        percent: Math.round(((i + 1) / dirtyFiles.length) * 100),
      });
    }
  }

  repoDb.markIndexed(repo.id, repo.total_files, symbolCount);
  db.save();

  return { totalFiles: dirtyFiles.length, symbolCount };
}

function walkDir(dirPath, results, repoPath, docignoreUtils, prefix) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = prefix ? path.join(prefix, entry.name) : entry.name;
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

function resetIndex(repoPath) {
  const repo = repoDb.getByPath(repoPath);
  if (!repo) return;
  symbolDb.deleteByRepo(repo.id);
  fileDb.removeByRepo(repo.id);
  repoDb.markUnindexed(repo.id);
  db.save();
}

function deleteIndex(repoPath) {
  const repo = repoDb.getByPath(repoPath);
  if (!repo) return;
  symbolDb.deleteByRepo(repo.id);
  fileDb.removeByRepo(repo.id);
  repoDb.remove(repoPath);
  db.save();
}

module.exports = {
  indexRepo, indexFile, reindexDirty, walkDir,
  resetIndex, deleteIndex,
};
